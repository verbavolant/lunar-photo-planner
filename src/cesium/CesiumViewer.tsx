import { useEffect, useRef, useState } from 'react'
import {
  ArcType,
  Cesium3DTileset,
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  Ion,
  JulianDate,
  PrimitiveCollection,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { resolveSceneDataProvider } from './dataProvider'
import { pickPointOnScene } from './pick'
import { resolveTileMaxDetailDistanceM, tilesetPerformanceOptions } from './tilesetPerformance'
import { acquireSessionTileset, markSessionTilesetDetached } from './tilesetSession'
import { createMoonTexture, moonDiameterM, moonPositionEcef } from './moonRender'
import { moonTopocentric, type MoonTopocentric } from '../astronomy/moon'
import type { GeoPoint } from '../geodesy/geodesy'
import type { RestrictivePoint } from '../planning/occlusion'
import type { PlannerPointId } from '../planning/points'

export interface CesiumViewerProps {
  observer: GeoPoint | null
  target: GeoPoint | null
  /** Tempo effettivo della UI: guida la posizione apparente della Luna. */
  time: Date
  /**
   * Punto occludente dell'analisi d'occlusione (T-064): passato solo quando
   * lo stato è `occluded`; `null` = nessun marker (vista libera, esito
   * indecidibile o analisi assente).
   */
  occlusionPoint: RestrictivePoint | null
  onScenePick: (point: GeoPoint) => void
  /** Chiamato dopo la creazione del Viewer (anche nel remount di StrictMode). */
  onViewerReady?: (viewer: Viewer) => void
}

// URL root dei Photorealistic 3D Tiles: sample ufficiale Google
// (developers.google.com/maps/documentation/tile/3d-tiles, agg. 2026-10-05).
// La chiave non va mai hardcodata: arriva da VITE_GOOGLE_MAPS_API_KEY.
// T-040: usato SOLO dal provider 'google' (opt-in) — ogni root request
// consuma la quota Google per progetto ("3D Tiles root requests per minute"
// = 150), fonte dell'errore 429 RATE_LIMIT_EXCEEDED che ha motivato il
// routing via ion.
const GOOGLE_3D_TILES_ROOT_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json'

// Google Photorealistic 3D Tiles via Cesium ion: asset pubblico 2275207,
// provider 'google-ion' (alias accettato: 'cesium'; T-034, tutorial ufficiale
// CesiumJS "Photorealistic 3D Tiles from Google Maps Platform in CesiumJS",
// cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/,
// consultato 2026-10-08). T-040: nel provider google-ion le richieste passano
// SOLO da ion — l'endpoint ion dell'asset (verificato dal vivo 2026-10-08 con
// GET /v1/assets/2275207/endpoint) restituisce type 3DTILES e options.url =
// "https://tile.googleapis.com/v1/3dtiles/root.json?key=…" con una CHIAVE
// GESTITA DA ION (fonte: sorgente Cesium 1.146 L99739–740, che usa
// endpoint.options.url), quindi la quota 429 del progetto Google dell'utente
// non è toccata. L'asset va abilitato lato account/token ion (T-031).
// API `Cesium3DTileset.fromIonAssetId` verificata su Cesium.d.ts 1.146
// (L32698); le attributions dell'asset (credit ion + Google) arrivano nella
// risposta dell'endpoint.
const GOOGLE_PHOTOREALISTIC_ION_ASSET_ID = 2275207

const OVERLAY_STYLE = {
  position: 'absolute' as const,
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  maxWidth: '80%',
  padding: '8px 12px',
  backgroundColor: 'rgba(20, 20, 30, 0.85)',
  color: '#f5f5f5',
  fontSize: 13,
  borderRadius: 4,
  pointerEvents: 'none' as const,
}

// Messaggio d'errore leggibile per i notice a schermo (usato dai catch dei
// caricamenti asincroni del provider attivo). Gli errori HTTP di Cesium
// (RequestErrorEvent) non sono Error: portano `statusCode` (d.ts 1.146
// L17591–L17613).
function describeError(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const candidate = error as { message?: unknown; statusCode?: unknown }
    if (typeof candidate.statusCode === 'number' && candidate.statusCode > 0) {
      const message =
        typeof candidate.message === 'string' && candidate.message !== ''
          ? `: ${candidate.message}`
          : ''
      return `HTTP ${candidate.statusCode}${message}`
    }
  }
  return error instanceof Error && error.message !== ''
    ? error.message
    : 'vedi console per i dettagli'
}

