import { describe, expect, it } from 'vitest'
import App from './App'

// Smoke test T-001: verifica che il modulo dell'app sia importabile in ambiente node
// (nessun rendering DOM necessario finché non arriva Cesium).
describe('App', () => {
  it('esporta un componente React valido', () => {
    expect(typeof App).toBe('function')
  })
})
