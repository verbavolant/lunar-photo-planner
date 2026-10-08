import { describe, expect, it } from 'vitest'
import {
  heightDifferenceM,
  inverseGeodesic,
  lineOfSightAzimuthDeg,
  straightDistanceM,
  verticalAngleDeg,
  type GeoPoint,
} from './geodesy'

// gradi/minuti/secondi → gradi decimali (con segno gestito dal chiamante)
function dmsToDeg(degrees: number, minutes: number, seconds: number): number {
  return degrees + minutes / 60 + seconds / 3600
}

// Coordinate dell'esempio classico di Vincenty (1975) riprese da
// movable-type.co.uk/scripts/latlong-vincenty.html (verificate 2026-10-06):
// Flinders Peak 37°57′03.72030″S, 144°25′29.52440″E
// Buninyong     37°39′10.15610″S, 143°55′35.38390″E
// s = 54 972.271 m; α1 = 306°52′05.37″; α2 = 307°10′25.07″ (p1→p2)
const FLINDERS: GeoPoint = {
  latitudeDeg: -dmsToDeg(37, 57, 3.7203),
  longitudeDeg: dmsToDeg(144, 25, 29.5244),
  heightM: 0,
}
const BUNINYONG: GeoPoint = {
  latitudeDeg: -dmsToDeg(37, 39, 10.1561),
  longitudeDeg: dmsToDeg(143, 55, 35.3839),
  heightM: 0,
}
const REFERENCE_DISTANCE_M = 54_972.271
const REFERENCE_AZI1_DEG = dmsToDeg(306, 52, 5.37)
const REFERENCE_AZI2_DEG = dmsToDeg(307, 10, 25.07)

// ~1000 m lungo il meridiano partendo dall'equatore (arco meridiano ≈ 110.574 m/°
// all'equatore; serve solo da input di test)
const ONE_KM_NORTH_LAT_DEG = 1000 / 110_574

describe('inverseGeodesic — Vincenty inverse su WGS84', () => {
  it("riproduce l'esempio di riferimento Flinders Peak → Buninyong (Vincenty 1975)", () => {
    const result = inverseGeodesic(FLINDERS, BUNINYONG)

    expect(Math.abs(result.distanceM - REFERENCE_DISTANCE_M)).toBeLessThan(0.002)
    expect(Math.abs(result.initialBearingDeg - REFERENCE_AZI1_DEG)).toBeLessThan(0.0005)
    expect(Math.abs(result.finalBearingDeg - REFERENCE_AZI2_DEG)).toBeLessThan(0.0005)
  })

  it('direzione inversa: azimut iniziale coerente con quello finale del verso diretto', () => {
    const direct = inverseGeodesic(FLINDERS, BUNINYONG)
    const reverse = inverseGeodesic(BUNINYONG, FLINDERS)

    expect(reverse.initialBearingDeg).toBeCloseTo((direct.finalBearingDeg + 180) % 360, 4)
    expect(reverse.finalBearingDeg).toBeCloseTo((direct.initialBearingDeg + 180) % 360, 4)
  })

  it('punti coincidenti: distanza nulla', () => {
    const result = inverseGeodesic(FLINDERS, FLINDERS)
    expect(result.distanceM).toBe(0)
  })

  it("linea nord-sud lungo un meridiano: azimut 0 in entrambi i punti", () => {
    const result = inverseGeodesic(
      { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 },
      { latitudeDeg: 1, longitudeDeg: 0, heightM: 0 },
    )
    expect(result.initialBearingDeg).toBeCloseTo(0, 9)
    expect(result.finalBearingDeg).toBeCloseTo(0, 9)
  })
})

describe("linea est-ovest sull'equatore: azimut 90; verso ovest: 270", () => {
  it('verso est: 90°, verso ovest: 270°', () => {
    const east = inverseGeodesic(
      { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 },
      { latitudeDeg: 0, longitudeDeg: 1, heightM: 0 },
    )
    expect(east.initialBearingDeg).toBeCloseTo(90, 9)
    expect(east.finalBearingDeg).toBeCloseTo(90, 9)

    const west = inverseGeodesic(
      { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 },
      { latitudeDeg: 0, longitudeDeg: -1, heightM: 0 },
    )
    expect(west.initialBearingDeg).toBeCloseTo(270, 9)
  })
})

describe('punti quasi antipodali', () => {
  it('rifiuta con errore esplicito (Vincenty non converge)', () => {
    expect(() =>
      inverseGeodesic(
        { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 },
        { latitudeDeg: 0, longitudeDeg: 179.9, heightM: 0 },
      ),
    ).toThrow(RangeError)
  })

  it('accetta linee lunghe ma non antipodali (170° di longitudine)', () => {
    const result = inverseGeodesic(
      { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 },
      { latitudeDeg: 0, longitudeDeg: 170, heightM: 0 },
    )
    expect(result.distanceM).toBeGreaterThan(18_000_000)
  })
})

describe('heightDifferenceM', () => {
  it('è Target − Observer (positiva se il Target è più alto)', () => {
    expect(heightDifferenceM({ ...BUNINYONG, heightM: 500 }, FLINDERS)).toBe(500)
    expect(heightDifferenceM(FLINDERS, { ...BUNINYONG, heightM: 500 })).toBe(-500)
  })
})

