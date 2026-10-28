import { describe, expect, it } from 'vitest'
import { resolveSceneDataProvider } from './dataProvider'

describe('resolveSceneDataProvider', () => {
  it('default: nessuna configurazione → google, nessun avviso', () => {
    expect(resolveSceneDataProvider(undefined, undefined)).toEqual({
      provider: 'google',
      invalidWarning: null,
    })
  })

  it('env google valida: nessun avviso', () => {
    expect(resolveSceneDataProvider('google', undefined)).toEqual({
      provider: 'google',
      invalidWarning: null,
    })
  })

  it('env google-ion valida: nessun avviso', () => {
    expect(resolveSceneDataProvider('google-ion', undefined)).toEqual({
      provider: 'google-ion',
      invalidWarning: null,
    })
  })

  it('alias storico cesium (anche con maiuscole e spazi) → google-ion', () => {
    expect(resolveSceneDataProvider(' CESIUM ', undefined).provider).toBe('google-ion')
    expect(resolveSceneDataProvider(undefined, 'cesium').provider).toBe('google-ion')
  })

  it('la query param ha priorità sull\u2019env', () => {
    expect(resolveSceneDataProvider('google', 'google-ion').provider).toBe('google-ion')
    expect(resolveSceneDataProvider('google-ion', 'google').provider).toBe('google')
  })

  it('valori vuoti = non impostati → default google senza avviso', () => {
    expect(resolveSceneDataProvider('', '')).toEqual({
      provider: 'google',
      invalidWarning: null,
    })
  })

  it('env non valida → default google con avviso che cita il valore', () => {
    const resolved = resolveSceneDataProvider('tile-openstreetmap', undefined)
    expect(resolved.provider).toBe('google')
    expect(resolved.invalidWarning).toContain('tile-openstreetmap')
    expect(resolved.invalidWarning).toContain('google')
  })

  it('query non valida + env valida: vince l\u2019env, avviso cita la query', () => {
    const resolved = resolveSceneDataProvider('google-ion', 'bogus')
    expect(resolved.provider).toBe('google-ion')
    expect(resolved.invalidWarning).toContain('bogus')
  })

  it('entrambi non validi → default google, avviso cita entrambi i valori', () => {
    const resolved = resolveSceneDataProvider('uno', 'due')
    expect(resolved.provider).toBe('google')
    expect(resolved.invalidWarning).toContain('uno')
    expect(resolved.invalidWarning).toContain('due')
  })

  it('l\u2019avviso elenca anche l\u2019alias cesium', () => {
    const resolved = resolveSceneDataProvider('bogus', undefined)
    expect(resolved.invalidWarning).toContain('google-ion')
    expect(resolved.invalidWarning).toContain('cesium')
  })

  it('T-072: la scelta dell\u2019utente (pannello Chiavi API) ha priorità sull\u2019env', () => {
    expect(resolveSceneDataProvider('google', undefined, 'google-ion').provider).toBe('google-ion')
    expect(resolveSceneDataProvider('google-ion', undefined, 'google').provider).toBe('google')
  })

  it('T-072: la query ?provider= ha priorità sulla scelta dell\u2019utente', () => {
    expect(resolveSceneDataProvider(undefined, 'google', 'google-ion').provider).toBe('google')
    expect(resolveSceneDataProvider('google', 'google-ion', 'google').provider).toBe('google-ion')
  })

  it('T-072: scelta utente valida + query non valida → vince l\u2019utente, avviso cita la query', () => {
    const resolved = resolveSceneDataProvider(undefined, 'bogus', 'google')
    expect(resolved.provider).toBe('google')
    expect(resolved.invalidWarning).toContain('bogus')
  })

  it('T-072: env non valida scavalcata dalla scelta utente, avviso cita l\u2019env', () => {
    const resolved = resolveSceneDataProvider('tile-openstreetmap', undefined, 'google-ion')
    expect(resolved.provider).toBe('google-ion')
    expect(resolved.invalidWarning).toContain('tile-openstreetmap')
  })

  it('T-072: scelta utente senza query né env → nessun avviso', () => {
    expect(resolveSceneDataProvider(undefined, undefined, 'google')).toEqual({
      provider: 'google',
      invalidWarning: null,
    })
  })
})
