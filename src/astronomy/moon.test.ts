import { describe, expect, it } from 'vitest'
import { KM_PER_AU } from 'astronomy-engine'
import { moonTopocentric } from './moon'
import type { GeoPoint } from '../geodesy/geodesy'

// Osservatore di verifica: Lonato del Garda (stesso punto della vista demo).
const OBSERVER: GeoPoint = { latitudeDeg: 45.5, longitudeDeg: 10.22, heightM: 0 }

/**
 * Vettori di test scaricati dal vivo da JPL Horizons (API pubblica) il
 * 2026-10-06 con: COMMAND='301' (Luna), CENTER='coord@399',
 * SITE_COORD='10.22,45.5,0.0', QUANTITIES='2,4,20', atmos refraction NO
 * (AIRLESS). Azimut/altitudine apparenti airless e range topocentrico (AU).
 */
interface HorizonsVector {
  readonly isoUtc: string
  readonly azimuthDeg: number
  readonly altitudeDeg: number
  readonly rangeAu: number
}

const HORIZONS_VECTORS: HorizonsVector[] = [
  {
    isoUtc: '2026-10-06T18:00:00Z',
    azimuthDeg: 325.893237,
    altitudeDeg: -25.228715,
    rangeAu: 0.00252660055919,
  },
  {
    isoUtc: '2026-01-21T12:00:00Z',
    azimuthDeg: 152.829983,
    altitudeDeg: 28.685969,
    rangeAu: 0.00256318023381,
  },
]

describe('moonTopocentric contro JPL Horizons', () => {
  it.each(HORIZONS_VECTORS)(
    'coincide con Horizons per $isoUtc entro 0.005° di angolo e 50 km di distanza',
    (vector) => {
      const result = moonTopocentric(OBSERVER, new Date(vector.isoUtc))

      // Scarti misurati (2026-10-06): azimut −4.1″/−4.3″, altitudine −0.6″/+0.6″
      // (AE VSOP87 troncato vs Horizons DE441: 0.005° = 18″, margine 4×).
      expect(Math.abs(result.azimuthDeg - vector.azimuthDeg)).toBeLessThan(0.005)
      expect(Math.abs(result.altitudeDeg - vector.altitudeDeg)).toBeLessThan(0.005)

      // Scarto radiale misurato: +18.4 km / −31.2 km (la precisione RADIALE di AE
      // non è coperta dal suo obiettivo di 1 arcmin angolare). Impact sul
      // diametro: ~4e-5° (0,15″): trascurabile per la pianificazione.
      const expectedDistanceM = vector.rangeAu * KM_PER_AU * 1000
      expect(Math.abs(result.distanceM - expectedDistanceM)).toBeLessThan(50_000)

      // Diametro verificato contro il RANGE DI HORIZONS (non la distanza di AE) e
      // il raggio IAU 1737.4 km (NASA fact sheet): tolleranza 0.001° ≈ 25× lo
      // scarto atteso (~0.00004°).
      const expectedDiameterDeg =
        (2 * Math.asin(1_737_400 / expectedDistanceM) * 180) / Math.PI
      expect(Math.abs(result.angularDiameterDeg - expectedDiameterDeg)).toBeLessThan(0.001)
    },
  )

  it('diametro angolare lunare nel range fisico plausibile (0,49°–0,58°)', () => {
    for (const vector of HORIZONS_VECTORS) {
      const result = moonTopocentric(OBSERVER, new Date(vector.isoUtc))
      expect(result.angularDiameterDeg).toBeGreaterThan(0.49)
      expect(result.angularDiameterDeg).toBeLessThan(0.58)
    }
  })
})
