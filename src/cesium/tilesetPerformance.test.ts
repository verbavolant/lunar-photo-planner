import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_DETAIL_DISTANCE_M,
  dynamicSseDensityForMaxDistanceM,
  resolveTileMaxDetailDistanceM,
  tilesetPerformanceOptions,
} from './tilesetPerformance'

// Replica della formula reale di CesiumJS 1.146 (verificata su
// node_modules/cesium/Build/CesiumUnminified/Cesium.js, Math.js):
// CesiumMath.fog(d, ρ) = 1 - exp(-(ρ·d)²).
function cesiumFog(distanceM: number, density: number): number {
  const scalar = distanceM * density
  return 1 - Math.exp(-(scalar * scalar))
}

describe('dynamicSseDensityForMaxDistanceM', () => {
  it('calibrata su 1 km: il rilassamento (Math.fog) vale 0.5 esattamente a 1000 m', () => {
    const density = dynamicSseDensityForMaxDistanceM(1000)
    // ρ = sqrt(-ln(0.5)) / 1000 = sqrt(ln 2) / 1000.
    expect(density).toBe(Math.sqrt(Math.LN2) / 1000)
    expect(cesiumFog(1000, density)).toBeCloseTo(0.5, 12)
  })

  it('il default DEFAULT_MAX_DETAIL_DISTANCE_M produce la stessa calibrazione', () => {
    expect(dynamicSseDensityForMaxDistanceM(DEFAULT_MAX_DETAIL_DISTANCE_M)).toBe(
      dynamicSseDensityForMaxDistanceM(1000),
    )
  })

  it('progr. con la distanza: quasi nulla a 500 m, quasi satura a 2 km', () => {
    const density = dynamicSseDensityForMaxDistanceM(1000)
    // Vicino il dettaglio resta quello di default: rilassamento < 20%.
    expect(cesiumFog(500, density)).toBeLessThan(0.2)
    // Oltre il doppio della distanza scelta il rilassamento è quasi pieno.
    expect(cesiumFog(2000, density)).toBeGreaterThan(0.9)
  })

  it('scala con la distanza richiesta (2000 m → metà forza a 2000 m)', () => {
    const density = dynamicSseDensityForMaxDistanceM(2000)
    expect(cesiumFog(2000, density)).toBeCloseTo(0.5, 12)
  })

  it('input non validi → RangeError (mai densità NaN/silenziosa)', () => {
    expect(() => dynamicSseDensityForMaxDistanceM(0)).toThrow(RangeError)
    expect(() => dynamicSseDensityForMaxDistanceM(-100)).toThrow(RangeError)
    expect(() => dynamicSseDensityForMaxDistanceM(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => dynamicSseDensityForMaxDistanceM(1000, 0)).toThrow(RangeError)
    expect(() => dynamicSseDensityForMaxDistanceM(1000, 1)).toThrow(RangeError)
  })
})

describe('tilesetPerformanceOptions', () => {
  it('dynamicScreenSpaceError attivo con la densità calibrata sulla distanza', () => {
    const options = tilesetPerformanceOptions(1000)
    expect(options.dynamicScreenSpaceError).toBe(true)
    // density = sqrt(ln 2) / 1000 ≈ 8.3255e-4.
    expect(options.dynamicScreenSpaceErrorDensity).toBeCloseTo(8.3255e-4, 7)
  })

  it('non tocca maximumScreenSpaceError: vicino resta il default Cesium (16)', () => {
    const options = tilesetPerformanceOptions(500)
    expect(options.maximumScreenSpaceError).toBeUndefined()
  })
})

describe('resolveTileMaxDetailDistanceM', () => {
  it('assente → default 1000, nessun avviso', () => {
    expect(resolveTileMaxDetailDistanceM(undefined)).toEqual({
      maxDetailDistanceM: 1000,
      invalidWarning: null,
    })
  })

  it('vuoto → default 1000, nessun avviso', () => {
    expect(resolveTileMaxDetailDistanceM('')).toEqual({
      maxDetailDistanceM: 1000,
      invalidWarning: null,
    })
  })

  it('valore valido → usato così com\u2019è (trim incluso)', () => {
    expect(resolveTileMaxDetailDistanceM('2000')).toEqual({
      maxDetailDistanceM: 2000,
      invalidWarning: null,
    })
    expect(resolveTileMaxDetailDistanceM(' 1500 ')).toEqual({
      maxDetailDistanceM: 1500,
      invalidWarning: null,
    })
  })

  it('valore non valido → default + avviso (NaN, zero, negativo)', () => {
    for (const value of ['abc', '0', '-5', 'NaN']) {
      const resolved = resolveTileMaxDetailDistanceM(value)
      expect(resolved.maxDetailDistanceM).toBe(1000)
      expect(resolved.invalidWarning).toContain('tileMaxM')
      expect(resolved.invalidWarning).toContain(value)
    }
  })
})
