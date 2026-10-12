import { Cartesian3, type Viewer } from 'cesium'
import type { GeoPoint } from '../geodesy/geodesy'

/** Vista nadirale su un punto: posizione sulla superficie e altezza della camera. */
export interface OverheadView {
  readonly longitudeDeg: number
  readonly latitudeDeg: number
  readonly altitudeM: number
}

/**
 * Volo animato verso una vista nadirale sul punto indicato (camera verticale,
 * nord in alto). Angoli in radianti come da API Camera.flyTo.
 */
export function flyToOverhead(viewer: Viewer, view: OverheadView, durationSeconds = 2): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(view.longitudeDeg, view.latitudeDeg, view.altitudeM),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration: durationSeconds,
  })
}

/**
 * "Occhio del fotografo": camera 1 m sopra la superficie dell'Observer
 * (T-028, richiesta umano: con la camera più in alto, abbassando la vista
 * si finisce sotto la mesh dei tiles), rivolta nella direzione indicata.
 * heading = azimut reale in gradi (0 = nord, orario), pitch = angolo
 * verticale reale in gradi (positivo sopra l'orizzonte).
 * I valori devono derivare dai dati reali (es. moonTopocentric).
 */
export function flyToObserverView(
  viewer: Viewer,
  observer: GeoPoint,
  headingDeg: number,
  pitchDeg: number,
  durationSeconds = 2,
): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      observer.longitudeDeg,
      observer.latitudeDeg,
      observer.heightM + 1,
    ),
    orientation: {
      heading: (headingDeg * Math.PI) / 180,
      pitch: (pitchDeg * Math.PI) / 180,
      roll: 0,
    },
    duration: durationSeconds,
  })
}

/**
 * Trasla la camera dello stesso spostamento 3D dell'Observer (T-037): l'offset
 * relativo camera↔Observer resta invariato, quindi la vista segue il punto
 * quando viene alzato/abbassato o spostato dai comandi della card. L'orientamento
 * (heading/pitch/roll in radianti, API Camera.setView verificata su
 * Cesium.d.ts 1.146 righe 29572–29782) viene ricatturato PRIMA della
 * traslazione e riapplicato alla nuova posizione: la direzione di vista resta
 * la stessa rispetto all'orizzonte locale del punto.
 */
export function moveCameraWithObserver(
  viewer: Viewer,
  fromPoint: GeoPoint,
  toPoint: GeoPoint,
): void {
  const camera = viewer.camera
  const from = Cartesian3.fromDegrees(
    fromPoint.longitudeDeg,
    fromPoint.latitudeDeg,
    fromPoint.heightM,
  )
  const to = Cartesian3.fromDegrees(
    toPoint.longitudeDeg,
    toPoint.latitudeDeg,
    toPoint.heightM,
  )
  if (Cartesian3.equals(from, to)) {
    return
  }
  const delta = Cartesian3.subtract(to, from, new Cartesian3())
  const destination = Cartesian3.add(camera.position, delta, new Cartesian3())
  camera.setView({
    destination,
    orientation: {
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
    },
  })
}
