import { describe, expect, it } from 'vitest'
import { HOME_STORAGE_KEY, loadSavedHome, saveHome } from './homeStorage'

/** Storage in memoria (sostituto di localStorage nei test). */
function memoryStorage(initial: Record<string, string> = {}): {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
} {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

const VALID_HOME = {
  latitudeDeg: 45.5397,
  longitudeDeg: 10.2197,
  heightM: 158.5,
  groundHeightM: 157.5,
}

describe('homeStorage', () => {
  it('roundtrip: saveHome → loadSavedHome restituisce i valori salvati', () => {
    const storage = memoryStorage()
    saveHome(VALID_HOME, storage)
    expect(loadSavedHome(storage)).toEqual(VALID_HOME)
  })

  it('groundHeightM null è preservato', () => {
    const storage = memoryStorage()
    saveHome({ ...VALID_HOME, groundHeightM: null }, storage)
    expect(loadSavedHome(storage)).toEqual({ ...VALID_HOME, groundHeightM: null })
  })

  it('chiave assente → null', () => {
    expect(loadSavedHome(memoryStorage())).toBeNull()
  })

  it('JSON corrotto → null (l\'app riparte senza Home)', () => {
    expect(loadSavedHome(memoryStorage({ [HOME_STORAGE_KEY]: '{non-json' }))).toBeNull()
  })

  it('tipi sbagliati → null', () => {
    expect(loadSavedHome(memoryStorage({ [HOME_STORAGE_KEY]: '"testo"' }))).toBeNull()
    expect(loadSavedHome(memoryStorage({ [HOME_STORAGE_KEY]: '{}' }))).toBeNull()
    expect(
      loadSavedHome(
        memoryStorage({
          [HOME_STORAGE_KEY]: JSON.stringify({
            latitudeDeg: '45',
            longitudeDeg: 10,
            heightM: 158,
            groundHeightM: null,
          }),
        }),
      ),
    ).toBeNull()
    expect(
      loadSavedHome(
        memoryStorage({
          [HOME_STORAGE_KEY]: JSON.stringify({
            latitudeDeg: 45,
            longitudeDeg: 10,
            heightM: null,
            groundHeightM: null,
          }),
        }),
      ),
    ).toBeNull()
  })

  it('lat/lon fuori dai limiti WGS84 → null', () => {
    expect(
      loadSavedHome(
        memoryStorage({
          [HOME_STORAGE_KEY]: JSON.stringify({ ...VALID_HOME, latitudeDeg: 91 }),
        }),
      ),
    ).toBeNull()
    expect(
      loadSavedHome(
        memoryStorage({
          [HOME_STORAGE_KEY]: JSON.stringify({ ...VALID_HOME, longitudeDeg: 181 }),
        }),
      ),
    ).toBeNull()
  })

  it('getItem che lancia (storage bloccato) → null', () => {
    expect(
      loadSavedHome({
        getItem: () => {
          throw new Error('bloccato')
        },
        setItem: () => {},
      }),
    ).toBeNull()
  })
})
