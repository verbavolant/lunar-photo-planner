import { describe, expect, it, vi, afterEach } from 'vitest'
// `import type` è cancellato in build: nessun modulo Cesium viene caricato
// nei test (requisito T-040: i test non creano tileset reali).
import type { Cesium3DTileset } from 'cesium'
import {
  DEFAULT_RATE_LIMIT_BACKOFF_MS,
  acquireSessionTileset,
  isRateLimitError,
  markSessionTilesetDetached,
  type TilesetSessionStore,
} from './tilesetSession'

function fakeTileset(id: number): Cesium3DTileset {
  return { id } as unknown as Cesium3DTileset
}

// Forma di RequestErrorEvent di Cesium (non-Error, con statusCode):
// Cesium.d.ts 1.146 L17591–L17613.
function rateLimitError(): unknown {
  return { statusCode: 429, response: 'RATE_LIMIT_EXCEEDED' }
}

function acquire(
  store: TilesetSessionStore,
  create: () => Promise<Cesium3DTileset>,
  hooks: { notices?: string[]; log?: (message: string) => void; sessionKey?: string } = {},
): Promise<Cesium3DTileset> {
  return acquireSessionTileset({
    sessionKey: hooks.sessionKey ?? 'sessione-test',
    label: 'Label test',
    create,
    onNotice: (message) => {
      if (message !== null) {
        hooks.notices?.push(message)
      }
    },
    describeError: (error) => (error instanceof Error ? error.message : String(error)),
    log: hooks.log,
    store,
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('acquireSessionTileset — una sola creazione per sessione', () => {
  it('chiamate concorrenti condividono la stessa Promise: una sola creazione', async () => {
    const store: TilesetSessionStore = new Map()
    const calls: number[] = []
    let resolveCreation!: (tileset: Cesium3DTileset) => void
    const pending = new Promise<Cesium3DTileset>((resolve) => {
      resolveCreation = resolve
    })
    const create = (): Promise<Cesium3DTileset> => {
      calls.push(calls.length + 1)
      return pending
    }
    const log = vi.fn()
    const first = acquire(store, create, { log })
    const second = acquire(store, create)

    expect(second).toBe(first)
    expect(calls).toHaveLength(1)
    const created = fakeTileset(1)
    resolveCreation(created)
    await expect(first).resolves.toBe(created)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('creazione #1 in questa sessione'))
  })

  it("dopo il successo un nuovo acquire riusa l'istanza senza ricreare", async () => {
    const store: TilesetSessionStore = new Map()
    const instance = fakeTileset(1)
    const log = vi.fn()
    let calls = 0
    const first = acquire(
      store,
      () => {
        calls += 1
        return Promise.resolve(instance)
      },
      { log },
    )
    await expect(first).resolves.toBe(instance)

    const second = acquire(
      store,
      () => {
        calls += 1
        return Promise.resolve(instance)
      },
      { log },
    )
    await expect(second).resolves.toBe(instance)
    expect(calls).toBe(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('riuso'))
  })
})

describe('backoff 429 (T-040: nessun retry immediato)', () => {
  it('429: attese 30 s → 2 min → 10 min, successo al 4° tentativo', async () => {
    vi.useFakeTimers()
    const store: TilesetSessionStore = new Map()
    const notices: string[] = []
    let calls = 0
    const promise = acquire(
      store,
      () => {
        calls += 1
        return calls <= 3
          ? Promise.reject(rateLimitError())
          : Promise.resolve(fakeTileset(calls))
      },
      { notices },
    )
    const expectation = expect(promise).resolves.toEqual({ id: 4 })

    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    expect(notices[0]).toContain('429')
    expect(notices[0]).toContain('30 s')
    // Chiamate concorrenti durante il backoff: stessa Promise, zero creazioni.
    expect(acquire(store, () => Promise.resolve(fakeTileset(99)))).toBe(promise)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls).toBe(2)
    expect(notices[1]).toContain('2 min')

    await vi.advanceTimersByTimeAsync(120_000)
    expect(calls).toBe(3)
    expect(notices[2]).toContain('10 min')

    await vi.advanceTimersByTimeAsync(600_000)
    await expectation
    expect(calls).toBe(4)
  })

  it('429: dopo il 4° fallimento la sessione si ferma (notice finale, nessun timer)', async () => {
    vi.useFakeTimers()
    const store: TilesetSessionStore = new Map()
    const notices: string[] = []
    let calls = 0
    const promise = acquire(
      store,
      () => {
        calls += 1
        return Promise.reject(rateLimitError())
      },
      { notices },
    )
    const expectation = expect(promise).rejects.toMatchObject({ statusCode: 429 })
    for (const waitMs of DEFAULT_RATE_LIMIT_BACKOFF_MS) {
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(waitMs)
    }
    await expectation
    expect(calls).toBe(DEFAULT_RATE_LIMIT_BACKOFF_MS.length + 1)
    expect(notices[notices.length - 1]).toContain('nessun altro tentativo in questa sessione')
    expect(vi.getTimerCount()).toBe(0)

    // Un acquire successivo non riprova: restituisce lo stesso rifiuto e
    // ri-mostra l'avviso finale, senza chiamate di rete.
    const noticesAfterGiveUp: string[] = []
    const again = acquire(
      store,
      () => {
        calls += 100
        return Promise.resolve(fakeTileset(1))
      },
      { notices: noticesAfterGiveUp },
    )
    await expect(again).rejects.toMatchObject({ statusCode: 429 })
    expect(calls).toBe(4)
    expect(noticesAfterGiveUp).toHaveLength(1)
  })

  it('errore non 429: un solo tentativo, nessun timer, notice senza backoff', async () => {
    vi.useFakeTimers()
    const store: TilesetSessionStore = new Map()
    const notices: string[] = []
    let calls = 0
    const promise = acquire(
      store,
      () => {
        calls += 1
        return Promise.reject(new Error('HTTP 403: chiave non valida'))
      },
      { notices },
    )
    await expect(promise).rejects.toThrow('403')
    expect(calls).toBe(1)
    expect(notices[0]).toContain('Errore nel caricamento')
    expect(notices[0]).not.toContain('riprovo')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('isRateLimitError', () => {
  it('RequestErrorEvent-like con statusCode 429 → true', () => {
    expect(isRateLimitError(rateLimitError())).toBe(true)
  })

  it('statusCode diverso da 429 → false', () => {
    expect(isRateLimitError({ statusCode: 500 })).toBe(false)
    expect(isRateLimitError({ statusCode: 403 })).toBe(false)
  })

  it('messaggio con 429 / rate limit / Too Many Requests → true', () => {
    expect(isRateLimitError(new Error('HTTP 429 Too Many Requests'))).toBe(true)
    expect(isRateLimitError(new Error('rate limit exceeded'))).toBe(true)
    expect(isRateLimitError(new Error('RATE-LIMIT'))).toBe(true)
  })

  it('altri errori → false', () => {
    expect(isRateLimitError(new Error('403 Forbidden'))).toBe(false)
    expect(isRateLimitError(undefined)).toBe(false)
    expect(isRateLimitError(null)).toBe(false)
  })

  it('valore primitivo in forma di stringa → true solo se cita il limite', () => {
    expect(isRateLimitError('HTTP 429')).toBe(true)
    expect(isRateLimitError('boom')).toBe(false)
  })
})

describe('markSessionTilesetDetached', () => {
  it('detach del tileset attaccato (contesto WebGL distrutto): la acquire seguente ricrea', async () => {
    const store: TilesetSessionStore = new Map()
    const log = vi.fn()
    const firstInstance = fakeTileset(1)
    let calls = 0
    const first = acquire(
      store,
      () => {
        calls += 1
        return Promise.resolve(firstInstance)
      },
      { log },
    )
    await expect(first).resolves.toBe(firstInstance)

    // Il claimante stava renderizzando: il distacco precede la distruzione
    // del contesto → la prossima acquire deve ricreare.
    markSessionTilesetDetached({ sessionKey: 'sessione-test', tileset: firstInstance, store })
    const secondInstance = fakeTileset(2)
    const second = acquire(
      store,
      () => {
        calls += 1
        return Promise.resolve(secondInstance)
      },
      { log },
    )
    await expect(second).resolves.toBe(secondInstance)
    expect(calls).toBe(2)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('creazione #2 in questa sessione'))
  })

  it('detach di un tileset non corrispondente non tocca lo stato', async () => {
    const store: TilesetSessionStore = new Map()
    const instance = fakeTileset(1)
    let calls = 0
    const first = acquire(store, () => {
      calls += 1
      return Promise.resolve(instance)
    })
    await expect(first).resolves.toBe(instance)

    markSessionTilesetDetached({ sessionKey: 'sessione-test', tileset: fakeTileset(99), store })
    const second = acquire(store, () => {
      calls += 1
      return Promise.resolve(instance)
    })
    await expect(second).resolves.toBe(instance)
    expect(calls).toBe(1)
  })
})

describe('store di sessione', () => {
  it('store iniettati distinti sono indipendenti', async () => {
    const firstStore: TilesetSessionStore = new Map()
    const secondStore: TilesetSessionStore = new Map()
    const instance = fakeTileset(1)
    let firstCalls = 0
    let secondCalls = 0
    const first = acquire(firstStore, () => {
      firstCalls += 1
      return Promise.resolve(instance)
    }, { sessionKey: 'k' })
    await expect(first).resolves.toBe(instance)
    const second = acquire(secondStore, () => {
      secondCalls += 1
      return Promise.resolve(instance)
    }, { sessionKey: 'k' })
    await expect(second).resolves.toBe(instance)
    expect(firstCalls).toBe(1)
    expect(secondCalls).toBe(1)
  })

  it('lo store di default è agganciato a globalThis (sopravvive a HMR)', async () => {
    const storeKey = '__lunarPhotoPlannerTilesetSessions'
    const host = globalThis as unknown as Record<string, unknown>
    const instance = fakeTileset(1)
    const options = {
      sessionKey: 'sessione-default-test',
      label: 'Label test',
      create: () => Promise.resolve(instance),
      onNotice: () => {},
      describeError: (error: unknown): string => String(error),
    }
    const first = acquireSessionTileset(options)
    const second = acquireSessionTileset(options)
    expect(second).toBe(first)
    expect(host[storeKey]).toBeInstanceOf(Map)
    // Pulizia: la voce di test non deve restare nello store di default.
    ;(host[storeKey] as TilesetSessionStore).delete('sessione-default-test')
  })
})