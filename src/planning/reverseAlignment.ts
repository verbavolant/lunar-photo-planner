/**
 * Reverse Planner (Fase 7, T-058): dato un Target fissato sulla mappa e una
 * composizione desiderata («Luna dietro/il Target» entro tolleranza), trova le
 * coppie (posizione dell'Observer, istante) che la realizzano.
 *
 * Geometria per istante: la Luna ha azimut/altitudine topocentrici dal Target;
 * il fotografo a terra deve stare sul radiale dal Target in direzione OPPOSTA
 * all'azimut della Luna (guardando il Target guarda verso la Luna; geometria
 * già disegnata dal T-043, annullato, qui reimplementata) a una distanza in cui
 * l'elevazione della linea di vista Observer→Target eguaglia l'altitudine della
 * Luna. Nessuna nuova formula: radiale con `movePointOnWGS84` (T-028), linea di
 * vista con `lineOfSightAzimuthDeg`/`verticalAngleDeg` (corda 3D rispetto alla
 * normale ellissoide, T-009), misura con `alignmentDegs` (T-045).
 *
 * Terreno: quote del suolo e linee di vista verso il Target NON dipendono
 * dall'istante, quindi la griglia polare attorno al Target (azimut × distanza)
 * le campiona una volta sola (sampler iniettabile, batch) e il radiale di un
 * qualunque istante si ottiene interpolando bilinearmente fra le due colonne
 * che racchiudono il suo azimut. Le celle senza quota (tile non caricati o fuori
 * copertura) escludono la distanza corrispondente.
 *
 * Luna per istante: la scansione usa la posizione vista dal TARGET; la posizione
 * vista dall'Observer candidato ne differisce per parallasse (≤ 0,0003° su 2 km)
 * e per l'inclinazione della normale ellissoide fra i due punti (≤ d/R ≈ 0,018°
 * su 2 km): complessivamente ≤ ~0,02°, trascurabile rispetto al diametro
 * apparente della Luna (~0,5°) e a qualunque tolleranza d'uso. I candidati
 * ammessi vengono comunque raffinati con la posizione esatta vista
 * dall'Observer (`refineReverseCandidate`).
 *
 * Limiti dichiarati: solo la composizione «dietro/il Target» sul radiale (gli
 * offset laterali ampi non sono richiesti); nessun controllo di occlusione
 * (Fase 8); l'Observer candidato è a terra, senza altezza occhi (equivalente
 * dichiarato: a scala urbana l'effetto sull'allineamento è trascurabile).
 */
import { moonTopocentric, type MoonTopocentric } from '../astronomy/moon'
import {
  lineOfSightAzimuthDeg,
  movePointOnWGS84,
  verticalAngleDeg,
  type GeoPoint,
} from '../geodesy/geodesy'
import {
  alignmentDegs,
  MAX_MOON_APPARENT_SPEED_DEG_PER_MIN,
  refineStepMinutes,
} from './alignment'

/** Punto geografico senza quota, per le richieste di campionamento terreno. */
export interface LatLonPoint {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
}

/**
 * Campiona la quota ellissoideale del suolo (m) per ogni punto richiesto,
 * nello stesso ordine. `null` = quota non determinabile (tile non caricati o
 * fuori copertura). Adapter reale: `src/cesium/terrainSample.ts` (T-060).
 */
export type TerrainHeightSampler = (
  points: ReadonlyArray<LatLonPoint>,
) => Promise<ReadonlyArray<number | null>>

/** Prima distanza di scansione dal Target (m): più vicino non serve. */
export const REVERSE_SCAN_FIRST_DISTANCE_M = 25
/** Passo della scansione lungo il radiale (m). */
export const REVERSE_SCAN_STEP_M = 50
/** Passo in azimut delle colonne della griglia polare, in gradi. */
export const TERRAIN_GRID_AZIMUTH_STEP_DEG = 2
/**
 * Dimensione massima di ogni richiesta al sampler: scelta di orchestrazione per
 * contenere la latenza di ogni chiamata, NON un limite dell'API di Cesium.
 */
export const TERRAIN_GRID_BATCH_SIZE = 512

