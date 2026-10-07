import { describe, expect, it } from 'vitest'
import {
  browserTimeZone,
  dateToLocalInputValue,
  effectiveTimeMs,
  localInputValueToMs,
} from './time'

describe('roundtrip datetime-local', () => {
  it('formatta e rilegge la stessa istante (in qualunque fuso)', () => {
    const instant = new Date('2026-10-06T16:30:00Z')
    const localValue = dateToLocalInputValue(instant)
    expect(localValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(localInputValueToMs(localValue)).toBe(instant.getTime())
  })
})

describe('effectiveTimeMs', () => {
  it('somma lo scostamento in minuti', () => {
    expect(effectiveTimeMs(1_000_000, 0)).toBe(1_000_000)
    expect(effectiveTimeMs(1_000_000, 5)).toBe(1_000_000 + 5 * 60_000)
    expect(effectiveTimeMs(1_000_000, -720)).toBe(1_000_000 - 720 * 60_000)
  })
})

describe('browserTimeZone', () => {
  it('restituisce un identificatore non vuoto', () => {
    expect(browserTimeZone().length).toBeGreaterThan(0)
  })
})
