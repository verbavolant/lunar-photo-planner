/** I due punti gestiti dal planner nella scena 3D. */
export type PlannerPointId = 'observer' | 'target'

/** Etichette in italiano per l'interfaccia. */
export const PLANNER_POINT_LABELS: Record<PlannerPointId, string> = {
  observer: 'Osservatore',
  target: 'Target',
}
