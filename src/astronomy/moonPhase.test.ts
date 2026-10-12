import { describe, expect, it } from 'vitest'
import { SearchMoonPhase, type AstroTime } from 'astronomy-engine'
import { moonPhase, moonPhaseDirection } from './moonPhase'

/**
 * Ancoraggi indipendenti: i quarti lunari sono cercati con `SearchMoonPhase`
 * (definizione AE: differenza di longitudine eclittica geocentrica Luna−Sole;
 * 0 = nuova, 90 = primo quarto, 180 = piena, 270 = ultimo quarto) e la fase
 * calcolata da `moonPhase()` deve esserci coerente in frazione illuminata
 * (k = (1+cos angolo di fase)/2, Meeus cap. 48) e in direzione C/D.
 *
 * Tolleranze giustificate fisicamente: alla nuova la Luna può stare fino a
 * ~5,3° fuori dall'eclittica rispetto al Sole (frazione ≤ ~0,01), alla piena
 * ≤ ~10,6° sommati (frazione ≥ ~0,98); ai quarti l'angolo di fase reale può
 * scostarsi da 90° di ~0,5° (frazione ~0,5 ± 0,05).
 */

/** Istante del prossimo raggiungimento della fase `targetLon` dopo `after`. */
function phaseTime(targetLon: number, after: Date): Date {
  const found: AstroTime | null = SearchMoonPhase(targetLon, after, 40)
  if (found === null) {
    throw new Error(`Fase ${targetLon}° non trovata entro 40 giorni da ${after.toISOString()}`)
  }
  return found.date
}

const NEW_MOON = phaseTime(0, new Date('2026-01-01T00:00:00Z'))
const FIRST_QUARTER = phaseTime(90, NEW_MOON)
const FULL_MOON = phaseTime(180, NEW_MOON)
const THIRD_QUARTER = phaseTime(270, FULL_MOON)

describe('moonPhase contro i quarti lunari di SearchMoonPhase (AE)', () => {
  it('alla luna nuova la frazione illuminata è ~0', () => {
    expect(moonPhase(NEW_MOON).illuminationFraction).toBeLessThan(0.02)
  })

  it('al primo quarto è ~0,5 e crescente (C)', () => {
    const phase = moonPhase(FIRST_QUARTER)
    expect(phase.illuminationFraction).toBeGreaterThan(0.45)
    expect(phase.illuminationFraction).toBeLessThan(0.55)
    expect(moonPhaseDirection(phase)).toBe('C')
  })

  it('alla luna piena la frazione illuminata è ~1', () => {
    // Direzione C/D non testata qui: alla piena la longitudine differenziale
    // è ~180° ± ε, quindi il segno C/D è instabile per costruzione.
    expect(moonPhase(FULL_MOON).illuminationFraction).toBeGreaterThan(0.98)
  })

  it("all'ultimo quarto è ~0,5 e decrescente (D)", () => {
    const phase = moonPhase(THIRD_QUARTER)
    expect(phase.illuminationFraction).toBeGreaterThan(0.45)
    expect(phase.illuminationFraction).toBeLessThan(0.55)
    expect(moonPhaseDirection(phase)).toBe('D')
  })

  it('a metà arco crescente/decrescente la direzione è coerente con la frazione', () => {
    const dayMs = 24 * 3_600_000
    const waxingSample = moonPhase(new Date(NEW_MOON.getTime() + 3 * dayMs))
    const waningSample = moonPhase(new Date(FULL_MOON.getTime() + 3 * dayMs))
    expect(moonPhaseDirection(waxingSample)).toBe('C')
    expect(waxingSample.illuminationFraction).toBeLessThan(0.5)
    expect(moonPhaseDirection(waningSample)).toBe('D')
    expect(waningSample.illuminationFraction).toBeGreaterThan(0.5)
  })

  it('la frazione illuminata cresce nel mezzo crescente (nuova → piena)', () => {
    const dayMs = 24 * 3_600_000
    let previous = 0
    for (let day = 1; day < 15; day++) {
      const current = moonPhase(new Date(NEW_MOON.getTime() + day * dayMs))
      expect(current.illuminationFraction).toBeGreaterThanOrEqual(previous - 0.005)
      previous = current.illuminationFraction
    }
  })
})
