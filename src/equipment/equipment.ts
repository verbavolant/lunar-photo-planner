/** Sensore di fotocamera: dimensioni fisiche (mm) e risoluzione (px). */
export interface CameraSpec {
  readonly sensorWidthMm: number
  readonly sensorHeightMm: number
  readonly resolutionX: number
  readonly resolutionY: number
}

/** Obiettivo: lunghezza focale in mm. */
export interface LensSpec {
  readonly focalLengthMm: number
}

/** Campo visivo (angle of view) in gradi, orizzontale/verticale/diagonale. */
export interface FieldOfViewDeg {
  readonly horizontalDeg: number
  readonly verticalDeg: number
  readonly diagonalDeg: number
}

/**
 * FOV = 2·arctan(d/(2f)) con d = dimensione del sensore sul piano di
 * rivelazione e f = focale. Formula standard dell'ottica fotografica
 * ("angle of view", tabella classica: full-frame 36×24 mm a 50 mm →
 * 39,6° orizzontale, 27,0° verticale, 46,8° diagonale).
 */
export function fieldOfViewDeg(
  sensorWidthMm: number,
  sensorHeightMm: number,
  focalLengthMm: number,
): FieldOfViewDeg {
  if (!(sensorWidthMm > 0) || !(sensorHeightMm > 0) || !(focalLengthMm > 0)) {
    throw new Error('Dimensioni del sensore e focale devono essere positive')
  }
  const angleDeg = (sizeMm: number): number =>
    (2 * Math.atan(sizeMm / (2 * focalLengthMm)) * 180) / Math.PI
  return {
    horizontalDeg: angleDeg(sensorWidthMm),
    verticalDeg: angleDeg(sensorHeightMm),
    diagonalDeg: angleDeg(Math.hypot(sensorWidthMm, sensorHeightMm)),
  }
}