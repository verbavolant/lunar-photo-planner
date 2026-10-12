import { describe, expect, it } from 'vitest'
import type { Viewer } from 'cesium'
import { readCameraPov } from './cameraPov'

// Stub minimo della camera: readCameraPov legge solo positionCartographic,
// heading e pitch (API verificata su Cesium.d.ts 1.146).
function fakeViewer(pov: {
  latitudeRad: number
  longitudeRad: number
  heightM: number
  headingRad: number
  pitchRad: number
}): Viewer {
  return {
    camera: {
      positionCartographic: {
        latitude: pov.latitudeRad,
        longitude: pov.longitudeRad,
        height: pov.heightM,
      },
      heading: pov.headingRad,
      pitch: pov.pitchRad,
    },
  } as unknown as Viewer
}

const DEG = Math.PI / 180

describe('readCameraPov', () => {
  it('converte radianti in gradi (lat/lon/quota/azimut/inclinazione)', () => {
    const pov = readCameraPov(
      fakeViewer({
        latitudeRad: 45.5397 * DEG,
        longitudeRad: 10.2197 * DEG,
        heightM: 656.2,
        headingRad: 350 * DEG,
        pitchRad: -30 * DEG,
      }),
    )
    expect(pov.latitudeDeg).toBeCloseTo(45.5397, 6)
    expect(pov.longitudeDeg).toBeCloseTo(10.2197, 6)
    expect(pov.heightM).toBeCloseTo(656.2, 6)
    expect(pov.headingDeg).toBeCloseTo(350, 6)
    expect(pov.pitchDeg).toBeCloseTo(-30, 6)
  })

  it('riporta l\u2019azimut in [0, 360)', () => {
    const over = readCameraPov(
      fakeViewer({
        latitudeRad: 0,
        longitudeRad: 0,
        heightM: 0,
        headingRad: 370 * DEG,
        pitchRad: 0,
      }),
    )
    expect(over.headingDeg).toBeCloseTo(10, 6)
    const negative = readCameraPov(
      fakeViewer({
        latitudeRad: 0,
        longitudeRad: 0,
        heightM: 0,
        headingRad: -10 * DEG,
        pitchRad: 0,
      }),
    )
    expect(negative.headingDeg).toBeCloseTo(350, 6)
  })
})
