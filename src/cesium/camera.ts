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
