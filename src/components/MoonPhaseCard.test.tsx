import { describe, expect, it } from 'vitest'
import { moonPhaseLabel, moonPhaseLitPath } from './MoonPhaseCard'

const R = 30

describe('moonPhaseLitPath (geometria del disco SVG)', () => {
  it('luna piena (k=1): l’arco di ritorno chiude il cerchio completo', () => {
    expect(moonPhaseLitPath(1, R)).toBe(
      `M 0,-${R} A ${R},${R} 0 0 1 0,${R} A ${R},${R} 0 0 1 0,-${R}`,
    )
  })

  it('quarto esatto (k=0,5): terminatore a linea retta (rx=0)', () => {
    expect(moonPhaseLitPath(0.5, R)).toBe(
      `M 0,-${R} A ${R},${R} 0 0 1 0,${R} A 0,${R} 0 0 1 0,-${R}`,
    )
  })

  it('falce (k=0,25): ritaglio a destra, terminatore con rx = r·(1−2k) e sweep 0', () => {
    expect(moonPhaseLitPath(0.25, R)).toBe(
      `M 0,-${R} A ${R},${R} 0 0 1 0,${R} A ${R * 0.5},${R} 0 0 0 0,-${R}`,
    )
  })

  it('gibbosa (k=0,75): terminatore a sinistra con rx = r·(2k−1) e sweep 1', () => {
    expect(moonPhaseLitPath(0.75, R)).toBe(
      `M 0,-${R} A ${R},${R} 0 0 1 0,${R} A ${R * 0.5},${R} 0 0 1 0,-${R}`,
    )
  })

  it('luna nuova (k=0): area nulla (due archi coincidenti, sweep 0)', () => {
    expect(moonPhaseLitPath(0, R)).toBe(
      `M 0,-${R} A ${R},${R} 0 0 1 0,${R} A ${R},${R} 0 0 0 0,-${R}`,
    )
  })

  it('valori fuori [0,1] limitati al range valido', () => {
    expect(moonPhaseLitPath(-0.5, R)).toBe(moonPhaseLitPath(0, R))
    expect(moonPhaseLitPath(1.5, R)).toBe(moonPhaseLitPath(1, R))
  })
})

describe('moonPhaseLabel', () => {
  it('percento in stile it-IT con lettera di direzione e parola estesa', () => {
    expect(moonPhaseLabel({ illuminationFraction: 0.62, waxing: true })).toBe('62% C (crescente)')
    expect(moonPhaseLabel({ illuminationFraction: 0.38, waxing: false })).toBe(
      '38% D (decrescente)',
    )
  })

  it('arrotonda all’intero più vicino (0,9979 → 100%)', () => {
    expect(moonPhaseLabel({ illuminationFraction: 0.9979, waxing: true })).toBe(
      '100% C (crescente)',
    )
  })
})