/** Normalizza un azimut in [0, 360) senza perturbare i valori già nel range (identità bit-a-bit). */
function normalizeAzimuthDeg(azimuthDeg: number): number {
  if (azimuthDeg >= 0 && azimuthDeg < 360) {
    return azimuthDeg
  }
  return ((azimuthDeg % 360) + 360) % 360
}

/**
 * Distanze di scansione dal primo al massimo (cap incluso), al passo costante:
 * se il cap non cade sul passo viene aggiunto come ultimo punto.
 */
export function scanDistancesM(
  firstDistanceM: number,
  stepM: number,
  maxDistanceM: number,
): number[] {
  if (
    !Number.isFinite(firstDistanceM) ||
    !Number.isFinite(stepM) ||
    !Number.isFinite(maxDistanceM) ||
    stepM <= 0 ||
    firstDistanceM < 0 ||
    maxDistanceM < firstDistanceM
  ) {
    throw new RangeError(
      'Parametri di scansione non validi: servono valori finiti, first ≥ 0, step > 0, max ≥ first.',
    )
  }
  const count = Math.floor((maxDistanceM - firstDistanceM) / stepM + 1e-9) + 1
  const distances: number[] = []
  for (let index = 0; index < count; index++) {
    distances.push(firstDistanceM + index * stepM)
  }
  const lastDistanceM = distances[distances.length - 1]
  if (lastDistanceM !== undefined && maxDistanceM - lastDistanceM > 1e-9) {
    distances.push(maxDistanceM)
  }
  return distances
}

/** Una cella del radiale: distanza dal Target, quota del suolo, linea di vista precomputata. */
export interface ReverseRadialCell {
  readonly distanceM: number
  /** Quota del suolo campionata/interpolata, in metri. */
  readonly groundHeightM: number
  /** Azimut della corda 3D Observer→Target: dipende solo dalla posizione, non dal tempo. */
  readonly losAzimuthDeg: number
  /** Elevazione della corda 3D Observer→Target sopra l'orizzonte locale, in gradi. */
  readonly losAltitudeDeg: number
}

/** Colonna della griglia polare: tutte le distanze a un azimut fissato. */
export interface TerrainPolarColumn {
  readonly azimuthDeg: number
  /** Cella per ogni distanza (stesso ordine di `distancesM`); `null` = quota non determinabile. */
  readonly cells: ReadonlyArray<ReverseRadialCell | null>
}

/** Griglia polare di quote e linee di vista attorno al Target. */
export interface TerrainPolarGrid {
  readonly target: GeoPoint
  readonly distancesM: ReadonlyArray<number>
  /** Colonne a azimut 0, step, 2·step, …, 360−step (sempre 360/step colonne). */
  readonly columns: ReadonlyArray<TerrainPolarColumn>
}

/**
 * Costruisce la griglia polare: campiona le quote di tutte le posizioni
 * (azimut × distanza) con il sampler, in batch, e precomputa per ogni cella la
 * linea di vista verso il Target (la posizione dell'Observer candidato è alla
 * quota del suolo campionato). Le richieste al sampler partono per colonne
 * intere in ordine di azimut.
 */
