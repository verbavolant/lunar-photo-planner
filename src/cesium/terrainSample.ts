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
 * tile di copertura dei punti richiesti, nella stessa sessione 3D Tiles già in
 * scena (vincolo «non ricaricare Google 3D Tiles quando cambia data/ora»: qui
 * la data/ora non è nemmeno coinvolta, le quote non dipendono dal tempo).
 *
 * Il batching a ≤ 512 punti per chiamata è fatto da `buildTerrainPolarGrid`
 * (`TERRAIN_GRID_BATCH_SIZE`: scelta di orchestrazione, NON un limite Cesium).
 */
import { Cartographic, type Viewer } from 'cesium'
import type { TerrainHeightSampler } from '../planning/reverseAlignment'

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
    const sampled = await scene.sampleHeightMostDetailed(positions, [
      ...viewer.entities.values,
    ])
    return sampled.map((position) =>
      position === undefined || position.height === undefined ? null : position.height,
    )
  }
}
