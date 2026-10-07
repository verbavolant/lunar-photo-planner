import { Cartesian3, type Viewer } from 'cesium'

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
