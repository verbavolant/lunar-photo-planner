/**
 * Chiavi API dell'utilizzatore (T-072): permettono a chi usa il sito di
 * inserire le PROPRIE credenziali (chiave Google Maps e/o token Cesium ion)
 * e di bypassare quelle cotte nel bundle dai secret di build (VITE_*). Le
 * chiavi restano nel localStorage del browser e vengono usate solo verso i
 * provider (tile.googleapis.com / api.cesium.com). Storage iniettabile per i
 * test, come in `src/planning/homeStorage.ts`.
 */
import type { SceneDataProvider } from './dataProvider'
import type { MinimalStorage } from '../planning/homeStorage'

/** Chiave localStorage della chiave Google Maps (provider 'google'). */
export const GOOGLE_API_KEY_STORAGE_KEY = 'lunar-photo-planner.google-maps-api-key'

/** Chiave localStorage del token Cesium ion (provider 'google-ion'). */
export const ION_TOKEN_STORAGE_KEY = 'lunar-photo-planner.cesium-ion-token'

/** Chiave localStorage della scelta di provider salvata nel pannello. */
export const PROVIDER_STORAGE_KEY = 'lunar-photo-planner.scene-provider'

/** Chiavi inserite dall'utilizzatore; stringa vuota = non impostata. */
export interface UserApiKeys {
  /** Chiave della Map Tiles API; usata dal provider 'google'. */
  googleMapsApiKey: string
  /** Token di ion.cesium.com; usato dal provider 'google-ion'. */
  cesiumIonToken: string
}

function readStoredValue(storage: MinimalStorage, key: string): string {
  try {
    return storage.getItem(key)?.trim() ?? ''
  } catch {
    return '' // storage non disponibile (es. navigazione privata)
  }
}

/** Legge le chiavi dell'utilizzatore; assenti o illeggibili → stringa vuota. */
export function loadUserApiKeys(storage: MinimalStorage): UserApiKeys {
  return {
    googleMapsApiKey: readStoredValue(storage, GOOGLE_API_KEY_STORAGE_KEY),
    cesiumIonToken: readStoredValue(storage, ION_TOKEN_STORAGE_KEY),
  }
}

/**
 * Salva le chiavi dell'utilizzatore, troncate qui. Può lanciare se lo storage
 * non è scrivibile: il chiamante decide come comportarsi.
 */
export function saveUserApiKeys(keys: UserApiKeys, storage: MinimalStorage): void {
  storage.setItem(GOOGLE_API_KEY_STORAGE_KEY, keys.googleMapsApiKey.trim())
  storage.setItem(ION_TOKEN_STORAGE_KEY, keys.cesiumIonToken.trim())
}

/** Torna alle chiavi di build: azzera entrambe le voci localStorage. */
export function clearUserApiKeys(storage: MinimalStorage): void {
  saveUserApiKeys({ googleMapsApiKey: '', cesiumIonToken: '' }, storage)
}

/**
 * Legge la scelta di provider salvata nel pannello. Solo i due valori ammessi
 * (l'alias 'cesium' NON è accettato qui: il pannello salva valori espliciti);
 * assente o estraneo (es. storage modificato a mano) → undefined.
 */
export function loadUserProvider(storage: MinimalStorage): SceneDataProvider | undefined {
  try {
    const raw = storage.getItem(PROVIDER_STORAGE_KEY)?.trim()
    if (raw === 'google' || raw === 'google-ion') {
      return raw
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Salva la scelta di provider ('' = torna al comportamento predefinito:
 * `?provider=` nell'URL, poi l'env di build). Può lanciare come saveUserApiKeys.
 */
export function saveUserProvider(
  provider: SceneDataProvider | '',
  storage: MinimalStorage,
): void {
  storage.setItem(PROVIDER_STORAGE_KEY, provider)
}

/**
 * Credenziale effettiva: quella dell'utilizzatore (se non vuota) ha priorità
 * su quella di build (VITE_*); undefined = nessuna delle due.
 */
export function resolveEffectiveCredential(
  envValue: string | undefined,
  userValue: string,
): string | undefined {
  const trimmed = userValue.trim()
  if (trimmed !== '') {
    return trimmed
  }
  return envValue
}

/**
 * Fingerprint FNV-1a a 32 bit (non crittografico; fonte: specifica FNV-1a,
 * vettori di test standard — "" → 0x811c9dc5, "a" → 0xe40c292c). Serve SOLO a
 * distinguere le credenziali nella chiave di sessione dei tileset senza
 * stamparle in chiaro in console: una collisione su 32 bit diventerebbe
 * rilevante solo con migliaia di chiavi diverse nella stessa sessione.
 */
export function credentialFingerprint(credential: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < credential.length; index += 1) {
    hash ^= credential.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Chiave di sessione del tileset (`acquireSessionTileset`): provider +
 * fingerprint della credenziale effettiva. Una credenziale diversa DEVE avere
 * un tileset nuovo (la chiave viaggia nella root request), una identica riusa
 * l'istanza di sessione come prima (T-040). Senza credenziale la chiave resta
 * il solo provider, com'era prima del T-072.
 */
export function resolveTilesetSessionKey(
  provider: SceneDataProvider,
  credential: string | undefined,
): string {
  const trimmed = credential?.trim() ?? ''
  if (trimmed === '') {
    return provider
  }
  return `${provider}:${credentialFingerprint(trimmed)}`
}
