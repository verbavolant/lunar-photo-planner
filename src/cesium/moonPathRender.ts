import { Cartesian3 } from 'cesium'
import { moonHorizonCrossingMs, type MoonSkyPath } from '../astronomy/moonPath'
import { moonTopocentric } from '../astronomy/moon'
import type { GeoPoint } from '../geodesy/geodesy'
import { moonPositionEcef } from './moonRender'

/**
 * Tratti ECEF dell'arco della traiettoria della Luna (T-075/T-076): i
 * campioni di `moonSkyPath` sopra l'orizzonte (altitudine topocentrica
 * airless > 0), spezzati in segmenti disgiunti ai cambiamenti di segno, con
 * i capi interni raffinati per bisezione (altitudine ≈ 0). Ogni punto è
 * proiettato sulla «sfera celeste» centrata sull'Observer con raggio =
 * `path.radiusM` (distanza topocentrica reale della Luna all'orario in uso)
 * con la stessa trasformazione ENU→ECEF della Luna in scena
 * (moonPositionEcef): il campione all'orario in uso coincide con la Luna
 * billboard, quindi l'arco passa per la Luna visualizzata qualunque sia
 * l'orario (non una geometria geocentrica).
 */
export function moonPathArcSegments(observer: GeoPoint, path: MoonSkyPath): Cartesian3[][] {
  const project = (azimuthDeg: number, altitudeDeg: number): Cartesian3 =>
    moonPositionEcef(observer, azimuthDeg, altitudeDeg, path.radiusM)

  const segments: Cartesian3[][] = []
  let current: Cartesian3[] | null = null

  /** Capo a orizzonte (crossing) in testa se il tratto si apre, in coda se si chiude. */
  const appendCrossing = (belowMs: number, aboveMs: number): void => {
    const crossingMs = moonHorizonCrossingMs(observer, belowMs, aboveMs)
    const moon = moonTopocentric(observer, new Date(crossingMs))
    if (current === null) {
      current = []
    }
    current.push(project(moon.azimuthDeg, moon.altitudeDeg))
  }

  for (let i = 0; i < path.samples.length; i += 1) {
    const sample = path.samples[i]
    if (sample.altitudeDeg > 0) {
      if (current === null) {
        current = []
        if (i > 0) {
          const previous = path.samples[i - 1]
          appendCrossing(previous.dateMs, sample.dateMs)
        }
      }
      current.push(project(sample.azimuthDeg, sample.altitudeDeg))
    } else if (current !== null) {
      // Chiusura: il capo è il crossing tra il campione sopra (precedente) e
      // questo sotto; appendCrossing aggiunge il punto e chiude il tratto.
      appendCrossing(sample.dateMs, path.samples[i - 1].dateMs)
      segments.push(current)
      current = null
    }
  }
  if (current !== null) {
    segments.push(current)
  }
  return segments
}
