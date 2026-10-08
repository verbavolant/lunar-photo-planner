import { describe, expect, it } from 'vitest'
import {
  browserTimeZone,
  dateToLocalInputValue,
  effectiveTimeMs,
  formatLocalDateTime,
  localInputValueToMs,
  localUtcOffsetLabel,
  zoneOffsetMinutes,
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

describe('formatLocalDateTime', () => {
  it('formato "g/m/aaaa hh:mm" locale, deterministico (nessun Intl)', () => {
    expect(formatLocalDateTime(new Date(2026, 0, 21, 13, 5))).toBe('21/1/2026 13:05')
    expect(formatLocalDateTime(new Date(2026, 0, 21, 9, 5))).toBe('21/1/2026 09:05')
  })
})

describe('ora legale e solare (offset per zona, deterministico)', () => {
  const ROME = 'Europe/Rome'
  it('inverno = UTC+1 (CET), estate = UTC+2 (CEST)', () => {
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 21, 12, 0, 0), ROME)).toBe(60)
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 21, 12, 0, 0), ROME)).toBe(120)
  })
  it('attraversa il passaggio all\u2019ora legale (29/3/2026: 02:00 CET → 03:00 CEST)', () => {
    // 00:30 UTC = 01:30 CET (inverno); 01:30 UTC = 03:30 CEST (estate).
    expect(zoneOffsetMinutes(Date.UTC(2026, 2, 29, 0, 30, 0), ROME)).toBe(60)
    expect(zoneOffsetMinutes(Date.UTC(2026, 2, 29, 1, 30, 0), ROME)).toBe(120)
  })
  it('ritorno all\u2019ora solare (25/10/2026: 03:00 CEST → 02:00 CET)', () => {
    // 00:30 UTC = 02:30 CEST (estate); 01:30 UTC = 02:30 CET (inverno).
    expect(zoneOffsetMinutes(Date.UTC(2026, 9, 25, 0, 30, 0), ROME)).toBe(120)
    expect(zoneOffsetMinutes(Date.UTC(2026, 9, 25, 1, 30, 0), ROME)).toBe(60)
  })
  it('l\u2019istante interno non cambia: la parete d\u2019orologio salta, non il tempo fisico', () => {
    // Slider/effective sommano minuti reali: +120 min sull\u2019istante
    // precedente finisce in CEST (+120), non resta "ore solari fisse".
    const before = Date.UTC(2026, 2, 29, 0, 30, 0)
    expect(zoneOffsetMinutes(before + 2 * 3_600_000, ROME)).toBe(120)
  })
})

describe('localUtcOffsetLabel', () => {
  it('formato "UTC±hh:mm" coerente con getTimezoneOffset della macchina', () => {
    const date = new Date(Date.UTC(2026, 6, 21, 12, 0, 0))
    expect(localUtcOffsetLabel(date)).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
    const totalMinutes = -date.getTimezoneOffset()
    const sign = totalMinutes < 0 ? '-' : '+'
    const absolute = Math.abs(totalMinutes)
    const pad = (value: number): string => String(value).padStart(2, '0')
    expect(localUtcOffsetLabel(date)).toBe(
      `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`,
    )
  })
})
