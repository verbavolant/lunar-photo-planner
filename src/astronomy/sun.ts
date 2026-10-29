import { Body, Equator, Horizon, Observer } from 'astronomy-engine'
import type { GeoPoint } from '../geodesy/geodesy'

/** Posizione apparente del Sole vista dall'Observer (topocentrica), airless. */
export interface SunTopocentric {
  /** Azimut apparente in gradi: 0 = nord, 90 = est, range [0, 360). */
  readonly azimuthDeg: number
  /** Altitudine apparente del CENTRO del Sole in gradi, senza rifrazione atmosferica. */
  readonly altitudeDeg: number
}

/** Fascia di luce del cielo in funzione dell'altitudine del centro del Sole. */
export type SunTwilightBand = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night'

export interface SunTwilightState {
  readonly altitudeDeg: number
  readonly band: SunTwilightBand
  /**
   * Verso dell'altitudine solare: true = in aumento (alba), false = in calo
   * (tramonto). `null` per giorno e notte, dove il verso non è pertinente.
   */
  readonly rising: boolean | null
}

/**
 * Soglie dei crepuscoli sull'altitudine GEOMETRICA (airless) del centro del
 * Sole, definizioni USNO «Rise, Set, and Twilight Definitions»
 * (aa.usno.navy.mil/faq/RST_defs, verificato 2026-10-29): crepuscolo civile
 * dove la distanza zenitale geometrica del centro è 96° (altitudine −6°),
 * nautico 102° (−12°), astronomico 108° (−18°). Alba/tramonto = lembo
 * superiore sull'orizzonte apparente: depressione geometrica del centro di
 * 50′ (raggio solare 16′ + rifrazione media all'orizzonte 34′) = −0,8333°.
 * Confronti stretti: al limite esatto la fascia successiva è già iniziata
 * (stessa convenzione del filtro orizzonte in alignment.ts).
 */
export const DAYLIGHT_LIMIT_DEG = -(50 / 60)
export const CIVIL_TWILIGHT_LIMIT_DEG = -6
export const NAUTICAL_TWILIGHT_LIMIT_DEG = -12
export const ASTRONOMICAL_TWILIGHT_LIMIT_DEG = -18

/** Fascia USNO per l'altitudine geometrica del centro del Sole. */
export function twilightBand(altitudeDeg: number): SunTwilightBand {
  if (altitudeDeg > DAYLIGHT_LIMIT_DEG) {
    return 'day'
  }
  if (altitudeDeg > CIVIL_TWILIGHT_LIMIT_DEG) {
    return 'civil'
  }
  if (altitudeDeg > NAUTICAL_TWILIGHT_LIMIT_DEG) {
    return 'nautical'
  }
  if (altitudeDeg > ASTRONOMICAL_TWILIGHT_LIMIT_DEG) {
    return 'astronomical'
  }
  return 'night'
}

/** Posizione apparente del Sole: stesso motore e convenzioni di moonTopocentric. */
export function sunTopocentric(observer: GeoPoint, date: Date): SunTopocentric {
  const aeObserver = new Observer(observer.latitudeDeg, observer.longitudeDeg, observer.heightM)
  const equatorial = Equator(Body.Sun, date, aeObserver, true, true)
  const horizontal = Horizon(date, aeObserver, equatorial.ra, equatorial.dec)
  return {
    azimuthDeg: horizontal.azimuth,
    altitudeDeg: horizontal.altitude,
  }
}

/**
 * Sonda del verso dell'altitudine solare: cambia al più ~0,25°/min (rotazione
 * diurna, lo stesso limite di Lipschitz del moto lunare in alignment.ts),
 * quindi 2 minuti separano alba e tramonto con margine. Agli estremi polari
 * la fascia può essere stazionaria in un estremo locale: il verso non è
 * definibile e il confronto stretto etichetta come tramonto (caso limite
 * accettato, non raggiungibile alle latitudini di uso normale).
 */
const RISING_PROBE_MINUTES = 2

/** Stato del Sole all'istante dato: banda di crepuscolo + verso alba/tramonto. */
export function sunTwilightState(observer: GeoPoint, date: Date): SunTwilightState {
  const now = sunTopocentric(observer, date)
  const band = twilightBand(now.altitudeDeg)
  if (band === 'day' || band === 'night') {
    return { altitudeDeg: now.altitudeDeg, band, rising: null }
  }
  const probe = sunTopocentric(observer, new Date(date.getTime() + RISING_PROBE_MINUTES * 60_000))
  return {
    altitudeDeg: now.altitudeDeg,
    band,
    rising: probe.altitudeDeg > now.altitudeDeg,
  }
}

/** Etichetta italiana dello stato del Sole per la UI (box Dati e risultati). */
export function sunTwilightLabel(state: SunTwilightState): string {
  switch (state.band) {
    case 'day':
      return 'Giorno'
    case 'night':
      return 'Notte'
    case 'civil':
      return state.rising ? 'Alba' : 'Tramonto'
    case 'nautical':
      return state.rising ? 'Alba nautica' : 'Tramonto nautico'
    case 'astronomical':
      return state.rising ? 'Alba astronomica' : 'Tramonto astronomico'
  }
}