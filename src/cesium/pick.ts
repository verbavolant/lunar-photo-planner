import { Cartesian2, Cartesian3, Cartographic, Ellipsoid, type Viewer } from 'cesium'
import type { GeoPoint } from '../geodesy/geodesy'

/** Converte un Cartographic (radianti) in GeoPoint (gradi decimali, metri). */
export function cartographicToGeoPoint(cartographic: Cartographic): GeoPoint {
  return {
    latitudeDeg: (cartographic.latitude * 180) / Math.PI,
    longitudeDeg: (cartographic.longitude * 180) / Math.PI,
    heightM: cartographic.height,
  }
}

/**
 * Punto reale sotto il cursore: superficie 3D (tiles Google o globo) con
 * scene.pickPosition (richiede pickPositionSupported); se non disponibile
 * cade sulla superficie dell'ellissoide. undefined se il clic non interseca
 * nulla di selezionabile.
 */
export function pickPointOnScene(
  viewer: Viewer,
  windowPosition: Cartesian2,
): GeoPoint | undefined {
  const scene = viewer.scene
  let cartesian: Cartesian3 | undefined
  if (scene.pickPositionSupported) {
    cartesian = scene.pickPosition(windowPosition)
  }
  if (cartesian === undefined) {
    cartesian = viewer.camera.pickEllipsoid(windowPosition, Ellipsoid.WGS84)
  }
  if (cartesian === undefined) {
    return undefined
  }
  return cartographicToGeoPoint(Cartographic.fromCartesian(cartesian, Ellipsoid.WGS84))
}
