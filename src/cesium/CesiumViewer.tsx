import { useEffect, useRef, useState } from 'react'
import {
  ArcType,
  Cesium3DTileset,
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  JulianDate,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
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

// Scena CesiumJS + Google Photorealistic 3D Tiles (T-003). L'attribution dei
// tiles resta a schermo: requisito delle Google Map Tiles API Policies.
// T-008: il clic posiziona Observer/Target sulla superficie reale.
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

    const viewer = new Viewer(container, {
      // Nessun imagery di default: i tiles Google forniscono il territorio.
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
          const message =
            error instanceof Error && error.message !== ''
              ? error.message
              : 'vedi console per i dettagli'
          setNotice(`Errore nel caricamento di Google Photorealistic 3D Tiles: ${message}`)
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

