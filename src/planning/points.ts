import type { GeoPoint } from '../geodesy/geodesy'

/** I due punti gestiti dal planner nella scena 3D. */
export type PlannerPointId = 'observer' | 'target'

/** Etichette in italiano per l'interfaccia. */
export const PLANNER_POINT_LABELS: Record<PlannerPointId, string> = {
  observer: 'Osservatore',
  target: 'Target',
}

/**
 * Vista "Home" (bottone "Vai a Home"): Piazza della Loggia, centro storico di
 * Brescia. Coordinate 45°32′23″N 10°13′11″E (it.wikipedia, voce "Piazza della
 * Loggia") → 45,5397°N 10,2197°E; quota del suolo ≈ 156 m s.l.m. (Copernicus
 * DEM via api.open-meteo.com, consultato 2026-10-07), trattata come quota
 * ellissoidea: lo scarto verticale geoide-ellissoide (decine di metri in
 * Lombardia) non è corretto — stima dichiarata, vista di navigazione, non una
 * misura. Camera ≈ 500 m sopra il suolo della piazza.
 */
export const HOME_VIEW = {
  longitudeDeg: 10.2197,
  latitudeDeg: 45.5397,
  altitudeM: 656, // 156 m (suolo) + 500 m di altezza camera
} as const

// Limite di sanità per l'altezza dal suolo dell'Observer (T-035): nessun valore
// scientifico, evita solo input assurdi (quote a migliaia di km).
export const MAX_OBSERVER_HEIGHT_ABOVE_GROUND_M = 20_000

/** Altezza dell'Observer sopra il suolo (m): quota corrente − quota di pick. */
export function observerHeightAboveGroundM(observer: GeoPoint, groundHeightM: number): number {
  return observer.heightM - groundHeightM
}

/**
 * Observer alla stessa lat/lon con l'altezza dal suolo richiesta (T-035): la
 * quota ellissoide diventa `groundHeightM + altezza dal suolo`, limitata a
 * [0, MAX_OBSERVER_HEIGHT_ABOVE_GROUND_M]. Il riferimento del suolo è la quota
 * misurata al pick, NON ricampionata: le mesh dei 3D tiles non espongono una
 * quota di terreno campionabile in modo sincrono (ADR-012).
 */
export function observerAtHeightAboveGround(
  observer: GeoPoint,
  groundHeightM: number,
  heightAboveGroundM: number,
): GeoPoint {
  const heightM =
    groundHeightM +
    Math.min(Math.max(0, heightAboveGroundM), MAX_OBSERVER_HEIGHT_ABOVE_GROUND_M)
  return { ...observer, heightM }
}

