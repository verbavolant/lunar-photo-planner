/** I due punti gestiti dal planner nella scena 3D. */
export type PlannerPointId = 'observer' | 'target'

/** Etichette in italiano per l'interfaccia. */
export const PLANNER_POINT_LABELS: Record<PlannerPointId, string> = {
  observer: 'Osservatore',
  target: 'Target',
}

/**
 * Vista di demo (zona di Lonato del Garda): 45,5°N 10,22°E con scala ≈ 1 km = 1 cm.
 * Altezza derivata da: viewport verticale ~23,8 cm (900 px @ 96 dpi), FOV Cesium
 * 60° → h = 23,8 km / (2·tan 30°) ≈ 20,6 km. Stima dipendente dallo schermo:
 * è una vista di demo, non una misura.
 */
export const DEMO_VIEW = {
  longitudeDeg: 10.22,
  latitudeDeg: 45.5,
  altitudeM: 20_600,
} as const
