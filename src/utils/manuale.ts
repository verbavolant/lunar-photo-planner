import { Marked } from 'marked'
import { gfmHeadingId } from 'marked-gfm-heading-id'

// Repository sorgente del manuale (git remote origin, verificato): i link
// relativi dentro MANUALE.md (es. [README.md](README.md)) devono restare
// seguibili anche dalla finestra di anteprima, che non ha un base URL del sito.
const GITHUB_BLOB_BASE = 'https://github.com/verbavolant/lunar-photo-planner/blob/main/'
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/verbavolant/lunar-photo-planner/main/'

// Istanza dedicata (non il default globale di marked) con gli id degli heading
// calcolati come su GitHub (github-slugger): l'indice del manuale usa anchor
// generati con l'algoritmo GitHub (verificati in T-042).
const manualeMarked = new Marked(gfmHeadingId())

// Stile inline: la finestra di anteprima non eredita i CSS dell'app e non deve
// caricare risorse esterne. Tema chiaro per la leggibilità di un documento lungo.
const DOCUMENT_STYLE = `
  body { margin: 0; background: #fff; color: #1f2328;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 15px; line-height: 1.6; }
  article { max-width: 880px; margin: 0 auto; padding: 24px 20px 64px; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 24px 0 12px; }
  h1 { font-size: 1.9em; padding-bottom: 8px; border-bottom: 1px solid #d1d9e0; }
  h2 { font-size: 1.45em; padding-bottom: 6px; border-bottom: 1px solid #d1d9e0; }
  h3 { font-size: 1.2em; }
  a { color: #0969da; }
  code { font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: .9em; background: #f6f8fa; padding: .2em .4em; border-radius: 4px; }
  pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-x: auto; }
  pre code { padding: 0; background: none; }
  table { border-collapse: collapse; margin: 12px 0; max-width: 100%;
    display: block; overflow-x: auto; }
  th, td { border: 1px solid #d1d9e0; padding: 6px 12px; text-align: left; vertical-align: top; }
  th { background: #f6f8fa; }
  blockquote { margin: 0 0 12px; padding: 0 12px; color: #59636e;
    border-left: 4px solid #d1d9e0; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #d1d9e0; margin: 24px 0; }
`

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Titolo del documento = primo heading di livello 1 del markdown.
function manualeTitle(markdown: string): string {
  const match = /^# (.+)$/m.exec(markdown)
  return match === null ? 'Manuale utente' : match[1].trim()
}

// I target relativi di link e immagini non risolvono nella finestra di
// anteprima (about:blank, nessun base URL): link di pagina → blob su GitHub,
// immagini → raw.githubusercontent. Assoluti, mailto e anchor interni restano.
function absolutizeRelativeTargets(html: string): string {
  return html.replace(/(href|src)="([^"]*)"/g, (match, attribute: string, target: string) => {
    if (/^(https?:|mailto:|#)/i.test(target) || target === '') {
      return match
    }
    const base = attribute === 'src' ? GITHUB_RAW_BASE : GITHUB_BLOB_BASE
    return `${attribute}="${base}${target}"`
  })
}

// Converte il markdown del manuale nel documento HTML completo da mostrare in
// una finestra separata: titolo dall'h1, stili inline, anchor interni con id
// GitHub-compatible. Il markdown è contenuto nostro (MANUALE.md nel repo, non
// input utente): marked non sanitizza l'HTML inline e qui non serve farlo.
export function manualeDocumentHtml(markdown: string): string {
  const body = manualeMarked.parse(markdown, { async: false })
  return [
    '<!doctype html>',
    '<html lang="it">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(manualeTitle(markdown))}</title>`,
    `<style>${DOCUMENT_STYLE}</style>`,
    '</head>',
    '<body>',
    `<article>${absolutizeRelativeTargets(body)}</article>`,
    '</body>',
    '</html>',
  ].join('\n')
}