import type { Cesium3DTileset } from 'cesium'
import { describe, expect, it, vi } from 'vitest'
import {
  computeLoadPercent,
  subscribeTileLoadProgress,
  TileLoadProgressTracker,
  type TileLoadProgressSnapshot,
} from './tileLoadProgress'

describe('computeLoadPercent', () => {
  it('peak 0 → 100 (mai NaN: nessun riferimento nella burst)', () => {
    expect(computeLoadPercent(0, 0)).toBe(100)
    expect(computeLoadPercent(3, 0)).toBe(100)
  })

  it('nessun pendente → 100; a metà del picco → 50', () => {
    expect(computeLoadPercent(0, 4)).toBe(100)
    expect(computeLoadPercent(2, 4)).toBe(50)
    expect(computeLoadPercent(1, 4)).toBe(75)
  })

  it('arrotonda al numero intero più vicino', () => {
    expect(computeLoadPercent(1, 3)).toBe(67) // 66.67
    expect(computeLoadPercent(2, 3)).toBe(33) // 33.33
  })

  it('clamp 0–100 anche con input fuori intervallo', () => {
    expect(computeLoadPercent(5, 2)).toBe(0) // pending > peak → negativo
    expect(computeLoadPercent(-1, 4)).toBe(100) // 125 → 100
  })
})

describe('TileLoadProgressTracker', () => {
  it('burst nuova: il peak parte dal primo evento non nullo, % = 0', () => {
    const tracker = new TileLoadProgressTracker()
    expect(tracker.onProgress(5, 0)).toEqual({
      percent: 0,
      pending: 5,
      processing: 0,
      peak: 5,
      busy: true,
    })
  })

  it('la % sale con il picco fisso della burst; a 100% con lavorazioni in corso resta busy', () => {
    const tracker = new TileLoadProgressTracker()
    tracker.onProgress(5, 0)
    expect(tracker.onProgress(3, 2).percent).toBe(40)
    expect(tracker.onProgress(1, 4).percent).toBe(80)
    // Scaricati tutti: restano le lavorazioni → 100%, ma busy resta vero.
    const done = tracker.onProgress(0, 5)
    expect(done.percent).toBe(100)
    expect(done.busy).toBe(true)
  })

  it('il peak cresce se la burst si allarga (nuove richieste in corsa)', () => {
    const tracker = new TileLoadProgressTracker()
    expect(tracker.onProgress(2, 0).percent).toBe(0)
    expect(tracker.onProgress(4, 0)).toMatchObject({ peak: 4, percent: 0 })
    expect(tracker.onProgress(3, 0)).toMatchObject({ peak: 4, percent: 25 })
  })

  it('burst conclusa (0,0): 100%, busy false, peak azzerato', () => {
    const tracker = new TileLoadProgressTracker()
    tracker.onProgress(5, 0)
    expect(tracker.onProgress(0, 0)).toEqual({
      percent: 100,
      pending: 0,
      processing: 0,
      peak: 0,
      busy: false,
    })
  })

  it('reset a burst conclusa: la burst successiva non eredita il peak', () => {
    const tracker = new TileLoadProgressTracker()
    tracker.onProgress(8, 0)
    tracker.onProgress(0, 0)
    expect(tracker.onProgress(2, 0)).toEqual({
      percent: 0,
      pending: 2,
      processing: 0,
      peak: 2,
      busy: true,
    })
  })
})

describe('subscribeTileLoadProgress', () => {
  /** Tileset finto con `loadProgress` emulato: nessun Cesium reale, nessuna rete. */
  function fakeTileset(): {
    tileset: Cesium3DTileset
    emit: (pending: number, processing: number) => void
  } {
    let handler: ((pending: number, processing: number) => void) | null = null
    const tileset = {
      loadProgress: {
        addEventListener: (listener: (pending: number, processing: number) => void) => {
          handler = listener
          return () => {
            handler = null
          }
        },
      },
    } as unknown as Cesium3DTileset
    return {
      tileset,
      emit: (pending, processing) => handler?.(pending, processing),
    }
  }

  it('traduce gli eventi loadProgress in snapshot, in ordine', () => {
    const { tileset, emit } = fakeTileset()
    const snapshots: TileLoadProgressSnapshot[] = []
    const remove = subscribeTileLoadProgress(tileset, (snapshot) => {
      snapshots.push(snapshot)
    })
    emit(4, 0)
    emit(2, 2)
    emit(0, 0)
    remove()
    expect(snapshots.map((snapshot) => snapshot.percent)).toEqual([0, 50, 100])
    expect(snapshots[1]).toMatchObject({ pending: 2, processing: 2, peak: 4, busy: true })
    expect(snapshots[2]).toMatchObject({ busy: false, peak: 0 })
  })

  it('la funzione di rimozione stacca il listener', () => {
    const { tileset, emit } = fakeTileset()
    const listener = vi.fn()
    const remove = subscribeTileLoadProgress(tileset, listener)
    emit(1, 0)
    remove()
    emit(0, 0)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
