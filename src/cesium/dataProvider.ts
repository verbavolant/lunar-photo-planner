// Sorgente dati 3D della scena (Fase 5b).
// - 'google': Google Photorealistic 3D Tiles via Map Tiles API (originale).
// - 'cesium': contenuti di Cesium ion (Cesium World Terrain + imagery Bing
//   Aerial + Cesium OSM Buildings), fallback se l'accesso Google al 3D è
//   limitato.
export type SceneDataProvider = 'google' | 'cesium'

export interface ResolvedSceneProvider {
  provider: SceneDataProvider
  /**
   * Avviso quando un valore configurato (env o query) era presente ma non
   * valido: la scelta ricade sul valore valido successivo e l'avviso va
   * mostrato all'utente, non ingoiato.
   */
  invalidWarning: string | null
}

const ADMITTED_PROVIDERS = 'google, cesium'

function parseProvider(value: string | undefined): SceneDataProvider | null {
  if (value === undefined) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  return normalized === 'google' || normalized === 'cesium' ? normalized : null
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
 * ha priorità sul default 'google'. I valori vuoti sono "non impostati";
 * quelli presenti ma non validi ricadono sul valore valido successivo e
 * producono un avviso.
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
