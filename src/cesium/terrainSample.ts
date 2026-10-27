/**
 * Adapter Cesium del `TerrainHeightSampler` del Reverse Planner (Fase 7, T-060).
 *
 * API usata: `Scene.sampleHeightMostDetailed` (Cesium.d.ts 1.146, Scene):
 * campionamento asincrono «alla massima LOD dei 3D Tilesets in scena», altezze
 * scritte in place sui Cartographic passati; per i punti senza geometria
 * campionabile (tile non caricati o fuori copertura) la posizione diventa
 * `undefined`. Serve proprio questa e non `sampleTerrainMostDetailed` (campa
 * solo il terreno del globo: con i Google 3D Tiles attaccati il globo è
 * nascosto, `globe.show = false` in CesiumViewer) né `sampleHeight` sincrono
 * (campa solo la geometria già renderizzata in vista, insufficiente per una
 * griglia a 360° attorno al Target).
 *
 * Semantica: i punti senza quota tornano `null` al motore di planning, che
 * esclude quelle distanze; mai quote simulate (regola del progetto).
 *
 * Non tocca né ricarica il tileset: il sampling forza solo il caricamento dei
 * tile di copertura dei punti richiesti (preload «most detailed» interno a
 * Cesium), nella stessa sessione 3D Tiles già in scena (vincolo «non
 * ricaricare Google 3D Tiles quando cambia data/ora»: qui la data/ora non è
 * nemmeno coinvolta, le quote non dipendono dal tempo). T-070: il preload gira
 * solo se il tileset è figlio DIRETTO di scene.primitives (gate
 * `scene.primitives.contains`, verificato sul sorgente Cesium 1.146 —
 * ADR-022); vedi CesiumViewer.tsx.
 *
 * Il batching a ≤ 512 punti per chiamata è fatto da `buildTerrainPolarGrid`
 * (`TERRAIN_GRID_BATCH_SIZE`: scelta di orchestrazione, NON un limite Cesium).
 */
import { Cartographic, type Viewer } from 'cesium'
import type { TerrainHeightSampler } from '../planning/reverseAlignment'

/**
 * Tempo massimo di attesa del campionamento, scarico dei tile incluso. Col
 * preload «most detailed» attivo (T-070) un tile che FALLISCE (es. 429 di
 * quota) lascia il pass di preload mai «ready»: `contentAvailable` è falso sui
 * tile FAILED e non vengono ritentati (sorgente Cesium 1.146, Cesium3DTile
 * L191688 e MostDetailedTraversal.selectTiles L193749) → la promessa di
 * `sampleHeightMostDetailed` non si risolverebbe mai. La guardia trasforma
 * l'attesa infinita in errore esplicito (mai «in corso» appeso a vivere).
 */
export const SAMPLING_TIMEOUT_MS = 60_000

/**
 * Crea un sampler che campiona le quote ellissoideali del suolo sulla scena
 * del Viewer: mesh dei 3D Tiles (Google Photorealistic) quando attaccata,
 * globo altrimenti. Le entità del planner (marker Observer/Target, linea di
 * vista, Luna) sono escluse dal campionamento: la quota deve arrivare dal
 * territorio, non dagli oggetti disegnati sopra.
 *
 * Errori espliciti (mai quote inventate): Viewer già distrutto o scena senza
 * supporto al campionamento (`scene.sampleHeightSupported`, depth texture)
 * → `Error` con messaggio mostrabile in UI.
 */
export function createTerrainHeightSampler(viewer: Viewer): TerrainHeightSampler {
  return async (points) => {
    if (points.length === 0) {
      return []
    }
    if (viewer.isDestroyed()) {
      throw new Error('La scena 3D è stata chiusa: campionamento del terreno impossibile.')
    }
    const scene = viewer.scene
    if (!scene.sampleHeightSupported) {
      throw new Error(
        'Il campionamento del terreno non è supportato da questo contesto grafico (depth texture mancante).',
      )
    }
    // Cartographic in radianti (lat, lon); la quota in ingresso è ignorata
    // dall'API (il punto è proiettato sulla geometria più dettagliata).
    const positions = points.map(
      (point) =>
        new Cartographic(
          (point.longitudeDeg * Math.PI) / 180,
          (point.latitudeDeg * Math.PI) / 180,
        ),
    )
    const sampling = scene.sampleHeightMostDetailed(positions, [
      ...viewer.entities.values,
    ])
    // Guardia di timeout (SAMPLING_TIMEOUT_MS): trasforma un preload bloccato
    // (tile fallito mai ritentato) in errore esplicito. `globalThis.setTimeout`
    // e non `window.setTimeout`: i test girano in ambiente node.
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    try {
      const sampled = await Promise.race([
        sampling,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new Error(
                `Campionamento del terreno non concluso entro ${Math.round(SAMPLING_TIMEOUT_MS / 1000)} s: scarico dei tile bloccato (rete o quota). Riprova.`,
              ),
            )
          }, SAMPLING_TIMEOUT_MS)
        }),
      ])
      return sampled.map((position) =>
        position === undefined || position.height === undefined
          ? null
          : position.height,
      )
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle)
      }
      // Se il timeout ha vinto la corsa, la promessa del sampling può
      // concludere dopo: senza questo catch sarebbe un unhandled rejection.
      sampling.catch(() => undefined)
    }
  }
}