// Scena CesiumJS con sorgente dati 3D configurabile (Fase 5b): Google
// Photorealistic 3D Tiles via Map Tiles API diretta (provider 'google',
// T-003, opt-in: quota Google 150 root request/min) oppure via Cesium ion,
// asset 2275207 (provider 'google-ion', T-034/T-040; alias accettato
// 'cesium'). T-040: il tileset è UNO per sessione per provider (Promise
// memoizzata, vedi tilesetSession.ts) con backoff esponenziale sui 429.
// L'attribution resta a schermo: requisito dei provider dei dati (Google Map
// Tiles API Policies; credit ion). T-008: il clic posiziona Observer/Target
// sulla superficie reale.
export default function CesiumViewer({
  observer,
  target,
  time,
  occlusionPoint,
  onScenePick,
  onViewerReady,
}: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Il callback arriva da React a ogni render: il handler del click legge il
  // riferimento aggiornato senza dover essere ricreato.
  const onScenePickRef = useRef(onScenePick)
  onScenePickRef.current = onScenePick
  // Stato di rendering della Luna: ricalcolato solo quando cambiano Observer o
  // tempo; i CallbackProperty dell'entità lo leggono a ogni frame (aggiornamento
  // fluido, senza ricreare l'entità).
  const moonRenderRef = useRef<{ observer: GeoPoint | null; moon: MoonTopocentric | null }>({
    observer: null,
    moon: null,
  })

  useEffect(() => {
    moonRenderRef.current = {
      observer,
      moon: observer === null ? null : moonTopocentric(observer, time),
    }
    // Sincronizza l'orologio interno della scena: il Sole e l'illuminazione dei
    // tiles seguono il tempo della UI, non l'ora di sistema.
    const viewer = viewerRef.current
    if (viewer !== null) {
      viewer.clock.currentTime = JulianDate.fromDate(time)
      viewer.clock.shouldAnimate = false
    }
  }, [observer, time])

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return undefined
    }

    // Evita di toccare il viewer dopo l'unmount (StrictMode: doppio mount).
    let disposed = false

    // Fase 5b: sorgente dati 3D configurabile. Default dall'env
    // (VITE_SCENE_PROVIDER), override runtime con ?provider= per cambiare
    // sorgente sul sito già deployato senza rebuild.
    const sceneProvider = resolveSceneDataProvider(
      import.meta.env.VITE_SCENE_PROVIDER as string | undefined,
      new URLSearchParams(window.location.search).get('provider') ?? undefined,
    )
    if (sceneProvider.invalidWarning !== null) {
      setNotice(sceneProvider.invalidWarning)
    }

    // T-039: il dettaglio dei tiles si ferma alla distanza scelta (default
    // 1 km): oltre, i tile restano al LOD del parent e non vengono
    // scaricati/raffinati. Override runtime senza rebuild: ?tileMaxM=<metri>.
    const tileMaxM = resolveTileMaxDetailDistanceM(
      new URLSearchParams(window.location.search).get('tileMaxM') ?? undefined,
    )
    if (tileMaxM.invalidWarning !== null) {
      setNotice(tileMaxM.invalidWarning)
    }

    // Ramo 'google-ion': il token ion va impostato prima di ogni richiesta
    // ion (`Cesium3DTileset.fromIonAssetId` lo legge internamente). Senza
    // token la scena resta sulla vista base, con l'avviso a schermo.
    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined
    const ionProviderActive = sceneProvider.provider === 'google-ion'
    const ionConfigured = ionProviderActive && ionToken !== undefined && ionToken !== ''
    if (ionProviderActive) {
      if (!ionConfigured) {
        setNotice(
          'Provider "google-ion" attivo ma senza token ion: imposta VITE_CESIUM_ION_TOKEN in .env.local (token da https://ion.cesium.com/tokens) e riavvia il server di sviluppo.',
        )
      } else {
        Ion.defaultAccessToken = ionToken
      }
    }

    const viewer = new Viewer(container, {
      // Nessun imagery/terrain di default: la superficie arriva dai tiles
      // Google del provider attivo (ramo 'google' via root.json, ramo 'cesium'
      // via ion). Se i tiles non caricano resta il globo nudo, comunque
      // selezionabile col pick.
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    })

    viewerRef.current = viewer
    onViewerReady?.(viewer)

    // Luna (T-016/T-017): billboard in posizione reale (azimut/altitudine/distanza
    // topocentriche da moonTopocentric) e dimensione in METRI dal diametro
    // angolare reale (sizeInMeters): Cesium la proietta con l'angolo corretto da
    // qualunque camera. I CallbackProperty leggono il ref: fluidi col tempo.
    const moonTexture = createMoonTexture()
    viewer.entities.add({
      id: 'moon',
      position: new CallbackPositionProperty(() => {
        const state = moonRenderRef.current
        if (state.observer === null || state.moon === null) {
          return Cartesian3.ZERO
        }
        return moonPositionEcef(
          state.observer,
          state.moon.azimuthDeg,
          state.moon.altitudeDeg,
          state.moon.distanceM,
        )
      }, false),
      billboard: {
        image: moonTexture,
        // La visibilità va sul billboard: a livello Entity `show` è solo boolean.
        show: new CallbackProperty(() => {
          const state = moonRenderRef.current
          return state.observer !== null && state.moon !== null
        }, false),
        sizeInMeters: true,
        width: new CallbackProperty(() => {
          const state = moonRenderRef.current
          if (state.moon === null) {
            return 1
          }
          return moonDiameterM(state.moon.distanceM, state.moon.angularDiameterDeg)
        }, false),
        height: new CallbackProperty(() => {
          const state = moonRenderRef.current
          if (state.moon === null) {
            return 1
          }
          return moonDiameterM(state.moon.distanceM, state.moon.angularDiameterDeg)
        }, false),
      },
    })

    // Clic sinistro → punto reale sulla superficie (tiles o ellissoide).
    const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    clickHandler.setInputAction((movement: { position: Cartesian2 }) => {
      const pickedPoint = pickPointOnScene(viewer, movement.position)
      if (pickedPoint !== undefined) {
        onScenePickRef.current(pickedPoint)
      }
    }, ScreenSpaceEventType.LEFT_CLICK)

    // CesiumJS non segue automaticamente il ridimensionamento del container.
    const resizeObserver = new ResizeObserver(() => viewer.resize())
    resizeObserver.observe(container)

    // T-040: UN tileset per sessione per provider. La Promise di creazione è
    // memoizzata in tilesetSession.ts (store su globalThis, sopravvive a
    // StrictMode/HMR): le chiamate concorrenti riusano la stessa creazione e
    // i 429 seguono un backoff esponenziale con avviso a schermo. L'holder
    // con destroyPrimitives: false (pattern ufficiale Cesium.d.ts 1.146
    // L44887–L44917) permette di rimuovere l'istanza condivisa dallo scene
    // che sta per essere distrutto SENZA distruggerla, così un remount la
    // riusa invece di rifare la root request.
    const tilesetHolder = new PrimitiveCollection({ destroyPrimitives: false })
    viewer.scene.primitives.add(tilesetHolder)
    let attachedTileset: Cesium3DTileset | null = null
    const sessionKey = sceneProvider.provider
    const sessionLabel =
      sessionKey === 'google'
        ? 'Google Photorealistic 3D Tiles (Map Tiles API diretta)'
        : 'Google Photorealistic 3D Tiles via Cesium ion'
    // Nota test (T-040): la funzione `create` reale vive SOLO qui; i test di
    // tilesetSession iniettano fake, quindi non creano mai tileset reali né
    // toccano la rete.
    if (!ionProviderActive) {
      // Ramo 'google' (T-003, opt-in): tiles fotorealistici via Map Tiles API
      // DIRETTA con la chiave dell'utente. Ogni root request consuma la quota
      // Google per progetto (150/min, fonte dell'errore 429 di T-040):
      // restare qui solo per confronto/debug.
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
      if (apiKey === undefined || apiKey === '') {
        setNotice(
          'Google Photorealistic 3D Tiles non attivi: imposta VITE_GOOGLE_MAPS_API_KEY in .env.local e riavvia il server di sviluppo.',
        )
      } else {
        acquireSessionTileset({
          sessionKey,
          label: sessionLabel,
          create: () =>
            Cesium3DTileset.fromUrl(`${GOOGLE_3D_TILES_ROOT_URL}?key=${apiKey}`, {
              // Requisito Google: attribution sempre visibile a schermo.
              showCreditsOnScreen: true,
              // T-039: dettaglio limitato alla distanza scelta (?tileMaxM=).
              ...tilesetPerformanceOptions(tileMaxM.maxDetailDistanceM),
            }),
          onNotice: setNotice,
          describeError,
        })
          .then((tileset) => {
            if (disposed) {
              // NIENTE destroy anche se disposed: l'istanza è di sessione e
              // un remount (StrictMode/HMR) può riusarla.
              return
            }
            tilesetHolder.add(tileset)
            // Sample ufficiale Google: la superficie fotorealistica sostituisce
            // l'ellissoide di base.
            viewer.scene.globe.show = false
            attachedTileset = tileset
          })
          .catch((error: unknown) => {
            if (disposed) {
              return
            }
            // Il notice utente è già emesso dal modulo di sessione (429 con
            // backoff, o esito finale): qui resta solo il log tecnico.
            console.error('Caricamento Google Photorealistic 3D Tiles fallito:', error)
          })
      }
    } else if (ionConfigured) {
      // Ramo 'google-ion' (T-034/T-040): stessa mesh Google del ramo
      // 'google', ma SOLO via Cesium ion (asset 2275207, chiave Google
      // gestita da ion — in questo ramo nessuna chiamata diretta con la
      // chiave utente): funziona anche dove l'accesso diretto è bloccato
      // (T-032, area EEA) e non consuma la quota Google del progetto utente.
      // Come da tutorial ufficiale CesiumJS, a caricamento avvenuto il globo
      // viene nascosto: il tileset copre l'estensione del globo, e terrain/
      // imagery sotto la mesh causerebbero z-fighting e doppio streaming. Se
      // il caricamento fallisce il globo resta visibile (fallback navigabile)
      // con l'avviso a schermo. I credit Google/ion restano a schermo:
      // requisito dei provider dei dati.
      acquireSessionTileset({
        sessionKey,
        label: sessionLabel,
        create: () =>
          Cesium3DTileset.fromIonAssetId(GOOGLE_PHOTOREALISTIC_ION_ASSET_ID, {
            // Attribution Google/ion a schermo: requisito dei provider (le
            // attributions dell'asset ion arrivano nella risposta
            // dell'endpoint; showCreditsOnScreen le renderizza, d.ts L31874).
            showCreditsOnScreen: true,
            // T-039: dettaglio limitato alla distanza scelta (?tileMaxM=).
            ...tilesetPerformanceOptions(tileMaxM.maxDetailDistanceM),
          }),
        onNotice: setNotice,
        describeError,
      })
        .then((tileset) => {
          if (disposed) {
            // NIENTE destroy anche se disposed: l'istanza è di sessione e un
            // remount (StrictMode/HMR) può riusarla.
            return
          }
          tilesetHolder.add(tileset)
          viewer.scene.globe.show = false
          attachedTileset = tileset
        })
        .catch((error: unknown) => {
          if (disposed) {
            return
          }
          // Notice già emesso dal modulo di sessione (429 con backoff, o
          // esito finale): qui resta solo il log tecnico.
          console.error('Caricamento Google Photorealistic 3D Tiles via ion fallito:', error)
        })
    }

    return () => {
      disposed = true
      if (attachedTileset !== null) {
        // destroyPrimitives: false sull'holder → rimozione SENZA destroy:
        // l'istanza di sessione resta riusabile da un remount. L'istanza era
        // attaccata (e quindi renderizzata) alla scena di QUESTO viewer, il
        // cui contesto WebGL muore qui sotto: il modulo di sessione segna il
        // tileset da ricreare alla prossima acquire.
        tilesetHolder.remove(attachedTileset)
        markSessionTilesetDetached({ sessionKey, tileset: attachedTileset })
      }
      clickHandler.destroy()
      resizeObserver.disconnect()
      viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  // Marker Observer/Target: ricreati quando cambia il punto nello stato.
  useEffect(() => {
    const viewer = viewerRef.current
    if (viewer === null) {
      return
    }
    const markers: [PlannerPointId, GeoPoint | null][] = [
      ['observer', observer],
      ['target', target],
    ]
    for (const [id, point] of markers) {
      const markerId = `marker-${id}`
      const existing = viewer.entities.getById(markerId)
      if (existing !== undefined) {
        viewer.entities.remove(existing)
      }
      if (point === null) {
        continue
      }
      viewer.entities.add({
        id: markerId,
        position: Cartesian3.fromDegrees(point.longitudeDeg, point.latitudeDeg, point.heightM),
        point: {
          pixelSize: 12,
          color: id === 'observer' ? Color.CYAN : Color.ORANGE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
        },
      })
    }

    // Linea Observer→Target: segmento retto in 3D (linea di vista). La
    // valutazione dell'occlusione NON avviene qui: è nel modulo
    // planning/occlusion (T-063, campionamento del suolo lungo la corda,
    // ADR-020 — il ray casting non esiste in CesiumJS 1.146); il readout è
    // nel box Dati e il punto occludente porta il marker rosso qui sotto.
    const sightLineId = 'line-observer-target'
    const existingSightLine = viewer.entities.getById(sightLineId)
    if (existingSightLine !== undefined) {
      viewer.entities.remove(existingSightLine)
    }
    if (observer !== null && target !== null) {
      viewer.entities.add({
        id: sightLineId,
        polyline: {
          positions: [
            Cartesian3.fromDegrees(observer.longitudeDeg, observer.latitudeDeg, observer.heightM),
            Cartesian3.fromDegrees(target.longitudeDeg, target.latitudeDeg, target.heightM),
          ],
          width: 2,
          material: Color.LIME,
          arcType: ArcType.NONE,
        },
      })
    }
  }, [observer, target])

  // Marker del punto occludente (T-064): posizionato sul SUOLO al punto più
  // restrittivo dell'analisi (lat/lon del campione, quota = suolo campionato,
  // che è l'ostacolo); rimosso quando l'analisi non individua un'occlusione.
  useEffect(() => {
    const viewer = viewerRef.current
    if (viewer === null) {
      return
    }
    const markerId = 'marker-occlusion'
    const existing = viewer.entities.getById(markerId)
    if (existing !== undefined) {
      viewer.entities.remove(existing)
    }
    if (occlusionPoint === null) {
      return
    }
    viewer.entities.add({
      id: markerId,
      position: Cartesian3.fromDegrees(
        occlusionPoint.longitudeDeg,
        occlusionPoint.latitudeDeg,
        occlusionPoint.groundHeightM,
      ),
      point: {
        pixelSize: 12,
        color: Color.RED,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
      },
    })
  }, [occlusionPoint])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {notice !== null && <div style={OVERLAY_STYLE}>{notice}</div>}
    </div>
  )
}

