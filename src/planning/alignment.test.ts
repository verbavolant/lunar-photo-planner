import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ALIGNMENT_SEARCH,
  angularSeparationDeg,
  azimuthDifferenceDeg,
  searchMoonAlignments,
} from './alignment'
import type { GeoPoint } from '../geodesy/geodesy'

// Osservatore di verifica: Lonato del Garda (stesso punto della vista demo).
const OBSERVER: GeoPoint = { latitudeDeg: 45.5, longitudeDeg: 10.22, heightM: 0 }

// Istante del vettore Horizons di moon.test.ts: Luna a az 152,829983°,
// alt 28,685969° dall'OBSERVER. La linea di vista generata da questi valori
// passa esattamente per la Luna in quell'istante (per costruzione).
const CROSSING_UTC_MS = Date.UTC(2026, 0, 21, 12, 0, 0)

describe('azimuthDifferenceDeg — differenza di azimut portata in (-180, 180]', () => {
  it('positiva quando il secondo azimut è più a est (senso orario)', () => {
    expect(azimuthDifferenceDeg(350, 10)).toBe(20)
    expect(azimuthDifferenceDeg(10, 350)).toBe(-20)
    expect(azimuthDifferenceDeg(0, 180)).toBe(180)
    expect(azimuthDifferenceDeg(0, 181)).toBe(-179)
    expect(azimuthDifferenceDeg(5, -5)).toBe(-10)
  })
})

describe('angularSeparationDeg — trigonometria sferica (Meeus, cap. 17)', () => {
  it('casi noti esatti', () => {
    expect(angularSeparationDeg(0, 0, 90, 0)).toBeCloseTo(90, 9)
    expect(angularSeparationDeg(0, 45, 90, 45)).toBeCloseTo(60, 9)
    expect(angularSeparationDeg(0, 0, 0, 30)).toBeCloseTo(30, 9)
    expect(angularSeparationDeg(100, 20, 100, 20)).toBeCloseTo(0, 9)
  })

  it('simmetrica rispetto allo scambio delle direzioni', () => {
    expect(angularSeparationDeg(350, -10, 10, 25)).toBeCloseTo(
      angularSeparationDeg(10, 25, 350, -10),
      9,
    )
  })
})

describe('searchMoonAlignments — attraversamenti reali della linea di vista', () => {
  it('trova l\u2019attraversamento noto (Horizons 2026-01-21T12:00Z) entro 2 minuti', () => {
    const results = searchMoonAlignments({
      observer: OBSERVER,
      losAzimuthDeg: 152.829983,
      losAltitudeDeg: 28.685969,
      fromDateMs: CROSSING_UTC_MS,
      durationHours: 2,
      stepMinutes: 1,
      toleranceDeg: 0.5,
      maxResults: 5,
    })

    expect(results.length).toBeGreaterThanOrEqual(1)
    // Un passaggio produce UN candidato: nessun duplicato a distanza di passo.
    for (let index = 1; index < results.length; index++) {
      const previous = results[index - 1]
      const current = results[index]
      if (previous === undefined || current === undefined) {
        continue
      }
      expect(current.dateMs - previous.dateMs).toBeGreaterThanOrEqual(60_000)
    }
    let best = results[0]
    for (const candidate of results) {
      if (best === undefined || candidate.separationDeg < best.separationDeg) {
        best = candidate
      }
    }
    if (best === undefined) {
      throw new Error('Nessun candidato trovato')
    }
    expect(Math.abs(best.dateMs - CROSSING_UTC_MS)).toBeLessThanOrEqual(2 * 60_000)
    expect(best.separationDeg).toBeLessThan(0.25)
    // Sul passaggio vero la Luna è praticamente sulla linea: offset ~0.
    expect(Math.abs(best.horizontalOffsetDeg)).toBeLessThan(0.5)
    expect(Math.abs(best.verticalOffsetDeg)).toBeLessThan(0.5)
  })

  it('nessun finto positivo verso una direzione irraggiungibile (nord, alt 60°, 3 h)', () => {
    // A lat 45,5° verso nord la Luna (declinazione ≤ ~28,7°) non sale mai oltre
    // ~lat − (90 − dec) ≈ −16°: la direzione (az 0, alt 60) è irraggiungibile,
    // la ricerca deve restare vuota (niente falso positivo numerico).
    const results = searchMoonAlignments({
      observer: OBSERVER,
      losAzimuthDeg: 0,
      losAltitudeDeg: 60,
      fromDateMs: CROSSING_UTC_MS,
      durationHours: 3,
      stepMinutes: 5,
      toleranceDeg: 0.5,
      maxResults: 5,
    })
    expect(results).toEqual([])
  })

  it('default esportati per l\u2019anteprima UI (finestra 2 mesi, passo coarse 15\u2032)', () => {
    expect(DEFAULT_ALIGNMENT_SEARCH).toEqual({
      durationHours: 1440,
      stepMinutes: 15,
      toleranceDeg: 1,
      maxResults: 8,
    })
  })

  it('il raffinamento recupera un attraversamento che il passo coarse perderebbe', () => {
    // Passo coarse 30′ con partenza 23′ PRIMA dell'attraversamento noto: i
    // campioni coarse più vicini cadono a ~1,8° (12:07) e ~6° (11:37), oltre
    // la tolleranza 0,5° — senza raffinamento la ricerca sarebbe vuota.
    const results = searchMoonAlignments({
      observer: OBSERVER,
      losAzimuthDeg: 152.829983,
      losAltitudeDeg: 28.685969,
      fromDateMs: CROSSING_UTC_MS - 23 * 60_000,
      durationHours: 2,
      stepMinutes: 30,
      toleranceDeg: 0.5,
      maxResults: 5,
    })

    expect(results.length).toBeGreaterThanOrEqual(1)
    let best = results[0]
    for (const candidate of results) {
      if (best === undefined || candidate.separationDeg < best.separationDeg) {
        best = candidate
      }
    }
    if (best === undefined) {
      throw new Error('Nessun candidato trovato')
    }
    expect(Math.abs(best.dateMs - CROSSING_UTC_MS)).toBeLessThanOrEqual(2 * 60_000)
    expect(best.separationDeg).toBeLessThan(0.3)
  })
})