import { describe, expect, it } from 'vitest'
import { Cartesian3, Cartographic, Ellipsoid } from 'cesium'
import { moonDiameterM, moonPositionEcef } from './moonRender'
import type { GeoPoint } from '../geodesy/geodesy'

const LONATO: GeoPoint = { latitudeDeg: 45.5, longitudeDeg: 10.22, heightM: 0 }

describe('moonPositionEcef', () => {
  it('zenit (alt 90°): coincide con fromDegrees alla stessa quota', () => {
    const position = moonPositionEcef(LONATO, 0, 90, 1000)
    const expected = Cartesian3.fromDegrees(10.22, 45.5, 1000)
    expect(position.x).toBeCloseTo(expected.x, 3)
    expect(position.y).toBeCloseTo(expected.y, 3)
    expect(position.z).toBeCloseTo(expected.z, 3)
  })

  it('la distanza dalla posizione dell\u2019Observer è esattamente quella data', () => {
    const distanceM = 377_976_000
    const position = moonPositionEcef(LONATO, 137.5, 23.4, distanceM)
    const observerPos = Cartesian3.fromDegrees(10.22, 45.5, 0)
    expect(Math.abs(Cartesian3.distance(position, observerPos) - distanceM)).toBeLessThan(0.5)
  })

  it('orizzonte (alt 0°): direzione tangente, nessuna componente verticale', () => {
    const position = moonPositionEcef(LONATO, 90, 0, 1000)
    const observerPos = Cartesian3.fromDegrees(10.22, 45.5, 0)
    const direction = Cartesian3.normalize(
      Cartesian3.subtract(position, observerPos, new Cartesian3()),
      new Cartesian3(),
    )
    const localUp = Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(
      Cartographic.fromDegrees(10.22, 45.5, 0),
      new Cartesian3(),
    )
    expect(Math.abs(Cartesian3.dot(direction, localUp))).toBeLessThan(1e-12)
  })
})

describe('moonDiameterM', () => {
  it('roundtrip angolo↔metri: 1 m di diametro a 1000 m', () => {
    const angularDeg = (2 * Math.atan(0.5 / 1000) * 180) / Math.PI
    expect(Math.abs(moonDiameterM(1000, angularDeg) - 1)).toBeLessThan(1e-9)
  })

  it('diametro lunare reale ≈ 3.474 km a ~378.000 km con 0,5267°', () => {
    const meters = moonDiameterM(377_976_000, 0.52671)
    expect(Math.abs(meters - 3_474_000)).toBeLessThan(1_000)
  })
})