export async function buildTerrainPolarGrid(
  target: GeoPoint,
  distancesM: ReadonlyArray<number>,
  sampler: TerrainHeightSampler,
  azimuthStepDeg: number = TERRAIN_GRID_AZIMUTH_STEP_DEG,
): Promise<TerrainPolarGrid> {
  if (distancesM.length === 0) {
    throw new RangeError('La griglia richiede almeno una distanza di scansione.')
  }
  for (let index = 1; index < distancesM.length; index++) {
    const previous = distancesM[index - 1]
    const current = distancesM[index]
    if (previous === undefined || current === undefined || current <= previous) {
      throw new RangeError('Le distanze di scansione devono essere strettamente crescenti.')
    }
  }
  if (
    !Number.isFinite(azimuthStepDeg) ||
    azimuthStepDeg <= 0 ||
    !Number.isInteger(360 / azimuthStepDeg)
  ) {
    throw new RangeError('Il passo di azimut deve essere finito, > 0 e divisore di 360.')
  }
  const columnCount = 360 / azimuthStepDeg
  const positions: GeoPoint[] = []
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
    const azimuthDeg = columnIndex * azimuthStepDeg
    for (const distanceM of distancesM) {
      positions.push(movePointOnWGS84(target, azimuthDeg, distanceM))
    }
  }
  const heightsM: (number | null)[] = []
  for (let start = 0; start < positions.length; start += TERRAIN_GRID_BATCH_SIZE) {
    const batch = positions.slice(start, start + TERRAIN_GRID_BATCH_SIZE)
    const sampled = await sampler(batch)
    if (sampled.length !== batch.length) {
      throw new Error('Il campionamento del terreno ha restituito un numero di quote errato.')
    }
    heightsM.push(...sampled)
  }
  const columns: TerrainPolarColumn[] = []
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
    const azimuthDeg = columnIndex * azimuthStepDeg
    const cells: (ReverseRadialCell | null)[] = []
    for (let distanceIndex = 0; distanceIndex < distancesM.length; distanceIndex++) {
      const arrayIndex = columnIndex * distancesM.length + distanceIndex
      const groundHeightM = heightsM[arrayIndex]
      const base = positions[arrayIndex]
      const distanceM = distancesM[distanceIndex]
      if (
        groundHeightM === null ||
        groundHeightM === undefined ||
        base === undefined ||
        distanceM === undefined
      ) {
        cells.push(null)
        continue
      }
      const observer: GeoPoint = { ...base, heightM: groundHeightM }
      cells.push({
        distanceM,
        groundHeightM,
        losAzimuthDeg: lineOfSightAzimuthDeg(observer, target),
        losAltitudeDeg: verticalAngleDeg(observer, target),
      })
    }
    columns.push({ azimuthDeg, cells })
  }
  return { target, distancesM: [...distancesM], columns }
}

/** Interpolazione lineare lungo il percorso più corto fra due azimut. */
function lerpAzimuthDeg(fromDeg: number, toDeg: number, t: number): number {
  const delta = ((((toDeg - fromDeg) % 360) + 540) % 360) - 180
  return fromDeg + delta * t
}

/**
 * Celle del radiale all'azimut richiesto: per ogni distanza, interpolazione
 * bilineare fra le due colonne che racchiudono l'azimut (ciclico). Una distanza
 * senza quota in una delle due colonne resta `null`: la distanza è esclusa.
 */
export function radialCellsAtAzimuth(
  grid: TerrainPolarGrid,
  azimuthDeg: number,
): ReadonlyArray<ReverseRadialCell | null> {
  const columnCount = grid.columns.length
  if (columnCount === 0) {
    throw new Error('Griglia polare priva di colonne.')
  }
  const stepDeg = 360 / columnCount
  const normalized = normalizeAzimuthDeg(azimuthDeg)
  const lowerIndex = Math.floor(normalized / stepDeg) % columnCount
  const upperIndex = (lowerIndex + 1) % columnCount
  const lower = grid.columns[lowerIndex]
  const upper = grid.columns[upperIndex]
  if (lower === undefined || upper === undefined) {
    throw new Error('Griglia polare incompleta: colonne mancanti.')
  }
  const t = (normalized - lowerIndex * stepDeg) / stepDeg
  return grid.distancesM.map((distanceM, index) => {
    const from = lower.cells[index]
    const to = upper.cells[index]
    if (from === null || from === undefined || to === null || to === undefined) {
      return null
    }
    return {
      distanceM,
      groundHeightM: from.groundHeightM + (to.groundHeightM - from.groundHeightM) * t,
      losAzimuthDeg: normalizeAzimuthDeg(lerpAzimuthDeg(from.losAzimuthDeg, to.losAzimuthDeg, t)),
      losAltitudeDeg: from.losAltitudeDeg + (to.losAltitudeDeg - from.losAltitudeDeg) * t,
    }
  })
}

