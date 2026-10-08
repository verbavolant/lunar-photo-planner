import { moonTopocentric, type MoonTopocentric } from '../astronomy/moon'
import type { GeoPoint } from '../geodesy/geodesy'

/** Un istante in cui la Luna risulta vicina alla linea di vista cercata. */
export interface AlignmentCandidate {
  readonly dateMs: number
  /** Separazione angolare reale Luna ↔ linea di vista, in gradi. */
  readonly separationDeg: number
  /** Offset orizzontale: differenza di azimut in [-180, 180); >0 = Luna a destra della linea (guardando lungo la linea). */
  readonly horizontalOffsetDeg: number
  /** Offset verticale: differenza di altitudine in gradi; >0 = Luna sopra la linea. */
  readonly verticalOffsetDeg: number
}

export interface AlignmentSearchParams {
  readonly observer: GeoPoint
  /** Azimut della linea di vista Observer→Target, in gradi (0 = nord). */
  readonly losAzimuthDeg: number
  /** Altitudine della linea di vista Observer→Target, in gradi. */
  readonly losAltitudeDeg: number
  /** Istante di partenza della ricerca, in ms epoch. */
  readonly fromDateMs: number
  /** Durata della finestra di ricerca, in ore. */
  readonly durationHours: number
  /** Passo di campionamento, in minuti. */
  readonly stepMinutes: number
  /** Separazione massima per considerare "allineato", in gradi. */
  readonly toleranceDeg: number
  /** Numero massimo di candidati restituiti. */
  readonly maxResults: number
}

/** Finestra di ricerca predefinita in giorni (richiesta umana: ~2 mesi). */
export const DEFAULT_ALIGNMENT_DAYS = 60

/**
 * Velocità massima del moto apparente della Luna sul cielo, in gradi/minuto:
 * rotazione diurna ≤ 15,041°/h = 0,2507°/min (giorno siderale 23,934 h) più
 * moto orbitale lunare ~0,55°/h ≈ 0,0092°/min (mese siderale 27,32 d; NASA
 * Moon Fact Sheet, verificato 2026-10-06), con margine. È il limite di
 * Lipschitz usato per non perdere attraversamenti tra campioni coarse.
 */
export const MAX_MOON_APPARENT_SPEED_DEG_PER_MIN = 0.3

/** Parametri di ricerca predefiniti per l'anteprima di Fase 6. */
export const DEFAULT_ALIGNMENT_SEARCH = {
  durationHours: DEFAULT_ALIGNMENT_DAYS * 24,
  stepMinutes: 15,
  toleranceDeg: 1,
  maxResults: 8,
} as const

/**
 * Passo fine del raffinamento: deve campionare la larghezza del passaggio al
 * limite della tolleranza (≈ 2·tolleranza/velocità), con cap a 1′ e minimo
 * 0,25′ per tolleranze piccole.
 */
function refineStepMinutes(toleranceDeg: number): number {
  return Math.min(
    1,
    Math.max(0.25, toleranceDeg / (3 * MAX_MOON_APPARENT_SPEED_DEG_PER_MIN)),
  )
}

/**
 * Differenza di azimut portata in (-180, 180]: positiva = secondo azimut più a
 * est (in senso orario visto dall'alto) del primo; l'opposizione esatta
 * (differenza ±180) restituisce +180 per convenzione.
 */
export function azimuthDifferenceDeg(fromAzDeg: number, toAzDeg: number): number {
  let difference = (toAzDeg - fromAzDeg) % 360
  if (difference > 180) {
    difference -= 360
  } else if (difference < -180) {
    difference += 360
  }
  return difference
}

/**
 * Separazione angolare tra due direzioni del cielo (azimut/altitudine in
 * gradi): acos(sin a₁·sin a₂ + cos a₁·cos a₂·cos Δaz) — formula standard
 * della trigonometria sferica (Meeus, "Astronomical Algorithms", cap. 17).
 */
export function angularSeparationDeg(
  azimuth1Deg: number,
  altitude1Deg: number,
  azimuth2Deg: number,
  altitude2Deg: number,
): number {
  const altitude1Rad = (altitude1Deg * Math.PI) / 180
  const altitude2Rad = (altitude2Deg * Math.PI) / 180
  const deltaAzimuthRad = ((azimuth2Deg - azimuth1Deg) * Math.PI) / 180
  const cosine =
    Math.sin(altitude1Rad) * Math.sin(altitude2Rad) +
    Math.cos(altitude1Rad) * Math.cos(altitude2Rad) * Math.cos(deltaAzimuthRad)
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI
}

