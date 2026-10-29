import { describe, expect, it } from 'vitest'
import { moonSkyPath } from './moonPath'
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

/**
 * Sorgere con la Luna sotto l'orizzonte 10 h prima (il gap tra passaggi a
 * lat 45° supera sempre 10 h: il test lo verifica esplicitamente).
 */
function findRiseWithGapMs(observer: GeoPoint): number {
  const centerMs = findInstantMs(observer, (alt) => alt > 20)
  const first = moonSkyPath(observer, centerMs)
  if (first === null) {
    throw new Error('nessun passaggio trovato dal test')
  }
  let riseMs = first.riseDateMs
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const probeMs = riseMs - 10 * 3_600_000
    if (moonTopocentric(observer, new Date(probeMs)).altitudeDeg <= 0) {
      return riseMs
    }
    const next = moonSkyPath(observer, riseMs + 24 * 3_600_000)
    if (next === null) {
      throw new Error('passaggio successivo non trovato dal test')
    }
    riseMs = next.riseDateMs
  }
  throw new Error('nessun sorgere con 10 h di Luna sotto l\u2019orizzonte')
}

describe('moonSkyPath', () => {
  it('passaggio in corso: contiene l\u2019orario, capi sull\u2019orizzonte, interni sopra', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    expect(path).not.toBeNull()
    if (path === null) {
      return
    }
    expect(path.riseDateMs).toBeLessThanOrEqual(centerMs)
    expect(path.setDateMs).toBeGreaterThanOrEqual(centerMs)
    const last = path.samples.length - 1
    expect(Math.abs(path.samples[0].altitudeDeg)).toBeLessThan(0.05)
    expect(Math.abs(path.samples[last].altitudeDeg)).toBeLessThan(0.05)
    for (let i = 1; i < last; i += 1) {
      expect(path.samples[i].altitudeDeg).toBeGreaterThan(-0.05)
    }
    expect(path.samples[0].dateMs).toBe(path.riseDateMs)
    expect(path.samples[last].dateMs).toBe(path.setDateMs)
  })

  it('campionamento uniforme: tempi crescenti, passo ≤ 5 min', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    expect(path).not.toBeNull()
    if (path === null) {
      return
    }
    for (let i = 1; i < path.samples.length; i += 1) {
      const deltaMs = path.samples[i].dateMs - path.samples[i - 1].dateMs
      expect(deltaMs).toBeGreaterThan(0)
      expect(deltaMs).toBeLessThanOrEqual(5 * 60_000 + 1)
    }
  })

  it('i campioni coincidono con moonTopocentric all\u2019istante del campione', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    expect(path).not.toBeNull()
    if (path === null) {
      return
    }
    for (let i = 0; i < path.samples.length; i += 10) {
      const sample = path.samples[i]
      const moon = moonTopocentric(LONATO, new Date(sample.dateMs))
      expect(sample.azimuthDeg).toBeCloseTo(moon.azimuthDeg, 9)
      expect(sample.altitudeDeg).toBeCloseTo(moon.altitudeDeg, 9)
    }
  })

  it('l\u2019azimut è continuo lungo l\u2019arco (salti < 2° a passo di 5 min)', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    expect(path).not.toBeNull()
    if (path === null) {
      return
    }
    for (let i = 1; i < path.samples.length; i += 1) {
      const raw = Math.abs(path.samples[i].azimuthDeg - path.samples[i - 1].azimuthDeg)
      const wrapped = Math.min(raw, 360 - raw)
      expect(wrapped).toBeLessThan(2)
    }
  })

  it('Luna sotto l\u2019orizzonte: restituisce il PROSSIMO passaggio (sorgere futuro)', () => {
    const belowMs = findInstantMs(LONATO, (alt) => alt < -5)
    const path = moonSkyPath(LONATO, belowMs)
    expect(path).not.toBeNull()
    if (path === null) {
      return
    }
    expect(path.riseDateMs).toBeGreaterThan(belowMs)
    const last = path.samples.length - 1
    for (let i = 1; i < last; i += 1) {
      expect(path.samples[i].altitudeDeg).toBeGreaterThan(-0.05)
    }
  })

  it('distanza a metà passaggio nel range fisico topocentrico', () => {
    // Range geocentrico NASA fact sheet (perigeo 356.500 km, apogeo 406.700 km)
    // allargato di ±6.500 km per la parallasse topocentrica (raggio terrestre).
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    expect(path).not.toBeNull()
    if (path === null) {
      return
    }
    expect(path.midDistanceM).toBeGreaterThan(350_000_000)
    expect(path.midDistanceM).toBeLessThan(413_200_000)
  })

  it('finestra di ricerca ristretta e nessun passaggio: null', () => {
    const riseMs = findRiseWithGapMs(LONATO)
    const probeMs = riseMs - 10 * 3_600_000
    expect(moonTopocentric(LONATO, new Date(probeMs)).altitudeDeg).toBeLessThanOrEqual(0)
    expect(moonSkyPath(LONATO, probeMs, { searchWindowHours: 1 })).toBeNull()
  })

  it('cap sul numero di campioni con passaggi lunghi (maxSamples)', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs, { maxSamples: 50 })
    expect(path).not.toBeNull()
    if (path === null) {
      return
    }
    expect(path.samples.length).toBeLessThanOrEqual(50)
    expect(path.samples[0].dateMs).toBe(path.riseDateMs)
    expect(path.samples[path.samples.length - 1].dateMs).toBe(path.setDateMs)
  })
})