/** Un candidato del Reverse Planner: dove mettere l'Observer e quando. */
export interface ReverseAlignmentCandidate {
  readonly dateMs: number
  /** Posizione dell'Observer, alla quota del suolo campionato. */
  readonly observer: GeoPoint
  /** Distanza Observer↔Target lungo il radiale, in metri. */
  readonly distanceM: number
  /** Separazione angolare reale Luna ↔ linea di vista, in gradi. */
  readonly separationDeg: number
  /** Offset orizzontale (Δazimut): >0 = Luna a destra della linea di vista. */
  readonly horizontalOffsetDeg: number
  /** Offset verticale (Δaltitudine): >0 = Luna sopra la linea di vista. */
  readonly verticalOffsetDeg: number
  /** Azimut della Luna usato per la misura (dal Target in scansione, esatto dopo il raffinamento). */
  readonly moonAzimuthDeg: number
  /** Altitudine della Luna usata per la misura (dal Target in scansione, esatta dopo il raffinamento). */
  readonly moonAltitudeDeg: number
  readonly losAzimuthDeg: number
  readonly losAltitudeDeg: number
}

export interface ReverseCandidateInput {
  readonly target: GeoPoint
  readonly dateMs: number
  /** Luna vista dal Target all'istante: il radiale è opposto al suo azimut. */
  readonly moonAtTarget: MoonTopocentric
  /** Celle del radiale all'azimut opposto alla Luna (`radialCellsAtAzimuth`). */
  readonly cells: ReadonlyArray<ReverseRadialCell | null>
  readonly toleranceDeg: number
  /** Altitudine minima della Luna perché l'istante sia ammesso, in gradi (confronto stretto, come T-047). */
  readonly minMoonAltitudeDeg: number
}

/**
 * Miglior candidato del radiale all'istante: la cella con separazione minima
 * entro tolleranza (a parità di separazione vince la distanza minore). Le celle
 * sono valutate con la Luna vista dal Target; `null` se la Luna è sotto la
 * soglia o nessuna distanza è entro tolleranza.
 */
export function reverseCandidateAtInstant(
  input: ReverseCandidateInput,
): ReverseAlignmentCandidate | null {
  if (input.moonAtTarget.altitudeDeg <= input.minMoonAltitudeDeg) {
    return null
  }
  const radialAzimuthDeg = normalizeAzimuthDeg(input.moonAtTarget.azimuthDeg + 180)
  let best: ReverseAlignmentCandidate | null = null
  for (const cell of input.cells) {
    if (cell === null) {
      continue
    }
    const offsets = alignmentDegs(cell.losAzimuthDeg, cell.losAltitudeDeg, input.moonAtTarget)
    if (offsets.separationDeg > input.toleranceDeg) {
      continue
    }
    if (best !== null && offsets.separationDeg >= best.separationDeg) {
      continue
    }
    const base = movePointOnWGS84(input.target, radialAzimuthDeg, cell.distanceM)
    best = {
      dateMs: input.dateMs,
      observer: { ...base, heightM: cell.groundHeightM },
      distanceM: cell.distanceM,
      separationDeg: offsets.separationDeg,
      horizontalOffsetDeg: offsets.horizontalOffsetDeg,
      verticalOffsetDeg: offsets.verticalOffsetDeg,
      moonAzimuthDeg: input.moonAtTarget.azimuthDeg,
      moonAltitudeDeg: input.moonAtTarget.altitudeDeg,
      losAzimuthDeg: cell.losAzimuthDeg,
      losAltitudeDeg: cell.losAltitudeDeg,
    }
  }
  return best
}

/**
 * Raffina un candidato con la posizione della Luna e la linea di vista ESATTE
 * dell'Observer candidato (la scansione usa la Luna vista dal Target: lo scarto
 * è parallasse + inclinazione della normale ellissoide, ≤ ~0,02° su 2 km).
 * Ritorna `null` se il candidato ricalcolato esce dalla tolleranza o dalla
 * soglia di altitudine.
 */
