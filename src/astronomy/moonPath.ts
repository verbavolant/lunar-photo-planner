/**
 * Traiettoria apparente della Luna nel cielo (T-075): campionamento del
 * passaggio sopra l'orizzonte che contiene (o segue) un istante dato.
 *
 * Direzioni da moonTopocentric (ADR-010: astronomy-engine, verificato contro
 * JPL Horizons; altitudine airless, «sopra l'orizzonte» = alt > 0). Il
 * sorgere/il tramonto è individuato con bisezione sull'altitudine tra un
 * istante sotto e uno sopra l'orizzonte (metodo numerico verificato dai test
 * sui capi: |altitudine| ≈ 0). La proiezione grafica dell'arco sta in
 * `src/cesium/moonPathRender.ts`; qui solo dati.
 */
import type { GeoPoint } from '../geodesy/geodesy'
import { moonTopocentric } from './moon'

export interface MoonSkyPathSample {
  /** Istante del campione (ms dall'epoca). */
  readonly dateMs: number
  /** Azimut topocentrico in gradi (0..360 dal nord). */
  readonly azimuthDeg: number
  /** Altitudine topocentrica in gradi (airless). */
  readonly altitudeDeg: number
}

export interface MoonSkyPath {
  /** Sorgere del passaggio: altitudine ≈ 0 in salita. */
  readonly riseDateMs: number
  /** Tramonto del passaggio: altitudine ≈ 0 in discesa. */
  readonly setDateMs: number
  /**
   * Distanza topocentrica della Luna all'istante medio del passaggio (m):
   * raggio della «sfera celeste» su cui l'arco viene proiettato in scena.
   */
  readonly midDistanceM: number
  /** Campioni uniformi dal sorgere al tramonto inclusi, tempi crescenti. */
  readonly samples: readonly MoonSkyPathSample[]
}

export interface MoonSkyPathOptions {
  /** Mezza larghezza della ricerca del passaggio, ore. Default 48. */
  readonly searchWindowHours?: number
  /** Passo del sondaggio grossolano, minuti. Default 30. */
  readonly coarseStepMin?: number
  /** Passo di campionamento dell'arco, minuti. Default 5. */
  readonly sampleStepMin?: number
  /** Numero massimo di campioni (cap per passaggi lunghissimi). Default 400. */
  readonly maxSamples?: number
}

const DEFAULT_SEARCH_WINDOW_HOURS = 48
const DEFAULT_COARSE_STEP_MIN = 30
const DEFAULT_SAMPLE_STEP_MIN = 5
const DEFAULT_MAX_SAMPLES = 400
// 30 iterazioni di bisezione su un intervallo ≤ 30 min: risoluzione ≈ 30 min /
// 2^30 ≈ 1,7 ms, molto sotto la precisione grafica dell'arco.
const BISECTION_ITERATIONS = 30

function isAboveHorizon(observer: GeoPoint, dateMs: number): boolean {
  return moonTopocentric(observer, new Date(dateMs)).altitudeDeg > 0
}

/**
 * Bisezione sul passaggio dell'orizzonte: `belowMs` sta sotto (alt ≤ 0),
 * `aboveMs` sopra (alt > 0); restituisce l'istante di attraversamento.
 */
function bisectHorizonCrossing(observer: GeoPoint, belowMs: number, aboveMs: number): number {
  let below = belowMs
  let above = aboveMs
  for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
    const midMs = (below + above) / 2
    if (isAboveHorizon(observer, midMs)) {
      above = midMs
    } else {
      below = midMs
    }
  }
  return above
}

/**
 * Traiettoria della Luna per l'Observer: il passaggio sopra l'orizzonte che
 * contiene `centerDateMs`, oppure — se la Luna è sotto l'orizzonte — il
 * prossimo che sorge dopo. `null` se nessun passaggio è completabile entro la
 * finestra di ricerca (±`searchWindowHours`; a latitudini estreme la Luna può
 * restare sotto per giorni, e passaggi più lunghi della finestra non hanno
 * entrambi i capi determinabili: in entrambi i casi nessun arco).
 */
export function moonSkyPath(
  observer: GeoPoint,
  centerDateMs: number,
  options: MoonSkyPathOptions = {},
): MoonSkyPath | null {
  const windowHours = options.searchWindowHours ?? DEFAULT_SEARCH_WINDOW_HOURS
  const coarseStepMs = (options.coarseStepMin ?? DEFAULT_COARSE_STEP_MIN) * 60_000
  const sampleStepMs = (options.sampleStepMin ?? DEFAULT_SAMPLE_STEP_MIN) * 60_000
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES

  const startMs = centerDateMs - windowHours * 3_600_000
  const endMs = centerDateMs + windowHours * 3_600_000
  const stepCount = Math.ceil((endMs - startMs) / coarseStepMs)

  // Sondaggio grossolano a passi costanti: ogni cambiamento sotto↔sopra
  // l'orizzonte viene raffinato per bisezione sull'istante esatto.
  const crossings: Array<{ dateMs: number; isRise: boolean }> = []
  let previousMs = startMs
  let previousAbove = isAboveHorizon(observer, previousMs)
  for (let i = 1; i <= stepCount; i += 1) {
    const currentMs = startMs + i * coarseStepMs
    const currentAbove = isAboveHorizon(observer, currentMs)
    if (currentAbove !== previousAbove) {
      crossings.push({
        dateMs: currentAbove
          ? bisectHorizonCrossing(observer, previousMs, currentMs)
          : bisectHorizonCrossing(observer, currentMs, previousMs),
        isRise: currentAbove,
      })
    }
    previousMs = currentMs
    previousAbove = currentAbove
  }

  let riseMs: number
  let setMs: number
  if (isAboveHorizon(observer, centerDateMs)) {
    // Passaggio in corso: l'ultimo sorgere prima dell'orario e il primo
    // tramonto dopo.
    const rises = crossings.filter((c) => c.isRise && c.dateMs < centerDateMs)
    const set = crossings.find((c) => !c.isRise && c.dateMs > centerDateMs)
    if (rises.length === 0 || set === undefined) {
      return null
    }
    riseMs = rises[rises.length - 1].dateMs
    setMs = set.dateMs
  } else {
    // Luna sotto l'orizzonte: prossimo sorgere e il suo tramonto.
    const rise = crossings.find((c) => c.isRise && c.dateMs > centerDateMs)
    const set =
      rise === undefined ? undefined : crossings.find((c) => !c.isRise && c.dateMs > rise.dateMs)
    if (rise === undefined || set === undefined) {
      return null
    }
    riseMs = rise.dateMs
    setMs = set.dateMs
  }

  // Campionamento uniforme del passaggio, capi inclusi; cap sul numero di
  // punti per passaggi più lunghi del passo minimo consentito.
  const durationMs = setMs - riseMs
  const intervalCount = Math.max(
    1,
    Math.min(maxSamples - 1, Math.ceil(durationMs / Math.min(sampleStepMs, durationMs))),
  )
  const samples: MoonSkyPathSample[] = []
  for (let i = 0; i <= intervalCount; i += 1) {
    const dateMs = riseMs + (durationMs * i) / intervalCount
    const moon = moonTopocentric(observer, new Date(dateMs))
    samples.push({ dateMs, azimuthDeg: moon.azimuthDeg, altitudeDeg: moon.altitudeDeg })
  }
  const midMoon = moonTopocentric(observer, new Date(riseMs + durationMs / 2))
  return {
    riseDateMs: riseMs,
    setDateMs: setMs,
    midDistanceM: midMoon.distanceM,
    samples,
  }
}
