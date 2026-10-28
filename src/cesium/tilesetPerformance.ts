// Limitazione del dettaglio dei Google Photorealistic 3D Tiles (T-039,
// richiesta umano 2026-10-07: "le tiles che vedo possono arrivare fino a 1 km
// al massimo ... per rendere la renderizzazione e il carico di download più
// rapido").
//
// Meccanismo reale di CesiumJS 1.146, verificato su
// node_modules/cesium/Build/CesiumUnminified/Cesium.js (funzioni
// updateDynamicScreenSpaceError e Cesium3DTile.getScreenSpaceError) e
// node_modules/cesium/Source/Cesium.d.ts L31760–31772:
//   - `CesiumMath.fog(d, ρ) = 1 − exp(−(ρ·d)²)` (Math.js).
//   - densità effettiva = dynamicScreenSpaceErrorDensity × horizonFactor
//     (orizzonte/street-level; guardando in basso l'effetto si spegne, per
//     costruzione di Cesium: il terreno sotto la camera è comunque vicino).
//   - l'errore a schermo di ogni tile viene ridotto di
//     `fog(distanza, densitàEffettiva) × dynamicScreenSpaceErrorFactor`;
//     sotto la soglia di raffinamento il tile resta al LOD del parent e non
//     viene scaricato né renderizzato in dettaglio.
// Non è un taglio netto a raggio fisso (Cesium non offre un cull-radius per
// 3D Tiles, e un foro nella mesh a 1 km lascerebbe il vuoto: il globo è
// nascosto quando i tiles sono attivi): è una decostruzione progressiva
// oltre la distanza scelta, con qualità vicina invariata.
import type { Cesium3DTileset } from 'cesium'

/**
 * Distanza (m) entro cui i tiles possono arrivare alla massima risoluzione.
 * Default richiesto dall'umano (1 km). Modificabile a runtime con
 * `?tileMaxM=<metri>` nell'URL, senza rebuild.
 */
export const DEFAULT_MAX_DETAIL_DISTANCE_M = 1000

/**
 * Frazione di rilassamento del dettaglio raggiunta a
 * DEFAULT_MAX_DETAIL_DISTANCE_M: 0.5 = metà forza a 1 km, ~0.94 a 2 km,
 * quasi satura oltre ~2.1 km (saturazione di `CesiumMath.fog`).
 */
const FOG_TARGET_AT_MAX_DISTANCE = 0.5

/**
 * Densità `dynamicScreenSpaceErrorDensity` per cui il rilassamento
 * `CesiumMath.fog(d, ρ) = 1 − exp(−(ρ·d)²)` raggiunge `fogTarget` alla
 * distanza data: inversione della formula → ρ = sqrt(−ln(1 − f)) / d.
 */
export function dynamicSseDensityForMaxDistanceM(
  maxDetailDistanceM: number,
  fogTarget: number = FOG_TARGET_AT_MAX_DISTANCE,
): number {
  if (!Number.isFinite(maxDetailDistanceM) || maxDetailDistanceM <= 0) {
    throw new RangeError(`maxDetailDistanceM non valido: ${maxDetailDistanceM}`)
  }
  if (!Number.isFinite(fogTarget) || fogTarget <= 0 || fogTarget >= 1) {
    throw new RangeError(`fogTarget fuori dall'intervallo (0,1): ${fogTarget}`)
  }
  return Math.sqrt(-Math.log(1 - fogTarget)) / maxDetailDistanceM
}

/**
 * Opzioni di caricamento per i tileset Google (entrambi i provider 'google' e
 * 'cesium'): a corta distanza la qualità resta il default Cesium
 * (`maximumScreenSpaceError` 16), oltre la distanza scelta i tile restano al
 * LOD del parent. `dynamicScreenSpaceErrorFactor` resta il default 24
 * (Cesium.d.ts 1.146, L31771: alzarlo carica tile ancora più grossolani).
 * API verificate su Cesium.d.ts 1.146: `dynamicScreenSpaceError` (default
 * true, L31769), `dynamicScreenSpaceErrorDensity` (default 2.0e-4, L31770),
 * `Cesium3DTileset.fromUrl`/`fromIonAssetId` con `ConstructorOptions`
 * (L32698/L32737).
 */
