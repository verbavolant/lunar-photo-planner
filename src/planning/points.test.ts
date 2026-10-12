import { describe, expect, it } from 'vitest'
import {
  MAX_OBSERVER_HEIGHT_ABOVE_GROUND_M,
  observerAtHeightAboveGround,
  observerHeightAboveGroundM,
} from './points'

const OBSERVER = { latitudeDeg: 45.5397, longitudeDeg: 10.2197, heightM: 156 }

describe('observerHeightAboveGroundM', () => {
  it('differenza quota corrente − quota di pick', () => {
    expect(observerHeightAboveGroundM({ ...OBSERVER, heightM: 256 }, 156)).toBe(100)
    expect(observerHeightAboveGroundM(OBSERVER, 156)).toBe(0)
  })
})

describe('observerAtHeightAboveGround', () => {
  it('sposta la quota mantenendo lat/lon', () => {
    const moved = observerAtHeightAboveGround(OBSERVER, 156, 50)
    expect(moved.latitudeDeg).toBe(45.5397)
    expect(moved.longitudeDeg).toBe(10.2197)
    expect(moved.heightM).toBe(206)
  })

  it('non scende sotto il suolo (clamp a 0)', () => {
    expect(observerAtHeightAboveGround(OBSERVER, 156, -10).heightM).toBe(156)
  })

  it('non supera il limite di sanità', () => {
    const beyond = observerAtHeightAboveGround(
      OBSERVER,
      156,
      MAX_OBSERVER_HEIGHT_ABOVE_GROUND_M + 1,
    )
    expect(beyond.heightM).toBe(156 + MAX_OBSERVER_HEIGHT_ABOVE_GROUND_M)
  })
})
