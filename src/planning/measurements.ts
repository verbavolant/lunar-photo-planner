import {
  heightDifferenceM,
  inverseGeodesic,
  straightDistanceM,
  verticalAngleDeg,
  type GeoPoint,
  type GeodesicInverse,
} from '../geodesy/geodesy'
import { formatAngleDeg, formatDistanceM, formatHeightDifferenceM } from './format'

export interface MeasurementRow {
  readonly label: string
  readonly value: string
}

const UNAVAILABLE = '—'

function tryGeodesic(a: GeoPoint, b: GeoPoint): GeodesicInverse | null {
  try {
    return inverseGeodesic(a, b)
  } catch {
    // Vincenty non converge sui quasi-antipodi: riga non disponibile.
    return null
  }
}

/**
 * Righe del pannello misure Observer→Target (valori già formattati in
 * italiano). Funzione pura: ogni valore deriva dal modulo geodesy testato.
 */
export function buildMeasurements(observer: GeoPoint, target: GeoPoint): MeasurementRow[] {
  const geodesic = tryGeodesic(observer, target)

  let verticalAngle: number | null = null
  try {
    verticalAngle = verticalAngleDeg(observer, target)
  } catch {
    // Observer e Target coincidenti: angolo indefinito → riga non disponibile.
  }

  return [
    {
      label: 'Distanza superficie',
      value: geodesic === null ? UNAVAILABLE : formatDistanceM(geodesic.distanceM),
    },
    {
      label: "Distanza linea d'aria",
      value: formatDistanceM(straightDistanceM(observer, target)),
    },
    {
      label: 'Azimut iniziale',
      value: geodesic === null ? UNAVAILABLE : formatAngleDeg(geodesic.initialBearingDeg),
    },
    {
      label: 'Azimut finale',
      value: geodesic === null ? UNAVAILABLE : formatAngleDeg(geodesic.finalBearingDeg),
    },
    {
      label: 'Differenza quota',
      value: formatHeightDifferenceM(heightDifferenceM(target, observer)),
    },
    {
      label: 'Angolo verticale',
      value: verticalAngle === null ? UNAVAILABLE : formatAngleDeg(verticalAngle),
    },
  ]
}
