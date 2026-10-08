import { Cartesian3, Matrix4, Transforms } from 'cesium'
import type { GeoPoint } from '../geodesy/geodesy'

/**
 * Posizione ECEF della Luna a distanza reale nella direzione azimut/altitudine
 * topocentriche dell'Observer. La direzione arriva dal modulo astronomy
 * testato (moonTopocentric); la rappresentazione grafica è un disco
 * equivalente: direzione e dimensione angolare percepita sono quelle reali.
 */
export function moonPositionEcef(
  observer: GeoPoint,
  azimuthDeg: number,
  altitudeDeg: number,
  distanceM: number,
): Cartesian3 {
  const observerPos = Cartesian3.fromDegrees(
    observer.longitudeDeg,
    observer.latitudeDeg,
    observer.heightM,
  )
  const eastNorthUp = Transforms.eastNorthUpToFixedFrame(observerPos)
  const azimuthRad = (azimuthDeg * Math.PI) / 180
  const altitudeRad = (altitudeDeg * Math.PI) / 180
  const directionEcef = Matrix4.multiplyByPointAsVector(
    eastNorthUp,
    new Cartesian3(
      Math.sin(azimuthRad) * Math.cos(altitudeRad),
      Math.cos(azimuthRad) * Math.cos(altitudeRad),
      Math.sin(altitudeRad),
    ),
    new Cartesian3(),
  )
  return Cartesian3.add(
    observerPos,
    Cartesian3.multiplyByScalar(directionEcef, distanceM, new Cartesian3()),
    new Cartesian3(),
  )
}

/**
 * Diametro geometrico (metri) che produce il diametro angolare reale (gradi)
 * alla distanza reale: d = 2·D·tan(θ/2). Con `sizeInMeters` del billboard,
 * Cesium proietta la dimensione angolare corretta da qualunque camera.
 */
export function moonDiameterM(distanceM: number, angularDiameterDeg: number): number {
  const angularRad = (angularDiameterDeg * Math.PI) / 180
  return 2 * distanceM * Math.tan(angularRad / 2)
}

/**
 * Texture procedurale della Luna (disco grigio con gradiente): equivalente
 * grafico dichiarato — la direzione e la dimensione angolare percepita
 * derivano dai dati reali, non dalla texture.
 */
export function createMoonTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('Canvas 2D non disponibile: impossibile creare la texture della Luna.')
  }
  const gradient = context.createRadialGradient(128, 128, 40, 128, 128, 127)
  gradient.addColorStop(0, '#ececec')
  gradient.addColorStop(0.85, '#cfcfcf')
  gradient.addColorStop(1, '#b0b0b0')
  context.fillStyle = gradient
  context.beginPath()
  context.arc(128, 128, 127, 0, 2 * Math.PI)
  context.fill()
  return canvas
}