/**
 * Cerca, campionando il tempo, i istanti in cui la Luna passa entro
 * `toleranceDeg` dalla linea di vista Observer→Target. Ricerca in due fasi:
 * 1. scansione coarse al passo `stepMinutes` — un intervallo [tᵢ, tᵢ₊₁] può
 *    contenere un passaggio sotto tolleranza se il minimo dei suoi estremi è
 *    ≤ tolleranza + v_max·passo/2 (limite di Lipschitz sul moto apparente:
 *    un dip sotto tolleranza NON può sfuggire a questa condizione, qualunque
 *    sia il passo coarse, perché gli estremi di un intervallo contenente un
 *    dip di profondità ≤ tol distano al più √(tol² + margine²) ≤ tol+margine);
 * 2. raffinamento al passo fine dei soli intervalli segnalati.
 * Ogni passaggio (finestra contigua di campioni ammissibili) produce un solo
 * candidato: il campione a separazione minima. Nota: l'offset orizzontale è
 * la differenza di azimut misurata sull'orizzonte, quindi a quote elevate
 * sovrastima lo scostamento sulla sfera; la separazione è la distanza
 * angolare reale.
 */
export function searchMoonAlignments(params: AlignmentSearchParams): AlignmentCandidate[] {
  const stepMs = params.stepMinutes * 60_000
  const endMs = params.fromDateMs + params.durationHours * 3_600_000
  const fineMs = Math.round(refineStepMinutes(params.toleranceDeg) * 60_000)
  const coarseMarginDeg = (MAX_MOON_APPARENT_SPEED_DEG_PER_MIN * params.stepMinutes) / 2

  const candidateFrom = (dateMs: number, moon: MoonTopocentric): AlignmentCandidate => ({
    dateMs,
    separationDeg: angularSeparationDeg(
      params.losAzimuthDeg,
      params.losAltitudeDeg,
      moon.azimuthDeg,
      moon.altitudeDeg,
    ),
    horizontalOffsetDeg: azimuthDifferenceDeg(params.losAzimuthDeg, moon.azimuthDeg),
    verticalOffsetDeg: moon.altitudeDeg - params.losAltitudeDeg,
  })

  const samples: AlignmentCandidate[] = []
  let previous: { dateMs: number; separationDeg: number } | null = null
  for (let dateMs = params.fromDateMs; dateMs <= endMs; dateMs += stepMs) {
    const moon = moonTopocentric(params.observer, new Date(dateMs))
    const candidate = candidateFrom(dateMs, moon)
    if (
      previous !== null &&
      Math.min(previous.separationDeg, candidate.separationDeg) <=
        params.toleranceDeg + coarseMarginDeg
    ) {
      // Raffina l'intervallo precedente: campioni fine dall'estremo iniziale
      // (escluso, già collezionato) all'attuale (escluso, valutato sotto).
      for (let fineMs2 = previous.dateMs + fineMs; fineMs2 < dateMs; fineMs2 += fineMs) {
        const fineMoon = moonTopocentric(params.observer, new Date(fineMs2))
        const fineCandidate = candidateFrom(fineMs2, fineMoon)
        if (fineCandidate.separationDeg <= params.toleranceDeg) {
          samples.push(fineCandidate)
        }
      }
    }
    if (candidate.separationDeg <= params.toleranceDeg) {
      samples.push(candidate)
    }
    previous = { dateMs, separationDeg: candidate.separationDeg }
  }

  const candidates: AlignmentCandidate[] = []
  let window: AlignmentCandidate[] = []
  const flushWindow = (): void => {
    let best: AlignmentCandidate | null = null
    for (const sample of window) {
      if (best === null || sample.separationDeg < best.separationDeg) {
        best = sample
      }
    }
    if (best !== null) {
      candidates.push(best)
    }
    window = []
  }
  for (const sample of samples) {
    const previousSample = window.length === 0 ? null : window[window.length - 1]
    if (previousSample !== null && sample.dateMs - previousSample.dateMs > stepMs + 1) {
      flushWindow()
    }
    window.push(sample)
  }
  flushWindow()

  candidates.sort((a, b) => a.dateMs - b.dateMs)
  return candidates.slice(0, params.maxResults)
}