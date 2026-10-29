/**
 * Traiettoria apparente della Luna nel cielo (T-075/T-076): campionamento
 * della finestra di tempo CENTRATA sull'istante in uso.
 *
 * Direzioni da moonTopocentric (ADR-010: astronomy-engine, verificato contro
 * JPL Horizons; altitudine airless, «sopra l'orizzonte» = alt > 0). Semantica
 * da revisione di ADR-025 (T-076, feedback umano): l'arco deve coincidere con
 * la Luna visualizzata in quel momento e seguire ogni cambio di orario
 * (slider, ±1 min, allineamento adottato) → la finestra è sempre centrata
 * sull'orario in uso e il campione centrale coincide con la Luna corrente per
 * costruzione (stesso motore topocentrico del billboard). La proiezione
 * grafica dell'arco sta in `src/cesium/moonPathRender.ts`; qui solo dati.
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
  /** Istante al centro della finestra: è l'orario in uso. */
  readonly centerDateMs: number
  /** Mezza larghezza della finestra campionata, ore. */
  readonly windowHours: number
  /**
   * Distanza topocentrica della Luna all'istante in uso (m): raggio della
   * «sfera celeste» su cui l'arco è proiettato in scena. Con questo raggio il
   * campione centrale coincide esattamente con la Luna billboard.
   */
  readonly radiusM: number
  /** Campioni uniformi su [center − window, center + window], center incluso. */
  readonly samples: readonly MoonSkyPathSample[]
}

export interface MoonSkyPathOptions {
  /** Mezza larghezza della finestra campionata, ore. Default 6. */
  readonly windowHours?: number
  /** Passo di campionamento dell'arco, minuti. Default 5. */
  readonly sampleStepMin?: number
  /** Numero massimo di campioni (cap per finestre larghe). Default 400. */
  readonly maxSamples?: number
}

const DEFAULT_WINDOW_HOURS = 6
const DEFAULT_SAMPLE_STEP_MIN = 5
const DEFAULT_MAX_SAMPLES = 400
// 30 iterazioni di bisezione su un intervallo ≤ 5 min: risoluzione ≈ 5 min /
// 2^30 ≈ 0,3 ms, molto sotto la precisione grafica dell'arco.
const BISECTION_ITERATIONS = 30

function isAboveHorizon(observer: GeoPoint, dateMs: number): boolean {
  return moonTopocentric(observer, new Date(dateMs)).altitudeDeg > 0
}

/**
 * Istante di attraversamento dell'orizzonte tra un campione sotto (alt ≤ 0) e
 * uno sopra (alt > 0): bisezione sull'altitudine di `moonTopocentric`. Il
 * chiamante garantisce il verso dei due istanti (restituito = sopra).
 */
export function moonHorizonCrossingMs(
  observer: GeoPoint,
  belowMs: number,
  aboveMs: number,
): number {
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
 * Traiettoria della Luna per l'Observer: campionamento uniforme della
 * finestra centrata su `centerDateMs` (±`windowHours` ore). La Luna
 * all'orario in uso è il campione centrale: ogni cambio di orario — slider,
 * ±1 min, allineamento adottato — ricentra l'arco, che resta coincidente con
 * la Luna visualizzata. Sempre calcolabile (nessun `null`): in scena possono
 * però mancare i tratti se in tutta la finestra la Luna resta sotto
 * l'orizzonte (vedi `moonPathArcSegments`).
 */
export function moonSkyPath(
  observer: GeoPoint,
  centerDateMs: number,
  options: MoonSkyPathOptions = {},
): MoonSkyPath {
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS
  const sampleStepMs = (options.sampleStepMin ?? DEFAULT_SAMPLE_STEP_MIN) * 60_000
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES

  const halfMs = windowHours * 3_600_000
  const startMs = centerDateMs - halfMs
  const durationMs = halfMs * 2
  // Numero di intervalli PARI: il centro della finestra cade esattamente su un
  // campione (i = metà degli intervalli) → coincidenza con la Luna in uso.
  let intervalCount = Math.min(Math.ceil(durationMs / sampleStepMs), maxSamples - 1)
  if (intervalCount % 2 !== 0) {
    intervalCount -= 1
  }
  intervalCount = Math.max(2, intervalCount)

  const samples: MoonSkyPathSample[] = []
  for (let i = 0; i <= intervalCount; i += 1) {
    const dateMs = startMs + (durationMs * i) / intervalCount
    const moon = moonTopocentric(observer, new Date(dateMs))
    samples.push({ dateMs, azimuthDeg: moon.azimuthDeg, altitudeDeg: moon.altitudeDeg })
  }
  return {
    centerDateMs,
    windowHours,
    radiusM: moonTopocentric(observer, new Date(centerDateMs)).distanceM,
    samples,
  }
}