export function refineReverseCandidate(
  candidate: ReverseAlignmentCandidate,
  target: GeoPoint,
  toleranceDeg: number,
  minMoonAltitudeDeg: number,
): ReverseAlignmentCandidate | null {
  const moon = moonTopocentric(candidate.observer, new Date(candidate.dateMs))
  if (moon.altitudeDeg <= minMoonAltitudeDeg) {
    return null
  }
  const losAzimuthDeg = lineOfSightAzimuthDeg(candidate.observer, target)
  const losAltitudeDeg = verticalAngleDeg(candidate.observer, target)
  const offsets = alignmentDegs(losAzimuthDeg, losAltitudeDeg, moon)
  if (offsets.separationDeg > toleranceDeg) {
    return null
  }
  return {
    ...candidate,
    separationDeg: offsets.separationDeg,
    horizontalOffsetDeg: offsets.horizontalOffsetDeg,
    verticalOffsetDeg: offsets.verticalOffsetDeg,
    moonAzimuthDeg: moon.azimuthDeg,
    moonAltitudeDeg: moon.altitudeDeg,
    losAzimuthDeg,
    losAltitudeDeg,
  }
}

/** Parametri della ricerca temporale del Reverse Planner. */
export interface SearchReverseAlignmentsParams {
  readonly target: GeoPoint
  /** Griglia polare costruita attorno allo stesso Target (`buildTerrainPolarGrid`). */
  readonly terrainGrid: TerrainPolarGrid
  /** Istante di partenza della ricerca, in ms epoch. */
  readonly fromDateMs: number
  /** Durata della finestra di ricerca, in ore. */
  readonly durationHours: number
  /** Passo della scansione coarse, in minuti. */
  readonly coarseStepMinutes: number
  /** Separazione massima per considerare «allineato», in gradi. */
  readonly toleranceDeg: number
  /**
   * Altitudine minima della Luna perché un passaggio sia ammesso, in gradi:
   * come in Fase 6, 0 scarta i passaggi sotto l'orizzonte (confronto stretto),
   * valori negativi ammessi per ricerche «fisiche» senza filtro.
   */
  readonly minMoonAltitudeDeg: number
  /** Numero massimo di candidati restituiti. */
  readonly maxResults: number
}

/** Risultato della ricerca temporale: candidati ordinati e contatori. */
export interface ReverseAlignmentSearchResult {
  /** Passaggi ammessi, ordinati per separazione crescente (tie-break per data), al più `maxResults`. */
  readonly candidates: ReverseAlignmentCandidate[]
  /** Numero totale di passaggi ammessi nella finestra, prima del troncamento a `maxResults`. */
  readonly totalFound: number
  /** Passaggi scartati perché la Luna era sotto `minMoonAltitudeDeg` al campione a separazione minima. */
  readonly discardedBelowHorizon: number
  /** Passaggi ammessi dalla scansione ma respinti dal ricalcolo esatto (`refineReverseCandidate`). */
  readonly discardedRefinement: number
  /** Istanti valutati (coarse + fine): misura del costo della ricerca. */
  readonly evaluatedInstants: number
}

/**
 * Massimo gradiente in azimut dell'altitudine della linea di vista, in gradi
 * di LOS per grado di azimut: massimo fra colonne adiacenti (ciclico) e
 * distanze di |ΔlosAlt| diviso il passo in azimut. Le coppie con una cella
 * senza quota sono saltate: lì il radiale non è valutabile (vedi i limiti
 * dichiarati di `searchReverseAlignments`).
 */
function maxLosAltitudeGradientDegPerDeg(grid: TerrainPolarGrid): number {
  const columnCount = grid.columns.length
  if (columnCount < 2) {
    return 0
  }
  const stepDeg = 360 / columnCount
  let max = 0
  for (let index = 0; index < columnCount; index++) {
    const from = grid.columns[index]
    const to = grid.columns[(index + 1) % columnCount]
    if (from === undefined || to === undefined) {
      continue
    }
    for (let cellIndex = 0; cellIndex < from.cells.length; cellIndex++) {
      const fromCell = from.cells[cellIndex]
      const toCell = to.cells[cellIndex]
      if (fromCell === null || fromCell === undefined || toCell === null || toCell === undefined) {
        continue
      }
      const gradient = Math.abs(toCell.losAltitudeDeg - fromCell.losAltitudeDeg) / stepDeg
      if (gradient > max) {
        max = gradient
      }
    }
  }
  return max
}

