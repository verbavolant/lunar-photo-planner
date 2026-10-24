import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ALIGNMENT_SEARCH,
  alignmentDegs,
  angularSeparationDeg,
  azimuthDifferenceDeg,
  searchMoonAlignments,
} from './alignment'
import { moonTopocentric } from '../astronomy/moon'
import type { GeoPoint } from '../geodesy/geodesy'

// Osservatore di verifica: Lonato del Garda (punto arbitrario di verifica).
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

describe('alignmentDegs — misura pura Luna ↔ linea di vista', () => {
  it('Luna esattamente sulla linea: separazione e offset nulli', () => {
    const moon = {
      azimuthDeg: 152.829983,
      altitudeDeg: 28.685969,
      distanceM: 380_000_000,
      angularDiameterDeg: 0.55,
    }
    const offsets = alignmentDegs(152.829983, 28.685969, moon)
    // acos(sin²+cos²) per direzioni identiche resta ~1e-6° per la precisione
    // del double vicino a 1 (≈ 0,003″): tolleranza 1e-5°, non 1e-9°.
    expect(offsets.separationDeg).toBeCloseTo(0, 5)
    expect(offsets.horizontalOffsetDeg).toBeCloseTo(0, 9)
    expect(offsets.verticalOffsetDeg).toBeCloseTo(0, 9)
  })

  it('casi noti: offset orizzontale = Δazimut, verticale = Δaltitudine', () => {
    const eastMoon = { azimuthDeg: 90, altitudeDeg: 0, distanceM: 1, angularDiameterDeg: 0 }
    const east = alignmentDegs(0, 0, eastMoon)
    expect(east.separationDeg).toBeCloseTo(90, 9)
    expect(east.horizontalOffsetDeg).toBe(90)
    expect(east.verticalOffsetDeg).toBe(0)

    // Attraverso il nord: Δazimut −10 (a sinistra), separazione 10.
    const wrappedMoon = { azimuthDeg: 350, altitudeDeg: 0, distanceM: 1, angularDiameterDeg: 0 }
    const wrapped = alignmentDegs(0, 0, wrappedMoon)
    expect(wrapped.separationDeg).toBeCloseTo(10, 9)
    expect(wrapped.horizontalOffsetDeg).toBe(-10)
    expect(wrapped.verticalOffsetDeg).toBe(0)

    const highMoon = { azimuthDeg: 0, altitudeDeg: 30, distanceM: 1, angularDiameterDeg: 0 }
    const high = alignmentDegs(0, 0, highMoon)
    expect(high.separationDeg).toBeCloseTo(30, 9)
    expect(high.horizontalOffsetDeg).toBe(0)
    expect(high.verticalOffsetDeg).toBe(30)
  })

  it('coerente con i candidati della ricerca sul passaggio noto (Horizons)', () => {
    const { candidates: results } = searchMoonAlignments({
      observer: OBSERVER,
      losAzimuthDeg: 152.829983,
      losAltitudeDeg: 28.685969,
      fromDateMs: CROSSING_UTC_MS,
      durationHours: 2,
      stepMinutes: 1,
      toleranceDeg: 0.5,
      maxResults: 5,
    })
    const best = results[0]
    if (best === undefined) {
      throw new Error('Nessun candidato trovato')
    }
    const moon = moonTopocentric(OBSERVER, new Date(best.dateMs))
    const offsets = alignmentDegs(152.829983, 28.685969, moon)
    expect(offsets.separationDeg).toBeCloseTo(best.separationDeg, 9)
    expect(offsets.horizontalOffsetDeg).toBeCloseTo(best.horizontalOffsetDeg, 9)
    expect(offsets.verticalOffsetDeg).toBeCloseTo(best.verticalOffsetDeg, 9)
  })
})

describe('searchMoonAlignments — attraversamenti reali della linea di vista', () => {
  it('trova l\u2019attraversamento noto (Horizons 2026-01-21T12:00Z) entro 2 minuti', () => {
    const { candidates: results, totalFound } = searchMoonAlignments({
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
    expect(totalFound).toBeGreaterThanOrEqual(results.length)
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
    const result = searchMoonAlignments({
      observer: OBSERVER,
      losAzimuthDeg: 0,
      losAltitudeDeg: 60,
      fromDateMs: CROSSING_UTC_MS,
      durationHours: 3,
      stepMinutes: 5,
      toleranceDeg: 0.5,
      maxResults: 5,
    })
    expect(result.candidates).toEqual([])
    expect(result.totalFound).toBe(0)
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
    const { candidates: results } = searchMoonAlignments({
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

  it('ranking per separazione crescente (tie-break per data) e troncamento a maxResults', () => {
    // Finestra lunga (60 giorni, il default) e tolleranza larga: più passaggi
    // distinti, così ranking e troncamento agiscono insieme (il passaggio
    // noto è in finestra). Verificato 2026-10-21: 8 passaggi trovati, 3 mostrati.
    const result = searchMoonAlignments({
      observer: OBSERVER,
      losAzimuthDeg: 152.829983,
      losAltitudeDeg: 28.685969,
      fromDateMs: CROSSING_UTC_MS,
      durationHours: 24 * 60,
      stepMinutes: 15,
      toleranceDeg: 5,
      maxResults: 3,
    })

    expect(result.candidates.length).toBe(3)
    expect(result.totalFound).toBeGreaterThan(result.candidates.length)
    for (let index = 1; index < result.candidates.length; index++) {
      const previous = result.candidates[index - 1]
      const current = result.candidates[index]
      if (previous === undefined || current === undefined) {
        continue
      }
      expect(current.separationDeg).toBeGreaterThanOrEqual(previous.separationDeg)
      if (current.separationDeg === previous.separationDeg) {
        expect(current.dateMs).toBeGreaterThanOrEqual(previous.dateMs)
      }
    }
  })
})