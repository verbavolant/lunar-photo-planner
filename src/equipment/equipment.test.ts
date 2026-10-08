import { describe, expect, it } from 'vitest'
import { fieldOfViewDeg } from './equipment'

// Valori di riferimento dalla tabella classica "angle of view"
// (sensore full-frame 36×24 mm): a 50 mm → 39,6° H, 27,0° V, 46,8° D.
describe('fieldOfViewDeg — full-frame 36×24 mm', () => {
  it('a 50 mm: H 39,60°, V 26,99°, D 46,79°', () => {
    const fov = fieldOfViewDeg(36, 24, 50)
    expect(fov.horizontalDeg).toBeCloseTo(39.5978, 2)
    expect(fov.verticalDeg).toBeCloseTo(26.9915, 2)
    expect(fov.diagonalDeg).toBeCloseTo(46.7930, 2)
  })
  it('a 500 mm: H 4,12°, V 2,75°, D 4,95°', () => {
    const fov = fieldOfViewDeg(36, 24, 500)
    expect(fov.horizontalDeg).toBeCloseTo(4.1235, 2)
    expect(fov.verticalDeg).toBeCloseTo(2.7497, 2)
    expect(fov.diagonalDeg).toBeCloseTo(4.9549, 2)
  })
})

describe('fieldOfViewDeg — casi limite', () => {
  it('sensore quadrato: H = V; diagonale maggiore della dimensione laterale', () => {
    const fov = fieldOfViewDeg(24, 24, 24)
    expect(fov.horizontalDeg).toBeCloseTo(fov.verticalDeg, 10)
    expect(fov.horizontalDeg).toBeCloseTo(53.1301, 2)
    // La diagonale (24·√2) supera il lato: il FOV diagonale è il più ampio.
    expect(fov.diagonalDeg).toBeGreaterThan(fov.horizontalDeg)
    expect(fov.diagonalDeg).toBeCloseTo(70.5288, 2)
  })
  it('rifiuta valori non positivi', () => {
    expect(() => fieldOfViewDeg(0, 24, 50)).toThrow()
    expect(() => fieldOfViewDeg(36, -1, 50)).toThrow()
    expect(() => fieldOfViewDeg(36, 24, 0)).toThrow()
  })
})