export function tilesetPerformanceOptions(
  maxDetailDistanceM: number,
): Cesium3DTileset.ConstructorOptions {
  return {
    dynamicScreenSpaceError: true,
    dynamicScreenSpaceErrorDensity: dynamicSseDensityForMaxDistanceM(maxDetailDistanceM),
  }
}

export interface ResolvedTileMaxDetailDistance {
  maxDetailDistanceM: number
  /**
   * Avviso quando `?tileMaxM=` era presente ma non valido: il default
   * scatta comunque e l'avviso va mostrato, non ingoiato (pattern di
   * dataProvider.ts).
   */
  invalidWarning: string | null
}

/**
 * Risolve l'override runtime `?tileMaxM=<metri>` sul default
 * DEFAULT_MAX_DETAIL_DISTANCE_M: assente/vuoto = default; presente ma non
 * valido (NaN, ≤ 0) = default + avviso.
 */
export function resolveTileMaxDetailDistanceM(
  queryValue: string | undefined,
): ResolvedTileMaxDetailDistance {
  if (queryValue === undefined || queryValue.trim() === '') {
    return { maxDetailDistanceM: DEFAULT_MAX_DETAIL_DISTANCE_M, invalidWarning: null }
  }
  const parsed = Number(queryValue.trim())
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      maxDetailDistanceM: DEFAULT_MAX_DETAIL_DISTANCE_M,
      invalidWarning: `Parametro "tileMaxM" non valido: "${queryValue}" (atteso un numero di metri > 0).`,
    }
  }
  return { maxDetailDistanceM: parsed, invalidWarning: null }
}

// ===== Livelli di qualità dei tiles (T-067, ADR-021) =====
//
// Richiesta umano 2026-10-21: «consumare meno tiles, non serve una
// raffigurazione perfetta: bastano dimensioni e ingombri indicativi».
// Tre preset applicati al tileset Google (entrambi i provider). I valori sono
// IPOTESI di partenza: il Done di T-067 richiede la misura live a path camera
// fisso; modifiche ai preset dopo la misura → riconferma dell'umano.
//
// Meccanismo (Cesium.d.ts 1.146):
//   - `maximumScreenSpaceError` (default 16, L31760): soglia di raffinamento
//     per errore a schermo; alzarla carica tile più grossolani ANCHE da vicino.
//   - `cacheBytes` (default 536870912 = 512 MB, L31761) e
//     `maximumCacheOverflowBytes` (default 536870912 = 512 MB, L31762): memoria
//     della cache dei tile (base + headroom).
//   - `preloadFlightDestinations` (default true, L31767): precarica i tile
//     della destinazione durante i voli di camera.
// Tutti e quattro sono campi della classe NON readonly (L32487, L32509,
// L32521, L31981), letti a ogni frame: mutarli a runtime NON ricrea il
// tileset e NON genera root request (protegge la finestra di autorizzazione
// root ~3 h, T-003/ADR-016). ORTOGONALE ad ADR-015: `dynamicScreenSpaceError`
// decostruisce a DISTANZA, il livello abbassa il LOD anche da vicino.
// Invariante: quote di suolo e occlusione passano da `sampleHeightMostDetailed`
// (sempre a max LOD, L45705–45725 — ADR-019/020): immuni dal livello.

/** Livelli selezionabili (selettore UI in barra comandi e `?tileQuality=`). */
export type TileQualityLevel = 'alta' | 'media' | 'eco'

/** Default scelto dall'umano (2026-10-28, T-071): Media. Prima Eco (2026-10-21). */
export const DEFAULT_TILE_QUALITY: TileQualityLevel = 'media'

interface TileQualityPreset {
  maximumScreenSpaceError: number
  cacheBytes: number
  maximumCacheOverflowBytes: number
  preloadFlightDestinations: boolean
}

