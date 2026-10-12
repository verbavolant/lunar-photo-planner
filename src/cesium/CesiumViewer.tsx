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
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { resolveSceneDataProvider } from './dataProvider'
import { pickPointOnScene } from './pick'
import { createMoonTexture, moonDiameterM, moonPositionEcef } from './moonRender'
import { moonTopocentric, type MoonTopocentric } from '../astronomy/moon'
import type { GeoPoint } from '../geodesy/geodesy'
import type { PlannerPointId } from '../planning/points'

export interface CesiumViewerProps {
  observer: GeoPoint | null
  target: GeoPoint | null
  /** Tempo effettivo della UI: guida la posizione apparente della Luna. */
  time: Date
  onScenePick: (point: GeoPoint) => void
  /** Chiamato dopo la creazione del Viewer (anche nel remount di StrictMode). */
  onViewerReady?: (viewer: Viewer) => void
}

// URL root dei Photorealistic 3D Tiles: sample ufficiale Google
// (developers.google.com/maps/documentation/tile/3d-tiles, agg. 2026-10-05).
// La chiave non va mai hardcodata: arriva da VITE_GOOGLE_MAPS_API_KEY.
const GOOGLE_3D_TILES_ROOT_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json'

// Google Photorealistic 3D Tiles anche via Cesium ion: asset pubblico 2275207
// (richiesta umano; tutorial ufficiale CesiumJS "Photorealistic 3D Tiles from
// Google Maps Platform in CesiumJS", cesium.com/learn, consultato 2026-10-07;
// API `Cesium3DTileset.fromIonAssetId` verificata su Cesium.d.ts 1.146). L'asset
// va abilitato lato account/token ion. Permette lo streaming della stessa mesh
// Google dove la Map Tiles API diretta è bloccata (T-032, area EEA).
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
// caricamenti asincroni del provider attivo).
function describeError(error: unknown): string {
  return error instanceof Error && error.message !== ''
    ? error.message
    : 'vedi console per i dettagli'
}

// Scena CesiumJS con sorgente dati 3D configurabile (Fase 5b): Google
// Photorealistic 3D Tiles, via Map Tiles API diretta (ramo 'google', T-003)
// oppure via Cesium ion, asset 2275207 (ramo 'cesium', T-034). L'attribution
// resta a schermo: requisito dei provider dei dati (Google Map Tiles API
// Policies; credit ion). T-008: il clic posiziona Observer/Target sulla
// superficie reale.
export default function CesiumViewer({
  observer,
  target,
  time,
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

    // Ramo 'cesium': il token ion va impostato prima di ogni richiesta ion
    // (`Cesium3DTileset.fromIonAssetId` lo legge internamente). Senza token la
    // scena resta su globo vuoto, con l'avviso a schermo.
    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined
    const cesiumProviderActive = sceneProvider.provider === 'cesium'
    const ionConfigured =
      cesiumProviderActive && ionToken !== undefined && ionToken !== ''
    if (cesiumProviderActive) {
      if (!ionConfigured) {
        setNotice(
          'Provider "cesium" attivo ma senza token ion: imposta VITE_CESIUM_ION_TOKEN in .env.local (token da https://ion.cesium.com/tokens) e riavvia il server di sviluppo.',
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

    if (!cesiumProviderActive) {
      // Ramo 'google' (T-003): tiles fotorealistici via Map Tiles API.
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
      if (apiKey === undefined || apiKey === '') {
        setNotice(
          'Google Photorealistic 3D Tiles non attivi: imposta VITE_GOOGLE_MAPS_API_KEY in .env.local e riavvia il server di sviluppo.',
        )
      } else {
        Cesium3DTileset.fromUrl(`${GOOGLE_3D_TILES_ROOT_URL}?key=${apiKey}`, {
          // Requisito Google: attribution sempre visibile a schermo.
          showCreditsOnScreen: true,
        })
          .then((tileset) => {
            if (disposed) {
              tileset.destroy()
              return
            }
            viewer.scene.primitives.add(tileset)
            // Sample ufficiale Google: la superficie fotorealistica sostituisce
            // l'ellissoide di base.
            viewer.scene.globe.show = false
          })
          .catch((error: unknown) => {
            if (disposed) {
              return
            }
            console.error('Caricamento Google Photorealistic 3D Tiles fallito:', error)
            setNotice(
              `Errore nel caricamento di Google Photorealistic 3D Tiles: ${describeError(error)}`,
            )
          })
      }
    } else if (ionConfigured) {
      // Ramo 'cesium' (T-034): stessa mesh Google del ramo 'google', ma
      // servita da Cesium ion (asset 2275207) invece che dalla Map Tiles API
      // diretta — funziona anche dove l'accesso diretto è bloccato (T-032).
      // Come da tutorial ufficiale CesiumJS, a caricamento avvenuto il globo
      // viene nascosto: il tileset copre l'estensione del globo, e terrain/
      // imagery sotto la mesh causerebbero z-fighting e doppio streaming. Se
      // il caricamento fallisce il globo resta visibile (fallback navigabile)
      // con l'avviso a schermo. I credit Google/ion restano a schermo:
      // requisito dei provider dei dati.
      Cesium3DTileset.fromIonAssetId(GOOGLE_PHOTOREALISTIC_ION_ASSET_ID)
        .then((tileset) => {
          if (disposed) {
            tileset.destroy()
            return
          }
          viewer.scene.primitives.add(tileset)
          viewer.scene.globe.show = false
        })
        .catch((error: unknown) => {
          if (disposed) {
            return
          }
          console.error('Caricamento Google Photorealistic 3D Tiles via ion fallito:', error)
          setNotice(
            `Errore nel caricamento di Google Photorealistic 3D Tiles via Cesium ion: ${describeError(error)}`,
          )
        })
    }

    return () => {
      disposed = true
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

    // Linea Observer→Target: segmento retto in 3D (linea di vista). La valutazione
    // reale dell'occlusione arriverà in Fase 8 con ray casting.
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

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {notice !== null && <div style={OVERLAY_STYLE}>{notice}</div>}
    </div>
  )
}

