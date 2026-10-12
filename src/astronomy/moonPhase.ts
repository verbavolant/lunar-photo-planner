import {
  Body,
  Illumination,
  MoonPhase as moonEclipticElongationDeg,
} from 'astronomy-engine'

/** Fase lunare all'istante considerato. */
export interface MoonPhase {
  /** Frazione del disco lunare illuminata dal Sole: 0 = luna nuova, 1 = luna piena. */
  readonly illuminationFraction: number
  /** true = fase crescente (luna a est del Sole), false = fase decrescente. */
  readonly waxing: boolean
}

/**
 * Fase lunare, definizione standard geocentrica (doc astronomy-engine 2.1.19
 * di `MoonPhase`/`Illumination`; Meeus, "Astronomical Algorithms", cap. 48):
 * - frazione illuminata = `Illumination(Body.Moon).phase_fraction`, calcolata
 *   come (1 + cos(angolo di fase))/2;
 * - direzione C/D dalla differenza di longitudine eclittica geocentrica
 *   Luna−Sole `MoonPhase(date)` in [0,360): [0,180) = crescente (C),
 *   [180,360) = decrescente (D) — 0 = nuova, 90 = primo quarto, 180 = piena,
 *   270 = ultimo quarto.
 * Geocentrica per definizione (è lo standard con cui si numerano le fasi):
 * la correzione topocentrica muove l'angolo di fase di ~1° di parallasse,
 * cioè <1% di frazione illuminata. Azimut/altitudine/diametro restano
 * topocentrici in `moonTopocentric`.
 */
export function moonPhase(date: Date): MoonPhase {
  const illumination = Illumination(Body.Moon, date)
  const elongationDeg = moonEclipticElongationDeg(date)
  return {
    illuminationFraction: illumination.phase_fraction,
    waxing: elongationDeg < 180,
  }
}

/** Lettera di direzione della fase: C = crescente, D = decrescente. */
export function moonPhaseDirection(phase: MoonPhase): 'C' | 'D' {
  return phase.waxing ? 'C' : 'D'
}
