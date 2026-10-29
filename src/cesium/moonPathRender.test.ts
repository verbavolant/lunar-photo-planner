import { describe, expect, it } from 'vitest'
import { Cartesian3 } from 'cesium'
import { moonPathArcSegments } from './moonPathRender'
import { moonSkyPath } from '../astronomy/moonPath'
import { moonPositionEcef } from './moonRender'
import { moonTopocentric } from '../astronomy/moon'
import type { MoonSkyPath } from '../astronomy/moonPath'
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

// Sintetico: altitudini scelte a mano (sopra, sopra, sotto, sopra) per la
// struttura dei tratti; i crossing interni usano il motore reale, quindi i
// test sui capi a orizzonte vivono in moonPath.test.ts.
const FAKE_PATH: MoonSkyPath = {
  centerDateMs: 300_000,
  windowHours: 5 / 60,
  radiusM: 1000,
  samples: [
    { dateMs: 0, azimuthDeg: 90, altitudeDeg: 10 },
    { dateMs: 200_000, azimuthDeg: 135, altitudeDeg: 30 },
    { dateMs: 400_000, azimuthDeg: 180, altitudeDeg: -20 },
    { dateMs: 600_000, azimuthDeg: 270, altitudeDeg: 40 },
  ],
}

describe('moonPathArcSegments', () => {
  it('spezza ai cambiamenti di segno: un tratto per sequenza di campioni sopra', () => {
    const segments = moonPathArcSegments(LONATO, FAKE_PATH)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toHaveLength(3) // campione 10°, campione 30°, crossing in chiusura
    expect(segments[1]).toHaveLength(2) // crossing in apertura, campione 40°
  })

  it('ogni punto sta sulla sfera celeste di raggio radiusM dall’Observer', () => {
    const observerPos = Cartesian3.fromDegrees(LONATO.longitudeDeg, LONATO.latitudeDeg, LONATO.heightM)
    for (const segment of moonPathArcSegments(LONATO, FAKE_PATH)) {
      for (const position of segment) {
        expect(Math.abs(Cartesian3.distance(position, observerPos) - FAKE_PATH.radiusM)).toBeLessThan(1e-6)
      }
    }
  })

  it('i campioni sopra l’orizzonte sono proiettati nella loro direzione', () => {
    const segments = moonPathArcSegments(LONATO, FAKE_PATH)
    const expected = moonPositionEcef(LONATO, 135, 30, FAKE_PATH.radiusM)
    expect(segments[0][1].x).toBeCloseTo(expected.x, 6)
    expect(segments[0][1].y).toBeCloseTo(expected.y, 6)
    expect(segments[0][1].z).toBeCloseTo(expected.z, 6)
  })

  it('Luna sopra l’orizzonte: l’arco passa per il punto esatto della Luna in scena', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt > 20)
    const path = moonSkyPath(LONATO, centerMs)
    const moon = moonTopocentric(LONATO, new Date(centerMs))
    const moonPosition = moonPositionEcef(LONATO, moon.azimuthDeg, moon.altitudeDeg, moon.distanceM)
    const segments = moonPathArcSegments(LONATO, path)
    const onArc = segments.some((segment) =>
      segment.some((position) => Cartesian3.distance(position, moonPosition) < 1e-6),
    )
    expect(onArc).toBe(true)
  })

  it('Luna sotto l’orizzonte: nessun tratto contiene la Luna corrente', () => {
    const centerMs = findInstantMs(LONATO, (alt) => alt < -5)
    const path = moonSkyPath(LONATO, centerMs)
    const moon = moonTopocentric(LONATO, new Date(centerMs))
    const moonPosition = moonPositionEcef(LONATO, moon.azimuthDeg, moon.altitudeDeg, moon.distanceM)
    const segments = moonPathArcSegments(LONATO, path)
    const onArc = segments.some((segment) =>
      segment.some((position) => Cartesian3.distance(position, moonPosition) < 1),
    )
    expect(onArc).toBe(false)
  })
})
