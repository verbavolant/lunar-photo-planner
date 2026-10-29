import { Cartesian3 } from 'cesium'
import type { MoonSkyPath } from '../astronomy/moonPath'
import type { GeoPoint } from '../geodesy/geodesy'
import { moonPositionEcef } from './moonRender'

/**
 * Punti ECEF dell'arco della traiettoria della Luna (T-075): ogni campione
 * (azimut, altitudine) è proiettato sulla «sfera celeste» centrata
 * sull'Observer con raggio = distanza topocentrica reale della Luna a metà
 * passaggio (`path.midDistanceM`), con la stessa trasformazione ENU→ECEF
 * usata per la Luna in scena (moonPositionEcef): l'arco passa così per la
 * direzione reale della Luna corrente, ed è la traiettoria percepita
 * dall'osservatore (non una geometria geocentrica).
 */
export function moonPathArcPositions(observer: GeoPoint, path: MoonSkyPath): Cartesian3[] {
  return path.samples.map((sample) =>
    moonPositionEcef(observer, sample.azimuthDeg, sample.altitudeDeg, path.midDistanceM),
  )
}
