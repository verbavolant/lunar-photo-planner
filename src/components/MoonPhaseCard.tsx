import type { MoonPhase } from '../astronomy/moonPhase'
import { moonPhaseDirection } from '../astronomy/moonPhase'
import { formatPercent } from '../planning/format'

// Blocco dentro la barra Tempo (T-056): niente card propria — sfondo
// trasparente che eredita la fascia; in App è ancorato alla destra della
// riga dello slider data/ora. Stili duplicati in locale per non esportarli
// tra componenti (convenzione).
const PHASE_BAR_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const PHASE_TITLE_STYLE = {
  fontWeight: 600 as const,
}

const PHASE_ROW_STYLE = {
  whiteSpace: 'nowrap' as const,
}

// Disco disegnato con la frazione illuminata reale ma orientamento
// convenzionale (emisfero boreale): equivalente grafico dichiarato.
const DISC_RADIUS = 30

/**
 * Percorso SVG della porzione illuminata del disco lunare, orientata per una
 * luna CRESCENTE vista dall'emisfero boreale (limbo luminoso a destra):
 * semicerchio destro del disco + arco di ellisse del terminatore. Il
 * semi-asse minore dell'ellisse è r·|2k−1|: dalla formula della frazione
 * illuminata k = (1+cos angolo di fase)/2 (Meeus, "Astronomical Algorithms",
 * cap. 48) segue cos = 2k−1, quindi k ≥ 0,5 (gibbosa) → terminatore che
 * sconfina a sinistra (arco con sweep 1), k < 0,5 (falce) → ritaglio sottile
 * a destra (sweep 0); rx = 0 al quarto esatto, che SVG rende come linea
 * retta. Per la luna DECRESCENTE il chiamante specchia con
 * transform="scale(-1 1)".
 */
export function moonPhaseLitPath(illuminationFraction: number, radius: number): string {
  const fraction = Math.min(1, Math.max(0, illuminationFraction))
  const semiMinor = radius * Math.abs(2 * fraction - 1)
  const returnSweep = fraction >= 0.5 ? 1 : 0
  return (
    `M 0,${-radius} ` +
    `A ${radius},${radius} 0 0 1 0,${radius} ` +
    `A ${semiMinor},${radius} 0 0 ${returnSweep} 0,${-radius}`
  )
}

/** Etichetta compatta della fase: "62% C (crescente)" / "38% D (decrescente)". */
export function moonPhaseLabel(phase: MoonPhase): string {
  const trend = phase.waxing ? 'crescente' : 'decrescente'
  return `${formatPercent(phase.illuminationFraction)} ${moonPhaseDirection(phase)} (${trend})`
}

/**
 * Blocco "Fase lunare" (T-036; nella barra Tempo a destra della riga slider
 * da T-056, prima centrato in fondo da T-054): disco lunare con la frazione
 * illuminata all'orario in uso, calcolata da
 * `moonPhase` (astronomy-engine, dati reali). La frazione è geocentrica per
 * definizione standard (vedi ADR-013); la rappresentazione grafica del limbo
 * è convenzionale, non dipende dall'orientamento reale del cielo
 * dell'Observer.
 */
export default function MoonPhaseCard({ phase }: { phase: MoonPhase }) {
  return (
    <div style={PHASE_BAR_STYLE}>
      <div style={PHASE_TITLE_STYLE}>Fase lunare</div>
      <svg
        width={64}
        height={64}
        viewBox="-32 -32 64 64"
        role="img"
        aria-label="Disco lunare con la fase all'orario in uso"
      >
        <circle r={DISC_RADIUS} fill="#394050" stroke="#5a6172" strokeWidth={1} />
        <path
          d={moonPhaseLitPath(phase.illuminationFraction, DISC_RADIUS)}
          fill="#e8e8e8"
          transform={phase.waxing ? undefined : 'scale(-1 1)'}
        />
      </svg>
      <div style={PHASE_ROW_STYLE}>
        <strong>{moonPhaseLabel(phase)}</strong>
      </div>
    </div>
  )
}
