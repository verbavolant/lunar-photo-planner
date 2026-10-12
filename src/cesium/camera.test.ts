import { describe, expect, it, vi } from 'vitest'
import { Cartesian3, type Viewer } from 'cesium'
import { moveCameraWithObserver } from './camera'

// Stub minimo: moveCameraWithObserver legge position/heading/pitch/roll della
// camera e chiama setView (API verificate su Cesium.d.ts 1.146, righe
// 29599–29782: position scrivibile, heading/pitch/roll in radianti).
function fakeViewer(camera: {
  position: Cartesian3
  headingRad: number
  pitchRad: number
  rollRad: number
}): { viewer: Viewer; setView: ReturnType<typeof vi.fn> } {
  const setView = vi.fn()
  const viewer = {
    camera: {
      position: camera.position,
      heading: camera.headingRad,
      pitch: camera.pitchRad,
      roll: camera.rollRad,
      setView,
    },
  } as unknown as Viewer
  return { viewer, setView }
}

describe('moveCameraWithObserver', () => {
  it('trasla la camera dello stesso delta 3D dell\u2019Observer, orientamento invariato', () => {
    const cameraStart = Cartesian3.fromDegrees(10.2197, 45.5397, 656)
    const { viewer, setView } = fakeViewer({
      position: cameraStart,
      headingRad: 1.1,
      pitchRad: -0.4,
      rollRad: 0,
    })
    const from = { latitudeDeg: 45.5397, longitudeDeg: 10.2197, heightM: 156 }
    const to = { latitudeDeg: 45.5407, longitudeDeg: 10.2197, heightM: 166 }

    moveCameraWithObserver(viewer, from, to)

    expect(setView).toHaveBeenCalledTimes(1)
    const options = setView.mock.calls[0][0] as {
      destination: Cartesian3
      orientation: { heading: number; pitch: number; roll: number }
    }
    // Atteso: posizione camera + (nuova − vecchia posizione dell'Observer).
    const expectedDestination = Cartesian3.add(
      cameraStart,
      Cartesian3.subtract(
        Cartesian3.fromDegrees(to.longitudeDeg, to.latitudeDeg, to.heightM),
        Cartesian3.fromDegrees(from.longitudeDeg, from.latitudeDeg, from.heightM),
        new Cartesian3(),
      ),
      new Cartesian3(),
    )
    expect(Cartesian3.distance(options.destination, expectedDestination)).toBeLessThan(1e-9)
    expect(options.orientation.heading).toBe(1.1)
    expect(options.orientation.pitch).toBe(-0.4)
    expect(options.orientation.roll).toBe(0)
  })

  it('posizione dell\u2019Observer invariata: nessuna chiamata a setView', () => {
    const { viewer, setView } = fakeViewer({
      position: Cartesian3.fromDegrees(10.2197, 45.5397, 656),
      headingRad: 0,
      pitchRad: 0,
      rollRad: 0,
    })
    const same = { latitudeDeg: 45.5397, longitudeDeg: 10.2197, heightM: 156 }
    moveCameraWithObserver(viewer, same, { ...same })
    expect(setView).not.toHaveBeenCalled()
  })
})