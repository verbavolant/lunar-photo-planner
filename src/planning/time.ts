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

/** Tempo effettivo = base dell'input + scostamento dello slider, in ms. */
export function effectiveTimeMs(baseMs: number, offsetMinutes: number): number {
  return baseMs + offsetMinutes * 60_000
}
