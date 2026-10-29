import { describe, expect, it } from 'vitest'
import {
  DAYLIGHT_LIMIT_DEG,
  sunTopocentric,
  sunTwilightLabel,
  sunTwilightState,
  twilightBand,
  type SunTwilightBand,
} from './sun'
import type { GeoPoint } from '../geodesy/geodesy'

// Osservatore di verifica: lo stesso di moon.test.ts (Lonato del Garda).
const OBSERVER: GeoPoint = { latitudeDeg: 45.5, longitudeDeg: 10.22, heightM: 0 }

/**
 * Righe scaricate dal vivo da JPL Horizons (API pubblica) il 2026-10-29 con:
 * COMMAND='10' (Sole), CENTER='coord@399', COORD_TYPE='GEODETIC',
 * SITE_COORD='10.22,45.5,0.0', QUANTITIES='2,4', «Atmos refraction: NO
 * (AIRLESS)» dall'header della risposta. Azimut/altitudine apparenti airless
 * del centro del Sole. `presence` è il CODICE DI PRESENZA SOLARE che Horizons
 * stampa accanto a ogni riga ('*' = giorno: lembo superiore rifratto sopra
 * l'orizzonte apparente; 'C' civile; 'N' nautico; 'A' astronomico; ' ' notte):
 * convenzione USNO calcolata da Horizons indipendentemente dal nostro codice,
 * usata come verifica delle soglie di twilightBand.
 */
interface HorizonsRow {
  readonly isoUtc: string
  readonly azimuthDeg: number
  readonly altitudeDeg: number
  readonly presence: '*' | 'C' | 'N' | 'A' | ' '
}

const HORIZONS_ROWS: HorizonsRow[] = [
  // 2026-01-21 12:00→12:01 UT (mezzogiorno, passo 1 min).
  { isoUtc: '2026-01-21T12:00:00Z', azimuthDeg: 187.638337, altitudeDeg: 24.316879, presence: '*' },
  { isoUtc: '2026-01-21T12:01:00Z', azimuthDeg: 187.895037, altitudeDeg: 24.293358, presence: '*' },
  // 2026-10-21 16:00→21:00 UT (tramonto e crepuscoli serali, passo 30 min).
  { isoUtc: '2026-10-21T16:00:00Z', azimuthDeg: 251.045483, altitudeDeg: 3.124982, presence: '*' },
  { isoUtc: '2026-10-21T16:30:00Z', azimuthDeg: 256.409639, altitudeDeg: -1.925645, presence: 'C' },
  { isoUtc: '2026-10-21T17:00:00Z', azimuthDeg: 261.679415, altitudeDeg: -7.090748, presence: 'N' },
  { isoUtc: '2026-10-21T17:30:00Z', azimuthDeg: 266.938626, altitudeDeg: -12.325543, presence: 'A' },
  { isoUtc: '2026-10-21T18:00:00Z', azimuthDeg: 272.277289, altitudeDeg: -17.586031, presence: 'A' },
  { isoUtc: '2026-10-21T18:30:00Z', azimuthDeg: 277.795328, altitudeDeg: -22.826385, presence: ' ' },
  { isoUtc: '2026-10-21T19:00:00Z', azimuthDeg: 283.60722, altitudeDeg: -27.995814, presence: ' ' },
  { isoUtc: '2026-10-21T19:30:00Z', azimuthDeg: 289.847188, altitudeDeg: -33.034648, presence: ' ' },
  { isoUtc: '2026-10-21T20:00:00Z', azimuthDeg: 296.673727, altitudeDeg: -37.869348, presence: ' ' },
  { isoUtc: '2026-10-21T20:30:00Z', azimuthDeg: 304.270363, altitudeDeg: -42.406312, presence: ' ' },
  { isoUtc: '2026-10-21T21:00:00Z', azimuthDeg: 312.835691, altitudeDeg: -46.525006, presence: ' ' },
  // 2026-10-21 05:00→07:30 UT (crepuscoli mattutini e alba, passo 15 min).
  { isoUtc: '2026-10-21T05:00:00Z', azimuthDeg: 96.876556, altitudeDeg: -8.271085, presence: 'N' },
  { isoUtc: '2026-10-21T05:15:00Z', azimuthDeg: 99.508859, altitudeDeg: -5.672072, presence: 'C' },
  { isoUtc: '2026-10-21T05:30:00Z', azimuthDeg: 102.149091, altitudeDeg: -3.093049, presence: 'C' },
  { isoUtc: '2026-10-21T05:45:00Z', azimuthDeg: 104.807719, altitudeDeg: -0.539625, presence: '*' },
  { isoUtc: '2026-10-21T06:00:00Z', azimuthDeg: 107.494957, altitudeDeg: 1.982433, presence: '*' },
  { isoUtc: '2026-10-21T06:15:00Z', azimuthDeg: 110.220835, altitudeDeg: 4.46713, presence: '*' },
  { isoUtc: '2026-10-21T06:30:00Z', azimuthDeg: 112.995226, altitudeDeg: 6.908176, presence: '*' },
  { isoUtc: '2026-10-21T06:45:00Z', azimuthDeg: 115.827865, altitudeDeg: 9.29893, presence: '*' },
  { isoUtc: '2026-10-21T07:00:00Z', azimuthDeg: 118.728326, altitudeDeg: 11.632334, presence: '*' },
  { isoUtc: '2026-10-21T07:15:00Z', azimuthDeg: 121.705972, altitudeDeg: 13.900869, presence: '*' },
  { isoUtc: '2026-10-21T07:30:00Z', azimuthDeg: 124.769852, altitudeDeg: 16.096502, presence: '*' },
]

