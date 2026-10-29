import { describe, expect, it } from 'vitest'
import { Cartesian3 } from 'cesium'
import { moonPathArcPositions } from './moonPathRender'
import type { MoonSkyPath } from '../astronomy/moonPath'
import type { GeoPoint } from '../geodesy/geodesy'

const LONATO: GeoPoint = { latitudeDeg: 45.5, longitudeDeg: 10.22, heightM: 0 }

const FAKE_PATH: MoonSkyPath = {
  riseDateMs: 0,
  setDateMs: 600_000,
  midDistanceM: 1000,
  samples: [
    { dateMs: 0, azimuthDeg: 90, altitudeDeg: 0 },
    { dateMs: 200_000, azimuthDeg: 135, altitudeDeg: 30 },
    { dateMs: 400_000, azimuthDeg: 0, altitudeDeg: 90 },
    { dateMs: 600_000, azimuthDeg: 270, altitudeDeg: 0 },
  ],
}

describe('moonPathArcPositions', () => {
  it('un punto per campione', () => {
    expect(moonPathArcPositions(LONATO, FAKE_PATH)).toHaveLength(FAKE_PATH.samples.length)
  })

  it('ogni punto sta sulla sfera celeste di raggio midDistanceM dall\u2019Observer', () => {
    const observerPos = Cartesian3.fromDegrees(LONATO.longitudeDeg, LONATO.latitudeDeg, LONATO.heightM)
    for (const position of moonPathArcPositions(LONATO, FAKE_PATH)) {
      expect(Math.abs(Cartesian3.distance(position, observerPos) - FAKE_PATH.midDistanceM)).toBeLessThan(1e-6)
    }
  })

  it('zenit (alt 90°): coincide con fromDegrees alla quota Observer + raggio', () => {
    const positions = moonPathArcPositions(LONATO, FAKE_PATH)
    const expected = Cartesian3.fromDegrees(
      LONATO.longitudeDeg,
      LONATO.latitudeDeg,
      LONATO.heightM + FAKE_PATH.midDistanceM,
    )
    expect(positions[2].x).toBeCloseTo(expected.x, 3)
    expect(positions[2].y).toBeCloseTo(expected.y, 3)
    expect(positions[2].z).toBeCloseTo(expected.z, 3)
  })
})
