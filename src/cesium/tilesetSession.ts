// Creazione singleton del tileset Google Photorealistic 3D per sessione
// (T-040). Richiesta umano dopo l'errore 429 RATE_LIMIT_EXCEEDED su
// tile.googleapis.com — quota "3D Tiles root requests per minute" = 150 per
// progetto Google (errore live 2026-10-08, progetto 584945306220) — esaurita
// dalle creazioni ripetute del tileset: in dev ogni remount di StrictMode
// (doppio mount) o HMR creava un tileset nuovo, e ogni creazione è una root
// request.
//
// Meccanismo verificato:
// - La PROMISE di creazione (non solo il risultato) è memoizzata per
//   `sessionKey` su uno store agganciato a globalThis, che sopravvive alla
//   ri-evaluazione del modulo durante HMR: le chiamate concorrenti riusano
//   la stessa Promise → una sola creazione, un solo root request.
// - Errore 429/rate limit: NESSUN retry immediato. I tentativi sono ripetuti
//   solo dopo backoff esponenziale (default 30 s, 2 min, 10 min; 4 tentativi
//   totali). Durante l'attesa la scena resta sulla vista base (globo senza
//   mesh) e l'utente vede un avviso con il countdown.
// - Errori non 429: un solo tentativo, avviso a schermo (fallback esistente:
//   globo nudo navigabile + notice).
// - Un'istanza Cesium3DTileset può stare in una sola scena: al remount la
//   componente la rimuove dalla scena vecchia con
//   scene.primitives.destroyPrimitives = false (T-070: il tileset sta
//   DIRETTAMENTE in scene.primitives, senza holder annidato — il preload
//   «most detailed» di sampleHeightMostDetailed richiede un figlio diretto,
//   ADR-022) e lo segnala qui; se il tileset ERA attaccato a una scena il cui
//   contesto WebGL sta per essere distrutto, le risorse GPU non sono più
//   valide e la acquire successiva ne ricrea uno.
// - Contatore console delle creazioni per sessione (debug, richiesta umano).
//
// Nei test NON tocca la rete (punto 4 della richiesta): la funzione di
// creazione reale (`fromUrl`/`fromIonAssetId`) vive solo in
// `src/cesium/CesiumViewer.tsx`, che nessun test importa; nei test si
// iniettano fake `create` e uno store Map fresco. `import type` è cancellato
// in build: il modulo non dipende da Cesium a runtime.
import type { Cesium3DTileset } from 'cesium'

/**
 * Ritardi (ms) tra i tentativi dopo un 429: 30 s, 2 min, 10 min
 * (1 tentativo iniziale + 3 retry = 4 tentativi totali, come richiesto).
 */
export const DEFAULT_RATE_LIMIT_BACKOFF_MS: readonly number[] = [
  30_000,
  120_000,
  600_000,
]

/**
 * Riconosce un errore di quota dal provider tiles: Cesium segnala i fallimenti
 * HTTP con `RequestErrorEvent` (non-Error, con `statusCode`, Cesium.d.ts 1.146
 * L17591–L17613); altri errori portano "429"/"rate limit" nel messaggio.
 */
export function isRateLimitError(error: unknown): boolean {
  const pattern = /\b429\b|rate[\s-]?limit|too many requests/i
  if (error !== null && typeof error === 'object') {
    const candidate = error as { statusCode?: unknown; message?: unknown }
    if (candidate.statusCode === 429) {
      return true
    }
    if (typeof candidate.message === 'string') {
      return pattern.test(candidate.message)
    }
    return false
  }
  return pattern.test(String(error ?? ''))
}

/** Ritardo in forma leggibile per i notice: "30 s", "2 min", "10 min". */
function formatWaitMs(waitMs: number): string {
  if (waitMs < 60_000) {
    return `${Math.round(waitMs / 1000)} s`
  }
  return `${Math.round(waitMs / 60_000)} min`
}

interface SessionState {
  promise: Promise<Cesium3DTileset> | null
  tileset: Cesium3DTileset | null
  settled: 'pending' | 'ok' | 'failed'
  creations: number
  contextInvalid: boolean
  activeNotice: string | null
}

/** Store di sessione: una voce per `sessionKey`. */
export type TilesetSessionStore = Map<string, SessionState>

// Store di default su globalThis: sopravvive alla ri-evaluazione del modulo
// durante HMR (una cache a livello di modulo verrebbe azzerata a ogni hot
// update, vanificando il singleton di sessione).
const SESSION_STORE_KEY = '__lunarPhotoPlannerTilesetSessions'

function defaultSessionStore(): TilesetSessionStore {
  const host = globalThis as unknown as Record<string, unknown>
  const existing = host[SESSION_STORE_KEY]
  if (existing instanceof Map) {
    return existing as TilesetSessionStore
  }
  const store: TilesetSessionStore = new Map()
  host[SESSION_STORE_KEY] = store
  return store
}

export interface AcquireSessionTilesetOptions {
  /** Chiave di sessione: un tileset per chiave (qui: il provider attivo). */
  sessionKey: string
  /** Nome leggibile per notice e log. */
  label: string
  /** Funzione di creazione reale (iniettata: nei test è un fake). */
  create: () => Promise<Cesium3DTileset>
  /** Notice a schermo (null = nasconde il notice di sessione). */
  onNotice: (message: string | null) => void
  describeError: (error: unknown) => string
  /** Log console; default console.info. */
  log?: (message: string) => void
  backoffMs?: readonly number[]
  /** Store iniettabile nei test; default: store di sessione su globalThis. */
  store?: TilesetSessionStore
}

