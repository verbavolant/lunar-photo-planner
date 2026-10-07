// Formattazioni numeriche con convenzione italiana (virgola decimale, punto
// delle migliaia). Funzioni pure, testate in format.test.ts. Usano un
// formattatore manuale invece di Intl.toLocaleString: il raggruppamento delle
// migliaia di Intl non era garantito nel runtime di test/CI (verificato:
// '1234,57' invece di '1.234,57'), il manuale è deterministico ovunque.

/** Numero con separatore migliaia '.' e virgola decimale (stile it-IT). */
function formatItalianNumber(value: number, fractionDigits: number): string {
  const fixed = value.toFixed(fractionDigits)
  const separatorIndex = fixed.indexOf('.')
  const integerPart = separatorIndex === -1 ? fixed : fixed.slice(0, separatorIndex)
  // Scarta gli zeri finali come farebbe Intl con maximumFractionDigits.
  const fractionPart =
    separatorIndex === -1 ? '' : fixed.slice(separatorIndex + 1).replace(/0+$/, '')
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return fractionPart === '' ? grouped : `${grouped},${fractionPart}`
}

/** Distanza: metri sotto 1 km, chilometri oltre, con 2 decimali. */
export function formatDistanceM(meters: number): string {
  if (meters < 1000) {
    return `${meters.toFixed(0)} m`
  }
  return `${formatItalianNumber(meters / 1000, 2)} km`
}

/** Angolo in gradi decimali con 2 decimali. */
export function formatAngleDeg(degrees: number): string {
  return `${formatItalianNumber(degrees, 2)}°`
}

/** Differenza quota firmata in metri, sempre con segno (+/−). */
export function formatHeightDifferenceM(meters: number): string {
  const sign = meters < 0 ? '-' : '+'
  return `${sign}${formatItalianNumber(Math.abs(meters), 1)} m`
}

