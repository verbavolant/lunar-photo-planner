/** Fuso orario del browser, per mostrarlo in UI accanto all'input data/ora. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Data → valore per input datetime-local, in ora locale (nessun Intl). */
export function dateToLocalInputValue(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Valore datetime-local (ora locale) → timestamp in ms. */
export function localInputValueToMs(value: string): number {
  return new Date(value).getTime()
}

/**
 * Offset della zona (es. 'Europe/Rome') all'istante dato, in minuti
 * (positivo a est di UTC). Deterministico: non dipende dal fuso della
 * macchina, quindi serve a testare l'ora legale anche su ambienti in UTC.
 */
export function zoneOffsetMinutes(instantMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = formatter.formatToParts(new Date(instantMs))
  const value = (type: string): number => {
    const part = parts.find((candidate) => candidate.type === type)
    if (part === undefined) {
      throw new Error(`Parte '${type}' mancante dalla formattazione`)
    }
    return Number(part.value)
  }
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  )
  return Math.round((asUtc - instantMs) / 60_000)
}

/** Etichetta dell'offset UTC del fuso locale all'istante dato, es. "UTC+02:00". */
export function localUtcOffsetLabel(date: Date): string {
  const totalMinutes = -date.getTimezoneOffset()
  const sign = totalMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(totalMinutes)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
}

/** Tempo effettivo = base dell'input + scostamento dello slider, in ms. */
export function effectiveTimeMs(baseMs: number, offsetMinutes: number): number {
  return baseMs + offsetMinutes * 60_000
}

/** Data → stringa locale compatta "21/1/2026 13:05" (nessun Intl, deterministica). */
export function formatLocalDateTime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
