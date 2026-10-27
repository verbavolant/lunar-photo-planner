/**
 * Occlusione della linea di vista Observer→Target (Fase 8, T-063; metodo in
 * ADR-020): in CesiumJS 1.146 non esiste ray casting (`pickFromRay`/
 * `drillPickFromRay` assenti dal d.ts, verifica T-062), quindi la visibilità
 * si valuta campionando il suolo lungo la CORDA Observer→Target — il segmento
 * retto in ECEF, che è la linea di vista fisica — con il sampler terreno
 * iniettabile (adapter reale: `createTerrainHeightSampler`, ADR-019).
 *
 * Geometria dei campioni: `Cartesian3.lerp` in ECEF + `Cartographic
 * .fromCartesian` (d.ts 1.146 L2095/L2690). La quota della corda è l'altezza
 * ellissoideale REALE del punto del segmento, non l'interpolazione lineare
 * delle quote degli estremi: per corde lunghe il segmento retto scende sotto
 * l'arco di superficie di ≈ d²/(8R) (1000 m → ~2 cm, 10 km → ~2 m,
 * 50 km → ~49 m) e l'occlusione da curvatura del terreno emerge da sé, come
 * deve; l'interpolazione lineare delle quote la nasconderebbe.
 *
 * Clearance(punto) = quota corda − quota suolo campionata. Esito:
 * - `occluded`: almeno un punto campionato con clearance sotto soglia —
 *   l'ostacolo è certo e i punti senza dati non lo smentiscono;
 * - `inconclusive`: nessuna occlusione accertata ma almeno un punto senza
 *   quota: MAI `free` per assenza di dati (ADR-020);
 * - `free`: tutti i punti campionati e tutti sopra soglia.
 *
 * Estremi esclusi: all'Observer e al Target la clearance è ≈ 0 per costruzione
 * (il segmento parte e arriva sulle loro posizioni) e non sono ostacoli: si
 * campionano solo punti interni, frazione t = i/(N+1), i = 1…N. Nessun margine
 * inventato (decisione T-063): un'eventuale tolleranza passa dalla soglia.
 */
import { Cartesian3, Cartographic } from 'cesium'
import type { GeoPoint } from '../geodesy/geodesy'
import {
  TERRAIN_GRID_BATCH_SIZE,
  type TerrainHeightSampler,
} from './reverseAlignment'

/**
 * Numero predefinito di punti campione interni alla corda: passo = corda/(N+1)
 * (~4 m su una corda di 1 km, ~195 m su 50 km). Valore di orchestrazione, come
 * le costanti di scansione del Reverse Planner.
 */
export const DEFAULT_SIGHT_SAMPLES = 256

/**
 * Massimo punti campione per analisi: una sola richiesta al sampler, entro la
 * convenzione di batch del progetto (T-060); NON è un limite di Cesium.
 */
export const MAX_SIGHT_SAMPLES = TERRAIN_GRID_BATCH_SIZE

/** Soglia predefinita di occlusione: basta che il suolo scavalchi la corda. */
export const DEFAULT_CLEARANCE_THRESHOLD_M = 0

/** Un punto campione interno alla corda (uso interno alla valutazione). */
interface ChordSample {
  readonly fraction: number
  readonly longitudeDeg: number
  readonly latitudeDeg: number
  readonly chordHeightM: number
  readonly distanceFromTargetM: number
}

export type SightLineStatus = 'free' | 'occluded' | 'inconclusive'

/**
 * Il campione con clearance minima fra quelli con quota nota (il «punto più
 * restrittivo»): è il punto occludente quando lo stato è `occluded`, il punto
 * di margine minimo quando lo stato è `free`.
 */
export interface RestrictivePoint {
  readonly longitudeDeg: number
  readonly latitudeDeg: number
  readonly chordHeightM: number
  readonly groundHeightM: number
  readonly clearanceM: number
  readonly distanceFromTargetM: number
}

export interface SightLineReport {
  readonly status: SightLineStatus
  /** `null` se nessun campione ha quota suolo nota. */
  readonly mostRestrictive: RestrictivePoint | null
  /** Campioni con suolo non determinabile («N» del readout «N/M»). */
  readonly unsampledCount: number
  /** Campioni totali interni alla corda («M» del readout). */
  readonly sampleCount: number
}