const MIB = 1024 * 1024

/**
 * Preset dei tre livelli. VALORI = IPOTESI da validare con la misura live
 * (ADR-021): «alta» replica i default Cesium resi espliciti; «media» ed «eco»
 * dimezzano a scala SSE ×2 / cache ÷2, con overflow = cache (stesso rapporto
 * 1:1 del default Cesium) e preload voli disattivato solo per «eco».
 */
const TILE_QUALITY_PRESETS: Record<TileQualityLevel, TileQualityPreset> = {
  alta: {
    maximumScreenSpaceError: 16,
    cacheBytes: 512 * MIB,
    maximumCacheOverflowBytes: 512 * MIB,
    preloadFlightDestinations: true,
  },
  media: {
    maximumScreenSpaceError: 32,
    cacheBytes: 256 * MIB,
    maximumCacheOverflowBytes: 256 * MIB,
    preloadFlightDestinations: true,
  },
  eco: {
    maximumScreenSpaceError: 64,
    cacheBytes: 128 * MIB,
    maximumCacheOverflowBytes: 128 * MIB,
    preloadFlightDestinations: false,
  },
}

/**
 * Opzioni di creazione del tileset per il livello scelto: da spargere nelle
 * `ConstructorOptions` di `Cesium3DTileset.fromUrl`/`fromIonAssetId` accanto
 * a `tilesetPerformanceOptions` (che NON tocca questi campi: test T-039).
 */
export function tilesetQualityOptions(
  level: TileQualityLevel,
): Cesium3DTileset.ConstructorOptions {
  const preset = TILE_QUALITY_PRESETS[level]
  return {
    maximumScreenSpaceError: preset.maximumScreenSpaceError,
    cacheBytes: preset.cacheBytes,
    maximumCacheOverflowBytes: preset.maximumCacheOverflowBytes,
    preloadFlightDestinations: preset.preloadFlightDestinations,
  }
}

/**
 * Applica il livello a un tileset GIÀ in scena mutandone le proprietà
 * (d.ts 1.146: campi non readonly, letti a ogni frame): nessun reload e
 * nessuna root request extra. Usato dal cambio di livello a runtime e al
 * riattacco del tileset di sessione (istanza riusata senza nuova `create`).
 */
export function applyTilesetQuality(tileset: Cesium3DTileset, level: TileQualityLevel): void {
  const preset = TILE_QUALITY_PRESETS[level]
  tileset.maximumScreenSpaceError = preset.maximumScreenSpaceError
  tileset.cacheBytes = preset.cacheBytes
  tileset.maximumCacheOverflowBytes = preset.maximumCacheOverflowBytes
  tileset.preloadFlightDestinations = preset.preloadFlightDestinations
}

export interface ResolvedTileQuality {
  level: TileQualityLevel
  /**
   * Avviso quando `?tileQuality=` era presente ma non valido: il default
   * scatta comunque e l'avviso va mostrato, non ingoiato (pattern di
   * dataProvider.ts e di `resolveTileMaxDetailDistanceM`).
   */
  invalidWarning: string | null
}

/**
 * Risolve l'override runtime `?tileQuality=alta|media|eco` sul default
 * DEFAULT_TILE_QUALITY: assente/vuoto = default; presente ma non valido =
 * default + avviso. Normalizzazione trim/minuscole come il provider.
 */
export function resolveTileQuality(queryValue: string | undefined): ResolvedTileQuality {
  if (queryValue === undefined || queryValue.trim() === '') {
    return { level: DEFAULT_TILE_QUALITY, invalidWarning: null }
  }
  const normalized = queryValue.trim().toLowerCase()
  if (normalized === 'alta' || normalized === 'media' || normalized === 'eco') {
    return { level: normalized, invalidWarning: null }
  }
  return {
    level: DEFAULT_TILE_QUALITY,
    invalidWarning: `Parametro "tileQuality" non valido: "${queryValue}" (valori ammessi: alta, media, eco).`,
  }
}