/**
 * Restituisce (creandolo una volta sola) il tileset della sessione per la
 * chiave data. Le chiamate concorrenti condividono la stessa Promise; dopo
 * un 429 i tentativi seguono il backoff esponenziale e, al fallimento finale,
 * la stessa Promise rifiutata viene restituita a ogni acquire successivo
 * della sessione (nessun altro traffico di rete).
 */
export function acquireSessionTileset(
  options: AcquireSessionTilesetOptions,
): Promise<Cesium3DTileset> {
  const store = options.store ?? defaultSessionStore()
  const log = options.log ?? ((message: string) => console.info(message))
  const existing = store.get(options.sessionKey)

  if (existing !== undefined) {
    if (existing.settled === 'ok' && existing.tileset !== null) {
      if (existing.contextInvalid) {
        // Riuso impossibile: le risorse GPU dell'istanza appartenevano al
        // contesto WebGL di una scena distrutta. L'istanza NON viene
        // distrutta qui (il suo contesto è già morto): si rilascia la
        // reference e si ricrea nella STESSA voce di sessione, così il
        // contatore delle creazioni resta cumulativo per la sessione.
        const state = existing
        state.tileset = null
        state.settled = 'pending'
        state.contextInvalid = false
        state.activeNotice = null
        const promise = createWithBackoff(options, state, log)
        state.promise = promise
        return promise
      } else {
        log(
          `[lunar-photo-planner] tileset "${options.sessionKey}": riuso dell'istanza di sessione (creazioni finora: ${existing.creations}).`,
        )
        return existing.promise as Promise<Cesium3DTileset>
      }
    } else if (existing.settled === 'failed') {
      // Backoff esaurito in fallimento: nessun altro tentativo in questa
      // sessione ("riprova al massimo dopo un backoff esponenziale"). Si
      // ri-mostra l'avviso e si restituisce lo stesso rifiuto.
      options.onNotice(existing.activeNotice)
      return existing.promise as Promise<Cesium3DTileset>
    } else {
      // Creazione in corso: le chiamate concorrenti riusano la stessa Promise.
      return existing.promise as Promise<Cesium3DTileset>
    }
  }

  const state: SessionState = {
    promise: null,
    tileset: null,
    settled: 'pending',
    creations: 0,
    contextInvalid: false,
    activeNotice: null,
  }
  const promise = createWithBackoff(options, state, log)
  state.promise = promise
  store.set(options.sessionKey, state)
  return promise
}

function createWithBackoff(
  options: AcquireSessionTilesetOptions,
  state: SessionState,
  log: (message: string) => void,
): Promise<Cesium3DTileset> {
  const backoff = options.backoffMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS
  return new Promise<Cesium3DTileset>((resolve, reject) => {
    const attempt = (attemptIndex: number): void => {
      state.creations += 1
      log(
        `[lunar-photo-planner] tileset "${options.sessionKey}": creazione #${state.creations} in questa sessione${attemptIndex > 0 ? ` (retry dopo 429, attesa ${formatWaitMs(backoff[attemptIndex - 1])})` : ''}.`,
      )
      let creation: Promise<Cesium3DTileset>
      try {
        creation = options.create()
      } catch (synchronousError) {
        handleFailure(synchronousError, attemptIndex)
        return
      }
      creation.then(
        (tileset) => {
          state.tileset = tileset
          state.settled = 'ok'
          if (state.activeNotice !== null) {
            // Il successo rende obsoleto l'ultimo avviso di sessione (es.
            // il countdown del backoff): lo si toglie a schermo.
            state.activeNotice = null
            options.onNotice(null)
          }
          resolve(tileset)
        },
        (error: unknown) => {
          handleFailure(error, attemptIndex)
        },
      )
    }
    const handleFailure = (error: unknown, attemptIndex: number): void => {
      if (isRateLimitError(error) && attemptIndex < backoff.length) {
        const waitMs = backoff[attemptIndex]
        const message = `Limite di richieste ${options.label} raggiunto (429). La scena resta sulla vista base senza mesh 3D; nuovo tentativo automatico tra ${formatWaitMs(waitMs)} (tentativo ${attemptIndex + 2} di ${backoff.length + 1}).`
        state.activeNotice = message
        options.onNotice(message)
        // Nessun retry immediato: attesa esponenziale a livello di sessione,
        // il timer sopravvive ai remount del componente.
        setTimeout(() => {
          attempt(attemptIndex + 1)
        }, waitMs)
        return
      }
      state.settled = 'failed'
      state.activeNotice = isRateLimitError(error)
        ? `Limite di richieste ${options.label} raggiunto (429). La scena resta sulla vista base senza mesh 3D; nessun altro tentativo in questa sessione: ricarica la pagina per riprovare.`
        : `Errore nel caricamento di ${options.label}: ${options.describeError(error)}.`
      options.onNotice(state.activeNotice)
      reject(error)
    }
    attempt(0)
  })
}

export interface MarkSessionTilesetDetachedOptions {
  sessionKey: string
  /** Istanza rimossa dalla scena del claimante (senza destroy). */
  tileset: unknown
  /** Store iniettabile nei test; default: store di sessione su globalThis. */
  store?: TilesetSessionStore
}

/**
 * Registrato dal claimante quando, in cleanup, rimuove il tileset condiviso
 * dalla sua scena: l'istanza NON viene distrutta (rimane in cache di
 * sessione), ma il contesto WebGL della scena sta per essere distrutto → la
 * acquire successiva ricreerà il tileset. Chiamato solo da chi l'aveva
 * davvero attaccato alla propria scena (se il tileset non corrisponde a
 * quello in cache lo stato non viene toccato).
 */
export function markSessionTilesetDetached(options: MarkSessionTilesetDetachedOptions): void {
  const store = options.store ?? defaultSessionStore()
  const state = store.get(options.sessionKey)
  if (state === undefined || state.tileset !== options.tileset) {
    return
  }
  state.contextInvalid = true
}