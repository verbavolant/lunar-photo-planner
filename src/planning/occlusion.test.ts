import { describe, expect, it } from 'vitest'
import { Cartesian3 } from 'cesium'
import {
  analyzeSightLine,
  DEFAULT_SIGHT_SAMPLES,
  MAX_SIGHT_SAMPLES,
  type RestrictivePoint,
  type SightLineReport,
} from './occlusion'
import type { GeoPoint } from '../geodesy/geodesy'
import type { LatLonPoint, TerrainHeightSampler } from './reverseAlignment'

/** Estremi di una corda meridiana di ~1,11 km a Brescia. */
const OBSERVER: GeoPoint = { latitudeDeg: 45.5, longitudeDeg: 10, heightM: 0 }
const TARGET: GeoPoint = { latitudeDeg: 45.51, longitudeDeg: 10, heightM: 0 }
const OBSERVER_H100: GeoPoint = { ...OBSERVER, heightM: 100 }
const TARGET_H100: GeoPoint = { ...TARGET, heightM: 100 }
const OBSERVER_H1: GeoPoint = { ...OBSERVER, heightM: 1 }
const TARGET_H1: GeoPoint = { ...TARGET, heightM: 1 }

function chordLengthM(from: GeoPoint, to: GeoPoint): number {
  return Cartesian3.distance(
    Cartesian3.fromDegrees(from.longitudeDeg, from.latitudeDeg, from.heightM),
    Cartesian3.fromDegrees(to.longitudeDeg, to.latitudeDeg, to.heightM),
  )
}

/** Sampler che registra le richieste e valuta il suolo con una funzione. */
function recordingSampler(
  groundAt: (point: LatLonPoint) => number | null,
  calls?: LatLonPoint[][],
): TerrainHeightSampler {
  return async (points) => {
    calls?.push([...points])
    return points.map(groundAt)
  }
}

/** Suolo piatto a quota `heightM`. */
function flatSampler(heightM: number, calls?: LatLonPoint[][]): TerrainHeightSampler {
  return recordingSampler(() => heightM, calls)
}

/** Suolo piatto con un rialzo di `bumpHeightM` in una banda a metà corda. */
function bumpSampler(bumpHeightM: number): TerrainHeightSampler {
  const midLatitudeDeg = (OBSERVER.latitudeDeg + TARGET.latitudeDeg) / 2
  return recordingSampler((point) =>
    Math.abs(point.latitudeDeg - midLatitudeDeg) <= 5e-4 ? bumpHeightM : 0,
  )
}

/** Suolo valutato sulla sola latitudine (per blocchi di campioni). */
function latitudeSampler(
  groundAt: (latitudeDeg: number) => number | null,
): TerrainHeightSampler {
  return recordingSampler((point) => groundAt(point.latitudeDeg))
}

/** Assert di aiuto: il punto più restrittivo deve esserci. */
function requireRestrictive(report: SightLineReport): RestrictivePoint {
  if (report.mostRestrictive === null) {
    throw new Error('Punto più restrittivo atteso, ma è null.')
  }
  return report.mostRestrictive
}

