import { describe, expect, it } from 'vitest'
import { moonHorizonCrossingMs, moonSkyPath } from './moonPath'
import { moonTopocentric } from './moon'
import type { GeoPoint } from '../geodesy/geodesy'

const LONATO: GeoPoint = { latitudeDeg: 45.5, longitudeDeg: 10.22, heightM: 0 }
const START_MS = Date.UTC(2026, 0, 21, 0)

/** Primo istante (passi di 30 min) la cui Luna soddisfa il predicato. */
function findInstantMs(observer: GeoPoint, predicate: (altitudeDeg: number) => boolean): number {
  for (let minutes = 0; minutes <= 60 * 24 * 40; minutes += 30) {
    const dateMs = START_MS + minutes * 60_000
    if (predicate(moonTopocentric(observer, new Date(dateMs)).altitudeDeg)) {
      return dateMs
    }
  }
  throw new Error('nessun istante soddisfa il predicato nella finestra di ricerca del test')
}

/** Prima coppia consecutiva (sotto, sopra) a passi di 30 min entro 40 giorni. */
function findBelowAbovePairMs(observer: GeoPoint): { belowMs: number; aboveMs: number } {
  let previousMs = findInstantMs(observer, (alt) => alt < -5)
  for (let minutes = 30; minutes <= 60 * 24 * 40; minutes += 30) {
    const dateMs = START_MS + minutes * 60_000
    if (moonTopocentric(observer, new Date(dateMs)).altitudeDeg > 0) {
      return { belowMs: previousMs, aboveMs: dateMs }
    }
    previousMs = dateMs
  }
  throw new Error('nessun attraversamento trovato nella finestra di ricerca del test')
}

describe('moonSkyPath', () => {
  it('il campione centrale coincide con la Luna all’orario in uso (coincidenza col billboard)', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    const center = path.samples[(path.samples.length - 1) / 2]
    expect(center.dateMs).toBe(centerMs)
    const moon = moonTopocentric(LONATO, new Date(centerMs))
    expect(center.azimuthDeg).toBeCloseTo(moon.azimuthDeg, 9)
    expect(center.altitudeDeg).toBeCloseTo(moon.altitudeDeg, 9)
    expect(path.radiusM).toBeCloseTo(moon.distanceM, 6)
  })

  it('capi della finestra: campioni a ±windowHours dall’orario in uso', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    expect(path.centerDateMs).toBe(centerMs)
    expect(path.samples[0].dateMs).toBe(centerMs - 6 * 3_600_000)
    expect(path.samples[path.samples.length - 1].dateMs).toBe(centerMs + 6 * 3_600_000)
  })

  it('campionamento uniforme: tempi crescenti, passo ≤ 5 min, orario in uso incluso', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    expect(path.samples.length % 2).toBe(1)
    expect(path.samples.some((sample) => sample.dateMs === centerMs)).toBe(true)
    for (let i = 1; i < path.samples.length; i += 1) {
      const deltaMs = path.samples[i].dateMs - path.samples[i - 1].dateMs
      expect(deltaMs).toBeGreaterThan(0)
      expect(deltaMs).toBeLessThanOrEqual(5 * 60_000 + 1)
    }
  })

  it('i campioni coincidono con moonTopocentric all’istante del campione', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    for (let i = 0; i < path.samples.length; i += 10) {
      const sample = path.samples[i]
      const moon = moonTopocentric(LONATO, new Date(sample.dateMs))
      expect(sample.azimuthDeg).toBeCloseTo(moon.azimuthDeg, 9)
      expect(sample.altitudeDeg).toBeCloseTo(moon.altitudeDeg, 9)
    }
  })

  it('l’azimut è continuo lungo l’arco (salti < 2° a passo di 5 min)', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    for (let i = 1; i < path.samples.length; i += 1) {
      const raw = Math.abs(path.samples[i].azimuthDeg - path.samples[i - 1].azimuthDeg)
      const wrapped = Math.min(raw, 360 - raw)
      expect(wrapped).toBeLessThan(2)
    }
  })

  it('raggio = distanza della Luna all’orario in uso, nel range fisico topocentrico', () => {
    // Range geocentrico NASA fact sheet (perigeo 356.500 km, apogeo 406.700 km)
    // allargato di ±6.500 km per la parallasse topocentrica (raggio terrestre).
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    expect(path.radiusM).toBeGreaterThan(350_000_000)
    expect(path.radiusM).toBeLessThan(413_200_000)
  })

  it('finestra personalizzata (windowHours): capi a ±1 h', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs, { windowHours: 1 })
    expect(path.windowHours).toBe(1)
    expect(path.samples[0].dateMs).toBe(centerMs - 3_600_000)
    expect(path.samples[path.samples.length - 1].dateMs).toBe(centerMs + 3_600_000)
  })

  it('cap sul numero di campioni (maxSamples) con centro ancora sull’orario in uso', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs, { maxSamples: 50 })
    expect(path.samples.length).toBeLessThanOrEqual(50)
    expect(path.samples[(path.samples.length - 1) / 2].dateMs).toBe(centerMs)
  })

  it('moonHorizonCrossingMs: il crossing sta tra i due istanti e sull’orizzonte (|alt| < 0,01°)', () => {
    const { belowMs, aboveMs } = findBelowAbovePairMs(LONATO)
    const crossingMs = moonHorizonCrossingMs(LONATO, belowMs, aboveMs)
    expect(crossingMs).toBeGreaterThan(belowMs)
    expect(crossingMs).toBeLessThan(aboveMs)
    expect(Math.abs(moonTopocentric(LONATO, new Date(crossingMs)).altitudeDeg)).toBeLessThan(0.01)
  })
})
