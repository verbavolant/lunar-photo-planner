// Sorgente dati 3D della scena (Fase 5b, T-040).
// - 'google': Google Photorealistic 3D Tiles via Map Tiles API DIRETTA con la
//   chiave dell'utente (VITE_GOOGLE_MAPS_API_KEY). Ogni root request consuma
//   la quota Google per progetto ("3D Tiles root requests per minute" = 150,
//   fonte dell'errore 429 RATE_LIMIT_EXCEEDED del 2026-10-08): modalità
//   opt-in da tenere solo per confronto/debug.
// - 'google-ion': la stessa mesh Google servita da Cesium ion (asset pubblico
//   2275207, T-034) con chiave Google gestita da ion (verificato dal vivo
//   2026-10-08 sull'endpoint /v1/assets/2275207/endpoint: type 3DTILES,
//   options.url = root.json?key=…): le richieste passano SOLO da ion, la
//   quota del progetto Google dell'utente non è toccata e l'accesso diretto
//   può anche essere bloccato (T-032, area EEA). Richiede
//   VITE_CESIUM_ION_TOKEN (T-031).
// Alias accettato: 'cesium' (nome storico del provider ion), mappato su
// 'google-ion'.
export type SceneDataProvider = 'google' | 'google-ion'

export interface ResolvedSceneProvider {
  provider: SceneDataProvider
  /**
   * Avviso quando un valore configurato (env o query) era presente ma non
   * valido: la scelta ricade sul valore valido successivo e l'avviso va
   * mostrato all'utente, non ingoiato.
   */
  invalidWarning: string | null
}

const ADMITTED_PROVIDERS = 'google, google-ion (alias: cesium)'

function parseProvider(value: string | undefined): SceneDataProvider | null {
  if (value === undefined) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'google') {
    return 'google'
  }
  if (normalized === 'google-ion' || normalized === 'cesium') {
    return 'google-ion'
  }
  return null
}

function invalidWarningFor(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') {
    return null
  }
  return `Provider non valido: "${value}" (valori ammessi: ${ADMITTED_PROVIDERS}).`
}

/**
 * Risolve il provider della scena: la query `?provider=` ha priorità sull'env
 * (permette di cambiare sorgente sul sito già deployato senza rebuild), l'env
 * ha priorità sul default 'google'. Il default resta 'google' per non
 * cambiare il comportamento del sito deployato finché il secret CI
 * VITE_CESIUM_ION_TOKEN non è impostato (T-031): per eliminare il 429 in
 * produzione impostare `VITE_SCENE_PROVIDER=google-ion` + il secret. I valori
 * vuoti sono "non impostati"; quelli presenti ma non validi ricadono sul
 * valore valido successivo e producono un avviso.
 */
export function resolveSceneDataProvider(
  envValue: string | undefined,
  queryValue: string | undefined,
): ResolvedSceneProvider {
  const fromQuery = parseProvider(queryValue)
  if (fromQuery !== null) {
    return { provider: fromQuery, invalidWarning: invalidWarningFor(envValue) }
  }
  const fromEnv = parseProvider(envValue)
  if (fromEnv !== null) {
    return { provider: fromEnv, invalidWarning: invalidWarningFor(queryValue) }
  }
  const invalid = [envValue, queryValue].filter(
    (value) => value !== undefined && value.trim() !== '',
  )
  if (invalid.length === 0) {
    return { provider: 'google', invalidWarning: null }
  }
  return {
    provider: 'google',
    invalidWarning: `Provider non valido: ${invalid
      .map((value) => `"${value}"`)
      .join(', ')} (valori ammessi: ${ADMITTED_PROVIDERS}).`,
  }
}
