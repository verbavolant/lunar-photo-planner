import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
  EllipsoidGeodesic,
} from '@cesium/core'

/** Un punto geodetico: lat/lon in gradi (nord/est positivi), quota ellipsoidica in metri. */
export interface GeoPoint {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  readonly heightM: number
}

/** Risultato del problema inverso di Vincenty (geodesia su WGS84). */
export interface GeodesicInverse {
  /** Distanza lungo la geodetica sulla superficie dell'ellissoide, in metri. */
  readonly distanceM: number
  /** Azimut iniziale in gradi, 0..360 (0 = nord, 90 = est). */
  readonly initialBearingDeg: number
  /** Azimut finale in gradi, 0..360 (direzione di arrivo della geodetica p1→p2). */
  readonly finalBearingDeg: number
}

// Vincenty inverse non converge per punti quasi antipodali: oltre ~19.936 km
// può ciclare (movable-type.co.uk/scripts/latlong-vincenty.html, test su dati
// GeographicLib, verificato 2026-10-06). Soglia con margine; per la scala del
// planner (linee da metri a decine di km) non è mai vicino al limite.
const MAX_TRUSTED_GEODESIC_M = 19_900_000
const MEAN_EARTH_RADIUS_M = 6_371_000

function toCartographic(point: GeoPoint): Cartographic {
  return Cartographic.fromDegrees(point.longitudeDeg, point.latitudeDeg, point.heightM)
}

function radiansToAzimuthDeg(radians: number): number {
  return ((radians * 180) / Math.PI + 360) % 360
}

// Stima sferica di cortesia (haversine): serve solo come guardia d'ingresso,
// mai come risultato; la distanza vera viene dal problema inverso di Vincenty.
function sphericalDistanceM(a: GeoPoint, b: GeoPoint): number {
  const phi1 = (a.latitudeDeg * Math.PI) / 180
  const phi2 = (b.latitudeDeg * Math.PI) / 180
  const deltaPhi = ((b.latitudeDeg - a.latitudeDeg) * Math.PI) / 180
  const deltaLambda = ((b.longitudeDeg - a.longitudeDeg) * Math.PI) / 180
  const halfChordSquared =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2
  return 2 * MEAN_EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(halfChordSquared)))
}

/**
 * Distanza geodetica e azimut iniziale/finale tra due punti sulla superficie
 * WGS84 (le quote non entrano nel calcolo della geodetica). Implementazione:
 * Vincenty inverse con convergenza 10^-12 (~0.006 mm), `EllipsoidGeodesic` di
 * @cesium/core — verifica numerica in geodesy.test.ts contro l'esempio
 * classico Flinders Peak → Buninyong (Vincenty 1975).
 * @throws RangeError per punti quasi antipodali (Vincenty non converge).
 */
export function inverseGeodesic(a: GeoPoint, b: GeoPoint): GeodesicInverse {
  if (sphericalDistanceM(a, b) > MAX_TRUSTED_GEODESIC_M) {
    throw new RangeError(
      'Punti quasi antipodali: Vincenty inverse non converge oltre ~19.900 km.',
    )
  }
  const geodesic = new EllipsoidGeodesic(toCartographic(a), toCartographic(b), Ellipsoid.WGS84)
  return {
    distanceM: geodesic.surfaceDistance,
    initialBearingDeg: radiansToAzimuthDeg(geodesic.startHeading),
    finalBearingDeg: radiansToAzimuthDeg(geodesic.endHeading),
  }
}

/** Differenza di quota Target − Observer, in metri (positiva = Target più alto). */
export function heightDifferenceM(target: GeoPoint, observer: GeoPoint): number {
  return target.heightM - observer.heightM
}

/** Distanza in linea d'aria (corda 3D) tra Observer e Target, in metri. */
export function straightDistanceM(observer: GeoPoint, target: GeoPoint): number {
  const observerPos = Cartesian3.fromDegrees(
    observer.longitudeDeg,
    observer.latitudeDeg,
    observer.heightM,
  )
  const targetPos = Cartesian3.fromDegrees(
    target.longitudeDeg,
    target.latitudeDeg,
    target.heightM,
  )
  return Cartesian3.distance(observerPos, targetPos)
}

/**
 * Angolo verticale (elevazione) della linea d'aria Observer→Target rispetto
 * all'orizzonte locale dell'Observer: 0 = orizzonte, +90 = zenit, negativo
 * sotto l'orizzonte. La verticale locale è la NORMALE all'ellissoide
 * (geodeticSurfaceNormalCartographic), non la radiale: le due direzioni
 * differiscono fino a ~0,19° a 45° di latitudine.
 * @throws Error se Observer e Target coincidono (direzione indefinita).
 */
export function verticalAngleDeg(observer: GeoPoint, target: GeoPoint): number {
  const observerPos = Cartesian3.fromDegrees(
    observer.longitudeDeg,
    observer.latitudeDeg,
    observer.heightM,
  )
  const targetPos = Cartesian3.fromDegrees(
    target.longitudeDeg,
    target.latitudeDeg,
    target.heightM,
  )
  const direction = Cartesian3.subtract(targetPos, observerPos, new Cartesian3())
  if (Cartesian3.magnitude(direction) === 0) {
    throw new Error('Observer e Target coincidono: angolo verticale indefinito.')
  }
  Cartesian3.normalize(direction, direction)
  const localUp = Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(
    toCartographic(observer),
    new Cartesian3(),
  )
  return (Math.asin(Cartesian3.dot(direction, localUp)) * 180) / Math.PI
}

/**
 * Azimut della linea d'aria (corda 3D) Observer→Target nel piano orizzontale
 * locale dell'Observer: 0 = nord, 90 = est, range [0, 360). È la direzione
 * orizzontale del RAGGIO visivo diretto (corda nello spazio), non l'azimut
 * iniziale della geodetica: su linee corte coincidono entro una frazione di
 * grado, poi divergono con la curvatura del percorso superficiale. La
 * verticale locale è la normale all'ellissoide, come in verticalAngleDeg.
 * Frame locale ENU: est = z_mondo × verticale, nord = verticale × est
 * (verificato numericamente in geodesy.test.ts).
 * @throws Error se Observer e Target coincidono (direzione indefinita).
 */
export function lineOfSightAzimuthDeg(observer: GeoPoint, target: GeoPoint): number {
  const observerPos = Cartesian3.fromDegrees(
    observer.longitudeDeg,
    observer.latitudeDeg,
    observer.heightM,
  )
  const targetPos = Cartesian3.fromDegrees(
    target.longitudeDeg,
    target.latitudeDeg,
    target.heightM,
  )
  const direction = Cartesian3.subtract(targetPos, observerPos, new Cartesian3())
  if (Cartesian3.magnitude(direction) === 0) {
    throw new Error('Observer e Target coincidono: azimut della linea di vista indefinito.')
  }
  Cartesian3.normalize(direction, direction)
  const localUp = Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(
    toCartographic(observer),
    new Cartesian3(),
  )
  const worldZ = new Cartesian3(0, 0, 1)
  const east = Cartesian3.cross(worldZ, localUp, new Cartesian3())
  if (Cartesian3.magnitude(east) === 0) {
    throw new Error('Observer ai poli: piano orizzontale indefinito.')
  }
  Cartesian3.normalize(east, east)
  const north = Cartesian3.cross(localUp, east, new Cartesian3())
  Cartesian3.normalize(north, north)
  return radiansToAzimuthDeg(
    Math.atan2(Cartesian3.dot(direction, east), Cartesian3.dot(direction, north)),
  )
}