export interface SightLineOptions {
  /**
   * Punti campione interni alla corda (estremi esclusi), intero in
   * [1, MAX_SIGHT_SAMPLES]. Predefinito: DEFAULT_SIGHT_SAMPLES.
   */
  readonly sampleCount?: number
  /**
   * Soglia di occlusione in metri: clearance < soglia ⇒ occluso. Predefinita 0
   * (suolo sopra la corda); positiva = margine di prudenza (es. vegetazione),
   * negativa = tolleranza.
   */
  readonly clearanceThresholdM?: number
}

/**
 * Valuta la visibilità Observer→Target campionando il suolo lungo la corda
 * (ADR-020). Asincrona: una sola richiesta al sampler con tutti i punti
 * interni, nello stesso ordine in cui sono generati (Observer → Target).
 */
export async function analyzeSightLine(
  observer: GeoPoint,
  target: GeoPoint,
  sampler: TerrainHeightSampler,
  options: SightLineOptions = {},
): Promise<SightLineReport> {
  const sampleCount = options.sampleCount ?? DEFAULT_SIGHT_SAMPLES
  const thresholdM = options.clearanceThresholdM ?? DEFAULT_CLEARANCE_THRESHOLD_M
  if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > MAX_SIGHT_SAMPLES) {
    throw new RangeError(
      `Numero di campioni non valido: serve un intero in [1, ${MAX_SIGHT_SAMPLES}].`,
    )
  }
  if (!Number.isFinite(thresholdM)) {
    throw new RangeError('Soglia di clearance non valida: serve un numero finito.')
  }
  for (const point of [observer, target]) {
    if (
      !Number.isFinite(point.latitudeDeg) ||
      !Number.isFinite(point.longitudeDeg) ||
      !Number.isFinite(point.heightM)
    ) {
      throw new RangeError(
        'Posizioni Observer/Target non valide: servono latitudine, longitudine e quota finite.',
      )
    }
  }

  const start = Cartesian3.fromDegrees(
    observer.longitudeDeg,
    observer.latitudeDeg,
    observer.heightM,
  )
  const end = Cartesian3.fromDegrees(target.longitudeDeg, target.latitudeDeg, target.heightM)
  const chordLengthM = Cartesian3.distance(start, end)

  // Punti interni alla corda: interpolazione ECEF + riconversione in
  // Cartographic (quota REALE del segmento, vedi header del modulo).
  const samples: ChordSample[] = []
  for (let index = 1; index <= sampleCount; index++) {
    const fraction = index / (sampleCount + 1)
    const position = Cartesian3.lerp(start, end, fraction, new Cartesian3())
    const carto = Cartographic.fromCartesian(position)
    samples.push({
      fraction,
      longitudeDeg: (carto.longitude * 180) / Math.PI,
      latitudeDeg: (carto.latitude * 180) / Math.PI,
      chordHeightM: carto.height,
      // La distanza lungo la corda è affine alla frazione: (1 − t) · lunghezza.
      distanceFromTargetM: (1 - fraction) * chordLengthM,
    })
  }

  const grounds = await sampler(
    samples.map((sample) => ({
      latitudeDeg: sample.latitudeDeg,
      longitudeDeg: sample.longitudeDeg,
    })),
  )
  if (grounds.length !== samples.length) {
    throw new Error(
      `Il sampler ha risposto con ${grounds.length} quote su ${samples.length} richieste.`,
    )
  }

  let unsampledCount = 0
  let mostRestrictive: RestrictivePoint | null = null
  for (let index = 0; index < samples.length; index++) {
    const groundHeightM = grounds[index]
    // Dopo il controllo di lunghezza `undefined` non può occorrere; il guard
    // serve solo a `noUncheckedIndexedAccess` e tratta il caso come senza dati.
    if (groundHeightM === null || groundHeightM === undefined) {
      unsampledCount++
      continue
    }
    const sample = samples[index]!
    const clearanceM = sample.chordHeightM - groundHeightM
    // In caso di parità vince il primo incontrato procedendo dall'Observer
    // verso il Target.
    if (mostRestrictive === null || clearanceM < mostRestrictive.clearanceM) {
      mostRestrictive = {
        longitudeDeg: sample.longitudeDeg,
        latitudeDeg: sample.latitudeDeg,
        chordHeightM: sample.chordHeightM,
        groundHeightM,
        clearanceM,
        distanceFromTargetM: sample.distanceFromTargetM,
      }
    }
  }

  const status: SightLineStatus =
    mostRestrictive !== null && mostRestrictive.clearanceM < thresholdM
      ? 'occluded'
      : unsampledCount > 0
        ? 'inconclusive'
        : 'free'

  return { status, mostRestrictive, unsampledCount, sampleCount: samples.length }
}