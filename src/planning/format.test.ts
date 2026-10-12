import { describe, expect, it } from 'vitest'
import {
  formatAngleDeg,
  formatDistanceM,
  formatHeightDifferenceM,
  formatPercent,
} from './format'

describe('formatDistanceM', () => {
  it('usa i metri sotto 1 km e i km oltre, separatore italiano', () => {
    expect(formatDistanceM(950)).toBe('950 m')
    expect(formatDistanceM(1000)).toBe('1 km')
    expect(formatDistanceM(54_972.271)).toBe('54,97 km')
    expect(formatDistanceM(1_234_567.8)).toBe('1.234,57 km')
  })
})

describe('formatAngleDeg', () => {
  it('gradi decimali con 2 decimali e virgola', () => {
    expect(formatAngleDeg(306.86816)).toBe('306,87°')
    expect(formatAngleDeg(-0.2473)).toBe('-0,25°')
    expect(formatAngleDeg(0)).toBe('0°')
  })
})

describe('formatHeightDifferenceM', () => {
  it('sempre con segno esplicito', () => {
    expect(formatHeightDifferenceM(500)).toBe('+500 m')
    expect(formatHeightDifferenceM(-12.34)).toBe('-12,3 m')
    expect(formatHeightDifferenceM(0)).toBe('+0 m')
  })
})

describe('formatPercent', () => {
  it('frazione × 100 con stile it-IT, default 0 decimali', () => {
    expect(formatPercent(0.62)).toBe('62%')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })

  it('decimali opzionali e arrotondamento all’intero', () => {
    expect(formatPercent(0.624, 1)).toBe('62,4%')
    expect(formatPercent(0.9979)).toBe('100%')
  })
})
