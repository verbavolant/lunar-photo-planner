import {
  Body,
  Equator,
  Horizon,
  KM_PER_AU,
  Observer,
} from 'astronomy-engine'
import type { GeoPoint } from '../geodesy/geodesy'

export interface MoonTopocentric {
  /** Azimut apparente in gradi: 0 = nord, 90 = est, range [0, 360). */
  readonly azimuthDeg: number
  /** Altitudine apparente in gradi, senza rifrazione atmosferica (airless). */
  readonly altitudeDeg: number
  /** Distanza topocentrica Observer→Luna in metri. */
  readonly distanceM: number
  /** Diametro angolare apparente in gradi dalla distanza topocentrica. */
  readonly angularDiameterDeg: number
}

// Raggio medio lunare IAU: 1737.4 km (NASA Moon Fact Sheet,
// nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html, verificato 2026-10-06).
const MOON_MEAN_RADIUS_M = 1_737_400

function toAeObserver(point: GeoPoint): Observer {
  return new Observer(point.latitudeDeg, point.longitudeDeg, point.heightM)
}

/**
 * Posizione apparente della Luna vista dall'Observer (topocentrica):
 * `Equator` con observer corregge la parallasse (massima per la Luna),
 * `Horizon` converte in azimut/altitudine. Rifrazione atmosferica NON
 * applicata (airless), per coerenza con le effemeridi di verifica JPL
 * Horizons. Diametro angolare = 2·asin(R_luna / d) dalla distanza
 * topocentrica (geometria del cerchio, R da NASA fact sheet).
 */
export function moonTopocentric(observer: GeoPoint, date: Date): MoonTopocentric {
  const aeObserver = toAeObserver(observer)
  const equatorial = Equator(Body.Moon, date, aeObserver, true, true)
  const horizontal = Horizon(date, aeObserver, equatorial.ra, equatorial.dec)
  const distanceM = equatorial.dist * KM_PER_AU * 1000
  return {
    azimuthDeg: horizontal.azimuth,
    altitudeDeg: horizontal.altitude,
    distanceM,
    angularDiameterDeg: (2 * Math.asin(MOON_MEAN_RADIUS_M / distanceM) * 180) / Math.PI,
  }
}