describe('sunTopocentric contro JPL Horizons', () => {
  it.each(HORIZONS_ROWS)(
    'coincide con Horizons per $isoUtc entro 0.005° di angolo',
    (row) => {
      const result = sunTopocentric(OBSERVER, new Date(row.isoUtc))

      // Stessa tolleranza del motore lunare (moon.test.ts): lì gli scarti
      // misurati sono ~4″; 0.005° = 18″, margine 4×.
      expect(Math.abs(result.azimuthDeg - row.azimuthDeg)).toBeLessThan(0.005)
      expect(Math.abs(result.altitudeDeg - row.altitudeDeg)).toBeLessThan(0.005)
    },
  )
})

describe('twilightBand: soglie USNO', () => {
  it('corrisponde al codice di presenza solare di Horizons su tutte le righe', () => {
    const presenceBand: Record<HorizonsRow['presence'], SunTwilightBand> = {
      '*': 'day',
      C: 'civil',
      N: 'nautical',
      A: 'astronomical',
      ' ': 'night',
    }
    for (const row of HORIZONS_ROWS) {
      expect(twilightBand(row.altitudeDeg)).toBe(presenceBand[row.presence])
    }
  })

  it('ai limiti esatti vale la fascia successiva (confronti stretti)', () => {
    expect(twilightBand(1)).toBe('day')
    expect(twilightBand(0)).toBe('day')
    expect(twilightBand(-0.8)).toBe('day')
    expect(twilightBand(DAYLIGHT_LIMIT_DEG)).toBe('civil')
    expect(twilightBand(-0.9)).toBe('civil')
    expect(twilightBand(-6)).toBe('nautical')
    expect(twilightBand(-6.1)).toBe('nautical')
    expect(twilightBand(-12)).toBe('astronomical')
    expect(twilightBand(-17.9)).toBe('astronomical')
    expect(twilightBand(-18)).toBe('night')
    expect(twilightBand(-90)).toBe('night')
  })
})

describe('sunTwilightState su istanti reali (profilo Horizons 21/10/2026)', () => {
  it.each([
    { isoUtc: '2026-10-21T16:00:00Z', band: 'day', rising: null },
    { isoUtc: '2026-10-21T16:30:00Z', band: 'civil', rising: false },
    { isoUtc: '2026-10-21T17:00:00Z', band: 'nautical', rising: false },
    { isoUtc: '2026-10-21T17:30:00Z', band: 'astronomical', rising: false },
    { isoUtc: '2026-10-21T18:30:00Z', band: 'night', rising: null },
    { isoUtc: '2026-10-21T05:00:00Z', band: 'nautical', rising: true },
    { isoUtc: '2026-10-21T05:15:00Z', band: 'civil', rising: true },
    { isoUtc: '2026-01-21T12:00:00Z', band: 'day', rising: null },
  ])('$isoUtc → banda $band, rising $rising', ({ isoUtc, band, rising }) => {
    const state = sunTwilightState(OBSERVER, new Date(isoUtc))
    expect(state.band).toBe(band)
    expect(state.rising).toBe(rising)
  })

  it("l'altitudine dello stato è quella di sunTopocentric", () => {
    const date = new Date('2026-10-21T17:00:00Z')
    expect(sunTwilightState(OBSERVER, date).altitudeDeg).toBe(
      sunTopocentric(OBSERVER, date).altitudeDeg,
    )
  })
})

describe('sunTwilightLabel', () => {
  const state = (band: SunTwilightBand, rising: boolean | null) => ({
    altitudeDeg: 0,
    band,
    rising,
  })

  it('etichette italiane per tutte le fasce e i due versi', () => {
    expect(sunTwilightLabel(state('day', null))).toBe('Giorno')
    expect(sunTwilightLabel(state('night', null))).toBe('Notte')
    expect(sunTwilightLabel(state('civil', true))).toBe('Alba')
    expect(sunTwilightLabel(state('civil', false))).toBe('Tramonto')
    expect(sunTwilightLabel(state('nautical', true))).toBe('Alba nautica')
    expect(sunTwilightLabel(state('nautical', false))).toBe('Tramonto nautico')
    expect(sunTwilightLabel(state('astronomical', true))).toBe('Alba astronomica')
    expect(sunTwilightLabel(state('astronomical', false))).toBe('Tramonto astronomico')
  })
})