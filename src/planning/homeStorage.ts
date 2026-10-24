/**
 * Home dell'Osservatore salvata nel browser (T-051): l'umano può fissare la
 * posizione corrente dell'Osservatore come «Home» e ritrovarla al prossimo
 * avvio (e con «Vai a Home»). Lo storage è iniettabile per i test: i moduli
 * puri non toccano `window` direttamente.
 */
export interface SavedHome {
  /** Latitudine WGS84 in gradi decimali. */
  latitudeDeg: number
  /** Longitudine WGS84 in gradi decimali. */
  longitudeDeg: number
  /** Quota ellissoide dell'Observer al salvataggio, in metri. */
  heightM: number
  /** Quota del suolo misurata al pick (ADR-012); null se non nota. */
  groundHeightM: number | null
}

/** Chiave localStorage: un'unica Home per browser. */
export const HOME_STORAGE_KEY = 'lunar-photo-planner.observer-home'

/** Minimo interfaccia di Storage usata qui (per test e iniezione). */
export interface MinimalStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Legge la Home salvata; null se assente, corrotta o fuori dai limiti WGS84.
 * Un dato non valido non deve mai impedire l'avvio: si riparte senza Home.
 */
export function loadSavedHome(storage: MinimalStorage): SavedHome | null {
  let raw: string | null
  try {
    raw = storage.getItem(HOME_STORAGE_KEY)
  } catch {
    return null // storage non disponibile (es. navigazione privata)
  }
  if (raw === null) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const candidate = parsed as Record<string, unknown>
    if (!isFiniteNumber(candidate.latitudeDeg) || Math.abs(candidate.latitudeDeg) > 90) {
      return null
    }
    if (!isFiniteNumber(candidate.longitudeDeg) || Math.abs(candidate.longitudeDeg) > 180) {
      return null
    }
    if (!isFiniteNumber(candidate.heightM)) {
      return null
    }
    if (candidate.groundHeightM !== null && !isFiniteNumber(candidate.groundHeightM)) {
      return null
    }
    return {
      latitudeDeg: candidate.latitudeDeg,
      longitudeDeg: candidate.longitudeDeg,
      heightM: candidate.heightM,
      groundHeightM: candidate.groundHeightM,
    }
  } catch {
    return null // JSON corrotto: nessuna Home, l'app riparte pulita
  }
}

/**
 * Salva la Home. Può lanciare se lo storage non è scrivibile (es. navigazione
 * privata): il chiamante decide come comportarsi.
 */
export function saveHome(home: SavedHome, storage: MinimalStorage): void {
  storage.setItem(HOME_STORAGE_KEY, JSON.stringify(home))
}
