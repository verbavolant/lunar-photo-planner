import type { Cesium3DTileset } from 'cesium'

// T-068: indicatore % caricamento dei tile del tileset di sessione.
//
// Base su CesiumJS 1.146 (Cesium.d.ts, doc `loadProgress` L32072–32097):
// l'evento passa `(numberOfPendingRequests, numberOfTilesProcessing)` a fine
// frame, ma NON esiste né un conteggio di tile totali né `statistics` su
// `Cesium3DTileset` → una percentuale VERA non è derivabile. La % è quindi una
// STIMA dichiarata: round(100·(1 − pending/peak)) con peak = massimo
// `pending + processing` osservato nella burst corrente; burst = intervallo
// fra due istanti a zero (poi il peak si azzera). A zero tile in corso la %
// vale 100. Il conteggio delle richieste pendenti è ESATTO. Limite
// documentato in MANUALE §9 e in ADR-021 (docs/ai/DECISIONS.md).

/** Istante del caricamento esposto alla UI (T-068). */
export interface TileLoadProgressSnapshot {
  /** Percentuale STIMA 0–100; 100 quando non c'è nulla in corso. */
  percent: number
  /** Richieste di download pendenti: valore ESATTO dell'evento Cesium. */
  pending: number
  /** Tile scaricati in lavorazione (decode/render): esatto. */
  processing: number
  /** Picco `pending + processing` osservato nella burst corrente. */
  peak: number
  /** true finché c'è almeno un tile pendente o in lavorazione. */
  busy: boolean
}

/**
 * Percentuale stimata per un istante: 1 − pending/peak, arrotondata e limitata
 * a [0, 100]. Con peak ≤ 0 (nessun riferimento: burst assente o azzerata)
 * restituisce 100, mai NaN.
 */
export function computeLoadPercent(pending: number, peak: number): number {
  if (peak <= 0) {
    return 100
  }
  const percent = Math.round(100 * (1 - pending / peak))
  return Math.min(100, Math.max(0, percent))
}

/**
 * Stato della burst corrente: accumula il picco fra due eventi a zero e si
 * azzera quando la burst termina (torna la % piena e il picco si resetta per
 * la burst successiva, che non eredita il vecchio riferimento).
 */
export class TileLoadProgressTracker {
  private burstActive = false
  private peak = 0

  onProgress(pending: number, processing: number): TileLoadProgressSnapshot {
    const total = pending + processing
    if (total === 0) {
      // Burst conclusa: reset del picco, la prossima burst riparte dal proprio.
      this.burstActive = false
      this.peak = 0
      return { percent: 100, pending, processing, peak: 0, busy: false }
    }
    if (!this.burstActive) {
      this.burstActive = true
      this.peak = total
    } else if (total > this.peak) {
      this.peak = total
    }
    return {
      percent: computeLoadPercent(pending, this.peak),
      pending,
      processing,
      peak: this.peak,
      busy: true,
    }
  }
}

/**
 * Aggancia il calcolo della % all'evento `loadProgress` del tileset di
 * sessione e restituisce la funzione di rimozione del listener: al cleanup il
 * componente si stacca, mentre il tileset di sessione sopravvive al remount.
 */
export function subscribeTileLoadProgress(
  tileset: Cesium3DTileset,
  listener: (snapshot: TileLoadProgressSnapshot) => void,
): () => void {
  const tracker = new TileLoadProgressTracker()
  const remove = tileset.loadProgress.addEventListener(
    (pending: number, processing: number) => {
      listener(tracker.onProgress(pending, processing))
    },
  )
  return remove
}
