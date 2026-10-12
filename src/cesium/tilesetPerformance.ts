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
