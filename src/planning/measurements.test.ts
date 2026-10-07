import { describe, expect, it } from 'vitest'
import { buildMeasurements } from './measurements'
import type { GeoPoint } from '../geodesy/geodesy'

// Stessi punti di riferimento di geodesy.test.ts (esempio Vincenty 1975)
const FLINDERS: GeoPoint = {
  latitudeDeg: -(37 + 57 / 60 + 3.7203 / 3600),
  longitudeDeg: 144 + 25 / 60 + 29.5244 / 3600,
  heightM: 0,
}
const BUNINYONG: GeoPoint = {
  latitudeDeg: -(37 + 39 / 60 + 10.1561 / 3600),
  longitudeDeg: 143 + 55 / 60 + 35.3839 / 3600,
  heightM: 0,
}

function valueByLabel(rows: ReturnType<typeof buildMeasurements>, label: string): string {
  const byLabel = new Map<string, string>(rows.map((row) => [row.label, row.value] as const))
  const value = byLabel.get(label)
  if (value === undefined) {
    throw new Error(`riga mancante: ${label}`)
  }
  return value
}

describe('buildMeasurements', () => {
  it('Flinders→Buninyong: valori coerenti con il riferimento Vincenty', () => {
    const rows = buildMeasurements(FLINDERS, BUNINYONG)
    expect(valueByLabel(rows, 'Distanza superficie')).toBe('54,97 km')
    expect(valueByLabel(rows, 'Azimut iniziale')).toBe('306,87°')
    expect(valueByLabel(rows, 'Azimut finale')).toBe('307,17°')
    expect(valueByLabel(rows, 'Differenza quota')).toBe('+0 m')
    expect(valueByLabel(rows, 'Angolo verticale')).toBe('-0,25°')
  })

  it('punti coincidenti: distanza zero e angolo verticale non disponibile', () => {
    const rows = buildMeasurements(FLINDERS, FLINDERS)
    expect(valueByLabel(rows, 'Distanza superficie')).toBe('0 m')
    expect(valueByLabel(rows, 'Angolo verticale')).toBe('—')
  })

  it('target in verticale sopra l\u2019Observer: +90° e distanze coerenti', () => {
    const observer: GeoPoint = { latitudeDeg: 45, longitudeDeg: 9, heightM: 0 }
    const target: GeoPoint = { latitudeDeg: 45, longitudeDeg: 9, heightM: 300 }
    const rows = buildMeasurements(observer, target)
    expect(valueByLabel(rows, 'Angolo verticale')).toBe('90°')
    expect(valueByLabel(rows, "Distanza linea d'aria")).toBe('300 m')
    expect(valueByLabel(rows, 'Differenza quota')).toBe('+300 m')
  })
})
