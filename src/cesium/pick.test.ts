import { describe, expect, it } from 'vitest'
import { Cartographic } from 'cesium'
import { cartographicToGeoPoint } from './pick'

describe('cartographicToGeoPoint', () => {
  it('converte radianti in gradi decimali e conserva la quota', () => {
    const cartographic = Cartographic.fromDegrees(12.4964, 41.9028, 37)
    const point = cartographicToGeoPoint(cartographic)

    expect(point.longitudeDeg).toBeCloseTo(12.4964, 9)
    expect(point.latitudeDeg).toBeCloseTo(41.9028, 9)
    expect(point.heightM).toBe(37)
  })
})
