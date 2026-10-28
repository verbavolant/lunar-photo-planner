import { describe, expect, it } from 'vitest'
import type { MinimalStorage } from '../planning/homeStorage'
import {
  GOOGLE_API_KEY_STORAGE_KEY,
  ION_TOKEN_STORAGE_KEY,
  PROVIDER_STORAGE_KEY,
  clearUserApiKeys,
  credentialFingerprint,
  loadUserApiKeys,
  loadUserProvider,
  resolveEffectiveCredential,
  resolveTilesetSessionKey,
  saveUserApiKeys,
  saveUserProvider,
} from './userKeys'

/** Storage in memoria (sostituto di localStorage nei test). */
function memoryStorage(initial: Record<string, string> = {}): MinimalStorage {
  const entries = new Map(Object.entries(initial))
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
  }
}

describe('loadUserApiKeys / saveUserApiKeys / clearUserApiKeys', () => {
  it('assenti → entrambe vuote', () => {
    expect(loadUserApiKeys(memoryStorage())).toEqual({ googleMapsApiKey: '', cesiumIonToken: '' })
  })

  it('presenti → valori trimmati', () => {
    const storage = memoryStorage({
      [GOOGLE_API_KEY_STORAGE_KEY]: '  chiave-google  ',
      [ION_TOKEN_STORAGE_KEY]: 'token-ion',
    })
    expect(loadUserApiKeys(storage)).toEqual({
      googleMapsApiKey: 'chiave-google',
      cesiumIonToken: 'token-ion',
    })
  })

  it('storage che lancia → chiavi vuote (mai bloccare l\u2019avvio)', () => {
    const storage: MinimalStorage = {
      getItem: () => {
        throw new Error('storage non disponibile')
      },
      setItem: () => undefined,
    }
    expect(loadUserApiKeys(storage)).toEqual({ googleMapsApiKey: '', cesiumIonToken: '' })
  })

  it('save trimma e sovrascrive; chiave non impostata salvata come stringa vuota', () => {
    const storage = memoryStorage({ [GOOGLE_API_KEY_STORAGE_KEY]: 'vecchia' })
    saveUserApiKeys({ googleMapsApiKey: '  nuova  ', cesiumIonToken: '' }, storage)
    expect(storage.getItem(GOOGLE_API_KEY_STORAGE_KEY)).toBe('nuova')
    expect(storage.getItem(ION_TOKEN_STORAGE_KEY)).toBe('')
    expect(loadUserApiKeys(storage)).toEqual({ googleMapsApiKey: 'nuova', cesiumIonToken: '' })
  })

  it('clear riporta entrambe a vuoto (chiavi di build di nuovo in uso)', () => {
    const storage = memoryStorage({
      [GOOGLE_API_KEY_STORAGE_KEY]: 'chiave',
      [ION_TOKEN_STORAGE_KEY]: 'token',
    })
    clearUserApiKeys(storage)
    expect(loadUserApiKeys(storage)).toEqual({ googleMapsApiKey: '', cesiumIonToken: '' })
  })
})

describe('loadUserProvider / saveUserProvider', () => {
  it('assente o vuoto → undefined (si usa il comportamento predefinito)', () => {
    expect(loadUserProvider(memoryStorage())).toBeUndefined()
    expect(loadUserProvider(memoryStorage({ [PROVIDER_STORAGE_KEY]: '' }))).toBeUndefined()
  })

  it('valori ammessi (trimmati) → il provider salvato', () => {
    expect(loadUserProvider(memoryStorage({ [PROVIDER_STORAGE_KEY]: 'google' }))).toBe('google')
    expect(loadUserProvider(memoryStorage({ [PROVIDER_STORAGE_KEY]: ' google-ion ' }))).toBe(
      'google-ion',
    )
  })

  it('alias cesium o valore estraneo → undefined (il pannello salva solo valori espliciti)', () => {
    expect(loadUserProvider(memoryStorage({ [PROVIDER_STORAGE_KEY]: 'cesium' }))).toBeUndefined()
    expect(
      loadUserProvider(memoryStorage({ [PROVIDER_STORAGE_KEY]: 'tile-openstreetmap' })),
    ).toBeUndefined()
  })

  it('saveUserProvider salva il valore scelto, anche "" per tornare al predefinito', () => {
    const storage = memoryStorage()
    saveUserProvider('google-ion', storage)
    expect(storage.getItem(PROVIDER_STORAGE_KEY)).toBe('google-ion')
    saveUserProvider('', storage)
    expect(storage.getItem(PROVIDER_STORAGE_KEY)).toBe('')
    expect(loadUserProvider(storage)).toBeUndefined()
  })
})

describe('resolveEffectiveCredential', () => {
  it('la chiave dell\u2019utilizzatore (trimmata) vince su quella di build', () => {
    expect(resolveEffectiveCredential('chiave-build', '  chiave-utente ')).toBe('chiave-utente')
  })

  it('utilizzatore vuoto → si usa la chiave di build (anche assente: undefined)', () => {
    expect(resolveEffectiveCredential('chiave-build', '')).toBe('chiave-build')
    expect(resolveEffectiveCredential(undefined, '   ')).toBeUndefined()
  })
})

describe('credentialFingerprint (FNV-1a 32 bit)', () => {
  it('vettori di riferimento della specifica FNV-1a: "" → 811c9dc5, "a" → e40c292c', () => {
    expect(credentialFingerprint('')).toBe('811c9dc5')
    expect(credentialFingerprint('a')).toBe('e40c292c')
  })

  it('deterministica e diversa per credenziali diverse', () => {
    expect(credentialFingerprint('chiave-1')).toBe(credentialFingerprint('chiave-1'))
    expect(credentialFingerprint('chiave-1')).not.toBe(credentialFingerprint('chiave-2'))
  })
})

describe('resolveTilesetSessionKey', () => {
  it('senza credenziale → il solo provider (comportamento T-040 invariato)', () => {
    expect(resolveTilesetSessionKey('google', undefined)).toBe('google')
    expect(resolveTilesetSessionKey('google-ion', '   ')).toBe('google-ion')
  })

  it('con credenziale → provider:fingerprint; credenziali diverse → sessioni diverse', () => {
    const first = resolveTilesetSessionKey('google', 'chiave-1')
    expect(first).toBe(`google:${credentialFingerprint('chiave-1')}`)
    expect(resolveTilesetSessionKey('google', 'chiave-2')).not.toBe(first)
    // Stessa credenziale, provider diverso → sessioni diverse.
    expect(resolveTilesetSessionKey('google-ion', 'chiave-1')).not.toBe(first)
  })
})
