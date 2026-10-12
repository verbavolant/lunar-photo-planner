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
