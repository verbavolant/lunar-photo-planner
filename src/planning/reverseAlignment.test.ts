import { describe, expect, it } from 'vitest'
import { moonTopocentric, type MoonTopocentric } from '../astronomy/moon'
import {
  lineOfSightAzimuthDeg,
  movePointOnWGS84,
  verticalAngleDeg,
  type GeoPoint,
} from '../geodesy/geodesy'
import {
  buildTerrainPolarGrid,
  radialCellsAtAzimuth,
  refineReverseCandidate,
  REVERSE_SCAN_FIRST_DISTANCE_M,
  REVERSE_SCAN_STEP_M,
  reverseCandidateAtInstant,
  scanDistancesM,
  searchReverseAlignments,
  TERRAIN_GRID_AZIMUTH_STEP_DEG,
  TERRAIN_GRID_BATCH_SIZE,
  type ReverseAlignmentCandidate,
  type ReverseRadialCell,
  type TerrainHeightSampler,
} from './reverseAlignment'

// Brescia, come le altre fixture del planner.
const TARGET: GeoPoint = { latitudeDeg: 45.5397, longitudeDeg: 10.2197, heightM: 156 }

function moonAt(azimuthDeg: number, altitudeDeg: number): MoonTopocentric {
  return { azimuthDeg, altitudeDeg, distanceM: 384_400_000, angularDiameterDeg: 0.55 }
}

const flatSampler =
  (heightM: number): TerrainHeightSampler =>
  async (points) =>
    points.map(() => heightM)

describe('scanDistancesM', () => {
  it('dal primo al cap con passo costante, cap incluso', () => {
    const distances = scanDistancesM(25, 50, 2000)
    expect(distances[0]).toBe(25)
    expect(distances[distances.length - 1]).toBe(2000)
    expect(distances[distances.length - 2]).toBe(1975)
    expect(distances).toHaveLength(41)
    for (let index = 1; index < distances.length - 1; index++) {
      expect(distances[index] - distances[index - 1]).toBe(50)
    }
  })

  it('rifiuta parametri invalidi', () => {
    expect(() => scanDistancesM(25, 0, 2000)).toThrow(RangeError)
    expect(() => scanDistancesM(2000, 50, 25)).toThrow(RangeError)
    expect(() => scanDistancesM(-1, 50, 2000)).toThrow(RangeError)
    expect(() => scanDistancesM(25, Number.NaN, 2000)).toThrow(RangeError)
  })
})

