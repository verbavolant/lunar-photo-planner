import type { SunTwilightState } from '../astronomy/sun'
import { sunTwilightLabel } from '../astronomy/sun'

// Blocco dentro la barra Tempo (T-074): niente card propria — sfondo
// trasparente che eredita la fascia; in App è ancorato alla destra del blocco
// Fase lunare. Stili duplicati in locale per non esportarli tra componenti
// (convenzione di MoonPhaseCard).
const SUN_BAR_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  // Separa il blocco Sole dal blocco Fase lunare alla sua sinistra.
  borderLeft: '1px solid #5a6172',
  paddingLeft: 16,
}

const SUN_TITLE_STYLE = {
  fontWeight: 600 as const,
}

const SUN_ROW_STYLE = {
  whiteSpace: 'nowrap' as const,
}

/**
 * Blocco "Sole" (T-074): stato di luce all'orario in uso (Giorno, crepuscoli
 * con le soglie USNO su altitudine geometrica del centro, Notte), calcolato
 * topocentrico dall'Osservatore con `sunTwilightState` (dati reali, ADR-024).
 * Nella barra Tempo alla destra del blocco Fase lunare; in App non compare
 * finché l'Osservatore non è posizionato.
 */
export default function SunStateCard({ state }: { state: SunTwilightState }) {
  return (
    <div style={SUN_BAR_STYLE}>
      <div style={SUN_TITLE_STYLE}>Sole</div>
      <div style={SUN_ROW_STYLE}>
        <strong>{sunTwilightLabel(state)}</strong>
      </div>
    </div>
  )
}