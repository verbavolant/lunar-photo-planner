import { moonTopocentric, type MoonTopocentric } from '../astronomy/moon'
import type { GeoPoint } from '../geodesy/geodesy'

/** Separazione e offset della Luna rispetto a una linea di vista, in gradi. */
export interface AlignmentOffsets {
  /** Separazione angolare reale Luna ↔ linea di vista, in gradi. */
  readonly separationDeg: number
  /** Offset orizzontale: differenza di azimut in [-180, 180); >0 = Luna a destra della linea (guardando lungo la linea). */
  readonly horizontalOffsetDeg: number
  /** Offset verticale: differenza di altitudine in gradi; >0 = Luna sopra la linea. */
  readonly verticalOffsetDeg: number
}

/** Un istante in cui la Luna risulta vicina alla linea di vista cercata. */
export interface AlignmentCandidate extends AlignmentOffsets {
  readonly dateMs: number
}

/** Risultato della ricerca: candidati selezionati + totale passaggi trovati. */
export interface AlignmentSearchResult {
  /** Passaggi ammessi, ordinati per separazione crescente (tie-break per data), al più `maxResults`. */
  readonly candidates: AlignmentCandidate[]
  /** Numero totale di passaggi ammessi nella finestra, prima del troncamento a `maxResults`. */
  readonly totalFound: number
  /** Passaggi scartati perché la Luna era sotto `minMoonAltitudeDeg` (T-047). */
  readonly discardedBelowHorizon: number
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
  /**
   * Altitudine minima della Luna perché un passaggio sia ammesso, in gradi:
   * default 0 (scartati i passaggi con la Luna sotto l'orizzonte), valori
   * negativi ammessi per ricerche «fisiche» senza filtro (T-047).
   */
  readonly minMoonAltitudeDeg: number
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

/**
 * Parametri di ricerca predefiniti della finestra Allineamenti. Tolleranza
 * predefinita 5° con massimo 10° (richiesta umana 2026-10-21).
 */
export const DEFAULT_ALIGNMENT_SEARCH = {
  durationHours: DEFAULT_ALIGNMENT_DAYS * 24,
  stepMinutes: 15,
  toleranceDeg: 5,
  minMoonAltitudeDeg: 0,
  maxResults: 8,
} as const

/**
 * Passo fine del raffinamento: deve campionare la larghezza del passaggio al
 * limite della tolleranza (≈ 2·tolleranza/velocità), con cap a 1′ e minimo
 * 0,25′ per tolleranze piccole. Condiviso con la ricerca del Reverse Planner
 * (T-059): stessa fisica del moto apparente lunare.
 */
export function refineStepMinutes(toleranceDeg: number): number {
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
 * Misura pura della Luna rispetto a una linea di vista all'istante della
 * posizione data: separazione angolare reale, offset orizzontale (Δazimut
 * sull'orizzonte, sovrastima a quote alte) e verticale (Δaltitudine). È la
 * stessa misura dei candidati della ricerca (candidateFrom) e il readout
 * «Allineamento ora» del box Dati (T-045).
 */
export function alignmentDegs(
  losAzimuthDeg: number,
  losAltitudeDeg: number,
  moon: MoonTopocentric,
): AlignmentOffsets {
  return {
    separationDeg: angularSeparationDeg(
      losAzimuthDeg,
      losAltitudeDeg,
      moon.azimuthDeg,
      moon.altitudeDeg,
    ),
    horizontalOffsetDeg: azimuthDifferenceDeg(losAzimuthDeg, moon.azimuthDeg),
    verticalOffsetDeg: moon.altitudeDeg - losAltitudeDeg,
  }
}

/**
 * Campione interno della ricerca: aggiunge l'altitudine della Luna al
 * campione, serve al filtro orizzonte (T-047) e non compare nel risultato.
 */
interface PassageCandidate extends AlignmentCandidate {
  readonly moonAltitudeDeg: number
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
 * I passaggi con la Luna sotto `minMoonAltitudeDeg` sono scartati e contati
 * in `discardedBelowHorizon` (T-047): il filtro usa l'altitudine del campione
 * a separazione minima del passaggio, cioè del candidato.
 * Risultato: candidati ordinati per separazione crescente (tie-break per
 * data) e troncati a `maxResults`; `totalFound` è il numero di passaggi
 * ammessi nella finestra prima del troncamento.
 */
export function searchMoonAlignments(params: AlignmentSearchParams): AlignmentSearchResult {
  const stepMs = params.stepMinutes * 60_000
  const endMs = params.fromDateMs + params.durationHours * 3_600_000
  const fineMs = Math.round(refineStepMinutes(params.toleranceDeg) * 60_000)
  const coarseMarginDeg = (MAX_MOON_APPARENT_SPEED_DEG_PER_MIN * params.stepMinutes) / 2

  const candidateFrom = (dateMs: number, moon: MoonTopocentric): PassageCandidate => ({
    dateMs,
    ...alignmentDegs(params.losAzimuthDeg, params.losAltitudeDeg, moon),
    moonAltitudeDeg: moon.altitudeDeg,
  })

  const samples: PassageCandidate[] = []
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

  const candidates: PassageCandidate[] = []
  let window: PassageCandidate[] = []
  const flushWindow = (): void => {
    let best: PassageCandidate | null = null
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

  // Filtro orizzonte (T-047): scartati i passaggi con la Luna sotto la soglia
  // (default 0: sotto l'orizzonte; confronto stretto, alt = soglia è scartato).
  // Gli ammessi perdono il campo interno con l'altitudine del campione; il
  // conteggio degli scarti torna alla UI per la nota «Luna sotto l'orizzonte».
  const admitted: AlignmentCandidate[] = []
  let discardedBelowHorizon = 0
  for (const passage of candidates) {
    if (passage.moonAltitudeDeg > params.minMoonAltitudeDeg) {
      admitted.push({
        dateMs: passage.dateMs,
        separationDeg: passage.separationDeg,
        horizontalOffsetDeg: passage.horizontalOffsetDeg,
        verticalOffsetDeg: passage.verticalOffsetDeg,
      })
    } else {
      discardedBelowHorizon++
    }
  }

  // Ranking: in cima il passaggio con separazione minima; parimerito → il
  // primo in tempo. `totalFound` permette alla UI di dire quanti passaggi
  // il limite `maxResults` ha nascosto.
  admitted.sort((a, b) => a.separationDeg - b.separationDeg || a.dateMs - b.dateMs)
  return {
    candidates: admitted.slice(0, params.maxResults),
    totalFound: admitted.length,
    discardedBelowHorizon,
  }
}