describe('buildTerrainPolarGrid', () => {
  it('colonne a passi di 2°, batch limitati, linea di vista coerente con la geometria piana', async () => {
    const distances = scanDistancesM(REVERSE_SCAN_FIRST_DISTANCE_M, REVERSE_SCAN_STEP_M, 975)
    const batches: number[] = []
    const sampler: TerrainHeightSampler = async (points) => {
      batches.push(points.length)
      return points.map(() => 100)
    }
    const grid = await buildTerrainPolarGrid(TARGET, distances, sampler)
    expect(grid.columns).toHaveLength(360 / TERRAIN_GRID_AZIMUTH_STEP_DEG)
    expect(grid.columns[0].azimuthDeg).toBe(0)
    expect(grid.columns[90].azimuthDeg).toBe(180)
    expect(grid.columns[179].azimuthDeg).toBe(358)
    expect(batches.reduce((total, length) => total + length, 0)).toBe(180 * distances.length)
    expect(Math.max(...batches)).toBeLessThanOrEqual(TERRAIN_GRID_BATCH_SIZE)
    // Prima cella: Observer a nord del Target (azimut 0) → LOS verso sud = 180°.
    const first = grid.columns[0].cells[0]
    expect(first).not.toBeNull()
    expect(first?.losAzimuthDeg).toBeCloseTo(180, 5)
    // Elevazione piana attesa: atan(Δh/d) con Δh = 156 − 100 = 56 m; a 25 m e a
    // 975 m lo scarto dalla corda 3D reale (normale ellissoide) è sotto 0,05°.
    const expectedNearDeg = (Math.atan(56 / 25) * 180) / Math.PI
    expect(first?.losAltitudeDeg).toBeCloseTo(expectedNearDeg, 1)
    const far = grid.columns[0].cells[distances.length - 1]
    expect(far?.losAltitudeDeg).toBeCloseTo((Math.atan(56 / 975) * 180) / Math.PI, 1)
  })

  it('celle senza quota a ovest: colonne nulle e distanze escluse nel radiale', async () => {
    const distances = scanDistancesM(25, 50, 475)
    const sampler: TerrainHeightSampler = async (points) =>
      points.map((point) => (point.longitudeDeg < TARGET.longitudeDeg ? null : 100))
    const grid = await buildTerrainPolarGrid(TARGET, distances, sampler)
    // Azimut 200° (colonna 100): a ovest → tutta senza quota; azimut 90°: a est.
    expect(grid.columns[100].cells.every((cell) => cell === null)).toBe(true)
    expect(grid.columns[45].cells.every((cell) => cell !== null)).toBe(true)
    // Radiale fra due colonne a ovest → tutto null; a cavallo ovest/est → null;
    // fra due colonne a est → celle valide.
    expect(radialCellsAtAzimuth(grid, 183).every((cell) => cell === null)).toBe(true)
    expect(radialCellsAtAzimuth(grid, 359).every((cell) => cell === null)).toBe(true)
    expect(radialCellsAtAzimuth(grid, 3).every((cell) => cell !== null)).toBe(true)
  })

  it('rifiuta distanze non crescenti, lista vuota e passi di azimut non divisori di 360', async () => {
    await expect(
      buildTerrainPolarGrid(TARGET, [100, 50], flatSampler(100)),
    ).rejects.toThrow(RangeError)
    await expect(buildTerrainPolarGrid(TARGET, [], flatSampler(100))).rejects.toThrow(RangeError)
    await expect(
      buildTerrainPolarGrid(TARGET, [100], flatSampler(100), 7),
    ).rejects.toThrow(RangeError)
  })

  it('sulla colonna esatta restituisce le celle della colonna', async () => {
    const distances = scanDistancesM(25, 50, 475)
    const grid = await buildTerrainPolarGrid(TARGET, distances, flatSampler(100))
    expect(radialCellsAtAzimuth(grid, 10)).toEqual(grid.columns[5].cells)
  })

  it("wrap dell'azimut: interpolazione sul percorso più corto", async () => {
    const distances = scanDistancesM(25, 50, 475)
    const grid = await buildTerrainPolarGrid(TARGET, distances, flatSampler(100))
    // Colonna 178 → LOS ≈ 358°, colonna 180 → LOS ≈ 0° ( discontinuità del ramo):
    // il percorso corto da 358 a 0 dà 359°, che è il valore geometrico esatto
    // (LOS = azimut radiale + 180).
    const cells = radialCellsAtAzimuth(grid, 179)
    expect(cells[0]?.losAzimuthDeg).toBeCloseTo(359, 2)
  })

  it('interpolazione accurata su terreno a pendenza costante', async () => {
    const distances = scanDistancesM(25, 50, 975)
    // Quota che scende allontanandosi verso nord (pendenza 0,2 m/m): campo
    // lineare in latitudine → la posizione intermedia ha quota esatta nota e si
    // può confrontare l'interpolazione con il calcolo esatto della linea di vista.
    const slopeSampler: TerrainHeightSampler = async (points) =>
      points.map((point) => 100 - (point.latitudeDeg - TARGET.latitudeDeg) * 111_320 * 0.2)
    const grid = await buildTerrainPolarGrid(TARGET, distances, slopeSampler)
    const far = radialCellsAtAzimuth(grid, 1)[distances.length - 1]
    if (far === null || far === undefined) {
      throw new Error('Attesa una cella interpolata a 975 m.')
    }
    const exactPosition = movePointOnWGS84(TARGET, 1, 975)
    const exactObserver: GeoPoint = {
      ...exactPosition,
      // Stessa formula del campo del sampler, valutata sulla posizione esatta:
      // confronta l'interpolazione fra colonne con il valore esatto del campo.
      heightM: 100 - (exactPosition.latitudeDeg - TARGET.latitudeDeg) * 111_320 * 0.2,
    }
    expect(Math.abs(far.groundHeightM - exactObserver.heightM)).toBeLessThan(0.1)
    expect(Math.abs(far.losAltitudeDeg - verticalAngleDeg(exactObserver, TARGET))).toBeLessThan(0.01)
    expect(Math.abs(far.losAzimuthDeg - lineOfSightAzimuthDeg(exactObserver, TARGET))).toBeLessThan(0.01)
  })
})

