import { describe, expect, it } from 'vitest'
import type { Viewer } from 'cesium'
import { createTerrainHeightSampler } from './terrainSample'
import type { LatLonPoint } from '../planning/reverseAlignment'

/** Chiamata registrata al fake di `Scene.sampleHeightMostDetailed`. */
interface SampleHeightCall {
  readonly longitudesRad: number[]
  readonly latitudesRad: number[]
  readonly objectsToExclude: readonly object[] | undefined
}

/** Viewer finto con solo le superficie usate dall'adapter (cast dichiarato). */
function fakeViewer(options: {
  sampleHeightSupported?: boolean
  destroyed?: boolean
  entities?: readonly object[]
  /** Quota restituita per indice: `undefined` = posizione non campionabile. */
  heightsByIndex: ReadonlyArray<number | undefined>
  calls?: SampleHeightCall[]
}): Viewer {
  const scene = {
    sampleHeightSupported: options.sampleHeightSupported ?? true,
    sampleHeightMostDetailed: (
      positions: { longitude: number; latitude: number; height?: number }[],
      objectsToExclude?: object[],
    ) => {
      options.calls?.push({
        longitudesRad: positions.map((position) => position.longitude),
        latitudesRad: positions.map((position) => position.latitude),
        objectsToExclude,
      })
      // Come Cesium: modifica in place e risolve alla stessa lista; le
      // posizioni senza geometria campionabile diventano undefined.
      return Promise.resolve(
        positions.map((position, index) => {
          const height = options.heightsByIndex[index]
          if (height === undefined) {
            return undefined
          }
          position.height = height
          return position
        }),
      )
    },
  }
  return {
    isDestroyed: () => options.destroyed ?? false,
    scene,
    entities: { values: [...(options.entities ?? [])] },
  } as unknown as Viewer
}

describe('createTerrainHeightSampler', () => {
  it('campiona le quote in gradi→radianti e le restituisce nello stesso ordine', async () => {
    const calls: SampleHeightCall[] = []
    const entities = [{ id: 'marker-observer' }, { id: 'marker-target' }]
    const sampler = createTerrainHeightSampler(
      fakeViewer({ heightsByIndex: [100, 250.5], entities, calls }),
    )
    const points: LatLonPoint[] = [
      { latitudeDeg: 45.5, longitudeDeg: 10.2 },
      { latitudeDeg: 45.6, longitudeDeg: 10.3 },
    ]

    const heights = await sampler(points)

    expect(heights).toEqual([100, 250.5])
    expect(calls).toHaveLength(1)
    const call = calls[0]
    expect(call).toBeDefined()
    expect(call?.longitudesRad[0]).toBeCloseTo((10.2 * Math.PI) / 180, 12)
    expect(call?.latitudesRad[0]).toBeCloseTo((45.5 * Math.PI) / 180, 12)
    expect(call?.longitudesRad[1]).toBeCloseTo((10.3 * Math.PI) / 180, 12)
    // Le entità del planner sono escluse dal campionamento.
    expect(call?.objectsToExclude).toEqual(entities)
  })

  it('i punti senza geometria campionabile tornano null (mai quote simulate)', async () => {
    const sampler = createTerrainHeightSampler(
      fakeViewer({ heightsByIndex: [undefined, 12] }),
    )

    const heights = await sampler([
      { latitudeDeg: 45.5, longitudeDeg: 10.2 },
      { latitudeDeg: 45.5, longitudeDeg: 10.21 },
    ])

    expect(heights).toEqual([null, 12])
  })

  it('richiesta vuota: nessuna chiamata di campionamento', async () => {
    const calls: SampleHeightCall[] = []
    const sampler = createTerrainHeightSampler(
      fakeViewer({ heightsByIndex: [], calls }),
    )

    expect(await sampler([])).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('scena senza supporto al campionamento: errore esplicito', async () => {
    const sampler = createTerrainHeightSampler(
      fakeViewer({ sampleHeightSupported: false, heightsByIndex: [] }),
    )

    await expect(
      sampler([{ latitudeDeg: 45.5, longitudeDeg: 10.2 }]),
    ).rejects.toThrow(/campionamento del terreno non è supportato/i)
  })

  it('viewer già distrutto: errore esplicito', async () => {
    const sampler = createTerrainHeightSampler(
      fakeViewer({ destroyed: true, heightsByIndex: [] }),
    )

    await expect(
      sampler([{ latitudeDeg: 45.5, longitudeDeg: 10.2 }]),
    ).rejects.toThrow(/scena 3D è stata chiusa/i)
  })
})
