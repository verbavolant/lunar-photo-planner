import { describe, expect, it } from 'vitest'
import manualeMarkdown from '../../MANUALE.md?raw'
import { manualeDocumentHtml } from './manuale'

describe('manualeDocumentHtml', () => {
  it('costruisce un documento HTML completo con titolo dal primo heading h1', () => {
    const html = manualeDocumentHtml('# Manuale utente — Lunar Photo Planner\n\nTesto.')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<html lang="it">')
    expect(html).toContain('<title>Manuale utente — Lunar Photo Planner</title>')
    // Slug misurato con github-slugger (stessa libreria dell'estensione):
    // l'em dash è rimosso e i due spazi diventano due trattini.
    expect(html).toContain('<h1 id="manuale-utente--lunar-photo-planner">')
  })

  it('renderizza heading con id, tabelle GFM, blocchi di codice e blockquote', () => {
    const html = manualeDocumentHtml(
      [
        '## Sezione di prova',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '```',
        'codice',
        '```',
        '',
        '> nota',
      ].join('\n'),
    )
    expect(html).toContain('<h2 id="sezione-di-prova">Sezione di prova</h2>')
    expect(html).toContain('<table>')
    expect(html).toContain('<pre><code>codice\n</code></pre>')
    expect(html).toContain('<blockquote>')
  })

  it('riscrive i link e le immagini relativi verso GitHub e non tocca assoluti e anchor', () => {
    const html = manualeDocumentHtml(
      '[guida](README.md)\n\n![screenshot](images/vista.png)\n\n' +
        '[sito](https://example.com/)\n\n[§2](#2-requisiti)',
    )
    expect(html).toContain(
      'href="https://github.com/verbavolant/lunar-photo-planner/blob/main/README.md"',
    )
    expect(html).toContain(
      'src="https://raw.githubusercontent.com/verbavolant/lunar-photo-planner/main/images/vista.png"',
    )
    expect(html).toContain('href="https://example.com/"')
    expect(html).toContain('href="#2-requisiti"')
  })

  it('gli anchor interni dell indice del manuale reale risolvono tutti in heading esistenti', () => {
    const html = manualeDocumentHtml(manualeMarkdown)
    // Nel browser il frammento viene percent-decodificato prima di cercare
    // l'id (spec HTML): il test replica quel comportamento, perché marked
    // codifica i target con encodeURI (es. è → %C3%A8).
    const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((match) =>
      decodeURIComponent(match[1]),
    )
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]))
    expect(anchors.length).toBeGreaterThan(10)
    expect(anchors.every((anchor) => ids.has(anchor))).toBe(true)
    expect(ids.has('1-che-cosè-e-cosa-non-è')).toBe(true)
    expect(ids.has('73-dal-numero-alla-focale')).toBe(true)
  })

  it('sul manuale reale riscrive i link a README.md e deriva il titolo', () => {
    const html = manualeDocumentHtml(manualeMarkdown)
    expect(html).toContain(
      'href="https://github.com/verbavolant/lunar-photo-planner/blob/main/README.md"',
    )
    expect(html).toContain('<title>Manuale utente — Lunar Photo Planner</title>')
  })
})