describe('reverseCandidateAtInstant', () => {
  it('terreno piatto con Target sopraelevato: distanza attesa e separazione minima', async () => {
    const distances = scanDistancesM(REVERSE_SCAN_FIRST_DISTANCE_M, REVERSE_SCAN_STEP_M, 975)
    const grid = await buildTerrainPolarGrid(TARGET, distances, flatSampler(100))
    // Luna a 10° di altitudine da est (azimut 90°): radiale a ovest (270°);
    // Δh = 56 m → d* = 56/tan(10°) ≈ 317,6 m → sulla griglia vince 325 m.
    const candidate = reverseCandidateAtInstant({
      target: TARGET,
      dateMs: Date.UTC(2026, 0, 21, 12),
      moonAtTarget: moonAt(90, 10),
      cells: radialCellsAtAzimuth(grid, 270),
      toleranceDeg: 5,
      minMoonAltitudeDeg: 0,
    })
    if (candidate === null) {
      throw new Error('Atteso un candidato sul terreno piatto.')
    }
    expect(candidate.distanceM).toBe(325)
    expect(candidate.separationDeg).toBeLessThan(0.5)
    expect(candidate.separationDeg).toBeCloseTo(10 - (Math.atan(56 / 325) * 180) / Math.PI, 1)
    // Luna sopra la linea di vista: offset verticale positivo, orizzontale ~0.
    expect(candidate.verticalOffsetDeg).toBeGreaterThan(0)
    expect(Math.abs(candidate.horizontalOffsetDeg)).toBeLessThan(0.01)
    expect(candidate.moonAzimuthDeg).toBe(90)
    expect(candidate.moonAltitudeDeg).toBe(10)
    // Observer a ovest del Target: longitudine minore, quota = suolo campionato.
    expect(candidate.observer.longitudeDeg).toBeLessThan(TARGET.longitudeDeg)
    expect(candidate.observer.heightM).toBe(100)
  })

  it('vince la cella con separazione minima; le celle fuori tolleranza sono scartate', () => {
    const cells: (ReverseRadialCell | null)[] = [
      { distanceM: 100, groundHeightM: 100, losAzimuthDeg: 90, losAltitudeDeg: 4 },
      { distanceM: 200, groundHeightM: 100, losAzimuthDeg: 90, losAltitudeDeg: 9.5 },
      { distanceM: 300, groundHeightM: 100, losAzimuthDeg: 90, losAltitudeDeg: 9 },
    ]
    const candidate = reverseCandidateAtInstant({
      target: TARGET,
      dateMs: 0,
      moonAtTarget: moonAt(90, 10),
      cells,
      toleranceDeg: 5,
      minMoonAltitudeDeg: 0,
    })
    if (candidate === null) {
      throw new Error('Atteso un candidato fra le celle manuali.')
    }
    // Separazioni: |10−4| = 6 (fuori tolleranza, scartata), |10−9,5| = 0,5, |10−9| = 1.
    expect(candidate.distanceM).toBe(200)
    expect(candidate.separationDeg).toBeCloseTo(0.5, 6)
  })

  it('Luna sotto la soglia di altitudine → null', () => {
    const candidate = reverseCandidateAtInstant({
      target: TARGET,
      dateMs: 0,
      moonAtTarget: moonAt(90, -5),
      cells: [{ distanceM: 100, groundHeightM: 100, losAzimuthDeg: 90, losAltitudeDeg: 10 }],
      toleranceDeg: 5,
      minMoonAltitudeDeg: 0,
    })
    expect(candidate).toBeNull()
  })

  it('nessuna distanza entro tolleranza → null', async () => {
    const distances = scanDistancesM(25, 50, 975)
    const grid = await buildTerrainPolarGrid(TARGET, distances, flatSampler(100))
    // Luna a 80°: la LOS più alta possibile (a 25 m) è atan(56/25) ≈ 66° →
    // separazione minima ≥ 14°, oltre la tolleranza.
    const candidate = reverseCandidateAtInstant({
      target: TARGET,
      dateMs: 0,
      moonAtTarget: moonAt(0, 80),
      cells: radialCellsAtAzimuth(grid, 180),
      toleranceDeg: 5,
      minMoonAltitudeDeg: 0,
    })
    expect(candidate).toBeNull()
  })

  it('celle tutte senza quota → null', () => {
    const candidate = reverseCandidateAtInstant({
      target: TARGET,
      dateMs: 0,
      moonAtTarget: moonAt(90, 10),
      cells: [null, null],
      toleranceDeg: 5,
      minMoonAltitudeDeg: 0,
    })
    expect(candidate).toBeNull()
  })
})