describe('straightDistanceM — corda 3D Observer→Target', () => {
  it('punto direttamente sopra: quota esatta', () => {
    expect(
      straightDistanceM(
        { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 },
        { latitudeDeg: 0, longitudeDeg: 0, heightM: 500 },
      ),
    ).toBeCloseTo(500, 6)
  })

  it('~1000 m lungo il meridiano: corda ≈ arco (<1 m di differenza)', () => {
    const chord = straightDistanceM(
      { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 },
      { latitudeDeg: ONE_KM_NORTH_LAT_DEG, longitudeDeg: 0, heightM: 0 },
    )
    expect(Math.abs(chord - 1000)).toBeLessThan(1)
  })
})

describe("verticalAngleDeg — elevazione rispetto all'orizzonte locale", () => {
  it("punto in verticale sopra l'Observer: +90°; sotto: −90°", () => {
    expect(
      verticalAngleDeg(
        { latitudeDeg: 45, longitudeDeg: 9, heightM: 0 },
        { latitudeDeg: 45, longitudeDeg: 9, heightM: 500 },
      ),
    ).toBeCloseTo(90, 9)
    expect(
      verticalAngleDeg(
        { latitudeDeg: 45, longitudeDeg: 9, heightM: 500 },
        { latitudeDeg: 45, longitudeDeg: 9, heightM: 0 },
      ),
    ).toBeCloseTo(-90, 9)
  })

  it('punti coincidenti: errore esplicito', () => {
    expect(() => verticalAngleDeg(FLINDERS, FLINDERS)).toThrow(/coincidono/)
  })

  it('Target ~1000 m a nord alla stessa quota: vicino all\u2019orizzonte (leggero dip)', () => {
    const elevation = verticalAngleDeg(
      { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 },
      { latitudeDeg: ONE_KM_NORTH_LAT_DEG, longitudeDeg: 0, heightM: 0 },
    )
    expect(Math.abs(elevation)).toBeLessThan(0.05)
  })

  it('Target a ~1000 m orizzontali e 500 m sopra: atan2(500, 1000) ≈ 26,565°', () => {
    const elevation = verticalAngleDeg(
      { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 },
      { latitudeDeg: ONE_KM_NORTH_LAT_DEG, longitudeDeg: 0, heightM: 500 },
    )
    expect(Math.abs(elevation - (Math.atan(0.5) * 180) / Math.PI)).toBeLessThan(0.01)
  })
})

describe("lineOfSightAzimuthDeg — azimut orizzontale della corda 3D Observer→Target", () => {
  const OBSERVER_45_10: GeoPoint = { latitudeDeg: 45, longitudeDeg: 10, heightM: 0 }

  /** Differenza circolare tra azimut in [0, 180], robusta al wrap 0/360. */
  function circularDifferenceDeg(a: number, b: number): number {
    return Math.abs(((a - b + 540) % 360) - 180)
  }

  it('Target sullo stesso meridiano: 0° a nord, 180° a sud (la corda resta nel piano meridiano)', () => {
    // Il confronto è circolare: il rumore float sul prodotto vettoriale può
    // dare 359,99999999999° invece di 0°.
    const north = lineOfSightAzimuthDeg(
      OBSERVER_45_10,
      { latitudeDeg: 45.01, longitudeDeg: 10, heightM: 0 },
    )
    expect(circularDifferenceDeg(north, 0)).toBeLessThan(1e-9)
    const south = lineOfSightAzimuthDeg(
      OBSERVER_45_10,
      { latitudeDeg: 44.99, longitudeDeg: 10, heightM: 0 },
    )
    expect(circularDifferenceDeg(south, 180)).toBeLessThan(1e-9)
  })

  it('Target alla stessa latitudine: ~90° a est, ~270° a ovest (sagitta della corda del parallelo)', () => {
    // La corda tra due punti dello stesso parallelo passa all'interno del
    // parallelo: a lat 45° e Δlon 0,02° la deviazione misurata è ~0,007°
    // (geometria reale, non errore numerico); tolleranza 0,02°.
    const east = lineOfSightAzimuthDeg(
      OBSERVER_45_10,
      { latitudeDeg: 45, longitudeDeg: 10.02, heightM: 0 },
    )
    expect(circularDifferenceDeg(east, 90)).toBeLessThan(0.02)
    const west = lineOfSightAzimuthDeg(
      OBSERVER_45_10,
      { latitudeDeg: 45, longitudeDeg: 9.98, heightM: 0 },
    )
    expect(circularDifferenceDeg(west, 270)).toBeLessThan(0.02)
  })

  it('Target a nordest: coerente col rapporto metrico lat/lon entro 0,15°', () => {
    // Δlat = Δlon = 0,01°: riferimento sferico atan2(cos 45°, 1) ≈ 35,26°;
    // la metrica WGS84 (gradi di lon più corti a lat 45) e la sagitta della
    // corda spostano il valore reale di ~0,1°: tolleranza 0,15°.
    const azimuth = lineOfSightAzimuthDeg(
      OBSERVER_45_10,
      { latitudeDeg: 45.01, longitudeDeg: 10.01, heightM: 0 },
    )
    const sphericalReference = (Math.atan2(Math.cos((45 * Math.PI) / 180), 1) * 180) / Math.PI
    expect(Math.abs(azimuth - sphericalReference)).toBeLessThan(0.15)
  })

  it('punti coincidenti: errore esplicito', () => {
    expect(() => lineOfSightAzimuthDeg(OBSERVER_45_10, OBSERVER_45_10)).toThrow(/coincidono/)
  })
})