describe('analyzeSightLine', () => {
  it('valida sampleCount, soglia e posizioni con RangeError', async () => {
    const sampler = flatSampler(0)
    await expect(
      analyzeSightLine(OBSERVER, TARGET, sampler, { sampleCount: 0 }),
    ).rejects.toThrow(RangeError)
    await expect(
      analyzeSightLine(OBSERVER, TARGET, sampler, { sampleCount: MAX_SIGHT_SAMPLES + 1 }),
    ).rejects.toThrow(RangeError)
    await expect(
      analyzeSightLine(OBSERVER, TARGET, sampler, { sampleCount: 2.5 }),
    ).rejects.toThrow(RangeError)
    await expect(
      analyzeSightLine(OBSERVER, TARGET, sampler, { clearanceThresholdM: Number.NaN }),
    ).rejects.toThrow(RangeError)
    await expect(
      analyzeSightLine({ ...OBSERVER, heightM: Number.NaN }, TARGET, sampler),
    ).rejects.toThrow(RangeError)
  })

  it('campiona solo punti interni (estremi esclusi) e usa il default di 256', async () => {
    const calls: LatLonPoint[][] = []
    const sampler = flatSampler(0, calls)
    const report = await analyzeSightLine(OBSERVER_H100, TARGET_H100, sampler)
    expect(calls).toHaveLength(1)
    const firstCall = calls[0] ?? []
    expect(firstCall).toHaveLength(DEFAULT_SIGHT_SAMPLES)
    for (const point of firstCall) {
      expect(point.latitudeDeg).toBeGreaterThan(OBSERVER.latitudeDeg)
      expect(point.latitudeDeg).toBeLessThan(TARGET.latitudeDeg)
    }
    expect(report.sampleCount).toBe(DEFAULT_SIGHT_SAMPLES)
    expect(report.unsampledCount).toBe(0)
    expect(report.status).toBe('free')
  })

  it('accetta fino a MAX_SIGHT_SAMPLES campioni in una sola richiesta', async () => {
    const calls: LatLonPoint[][] = []
    const report = await analyzeSightLine(OBSERVER_H100, TARGET_H100, flatSampler(0, calls), {
      sampleCount: MAX_SIGHT_SAMPLES,
    })
    expect(calls[0]).toHaveLength(MAX_SIGHT_SAMPLES)
    expect(report.sampleCount).toBe(MAX_SIGHT_SAMPLES)
  })

  it('corda fra due punti a quota suolo su terreno piatto → occlusa per curvatura (≈ −d²/8R)', async () => {
    const lengthM = chordLengthM(OBSERVER, TARGET)
    const report = await analyzeSightLine(OBSERVER, TARGET, flatSampler(0), { sampleCount: 1 })
    expect(report.status).toBe('occluded')
    const point = requireRestrictive(report)
    // La corda retta scende sotto l'arco di superficie di ≈ d²/(8R)
    // (R medio 6 371 000 m): l'occlusione da curvatura emerge da sé.
    expect(point.clearanceM).toBeCloseTo(-(lengthM ** 2) / (8 * 6_371_000), 3)
    expect(point.groundHeightM).toBe(0)
    expect(point.latitudeDeg).toBeCloseTo((OBSERVER.latitudeDeg + TARGET.latitudeDeg) / 2, 3)
    expect(point.distanceFromTargetM).toBeCloseTo(lengthM / 2, 9)
  })

  it('corda a 100 m sul terreno piatto → libera, con margine ≈ 100 − d²/8R', async () => {
    const lengthM = chordLengthM(OBSERVER_H100, TARGET_H100)
    const report = await analyzeSightLine(OBSERVER_H100, TARGET_H100, flatSampler(0), {
      sampleCount: 1,
    })
    expect(report.status).toBe('free')
    const point = requireRestrictive(report)
    expect(point.clearanceM).toBeCloseTo(100 - (lengthM ** 2) / (8 * 6_371_000), 2)
    expect(point.distanceFromTargetM).toBeCloseTo(lengthM / 2, 9)
  })

  it('rialzo che interseca la corda → occlusa con punto e clearance coerenti', async () => {
    const lengthM = chordLengthM(OBSERVER, TARGET)
    const report = await analyzeSightLine(OBSERVER, TARGET, bumpSampler(50), { sampleCount: 1 })
    expect(report.status).toBe('occluded')
    const point = requireRestrictive(report)
    expect(point.groundHeightM).toBe(50)
    expect(point.clearanceM).toBeCloseTo(-50 - (lengthM ** 2) / (8 * 6_371_000), 2)
    expect(point.distanceFromTargetM).toBeCloseTo(lengthM / 2, 9)
  })

  it('applica la soglia di clearance esplicita in entrambe le direzioni', async () => {
    const lengthM = chordLengthM(OBSERVER_H1, TARGET_H1)
    // Corda a 1 m sul terreno con rialzo di 0,5 m a metà corda: clearance ≈ 0,5 − d²/8R.
    const reportFree = await analyzeSightLine(OBSERVER_H1, TARGET_H1, bumpSampler(0.5), {
      sampleCount: 1,
    })
    expect(reportFree.status).toBe('free')
    expect(requireRestrictive(reportFree).clearanceM).toBeCloseTo(
      0.5 - (lengthM ** 2) / (8 * 6_371_000),
      2,
    )
    // Con soglia 0,5 m la stessa clearance è sotto soglia → occlusa.
    const reportOccluded = await analyzeSightLine(OBSERVER_H1, TARGET_H1, bumpSampler(0.5), {
      sampleCount: 1,
      clearanceThresholdM: 0.5,
    })
    expect(reportOccluded.status).toBe('occluded')
  })

  it('punti senza quota → inconclusive con conteggio, MAI free per assenza dati', async () => {
    // Estremi a 100 m su suolo piatto a 0: i punti noti sono liberi, i primi
    // due campioni (lat < 45,505°) non hanno quota.
    const report = await analyzeSightLine(
      OBSERVER_H100,
      TARGET_H100,
      latitudeSampler((latitudeDeg) => (latitudeDeg < 45.505 ? null : 0)),
      { sampleCount: 4 },
    )
    expect(report.status).toBe('inconclusive')
    expect(report.unsampledCount).toBe(2)
    expect(report.sampleCount).toBe(4)
    expect(report.mostRestrictive).not.toBeNull()
  })

  it('un ostacolo certo prevale sui punti senza dati: occluded anche con buchi', async () => {
    // Estremi a 100 m; rialzo a 150 m nell'unico campione noto (t = 0,4),
    // tutti gli altri senza quota.
    const report = await analyzeSightLine(
      OBSERVER_H100,
      TARGET_H100,
      latitudeSampler((latitudeDeg) => (Math.abs(latitudeDeg - 45.504) <= 5e-4 ? 150 : null)),
      { sampleCount: 4 },
    )
    expect(report.status).toBe('occluded')
    expect(report.unsampledCount).toBe(3)
    const point = requireRestrictive(report)
    expect(point.groundHeightM).toBe(150)
    expect(point.clearanceM).toBeLessThan(0)
  })

  it('nessun punto con quota → inconclusive con mostRestrictive null', async () => {
    const report = await analyzeSightLine(
      OBSERVER_H100,
      TARGET_H100,
      latitudeSampler(() => null),
      { sampleCount: 3 },
    )
    expect(report.status).toBe('inconclusive')
    expect(report.unsampledCount).toBe(3)
    expect(report.mostRestrictive).toBeNull()
  })

  it('risposta del sampler di lunghezza sbagliata → errore esplicito', async () => {
    const badSampler: TerrainHeightSampler = async () => [0]
    await expect(
      analyzeSightLine(OBSERVER_H100, TARGET_H100, badSampler, { sampleCount: 3 }),
    ).rejects.toThrow('su 3 richieste')
  })
})