describe('refineReverseCandidate', () => {
  // Primo istante del mese scelto con la Luna fra 10° e 17° da Brescia; quota
  // del terreno piatto calibrata perché la soluzione cada a esattamente 500 m
  // (presente nella griglia a 25 m: Δh = 500·tan(alt) → LOS(500) = alt).
  async function flatFixture(): Promise<{
    coarse: ReverseAlignmentCandidate
    moon: MoonTopocentric
    dateMs: number
  }> {
    let dateMs = Date.UTC(2026, 0, 21, 0)
    let moon: MoonTopocentric | null = null
    for (let hour = 0; hour < 24 * 28 && moon === null; hour++) {
      const candidateDateMs = dateMs + hour * 3_600_000
      const candidateMoon = moonTopocentric(TARGET, new Date(candidateDateMs))
      if (candidateMoon.altitudeDeg >= 10 && candidateMoon.altitudeDeg <= 17) {
        moon = candidateMoon
        dateMs = candidateDateMs
      }
    }
    if (moon === null) {
      throw new Error('Fixture attesa: Luna fra 10° e 17° nel mese scelto.')
    }
    const groundHeightM = TARGET.heightM - Math.tan((moon.altitudeDeg * Math.PI) / 180) * 500
    const grid = await buildTerrainPolarGrid(TARGET, scanDistancesM(25, 25, 975), flatSampler(groundHeightM))
    const coarse = reverseCandidateAtInstant({
      target: TARGET,
      dateMs,
      moonAtTarget: moon,
      cells: radialCellsAtAzimuth(grid, (moon.azimuthDeg + 180) % 360),
      toleranceDeg: 5,
      minMoonAltitudeDeg: 0,
    })
    if (coarse === null) {
      throw new Error('Atteso un candidato dalla griglia piana.')
    }
    return { coarse, moon, dateMs }
  }

  it('raffina con la Luna esatta dell Observer: la differenza di parallasse resta trascurabile', async () => {
    const { coarse, moon } = await flatFixture()
    expect(coarse.distanceM).toBe(500)
    const refined = refineReverseCandidate(coarse, TARGET, 5, 0)
    if (refined === null) {
      throw new Error('Atteso candidato valido dopo il raffinamento.')
    }
    expect(refined.observer).toEqual(coarse.observer)
    expect(refined.distanceM).toBe(500)
    // La Luna vista dall'Observer candidato differisce da quella vista dal
    // Target per parallasse (7,5·10⁻⁵° su 500 m) E per l'inclinazione della
    // normale ellissoide fra i due punti (d/R ≈ 0,0045° su 500 m) → soglia 0,02°.
    expect(Math.abs(refined.moonAltitudeDeg - moon.altitudeDeg)).toBeLessThan(0.02)
    expect(Math.abs(refined.separationDeg - coarse.separationDeg)).toBeLessThan(0.02)
    expect(Math.abs(refined.losAltitudeDeg - coarse.losAltitudeDeg)).toBeLessThan(0.001)
  })

  it('candidato fuori soglia dopo il ricalcolo → null', async () => {
    const { coarse, moon } = await flatFixture()
    const refined = refineReverseCandidate(coarse, TARGET, 5, moon.altitudeDeg + 0.01)
    expect(refined).toBeNull()
  })
})