/**
 * Ricerca nel tempo della composizione «Luna dietro/il Target»: per ogni
 * istante valuta il radiale opposto all'azimut della Luna vista dal Target
 * (`reverseCandidateAtInstant`) e raggruppa i campioni entro tolleranza in
 * passaggi, un candidato ciascuno (il campione a separazione minima).
 *
 * Due fasi, stesso schema di `searchMoonAlignments`:
 * 1. scansione coarse al passo `coarseStepMinutes`: un intervallo può
 *    contenere un dip sotto tolleranza solo se il minimo dei suoi estremi è
 *    ≤ tolleranza + margine, con margine = v_max·(1 + G)·passo/2, dove
 *    v_max = MAX_MOON_APPARENT_SPEED_DEG_PER_MIN e G è il massimo gradiente
 *    in azimut dell'altitudine di linea di vista della griglia
 *    (`maxLosAltitudeGradientDegPerDeg`). Il termine G è la differenza rispetto
 *    alla Fase 6: qui il radiale ruota con la Luna (fino a v_max gradi/minuto)
 *    e l'altitudine della LOS interpolata cambia a ritmo fino a v_max·G; col
 *    solo margine lunare un dip generato da un gradiente G ≳ 0,15 (pendenza
 *    azimutale ≳ 15%) può sfuggire alla condizione. Il contributo di azimut
 *    della differenza fra le due direzioni (LOS e Luna) è trascurabile: la LOS
 *    dell'Observer verso il Target è il retro-azimut del radiale, che ruota
 *    insieme all'azimut lunare (deriva ≲ 0,005°/min, coerenza verificata dai
 *    test di raffinamento del T-058 entro 0,02°);
 * 2. raffinamento al passo fine di `refineStepMinutes` dei soli intervalli
 *    segnalati.
 * I passaggi con la Luna sotto `minMoonAltitudeDeg` al campione a separazione
 * minima sono scartati e contati in `discardedBelowHorizon`; i passaggi che
 * il ricalcolo esatto (`refineReverseCandidate`, Luna vista dall'Observer
 * candidato) respinge sono contati in `discardedRefinement` (lo scarto
 * scansione↔esatto è ≤ ~0,02° su 2 km: rilevante solo a tolleranze minuscole).
 * Limiti dichiarati: le distanze con buchi di copertura terreno nella griglia
 * (celle nulle) possono nascondere passaggi brevissimi quando il radiale
 * entra/esce dal buco fra due campioni; con copertura completa la garanzia a
 * due fasi vale col margine esteso al gradiente.
 * Risultato: candidati ordinati per separazione crescente (tie-break per
 * data) e troncati a `maxResults`; `totalFound` è il numero di passaggi
 * ammessi nella finestra prima del troncamento.
 */
