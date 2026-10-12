import type { Viewer } from 'cesium'

/**
 * POV della camera in termini numerici (T-035): posizione (lat/lon in gradi
 * decimali, quota ellissoide in metri) e orientamento (azimut 0 = nord orario,
 * inclinazione positiva sopra l'orizzonte). È la vista corrente della scena:
 * con "Vista Luna" coincide col POV dell'Observer (camera a +1 m, T-028).
 */
export interface CameraPov {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly heightM: number
  readonly headingDeg: number
  readonly pitchDeg: number
}

/**
 * Legge il POV corrente della camera del Viewer (`positionCartographic`,
 * `heading`, `pitch` — API verificata su Cesium.d.ts 1.146). Conversione
 * radianti → gradi; l'azimut è riportato in [0, 360).
 */
export function readCameraPov(viewer: Viewer): CameraPov {
  const cartographic = viewer.camera.positionCartographic
  return {
    latitudeDeg: (cartographic.latitude * 180) / Math.PI,
    longitudeDeg: (cartographic.longitude * 180) / Math.PI,
    heightM: cartographic.height,
    headingDeg: ((viewer.camera.heading * 180) / Math.PI + 360) % 360,
    pitchDeg: (viewer.camera.pitch * 180) / Math.PI,
  }
}