describe('searchReverseAlignments', () => {
  // Primo istante dal 21/01/2026 con la Luna nella fascia di altitudine scelta,
  // vista dal Target (stessa ricerca della fixture di refineReverseCandidate).
  function findMoonInstantInBand(
    minAltitudeDeg: number,
    maxAltitudeDeg: number,
  ): { dateMs: number; moon: MoonTopocentric } {
    const startMs = Date.UTC(2026, 0, 21, 0)
    for (let hour = 0; hour < 24 * 28; hour++) {
      const dateMs = startMs + hour * 3_600_000
      const moon = moonTopocentric(TARGET, new Date(dateMs))
      if (moon.altitudeDeg >= minAltitudeDeg && moon.altitudeDeg <= maxAltitudeDeg) {
        return { dateMs, moon }
      }
    }
    throw new Error('Fixture attesa: nessun istante con la Luna nella fascia di altitudine.')
  }

  async function flatGrid(
    distancesM: ReadonlyArray<number> = scanDistancesM(
      REVERSE_SCAN_FIRST_DISTANCE_M,
      REVERSE_SCAN_STEP_M,
      975,
    ),
  ) {
    return buildTerrainPolarGrid(TARGET, distancesM, flatSampler(100))
  }

  it('la scansione coarse a 15 min non perde passaggi rispetto alla riferimento a 2 min', async () => {
    const { dateMs } = findMoonInstantInBand(10, 17)
    const grid = await flatGrid()
    const base = {
      target: TARGET,
      terrainGrid: grid,
      fromDateMs: dateMs - 72 * 3_600_000,
      durationHours: 144,
      toleranceDeg: 5,
      // Senza filtro d'orizzonte: il confronto copre TUTTI i passaggi.
      minMoonAltitudeDeg: -90,
    }
    const reference = searchReverseAlignments({ ...base, coarseStepMinutes: 2, maxResults: 1000 })
    const scanned = searchReverseAlignments({ ...base, coarseStepMinutes: 15, maxResults: 1000 })
    expect(reference.candidates.length).toBeGreaterThan(0)
    expect(scanned.candidates.length).toBeGreaterThan(0)
    expect(scanned.totalFound).toBeLessThanOrEqual(reference.totalFound)
    for (const refCandidate of reference.candidates) {
      const match = scanned.candidates.find(
        (candidate) => Math.abs(candidate.dateMs - refCandidate.dateMs) <= 15 * 60_000,
      )
      expect(match).toBeDefined()
      // Entrambe le ricerche campionano il minimo del passaggio al passo fine
      // di 1′: lo scarto fra i due migliori campioni resta sotto ~0,13°.
      expect(match?.separationDeg).toBeLessThanOrEqual(refCandidate.separationDeg + 0.3)
    }
  })

  it('ordina per separazione crescente, tie-break per data, e tronca a maxResults', async () => {
    const { dateMs } = findMoonInstantInBand(10, 17)
    const grid = await flatGrid()
    const base = {
      target: TARGET,
      terrainGrid: grid,
      fromDateMs: dateMs - 72 * 3_600_000,
      durationHours: 144,
      coarseStepMinutes: 15,
      toleranceDeg: 5,
      minMoonAltitudeDeg: 0,
    }
    const full = searchReverseAlignments({ ...base, maxResults: 1000 })
    expect(full.totalFound).toBeGreaterThan(3)
    const truncated = searchReverseAlignments({ ...base, maxResults: 3 })
    expect(truncated.totalFound).toBe(full.totalFound)
    expect(truncated.candidates).toHaveLength(3)
    expect(truncated.candidates).toEqual(full.candidates.slice(0, 3))
    for (let index = 1; index < truncated.candidates.length; index++) {
      const previous = truncated.candidates[index - 1]
      const current = truncated.candidates[index]
      if (previous === undefined || current === undefined) {
        continue
      }
      expect(previous.separationDeg).toBeLessThanOrEqual(current.separationDeg)
      if (previous.separationDeg === current.separationDeg) {
        expect(previous.dateMs).toBeLessThanOrEqual(current.dateMs)
      }
    }
  })

  it('scarta e conta i passaggi con la Luna sotto la soglia di altitudine', async () => {
    const { dateMs } = findMoonInstantInBand(10, 17)
    // Solo le distanze 475–525 m: con piatto a quota 100 l'altitudine della LOS
    // è ~5,6–6,7°, quindi ogni passaggio ha la Luna sotto la soglia di 30°.
    const grid = await buildTerrainPolarGrid(TARGET, scanDistancesM(475, 50, 525), flatSampler(100))
    const base = {
      target: TARGET,
      terrainGrid: grid,
      fromDateMs: dateMs - 72 * 3_600_000,
      durationHours: 144,
      coarseStepMinutes: 15,
      toleranceDeg: 5,
      maxResults: 8,
    }
    const filtered = searchReverseAlignments({ ...base, minMoonAltitudeDeg: 30 })
    expect(filtered.candidates).toHaveLength(0)
    expect(filtered.totalFound).toBe(0)
    expect(filtered.discardedRefinement).toBe(0)
    expect(filtered.discardedBelowHorizon).toBeGreaterThan(0)
    const admitted = searchReverseAlignments({ ...base, minMoonAltitudeDeg: 0, maxResults: 1000 })
    expect(admitted.candidates.length).toBeGreaterThan(0)
    expect(admitted.discardedBelowHorizon).toBe(0)
    expect(admitted.totalFound).toBe(admitted.candidates.length)
  })

  it('un passaggio ammesso dalla scansione ma respinto dal ricalcolo esatto è contato in discardedRefinement', async () => {
    // Luna a est/ovest (azimut ≈ 90°/270°) con altitudine 10–17°: lì la
    // rotazione della normale ellissoide fra Target e Observer (≈ d/R, asse
    // nord-sud) agisce TUTTA sull'altitudine della Luna vista dal candidato,
    // mentre la scansione misura con la Luna vista dal Target. A 8 km lo
    // scarto è ~0,072°, misurabile con una tolleranza piccola ma stabile.
    const startMs = Date.UTC(2026, 0, 21, 0)
    let fixture: { dateMs: number; moon: MoonTopocentric } | null = null
    for (let minutes = 0; minutes < 60 * 24 * 45 && fixture === null; minutes += 3) {
      const dateMs = startMs + minutes * 60_000
      const moon = moonTopocentric(TARGET, new Date(dateMs))
      const nearEastOrWest =
        Math.abs(moon.azimuthDeg - 90) <= 1 || Math.abs(moon.azimuthDeg - 270) <= 1
      if (moon.altitudeDeg >= 10 && moon.altitudeDeg <= 17 && nearEastOrWest) {
        fixture = { dateMs, moon }
      }
    }
    if (fixture === null) {
      throw new Error('Fixture attesa: Luna a est/ovest fra 10° e 17° entro 45 giorni.')
    }
    const { dateMs, moon } = fixture
    const candidateBase = movePointOnWGS84(TARGET, moon.azimuthDeg + 180, 8000)
    // Bisezione sulla quota del piatto: linea di vista ESATTA dal candidato a
    // 8 km = altitudine della Luna vista dal Target → la separazione di
    // scansione ha solo il termine di azimut (convergenza dei meridiani,
    // ≈ 0,073° a 8 km), il ricalcolo esatto vi somma in quadratura il termine
    // d'altitudine (~0,072°) → ~0,101°.
    let low = TARGET.heightM - 4000
    let high = TARGET.heightM
    for (let iteration = 0; iteration < 60; iteration++) {
      const mid = (low + high) / 2
      const losAltitudeDeg = verticalAngleDeg({ ...candidateBase, heightM: mid }, TARGET)
      if (losAltitudeDeg > moon.altitudeDeg) {
        low = mid
      } else {
        high = mid
      }
    }
    const groundHeightM = (low + high) / 2
    const grid = await buildTerrainPolarGrid(TARGET, [8000], flatSampler(groundHeightM))
    const base = {
      target: TARGET,
      terrainGrid: grid,
      fromDateMs: dateMs - 6 * 3_600_000,
      durationHours: 12,
      coarseStepMinutes: 15,
      minMoonAltitudeDeg: -90,
      maxResults: 10,
    }
    // Tolleranza 0,06°: la scansione ammette il passaggio (miglior campione
    // ≤ ~0,048°: termine di azimut ≈ 0,035° + quantizzazione fine), il
    // ricalcolo esatto lo respinge: l'azimut della Luna vista dal candidato è
    // shiftato dalla convergenza del meridiano (~0,073°), che annulla il
    // termine di azimut, e l'altitudine della normale ellissoide (d/R ≈
    // 0,072°) vi si somma in quadratura → ~0,080° > 0,06°.
    const strict = searchReverseAlignments({ ...base, toleranceDeg: 0.06 })
    expect(strict.candidates).toHaveLength(0)
    expect(strict.discardedRefinement).toBe(1)
    expect(strict.discardedBelowHorizon).toBe(0)
    // Con tolleranza 0,5° lo stesso passaggio è ammesso dal ricalcolo esatto.
    const tolerant = searchReverseAlignments({ ...base, toleranceDeg: 0.5 })
    expect(tolerant.candidates).toHaveLength(1)
    expect(tolerant.discardedRefinement).toBe(0)
  })

  it('valida i parametri della ricerca', async () => {
    const grid = await flatGrid()
    const base = {
      target: TARGET,
      terrainGrid: grid,
      fromDateMs: Date.UTC(2026, 0, 21, 0),
      durationHours: 24,
      coarseStepMinutes: 15,
      toleranceDeg: 5,
      minMoonAltitudeDeg: 0,
      maxResults: 8,
    }
    expect(() =>
      searchReverseAlignments({ ...base, target: { ...TARGET, heightM: TARGET.heightM + 1 } }),
    ).toThrow(RangeError)
    expect(() => searchReverseAlignments({ ...base, durationHours: 0 })).toThrow(RangeError)
    expect(() => searchReverseAlignments({ ...base, coarseStepMinutes: 0 })).toThrow(RangeError)
    expect(() => searchReverseAlignments({ ...base, toleranceDeg: -1 })).toThrow(RangeError)
    expect(() => searchReverseAlignments({ ...base, maxResults: 1.5 })).toThrow(RangeError)
  })

  it('finestra senza passaggi: nessun candidato e contatori a zero', async () => {
    const grid = await flatGrid()
    const result = searchReverseAlignments({
      target: TARGET,
      terrainGrid: grid,
      fromDateMs: Date.UTC(2026, 0, 21, 0),
      durationHours: 48,
      coarseStepMinutes: 15,
      toleranceDeg: 1e-6,
      minMoonAltitudeDeg: 0,
      maxResults: 8,
    })
    expect(result.candidates).toHaveLength(0)
    expect(result.totalFound).toBe(0)
    expect(result.discardedBelowHorizon).toBe(0)
    expect(result.discardedRefinement).toBe(0)
    expect(result.evaluatedInstants).toBeGreaterThan(0)
  })

  it('benchmark documentato: finestra di 60 giorni con griglia piatta', async () => {
    const grid = await flatGrid()
    const start = performance.now()
    const result = searchReverseAlignments({
      target: TARGET,
      terrainGrid: grid,
      fromDateMs: Date.UTC(2026, 0, 21, 0),
      durationHours: 60 * 24,
      coarseStepMinutes: 15,
      toleranceDeg: 5,
      minMoonAltitudeDeg: 0,
      maxResults: 8,
    })
    const elapsedMs = performance.now() - start
    // Budget generoso per l'hardware di CI: il test deve rompersi solo a fronte
    // di una regressione di un ordine di grandezza; i numeri misurati vanno
    // registrati in ADR-018 (docs/ai/DECISIONS.md).
    expect(elapsedMs).toBeLessThan(30_000)
    expect(result.candidates.length).toBeGreaterThan(0)
    console.log(
      `benchmark reverse 60 gg: ${elapsedMs.toFixed(0)} ms, ` +
        `${result.evaluatedInstants} istanti valutati, ` +
        `${result.totalFound} passaggi ammessi (mostrati ${result.candidates.length})`,
    )
  })
})