export function searchReverseAlignments(
  params: SearchReverseAlignmentsParams,
): ReverseAlignmentSearchResult {
  const { target, terrainGrid } = params
  if (
    terrainGrid.target.latitudeDeg !== target.latitudeDeg ||
    terrainGrid.target.longitudeDeg !== target.longitudeDeg ||
    terrainGrid.target.heightM !== target.heightM
  ) {
    throw new RangeError(
      'La griglia polare è costruita attorno a un Target diverso da quello della ricerca.',
    )
  }
  if (!Number.isFinite(params.durationHours) || params.durationHours <= 0) {
    throw new RangeError('La durata della finestra di ricerca deve essere positiva.')
  }
  if (!Number.isFinite(params.coarseStepMinutes) || params.coarseStepMinutes <= 0) {
    throw new RangeError('Il passo coarse deve essere positivo.')
  }
  if (!Number.isFinite(params.toleranceDeg) || params.toleranceDeg < 0) {
    throw new RangeError('La tolleranza deve essere non negativa.')
  }
  if (!Number.isFinite(params.minMoonAltitudeDeg)) {
    throw new RangeError('La soglia di altitudine della Luna deve essere finita.')
  }
  if (!Number.isInteger(params.maxResults) || params.maxResults < 0) {
    throw new RangeError('maxResults deve essere un intero non negativo.')
  }

  const stepMs = params.coarseStepMinutes * 60_000
  const endMs = params.fromDateMs + params.durationHours * 3_600_000
  const fineMs = Math.round(refineStepMinutes(params.toleranceDeg) * 60_000)
  const coarseMarginDeg =
    (MAX_MOON_APPARENT_SPEED_DEG_PER_MIN *
      (1 + maxLosAltitudeGradientDegPerDeg(terrainGrid)) *
      params.coarseStepMinutes) /
    2

  // La soglia di altitudine NON filtra i campioni (come in Fase 6): i passaggi
  // vengono prima raggruppati, poi filtrati sul campione a separazione minima.
  let evaluatedInstants = 0
  const candidateAt = (dateMs: number, toleranceDeg: number): ReverseAlignmentCandidate | null => {
    const moon = moonTopocentric(target, new Date(dateMs))
    evaluatedInstants += 1
    return reverseCandidateAtInstant({
      target,
      dateMs,
      moonAtTarget: moon,
      cells: radialCellsAtAzimuth(terrainGrid, moon.azimuthDeg + 180),
      toleranceDeg,
      minMoonAltitudeDeg: Number.NEGATIVE_INFINITY,
    })
  }

  const samples: ReverseAlignmentCandidate[] = []
  let previous: { dateMs: number; separationDeg: number } | null = null
  for (let dateMs = params.fromDateMs; dateMs <= endMs; dateMs += stepMs) {
    const coarse = candidateAt(dateMs, params.toleranceDeg + coarseMarginDeg)
    const separationDeg = coarse === null ? Number.POSITIVE_INFINITY : coarse.separationDeg
    if (
      previous !== null &&
      Math.min(previous.separationDeg, separationDeg) <= params.toleranceDeg + coarseMarginDeg
    ) {
      // Raffina l'intervallo precedente: campioni fine dall'estremo iniziale
      // (escluso, già collezionato) all'attuale (escluso, valutato sotto).
      for (let fineDateMs = previous.dateMs + fineMs; fineDateMs < dateMs; fineDateMs += fineMs) {
        const fine = candidateAt(fineDateMs, params.toleranceDeg)
        if (fine !== null) {
          samples.push(fine)
        }
      }
    }
    if (coarse !== null && coarse.separationDeg <= params.toleranceDeg) {
      samples.push(coarse)
    }
    previous = { dateMs, separationDeg }
  }

  // Un passaggio = finestra contigua di campioni ammissibili; ne sopravvive il
  // campione a separazione minima (a parità di separazione il primo in tempo:
  // i campioni sono cronologici e il confronto è stretto).
  const passages: ReverseAlignmentCandidate[] = []
  let window: ReverseAlignmentCandidate[] = []
  const flushWindow = (): void => {
    let best: ReverseAlignmentCandidate | null = null
    for (const sample of window) {
      if (best === null || sample.separationDeg < best.separationDeg) {
        best = sample
      }
    }
    if (best !== null) {
      passages.push(best)
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

  // Filtro orizzonte sul campione a separazione minima del passaggio (come
  // T-047) e ricalcolo esatto con la Luna vista dall'Observer candidato: un
  // passaggio respinto dal ricalcolo è contato, non taciuto.
  const admitted: ReverseAlignmentCandidate[] = []
  let discardedBelowHorizon = 0
  let discardedRefinement = 0
  for (const passage of passages) {
    if (passage.moonAltitudeDeg > params.minMoonAltitudeDeg) {
      const refined = refineReverseCandidate(
        passage,
        target,
        params.toleranceDeg,
        params.minMoonAltitudeDeg,
      )
      if (refined === null) {
        discardedRefinement += 1
      } else {
        admitted.push(refined)
      }
    } else {
      discardedBelowHorizon += 1
    }
  }

  // Ranking: in cima il passaggio con separazione minima; parimerito → il
  // primo in tempo. `totalFound` permette alla UI di dire quanti passaggi il
  // limite `maxResults` ha nascosto.
  admitted.sort((a, b) => a.separationDeg - b.separationDeg || a.dateMs - b.dateMs)
  return {
    candidates: admitted.slice(0, params.maxResults),
    totalFound: admitted.length,
    discardedBelowHorizon,
    discardedRefinement,
    evaluatedInstants,
  }
}