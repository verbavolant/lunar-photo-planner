import { useEffect, useRef, useState } from 'react'
import type { Viewer } from 'cesium'
import CesiumViewer from './cesium/CesiumViewer'
import CameraPovCard from './cesium/CameraPovCard'
import { createTerrainHeightSampler } from './cesium/terrainSample'
import type { TileLoadProgressSnapshot } from './cesium/tileLoadProgress'
import { resolveTileQuality, type TileQualityLevel } from './cesium/tilesetPerformance'
import type { SceneDataProvider } from './cesium/dataProvider'
import {
  clearUserApiKeys,
  loadUserApiKeys,
  loadUserProvider,
  saveUserApiKeys,
  saveUserProvider,
  type UserApiKeys,
} from './cesium/userKeys'
import { flyToObserverView, flyToOverhead, moveCameraWithObserver } from './cesium/camera'
import { moonTopocentric } from './astronomy/moon'
import { moonSkyPath, type MoonSkyPath } from './astronomy/moonPath'
import {
  HOME_VIEW,
  PLANNER_POINT_LABELS,
  observerAtHeightAboveGround,
  observerHeightAboveGroundM,
  type PlannerPointId,
} from './planning/points'
import { buildMeasurements, type MeasurementRow } from './planning/measurements'
import {
  DEFAULT_ALIGNMENT_DAYS,
  DEFAULT_ALIGNMENT_SEARCH,
  alignmentDegs,
  searchMoonAlignments,
  type AlignmentOffsets,
  type AlignmentSearchResult,
} from './planning/alignment'
import {
  buildTerrainPolarGrid,
  REVERSE_SCAN_FIRST_DISTANCE_M,
  REVERSE_SCAN_STEP_M,
  scanDistancesM,
  searchReverseAlignments,
  type ReverseAlignmentCandidate,
  type ReverseAlignmentSearchResult,
} from './planning/reverseAlignment'
import { analyzeSightLine, type SightLineReport } from './planning/occlusion'
import {
  formatAngleDeg,
  formatDistanceM,
  formatHeightDifferenceM,
} from './planning/format'
import { loadSavedHome, saveHome, type SavedHome } from './planning/homeStorage'
import {
  browserTimeZone,
  dateToLocalInputValue,
  effectiveTimeMs,
  formatLocalDateTime,
  localInputValueToMs,
  localUtcOffsetLabel,
} from './planning/time'
import { lineOfSightAzimuthDeg, movePointOnWGS84, verticalAngleDeg, type GeoPoint } from './geodesy/geodesy'
import { moonPhase } from './astronomy/moonPhase'
import { sunTwilightLabel, sunTwilightState } from './astronomy/sun'
import MoonPhaseCard, { moonPhaseLabel } from './components/MoonPhaseCard'
import SunStateCard from './components/SunStateCard'
import { manualeDocumentHtml } from './utils/manuale'
import manualeMarkdown from '../MANUALE.md?raw'

// Layout a pagina (T-027): l'UI non copre più la scena — toolbar sopra la vista,
// card Tempo sotto, box dati/allineamenti a sinistra. Così il canvas non ha zone
// morte: drag/zoom/click funzionano su tutta la sua area.
const ROOT_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  height: '100vh',
  backgroundColor: '#14141e',
  color: '#f5f5f5',
  fontFamily: 'sans-serif',
  fontSize: 13,
}

const TOOLBAR_STYLE = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  flexShrink: 0,
}

// Stato di sviluppo in fondo a destra nella barra comandi (T-057): riporta
// l'ID dell'ultimo task completato nel piano (docs/ai/TASKS.md), così l'umano
// vede sul live fino a dove è arrivato lo sviluppo. Aggiornare la costante a
// ogni task chiuso.
const DEVELOPMENT_STATUS = 'T-075'

// Distanza massima Observer↔Target esplorata dal Reverse Planner (T-060), in
// metri: default 2 km (scala urbana, copertura dei Google 3D Tiles), editabile
// 100–20.000 nella finestra di ricerca.
const DEFAULT_REVERSE_MAX_DISTANCE_M = 2000

// Debounce (ms) dell'analisi d'occlusione (T-064): i pick e i passi ±
// dell'Osservatore possono arrivare in raffica; l'analisi campiona il suolo
// solo quando la modifica si assesta. Le quote non dipendono dal tempo:
// l'effetto non ascolta data/ora.
const OCCLUSION_DEBOUNCE_MS = 500

const DEV_STATUS_STYLE = {
  marginLeft: 'auto',
  whiteSpace: 'nowrap' as const,
  color: '#9aa3b5',
}

// Indicatore «Caricamento tiles: N%» (T-068) accanto al selettore qualità:
// compare solo mentre i tile stanno arrivando, stessa tinta attenuata dello
// stato di sviluppo.
const TILE_LOAD_STYLE = {
  whiteSpace: 'nowrap' as const,
  color: '#9aa3b5',
}

const MAIN_ROW_STYLE = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
}

const SIDEBAR_STYLE = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 8,
  width: 380,
  // T-065: sotto ~400 px la colonna non sta più accanto alla vista: si
  // stringe fino a occupare tutta la larghezza (la vista 3D resta a 0) invece
  // di mandare la pagina in overflow orizzontale. Sopra 380 px non cambia
  // nulla (shrink 1 non agisce con spazio libero).
  maxWidth: '100%',
  flexShrink: 1,
  padding: 8,
  overflowY: 'auto' as const,
}

const SIDEBAR_HINT_STYLE = {
  color: '#9aa3b5',
  fontSize: 12,
  padding: '8px 12px',
}

const VIEW_CONTAINER_STYLE = {
  position: 'relative' as const,
  flex: 1,
  minWidth: 0,
}

const BUTTON_STYLE = {
  padding: '6px 10px',
  borderRadius: 4,
  border: '1px solid #556',
  backgroundColor: '#1b1e2b',
  color: '#f5f5f5',
  cursor: 'pointer' as const,
}

const ACTIVE_BUTTON_STYLE = {
  ...BUTTON_STYLE,
  borderColor: '#7ab8ff',
  backgroundColor: '#24406b',
}

const CARD_STYLE = {
  display: 'grid',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 6,
  backgroundColor: 'rgba(20, 20, 30, 0.85)',
  color: '#f5f5f5',
  fontFamily: 'sans-serif',
  fontSize: 13,
  colorScheme: 'dark' as const,
}

// Card Tempo: fascia a tutta larghezza sotto la vista (T-027). Da T-056 è una
// riga orizzontale: a sinistra la colonna dei comandi data/ora, a destra i
// blocchi Fase lunare e Sole (T-074, centrati in verticale), non più righe dedicate.
const TEMPO_CARD_STYLE = {
  ...CARD_STYLE,
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  borderRadius: 0,
  flexShrink: 0,
  // T-065: a viewport stretti il blocco Fase lunare passa sotto la colonna
  // data/ora invece di spingere la card oltre la larghezza della pagina.
  flexWrap: 'wrap' as const,
}

// Colonna sinistra della card Tempo (T-056): le tre righe data/ora.
const TEMPO_LEFT_STYLE = {
  display: 'grid',
  gap: 6,
  flex: 1,
  minWidth: 0,
}

// T-065: le righe vanno a capo se troppo lunghe per la larghezza disponibile
// (candidati allineamenti/reverse, note lunghe): prima il nowrap mandava la
// sidebar in scroll orizzontale. minWidth 0 lascia stringere le righe dentro
// flex e grid (min-width auto le bloccherebbe sul contenuto).
const ROW_STYLE = {
  minWidth: 0,
}

const TIME_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  // T-065: nella card Tempo stretta la riga orario + slider va a capo invece
  // di straripare (i controlli hanno larghezza intrinseca non comprimibile).
  flexWrap: 'wrap' as const,
}

const DIVIDER_STYLE = {
  width: '100%',
  margin: '2px 0',
  border: 'none',
  borderTop: '1px solid #456',
}

// Finestra Allineamenti: card del box laterale, non più overlay sulla scena.
const ALIGNMENT_WINDOW_STYLE = {
  display: 'grid',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 6,
  backgroundColor: 'rgba(20, 20, 30, 0.85)',
  color: '#f5f5f5',
  fontFamily: 'sans-serif',
  fontSize: 13,
  colorScheme: 'dark' as const,
}

const WINDOW_HEADER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  fontWeight: 600 as const,
}

const ALIGNMENT_ROW_BUTTON_STYLE = {
  ...BUTTON_STYLE,
  textAlign: 'left' as const,
}

// Riga risultato adottata (T-053): stessa riga con il testo in grassetto.
const ALIGNMENT_ROW_ADOPTED_STYLE = {
  ...ALIGNMENT_ROW_BUTTON_STYLE,
  fontWeight: 700 as const,
}

const WINDOW_PARAMS_STYLE = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap' as const,
  alignItems: 'center',
}

const PARAM_LABEL_STYLE = {
  display: 'grid',
  gap: 2,
  fontSize: 12,
}

const NUMBER_INPUT_STYLE = {
  width: 64,
}

// Campi del pannello «Chiavi API» (T-072): a tutta larghezza della card.
const KEY_INPUT_STYLE = {
  width: '100%',
  boxSizing: 'border-box' as const,
}

// Riga dei controlli ±/input/passo dell'altezza dal suolo dell'Observer (T-035).
const OBSERVER_HEIGHT_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

// Riga dei comandi di spostamento dell'Observer (T-037): come la riga altezza
// ma con wrap, per i quattro bottoni direzionali.
const OBSERVER_MOVE_ROW_STYLE = {
  ...OBSERVER_HEIGHT_ROW_STYLE,
  flexWrap: 'wrap' as const,
}

// Coordinate leggibili in gradi decimali con emisfero e quota in metri.
function formatPoint(point: GeoPoint): string {
  const latitudeAbs = Math.abs(point.latitudeDeg).toFixed(6)
  const longitudeAbs = Math.abs(point.longitudeDeg).toFixed(6)
  const latitudeHemisphere = point.latitudeDeg < 0 ? 'S' : 'N'
  const longitudeHemisphere = point.longitudeDeg < 0 ? 'O' : 'E'
  return `${latitudeAbs}°${latitudeHemisphere} ${longitudeAbs}°${longitudeHemisphere} · ${point.heightM.toFixed(0)} m`
}

/** GeoPoint dalla Home salvata (lat/lon e quota ellissoide del salvataggio). */
function savedHomePoint(home: SavedHome): GeoPoint {
  return {
    latitudeDeg: home.latitudeDeg,
    longitudeDeg: home.longitudeDeg,
    heightM: home.heightM,
  }
}

/** Offset rispetto alla linea di vista in italiano, con segno esplicito. */
function describeAlignmentOffsets(offsets: AlignmentOffsets): string {
  const horizontal =
    Math.abs(offsets.horizontalOffsetDeg) < 0.005
      ? 'in azimut'
      : `${formatAngleDeg(Math.abs(offsets.horizontalOffsetDeg), 2)} ${offsets.horizontalOffsetDeg > 0 ? 'a destra' : 'a sinistra'}`
  const vertical =
    Math.abs(offsets.verticalOffsetDeg) < 0.005
      ? 'in quota'
      : `${formatAngleDeg(Math.abs(offsets.verticalOffsetDeg), 2)} ${offsets.verticalOffsetDeg > 0 ? 'sopra' : 'sotto'}`
  return `${horizontal} · ${vertical}`
}

/** Riga «Occlusione» del box Dati (T-064) dal report dell'analisi. */
function describeOcclusion(report: SightLineReport): string {
  if (report.status === 'free') {
    return 'vista libera'
  }
  const restrictive = report.mostRestrictive
  if (report.status === 'occluded' && restrictive !== null) {
    return `occlusa a ~${formatDistanceM(restrictive.distanceFromTargetM)} dal Target (margine ${formatHeightDifferenceM(restrictive.clearanceM)})`
  }
  return `non determinabile (${report.unsampledCount}/${report.sampleCount} punti senza dati)`
}

/** Limita un intero dal campo numerico (fallback al default se non leggibile). */
function clampInt(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

/** Limita un decimale dal campo numerico (fallback al default se non leggibile). */
function clampFloat(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

// Apre il manuale (importato a build time con ?raw: niente fetch, la finestra
// si riempie nello stesso gesto del click e i popup blocker non intervengono).
// Finestra separata come richiesto; se il browser la blocca si ripiega su una
// nuova scheda; se blocca anche quella resta il messaggio in console.
function openManualeWindow(): void {
  const win =
    window.open('', '_blank', 'width=980,height=880,scrollbars=yes,resizable=yes') ??
    window.open('', '_blank')
  if (win === null) {
    console.error('Manuale: apertura della finestra bloccata dal browser.')
    return
  }
  win.document.open()
  win.document.write(manualeDocumentHtml(manualeMarkdown))
  win.document.close()
}

export default function App() {
  // Home dell'Osservatore salvata nel browser (T-051): letta una sola volta
  // all'avvio; se valida ripristina subito l'Osservatore sul punto salvato.
  const [savedHome, setSavedHome] = useState<SavedHome | null>(() =>
    loadSavedHome(window.localStorage),
  )
  const [observer, setObserver] = useState<GeoPoint | null>(() =>
    savedHome === null ? null : savedHomePoint(savedHome),
  )
  const [target, setTarget] = useState<GeoPoint | null>(null)
  const [activePoint, setActivePoint] = useState<PlannerPointId>('observer')
  const viewerRef = useRef<Viewer | null>(null)
  // Specchio sincrono dell'Observer per gli esiti async (T-038): se durante
  // l'attesa della nuova quota del suolo l'Osservatore cambia per altra via
  // (pick, ±/input altezza, Home, Reverse), lo spostamento in attesa è scartato.
  const observerRef = useRef<GeoPoint | null>(observer)
  useEffect(() => {
    observerRef.current = observer
  }, [observer])
  // Viewer anche in stato (non solo ref): la card POV camera si iscrive ai suoi
  // eventi (T-035).
  const [viewer, setViewer] = useState<Viewer | null>(null)
  // Quota del suolo misurata al pick dell'Observer: riferimento per l'altezza
  // dal suolo (ADR-012: non ricampionata a valle del pick).
  const [observerGroundM, setObserverGroundM] = useState<number | null>(
    () => savedHome?.groundHeightM ?? null,
  )
  // Passo (m) dei bottoni ± dell'altezza dal suolo.
  const [observerHeightStepM, setObserverHeightStepM] = useState(1)
  // Passo (m) dei comandi di spostamento orizzontale dell'Observer (T-037).
  const [observerMoveStepM, setObserverMoveStepM] = useState(10)
  // Spostamento direzionale (T-038): mentre arriva la nuova quota del suolo i
  // quattro comandi sono disabilitati (una misura alla volta) e sotto di essi
  // compare la nota d'attesa; suolo non determinabile o errore di campionamento
  // → spostamento non applicato + nota esplicita (pattern reverseNote).
  const [observerMoveBusy, setObserverMoveBusy] = useState(false)
  const [observerMoveNote, setObserverMoveNote] = useState<string | null>(null)
  // Livello qualità dei tiles 3D (T-067, ADR-021): default Media (decisione
  // umano 2026-10-28, T-071; prima Eco). All'avvio può essere impostato con
  // ?tileQuality=alta|media|eco (invalido → default + avviso a schermo,
  // pattern tileMaxM): la stessa risoluzione pura è rifatta in CesiumViewer
  // per il solo avviso. Il cambio a runtime muta il tileset di sessione
  // senza ricaricarlo (nessuna root request extra).
  const [tileQuality, setTileQuality] = useState<TileQualityLevel>(() =>
    resolveTileQuality(
      new URLSearchParams(window.location.search).get('tileQuality') ?? undefined,
    ).level,
  )
  // Chiavi API dell'utilizzatore (T-072): inserite nel pannello «Chiavi API»,
  // sovrascrivono le chiavi di build (VITE_* cotte nel bundle dai secret
  // GitHub). Restano nel localStorage del browser.
  const [userKeys, setUserKeys] = useState<UserApiKeys>(() =>
    loadUserApiKeys(window.localStorage),
  )
  const [userProvider, setUserProvider] = useState<SceneDataProvider | undefined>(() =>
    loadUserProvider(window.localStorage),
  )
  // Generazione della scena (T-072): le credenziali sono lette da
  // CesiumViewer solo al mount → applicarle = rimontare il viewer usando
  // questo contatore come key su <CesiumViewer>. Observer/Target/tempo restano
  // intatti; solo la camera torna alla vista di partenza.
  const [sceneGeneration, setSceneGeneration] = useState(0)
  // Finestra «Chiavi API» (T-072): bozza dei campi + nota d'errore.
  const [keysWindowOpen, setKeysWindowOpen] = useState(false)
  const [keysGoogleInput, setKeysGoogleInput] = useState('')
  const [keysIonInput, setKeysIonInput] = useState('')
  const [keysProviderInput, setKeysProviderInput] = useState<SceneDataProvider | ''>('')
  const [keysNote, setKeysNote] = useState<string | null>(null)
  // T-068: snapshot del caricamento dei tile del tileset di sessione (la % è
  // una stima, il conteggio pendente è esatto — ADR-021). null = nessun
  // evento ancora ricevuto: l'indicatore compare solo mentre c'è attività.
  const [tileLoad, setTileLoad] = useState<TileLoadProgressSnapshot | null>(null)
  const [baseDateMs, setBaseDateMs] = useState<number>(() => Date.now())
  const [sliderOffsetMin, setSliderOffsetMin] = useState(0)
  const [alignmentWindowOpen, setAlignmentWindowOpen] = useState(false)
  const [alignmentSearch, setAlignmentSearch] = useState<AlignmentSearchResult | null>(null)
  // Campo «Ricerca da» (T-048): istante di partenza della ricerca, editabile
  // anche nel passato. Vuoto/invalido → si parte dall'orario effettivo e il
  // valore usato torna nel campo; dopo l'adozione resta com'è, così l'elenco
  // mostrato corrisponde sempre al campo.
  const [alignmentFromInput, setAlignmentFromInput] = useState('')
  const [alignmentNote, setAlignmentNote] = useState<string | null>(null)
  const [alignmentDays, setAlignmentDays] = useState(DEFAULT_ALIGNMENT_DAYS)
  const [alignmentStepMin, setAlignmentStepMin] = useState<number>(
    DEFAULT_ALIGNMENT_SEARCH.stepMinutes,
  )
  const [alignmentToleranceDeg, setAlignmentToleranceDeg] = useState<number>(
    DEFAULT_ALIGNMENT_SEARCH.toleranceDeg,
  )
  // Ultimo candidato adottato (T-053): la riga corrispondente nell'elenco
  // appare in grassetto; a ogni nuova ricerca riparte da zero.
  const [adoptedAlignmentMs, setAdoptedAlignmentMs] = useState<number | null>(null)
  // Reverse Planner (T-060): stessa struttura della finestra Allineamenti.
  // I default di finestra/tolleranza (e il passo coarse e maxResults, non
  // editabili qui) sono quelli della Fase 6.
  const [reverseWindowOpen, setReverseWindowOpen] = useState(false)
  const [reverseSearch, setReverseSearch] = useState<ReverseAlignmentSearchResult | null>(null)
  // Campo «Ricerca da»: stessa semantica del campo Allineamenti (vuoto o
  // invalido → si parte dall'orario effettivo, che torna nel campo).
  const [reverseFromInput, setReverseFromInput] = useState('')
  const [reverseNote, setReverseNote] = useState<string | null>(null)
  const [reverseDays, setReverseDays] = useState(DEFAULT_ALIGNMENT_DAYS)
  const [reverseToleranceDeg, setReverseToleranceDeg] = useState<number>(
    DEFAULT_ALIGNMENT_SEARCH.toleranceDeg,
  )
  const [reverseMaxDistanceM, setReverseMaxDistanceM] = useState<number>(
    DEFAULT_REVERSE_MAX_DISTANCE_M,
  )
  // Campionamento del terreno in corso: la griglia è async (sampler Cesium sui
  // 3D Tiles), la ricerca che segue è sincrona e pura (ADR-018).
  const [reverseBusy, setReverseBusy] = useState(false)
  // Chiave del candidato adottato (data + distanza): riga in grassetto (T-053).
  const [adoptedReverseKey, setAdoptedReverseKey] = useState<string | null>(null)
  // Occlusione della linea di vista (T-064): report dell'ultima analisi o nota
  // d'errore (pattern reverseNote). Mentre la nuova analisi è in corso la riga
  // mostra «calcolo in corso» al posto del report precedente, che sembrava un
  // risultato vecchio (T-069, richiesta umano); il report/note resta l'ultimo
  // valido e viene scartato solo a punti nulli, coincidenti o in errore.
  const [occlusionReport, setOcclusionReport] = useState<SightLineReport | null>(null)
  const [occlusionNote, setOcclusionNote] = useState<string | null>(null)
  const [occlusionBusy, setOcclusionBusy] = useState(false)
  // Traiettoria della Luna nel cielo (T-075): campionamento del passaggio
  // sopra l'orizzonte che contiene l'orario in uso (o del prossimo), e spunta
  // di visibilità (accesa anche dal click su «Vista Luna»).
  const [moonPath, setMoonPath] = useState<MoonSkyPath | null>(null)
  const [moonPathVisible, setMoonPathVisible] = useState(false)
  const effectiveDate = new Date(effectiveTimeMs(baseDateMs, sliderOffsetMin))
  // Fase lunare all'orario in uso (geocentrica, standard): blocco a destra
  // della riga slider nella barra Tempo, % C/D nei risultati allineamenti.
  const phaseNow = moonPhase(effectiveDate)

  // Stato del Sole all'orario in uso (topocentrico, serve l'Osservatore):
  // blocco accanto alla Fase lunare nella barra Tempo (T-074); null senza
  // Observer → il blocco non compare, come le righe lunari nel box Dati.
  const sunStateNow = observer !== null ? sunTwilightState(observer, effectiveDate) : null

  // Cache della traiettoria (T-075): l'arco dipende solo dall'Observer e dal
  // passaggio sopra l'orizzonte selezionato. Muovere slider/±1 min dentro lo
  // stesso passaggio NON ricampiona (un ricalcolo costa ~400 chiamate di
  // moonTopocentric): la guardia confronta Observer e orario con la cache —
  // con `centerMs <= setDateMs` il passaggio «contenente o prossimo» è
  // invariato per costruzione di moonSkyPath.
  const moonPathCacheRef = useRef<{ observer: GeoPoint | null; path: MoonSkyPath | null }>({
    observer: null,
    path: null,
  })
  useEffect(() => {
    if (observer === null) {
      if (moonPathCacheRef.current.path !== null) {
        moonPathCacheRef.current = { observer: null, path: null }
        setMoonPath(null)
      }
      return
    }
    const centerMs = effectiveDate.getTime()
    const cached = moonPathCacheRef.current
    if (
      cached.path !== null &&
      cached.observer !== null &&
      cached.observer.latitudeDeg === observer.latitudeDeg &&
      cached.observer.longitudeDeg === observer.longitudeDeg &&
      cached.observer.heightM === observer.heightM &&
      centerMs <= cached.path.setDateMs
    ) {
      return
    }
    const path = moonSkyPath(observer, centerMs)
    moonPathCacheRef.current = { observer, path }
    setMoonPath(path)
  }, [observer, effectiveDate])

  const points: Record<PlannerPointId, GeoPoint | null> = { observer, target }

  function buildMoonRows(observerPoint: GeoPoint): MeasurementRow[] {
    const moon = moonTopocentric(observerPoint, effectiveDate)
    return [
      { label: 'Luna · Azimut', value: formatAngleDeg(moon.azimuthDeg) },
      { label: 'Luna · Altitudine', value: formatAngleDeg(moon.altitudeDeg) },
      { label: 'Luna · Distanza', value: formatDistanceM(moon.distanceM) },
      { label: 'Luna · Diametro', value: formatAngleDeg(moon.angularDiameterDeg, 4) },
    ]
  }

  /**
   * Riga «Allineamento ora» del box Dati (T-045): la stessa misura dei
   * candidati della ricerca (alignmentDegs), valutata sull'orario effettivo.
   * Nascosta se Observer e Target coincidono (linea di vista indefinita).
   */
  function buildAlignmentNowRows(observerPoint: GeoPoint, targetPoint: GeoPoint): MeasurementRow[] {
    const moon = moonTopocentric(observerPoint, effectiveDate)
    let offsets: AlignmentOffsets | null = null
    try {
      offsets = alignmentDegs(
        lineOfSightAzimuthDeg(observerPoint, targetPoint),
        verticalAngleDeg(observerPoint, targetPoint),
        moon,
      )
    } catch {
      // Punti coincidenti: righe nascoste (la nota esplicita è nella finestra di ricerca).
    }
    if (offsets === null) {
      return []
    }
    return [
      { label: 'Allineamento ora · Separazione', value: formatAngleDeg(offsets.separationDeg, 2) },
      { label: 'Allineamento ora · Offset', value: describeAlignmentOffsets(offsets) },
    ]
  }

  function handleScenePick(point: GeoPoint): void {
    if (activePoint === 'observer') {
      setObserver(point)
      // Il suolo di riferimento per l'altezza dal suolo è la quota del pick
      // (ADR-012): a ogni nuovo pick l'altezza dal suolo riparte da 0.
      setObserverGroundM(point.heightM)
    } else {
      setTarget(point)
    }
  }

  function clearActivePoint(): void {
    if (activePoint === 'observer') {
      setObserver(null)
      setObserverGroundM(null)
    } else {
      setTarget(null)
    }
  }

  /**
   * Applica una nuova posizione all'Observer dai CONTROLLI della card (T-037):
   * la camera viene traslata dello stesso delta 3D con orientamento invariato,
   * così la vista segue il punto. Il pick di un punto nuovo (handleScenePick)
   * NON passa da qui: riposizionare dalla scena è una scelta esplicita di
   * vista, non un aggiustamento.
   */
  function updateObserverPoint(next: GeoPoint): void {
    const viewer = viewerRef.current
    if (viewer !== null && !viewer.isDestroyed() && observer !== null) {
      moveCameraWithObserver(viewer, observer, next)
    }
    setObserver(next)
  }

  /** Alza/abbassa l'Observer della quantità indicata rispetto al suolo di pick. */
  function adjustObserverHeightAboveGround(deltaM: number): void {
    if (observer === null || observerGroundM === null) {
      return
    }
    updateObserverPoint(
      observerAtHeightAboveGround(
        observer,
        observerGroundM,
        observerHeightAboveGroundM(observer, observerGroundM) + deltaM,
      ),
    )
  }

  /** Altezza dal suolo inserita a mano (interi; vuoto/non numerico = nessun cambio). */
  function handleObserverHeightInput(value: string): void {
    if (observer === null || observerGroundM === null) {
      return
    }
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) {
      return
    }
    updateObserverPoint(observerAtHeightAboveGround(observer, observerGroundM, parsed))
  }

  /**
   * Sposta l'Observer in orizzontale della distanza scelta, lungo la direzione
   * indicata rispetto all'azimut corrente della vista (T-037): 0 = avanti,
   * 90 = destra, 180 = indietro, 270 = sinistra. T-038, modalità «attendi la
   * misura» (conferma umano 2026-10-28): la quota del suolo alla nuova lat/lon
   * viene campionata col sampler terreno (ADR-019/022) PRIMA di applicare lo
   * spostamento, e il punto arriva già appoggiato al nuovo suolo con l'altezza
   * dal suolo corrente conservata (clamp [0, 20 000] m in
   * `observerAtHeightAboveGround`). Suolo non determinabile (acqua o mesh non
   * caricata) o errore di campionamento → spostamento NON applicato + nota.
   * Mentre la misura è in attesa i comandi sono disabilitati: un'operazione
   * alla volta, niente debounce (la quota 429 è protetta dal backoff T-040).
   */
  async function moveObserverViewRelative(offsetDeg: number): Promise<void> {
    if (observer === null || observerMoveBusy) {
      return
    }
    const clickedObserver = observer
    const clickedGroundM = observerGroundM
    const viewer = viewerRef.current
    const headingDeg =
      viewer === null || viewer.isDestroyed() ? 0 : (viewer.camera.heading * 180) / Math.PI
    const azimuthDeg = (headingDeg + offsetDeg + 360) % 360
    if (clickedGroundM === null) {
      // Senza suolo di riferimento non c'è altezza dal suolo da conservare né
      // un riallineamento sensato: come in T-037 si sposta a quota invariata
      // (l'«Altezza dal suolo» resta «—» finché non si riposiziona col pick).
      updateObserverPoint(movePointOnWGS84(clickedObserver, azimuthDeg, observerMoveStepM))
      return
    }
    if (viewer === null || viewer.isDestroyed()) {
      // Il campionamento del suolo richiede la scena 3D (ADR-019): senza
      // viewer la misura non può partire e il punto non si sposta a cieco.
      setObserverMoveNote('La scena 3D non è pronta: spostamento non applicato.')
      return
    }
    const moved = movePointOnWGS84(clickedObserver, azimuthDeg, observerMoveStepM)
    setObserverMoveBusy(true)
    setObserverMoveNote(null)
    try {
      const sampler = createTerrainHeightSampler(viewer)
      const heights = await sampler([moved])
      if (observerRef.current !== clickedObserver) {
        // L'Osservatore è cambiato per altra via durante l'attesa (pick, ±/
        // input, Home, Reverse): lo spostamento richiesto non esiste più →
        // scartato senza nota (la scelta attuale è quella più recente).
        return
      }
      const groundM = heights[0] ?? null
      if (groundM === null) {
        setObserverMoveNote(
          'Suolo non determinabile alla nuova posizione (acqua o mesh non ancora caricata): spostamento non applicato.',
        )
        return
      }
      // Altezza dal suolo conservata: la nuova quota è nuovo suolo + AGL attuale.
      updateObserverPoint(
        observerAtHeightAboveGround(
          moved,
          groundM,
          observerHeightAboveGroundM(clickedObserver, clickedGroundM),
        ),
      )
      setObserverGroundM(groundM)
    } catch (error: unknown) {
      console.error('Spostamento Observer: campionamento del suolo fallito:', error)
      setObserverMoveNote(
        error instanceof Error && error.message !== ''
          ? `${error.message} Spostamento non applicato.`
          : 'Campionamento del suolo non riuscito: spostamento non applicato.',
      )
    } finally {
      setObserverMoveBusy(false)
    }
  }

  /**
   * Salva la posizione corrente dell'Osservatore come Home nel browser (T-051).
   * Il suolo di riferimento del pick (ADR-012) è salvato insieme al punto, così
   * al ripristino l'altezza dal suolo resta coerente senza ricampionare.
   */
  function saveObserverAsHome(): void {
    if (observer === null) {
      return
    }
    const home: SavedHome = {
      latitudeDeg: observer.latitudeDeg,
      longitudeDeg: observer.longitudeDeg,
      heightM: observer.heightM,
      groundHeightM: observerGroundM,
    }
    try {
      saveHome(home, window.localStorage)
    } catch {
      // Storage non scrivibile (es. navigazione privata): la sessione continua,
      // la Home semplicemente non sopravvive al ricaricamento.
      console.error('Home: salvataggio nel browser non riuscito (localStorage non disponibile).')
      return
    }
    setSavedHome(home)
  }

  /**
   * «Vai a Home» (T-051): con una Home salvata riporta l'Osservatore sul punto
   * salvato (con il suolo di riferimento del salvataggio) e ci vola sopra;
   * senza Home resta il volo di default su Brescia (HOME_VIEW), che non tocca
   * l'Osservatore.
   */
  function flyToHomeView(): void {
    const viewer = viewerRef.current
    if (viewer === null || viewer.isDestroyed()) {
      return
    }
    if (savedHome !== null) {
      setObserver(savedHomePoint(savedHome))
      setObserverGroundM(savedHome.groundHeightM)
      flyToOverhead(viewer, {
        longitudeDeg: savedHome.longitudeDeg,
        latitudeDeg: savedHome.latitudeDeg,
        altitudeM: (savedHome.groundHeightM ?? 0) + 500,
      })
      return
    }
    flyToOverhead(viewer, HOME_VIEW)
  }

  function flyToMoonView(): void {
    if (observer === null) {
      return
    }
    const viewer = viewerRef.current
    if (viewer === null || viewer.isDestroyed()) {
      return
    }
    const moon = moonTopocentric(observer, effectiveDate)
    // T-075: entrare in Vista Luna accende anche la traiettoria nel cielo
    // (la spunta «Traiettoria Luna» la spegne/riaccende).
    setMoonPathVisible(true)
    flyToObserverView(viewer, observer, moon.azimuthDeg, moon.altitudeDeg)
  }

  function runAlignmentSearch(): void {
    if (observer === null || target === null) {
      return
    }
    // «Ricerca da» (T-048): campo vuoto o invalido → si parte dall'orario
    // effettivo e il valore usato torna nel campo; altrimenti la ricerca usa
    // il campo così com'è (anche nel passato).
    const fromInputMs = localInputValueToMs(alignmentFromInput)
    const fromMs = Number.isNaN(fromInputMs) ? effectiveDate.getTime() : fromInputMs
    if (Number.isNaN(fromInputMs)) {
      setAlignmentFromInput(dateToLocalInputValue(new Date(fromMs)))
    }
    let losAzimuth: number
    let losAltitude: number
    try {
      losAzimuth = lineOfSightAzimuthDeg(observer, target)
      losAltitude = verticalAngleDeg(observer, target)
    } catch {
      setAlignmentNote('Linea di vista indefinita: Observer e Target coincidono.')
      setAlignmentSearch(null)
      setAlignmentWindowOpen(true)
      return
    }
    setAlignmentNote(null)
    // Nuova ricerca → elenco nuovo: nessuna riga resta evidenziata (T-053).
    setAdoptedAlignmentMs(null)
    setAlignmentSearch(
      searchMoonAlignments({
        observer,
        losAzimuthDeg: losAzimuth,
        losAltitudeDeg: losAltitude,
        fromDateMs: fromMs,
        durationHours: alignmentDays * 24,
        stepMinutes: alignmentStepMin,
        toleranceDeg: alignmentToleranceDeg,
        minMoonAltitudeDeg: DEFAULT_ALIGNMENT_SEARCH.minMoonAltitudeDeg,
        maxResults: DEFAULT_ALIGNMENT_SEARCH.maxResults,
      }),
    )
    setAlignmentWindowOpen(true)
  }

  function adoptAlignment(dateMs: number): void {
    setBaseDateMs(dateMs)
    setSliderOffsetMin(0)
    // La riga adottata resta in grassetto nell'elenco (T-053).
    setAdoptedAlignmentMs(dateMs)
    // La finestra resta aperta con l'elenco (T-046b, richiesta umana):
    // l'umano può adottare altri candidati senza premere Ricalcola.
  }

  /** Chiave stabile di una riga risultato del Reverse Planner (data + distanza). */
  function reverseCandidateKey(candidate: ReverseAlignmentCandidate): string {
    return `${candidate.dateMs}-${candidate.distanceM.toFixed(0)}`
  }

  /**
   * Reverse Planner (T-060): prima la griglia polare del terreno (async: il
   * sampler Cesium campiona i 3D Tiles in batch ≤ 512), poi la ricerca
   * temporale, sincrona e pura (ADR-018). Nessun ricaricamento dei 3D Tiles:
   * il sampling usa la stessa sessione già in scena e le quote non dipendono
   * dal tempo.
   */
  async function runReverseSearch(): Promise<void> {
    if (target === null) {
      return
    }
    const activeViewer = viewerRef.current
    if (activeViewer === null || activeViewer.isDestroyed()) {
      setReverseNote('La scena 3D non è pronta: attendi il caricamento e riprova.')
      setReverseSearch(null)
      setReverseWindowOpen(true)
      return
    }
    // «Ricerca da» come in Fase 6: vuoto/invalido → orario effettivo, che
    // torna nel campo.
    const fromInputMs = localInputValueToMs(reverseFromInput)
    const fromMs = Number.isNaN(fromInputMs) ? effectiveDate.getTime() : fromInputMs
    if (Number.isNaN(fromInputMs)) {
      setReverseFromInput(dateToLocalInputValue(new Date(fromMs)))
    }
    setReverseBusy(true)
    setReverseNote(null)
    setReverseSearch(null)
    setAdoptedReverseKey(null)
    try {
      const grid = await buildTerrainPolarGrid(
        target,
        scanDistancesM(REVERSE_SCAN_FIRST_DISTANCE_M, REVERSE_SCAN_STEP_M, reverseMaxDistanceM),
        createTerrainHeightSampler(activeViewer),
      )
      const totalCells = grid.columns.length * grid.distancesM.length
      const sampledCells = grid.columns.reduce(
        (count, column) => count + column.cells.filter((cell) => cell !== null).length,
        0,
      )
      if (sampledCells === 0) {
        setReverseNote(
          'Terreno non campionabile: nessuna quota disponibile attorno al Target (zona non coperta dalla mesh 3D o scaricamento fallito).',
        )
        return
      }
      const result = searchReverseAlignments({
        target,
        terrainGrid: grid,
        fromDateMs: fromMs,
        durationHours: reverseDays * 24,
        coarseStepMinutes: DEFAULT_ALIGNMENT_SEARCH.stepMinutes,
        toleranceDeg: reverseToleranceDeg,
        minMoonAltitudeDeg: DEFAULT_ALIGNMENT_SEARCH.minMoonAltitudeDeg,
        maxResults: DEFAULT_ALIGNMENT_SEARCH.maxResults,
      })
      setReverseSearch(result)
      if (sampledCells < totalCells) {
        setReverseNote(
          `Copertura terreno parziale: ${sampledCells} celle campionate su ${totalCells}; le distanze senza quota sono escluse.`,
        )
      }
    } catch (error) {
      setReverseNote(
        error instanceof Error
          ? `Ricerca Reverse Planner fallita: ${error.message}`
          : 'Ricerca Reverse Planner fallita.',
      )
    } finally {
      setReverseBusy(false)
      setReverseWindowOpen(true)
    }
  }

  /**
   * Adotta un candidato del Reverse Planner: sposta l'Observer sul punto
   * trovato (quota = suolo campionato, altezza dal suolo 0 per costruzione) e
   * imposta l'orario. Come in Fase 6 la finestra resta aperta.
   */
  function adoptReverseCandidate(candidate: ReverseAlignmentCandidate): void {
    setObserver(candidate.observer)
    // Il suolo di riferimento del nuovo Observer è la quota campionata: la
    // riga «Altezza dal suolo» resta coerente senza ricampionare (ADR-012).
    setObserverGroundM(candidate.observer.heightM)
    setBaseDateMs(candidate.dateMs)
    setSliderOffsetMin(0)
    setAdoptedReverseKey(reverseCandidateKey(candidate))
  }

  // Occlusione della linea di vista (T-064): con Observer e Target posati
  // campiona il suolo lungo la corda con il sampler ADR-019 (quote alla
  // massima risoluzione dei 3D Tiles in scena). Le quote non dipendono dal
  // tempo: l'effetto non ascolta data/ora (come il Reverse Planner). Debounce
  // per coalescere le modifiche ravvicinate; `viewer` in dipendenze serve solo
  // a riarmare l'analisi quando la scena diventa pronta.
  useEffect(() => {
    if (observer === null || target === null) {
      setOcclusionReport(null)
      setOcclusionNote(null)
      setOcclusionBusy(false)
      return undefined
    }
    const analysisViewer = viewerRef.current
    if (analysisViewer === null || analysisViewer.isDestroyed()) {
      setOcclusionReport(null)
      setOcclusionNote('La scena 3D non è pronta: attendi il caricamento e riprova.')
      setOcclusionBusy(false)
      return undefined
    }
    // Punti coincidenti: corda di lunghezza nulla, linea di vista indefinita.
    // La condizione canonica è il throw di geodesy (stessa segnalazione delle
    // misure e della ricerca): riusarlo evita di duplicare la soglia.
    try {
      lineOfSightAzimuthDeg(observer, target)
    } catch {
      setOcclusionReport(null)
      setOcclusionNote('Linea di vista indefinita: Observer e Target coincidono.')
      setOcclusionBusy(false)
      return undefined
    }
    // Analisi in arrivo (già durante il debounce): la riga passa subito a
    // «scarico i tile della linea di vista» per non lasciare a schermo un
    // esito ormai vecchio (T-069; testo T-070: l'analisi include lo scarico
    // dei tile mancanti lungo la linea). Il flag torna falso quando arriva
    // il nuovo esito o una guardia
    // lo disattiva; il cleanup non lo tocca perché ogni ri-esecuzione lo
    // risetta prima del render.
    setOcclusionBusy(true)
    let cancelled = false
    const debounceTimer = window.setTimeout(() => {
      void analyzeSightLine(observer, target, createTerrainHeightSampler(analysisViewer))
        .then((report) => {
          if (!cancelled) {
            setOcclusionReport(report)
            setOcclusionNote(null)
            setOcclusionBusy(false)
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setOcclusionReport(null)
            setOcclusionNote(
              error instanceof Error && error.message !== ''
                ? error.message
                : 'Campionamento del terreno non riuscito (dettagli in console).',
            )
            setOcclusionBusy(false)
            console.error('Analisi occlusione linea di vista fallita:', error)
          }
        })
    }, OCCLUSION_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(debounceTimer)
    }
  }, [observer, target, viewer])

  function flyToObserverOverhead(): void {
    if (observer === null) {
      return
    }
    const viewer = viewerRef.current
    if (viewer === null || viewer.isDestroyed()) {
      return
    }
    flyToOverhead(viewer, {
      longitudeDeg: observer.longitudeDeg,
      latitudeDeg: observer.latitudeDeg,
      altitudeM: observer.heightM + 100,
    })
  }

  // Finestra «Chiavi API» (T-072): si apre con le bozze uguali ai valori
  // salvati, così i campi mostrano cosa c'è nel browser adesso.
  function openKeysWindow(): void {
    setKeysGoogleInput(userKeys.googleMapsApiKey)
    setKeysIonInput(userKeys.cesiumIonToken)
    setKeysProviderInput(userProvider ?? '')
    setKeysNote(null)
    setKeysWindowOpen(true)
  }

  /**
   * Salva chiavi e provider dell'utilizzatore nel localStorage e ricrea la
   * scena: CesiumViewer legge le credenziali solo al mount, quindi
   * l'applicazione è un remount (sceneGeneration → key su <CesiumViewer>).
   * Il tileset di sessione è ripartito per credenziale
   * (resolveTilesetSessionKey): credenziale diversa → tileset nuovo.
   */
  function applyUserKeys(): void {
    const keys: UserApiKeys = {
      googleMapsApiKey: keysGoogleInput.trim(),
      cesiumIonToken: keysIonInput.trim(),
    }
    try {
      saveUserApiKeys(keys, window.localStorage)
      saveUserProvider(keysProviderInput, window.localStorage)
    } catch {
      setKeysNote(
        'Salvataggio nel browser non riuscito (localStorage non disponibile): le chiavi non sono state salvate.',
      )
      return
    }
    setUserKeys(keys)
    setUserProvider(keysProviderInput === '' ? undefined : keysProviderInput)
    setSceneGeneration((generation) => generation + 1)
    setKeysWindowOpen(false)
  }

  /** Torna alle chiavi del sito: azzera il localStorage e ricrea la scena. */
  function removeUserKeys(): void {
    try {
      clearUserApiKeys(window.localStorage)
      saveUserProvider('', window.localStorage)
    } catch {
      setKeysNote('Pulizia dello storage non riuscita (localStorage non disponibile).')
      return
    }
    setUserKeys({ googleMapsApiKey: '', cesiumIonToken: '' })
    setUserProvider(undefined)
    setSceneGeneration((generation) => generation + 1)
    setKeysWindowOpen(false)
  }

  return (
    <div style={ROOT_STYLE}>
      <div style={TOOLBAR_STYLE}>
        {(['observer', 'target'] as const).map((id) => {
          const point = points[id]
          return (
            <button
              key={id}
              onClick={() => setActivePoint(id)}
              style={activePoint === id ? ACTIVE_BUTTON_STYLE : BUTTON_STYLE}
              title="Seleziona il punto, poi clicca sulla scena per posizionarlo"
            >
              {PLANNER_POINT_LABELS[id]}: {point === null ? '— clicca sulla scena' : formatPoint(point)}
            </button>
          )
        })}
        <button
          onClick={clearActivePoint}
          style={BUTTON_STYLE}
          title="Rimuove il punto attivo"
        >
          Azzera
        </button>
        <button
          onClick={flyToHomeView}
          style={BUTTON_STYLE}
          title={
            savedHome === null
              ? 'Vai a Home: Piazza della Loggia, centro di Brescia (45,5397°N 10,2197°E), ≈ 500 m sul suolo'
              : `Vai a Home (${formatPoint(savedHomePoint(savedHome))}): riporta l'Osservatore sulla posizione salvata nel browser`
          }
        >
          Vai a Home
        </button>
        <button
          onClick={saveObserverAsHome}
          style={BUTTON_STYLE}
          disabled={observer === null}
          title="Salva la posizione attuale dell'Osservatore come Home nel browser (localStorage): al prossimo avvio l'app riparte da lì e «Vai a Home» ci riporta"
        >
          Imposta come Home
        </button>
        <button
          onClick={flyToMoonView}
          style={BUTTON_STYLE}
          title="Camera sull'Osservatore rivolta verso la Luna (posa reale)"
        >
          Vista Luna
        </button>
        <label
          style={ROW_STYLE}
          title="Traiettoria della Luna nel cielo: arco tratteggiato ciano dal sorgere al tramonto del passaggio sopra l'orizzonte dell'orario in uso (o del prossimo, se ora la Luna è sotto l'orizzonte). Si attiva anche premendo «Vista Luna»."
        >
          Traiettoria Luna{' '}
          <input
            type="checkbox"
            checked={moonPathVisible}
            disabled={observer === null}
            onChange={(event) => setMoonPathVisible(event.target.checked)}
          />
        </label>
        <button
          onClick={flyToObserverOverhead}
          style={BUTTON_STYLE}
          disabled={observer === null}
          title="Camera 100 m sopra l'Osservatore, puntata su di lui (vista dall'alto)"
        >
          Sopra Observer · 100 m
        </button>
        <button
          onClick={runAlignmentSearch}
          style={BUTTON_STYLE}
          disabled={observer === null || target === null}
          title="Cerca gli istanti in cui la Luna passa sulla linea Observer→Target, dal campo «Ricerca da» in avanti"
        >
          Cerca allineamenti Luna
        </button>
        <button
          onClick={() => {
            void runReverseSearch()
          }}
          disabled={reverseBusy || target === null}
          style={BUTTON_STYLE}
          title="Reverse Planner: cerca dove e quando stare per avere la Luna dietro/il Target (richiede il Target; campiona il terreno sui 3D Tiles in scena, senza ricaricarli)"
        >
          {reverseBusy ? 'Reverse: campionamento…' : 'Cerca luogo per il Target'}
        </button>
        <label
          style={ROW_STYLE}
          title="Qualità della mesh 3D: Alta = massimo dettaglio, Media = intermedia, Eco = meno tile possibile (default). Quote di suolo e occlusione non cambiano; il cambio si applica senza ricaricare la scena."
        >
          Qualità tiles{' '}
          <select
            value={tileQuality}
            onChange={(event) => setTileQuality(resolveTileQuality(event.target.value).level)}
            aria-label="Livello di qualità dei tiles 3D (Alta, Media o Eco)"
          >
            <option value="alta">Alta</option>
            <option value="media">Media (default)</option>
            <option value="eco">Eco</option>
          </select>
        </label>
        {tileLoad !== null && (tileLoad.busy || tileLoad.percent < 100) && (
          <span
            style={TILE_LOAD_STYLE}
            title="Avanzamento del caricamento dei tile 3D. Percentuale stimata: Cesium non espone il totale dei tile da caricare (dettagli: manuale §9)."
          >
            Caricamento tiles: {tileLoad.percent}%
          </span>
        )}
        <button
          onClick={openKeysWindow}
          style={BUTTON_STYLE}
          title="Inserisci le tue chiavi API (chiave Google Maps e/o token Cesium ion): restano in questo browser, sovrascrivono quelle del sito e si applicano ricreando la scena"
        >
          Chiavi API
        </button>
        <button
          onClick={openManualeWindow}
          style={BUTTON_STYLE}
          title="Apre il manuale utente (MANUALE.md) in una finestra separata"
        >
          Manuale
        </button>
        <div
          style={DEV_STATUS_STYLE}
          title="Ultimo task completato nel piano di sviluppo (docs/ai/TASKS.md): aggiornato a ogni task chiuso"
        >
          Sviluppo: <strong>{DEVELOPMENT_STATUS}</strong>
        </div>
      </div>
      <div style={MAIN_ROW_STYLE}>
        <div style={SIDEBAR_STYLE}>
          <CameraPovCard viewer={viewer} />
          {observer !== null && (
            <div style={CARD_STYLE}>
              <div style={ROW_STYLE}>
                Quota (ellissoide): <strong>{observer.heightM.toFixed(0)} m</strong>
              </div>
              <div style={ROW_STYLE}>
                Altezza dal suolo:{' '}
                <strong>
                  {observerGroundM === null
                    ? '—'
                    : `${observerHeightAboveGroundM(observer, observerGroundM).toFixed(0)} m`}
                </strong>
              </div>
              {observerGroundM !== null && (
                <div style={OBSERVER_HEIGHT_ROW_STYLE}>
                  <button
                    onClick={() => adjustObserverHeightAboveGround(-observerHeightStepM)}
                    style={BUTTON_STYLE}
                    title="Abbassa l'Observer verso il suolo"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={observerHeightAboveGroundM(observer, observerGroundM)}
                    onChange={(event) => handleObserverHeightInput(event.target.value)}
                    style={NUMBER_INPUT_STYLE}
                    aria-label="Altezza dell'Observer dal suolo, in metri"
                  />
                  <button
                    onClick={() => adjustObserverHeightAboveGround(observerHeightStepM)}
                    style={BUTTON_STYLE}
                    title="Alza l'Observer dal suolo"
                  >
                    +
                  </button>
                  <label style={ROW_STYLE}>
                    passo{' '}
                    <select
                      value={observerHeightStepM}
                      onChange={(event) =>
                        setObserverHeightStepM(Number.parseInt(event.target.value, 10))
                      }
                      aria-label="Passo dei bottoni ± dell'altezza dal suolo"
                    >
                      <option value={1}>1 m</option>
                      <option value={10}>10 m</option>
                      <option value={100}>100 m</option>
                    </select>
                  </label>
                </div>
              )}
              <div style={ROW_STYLE}>Sposta (rispetto alla direzione di vista):</div>
              <div style={OBSERVER_MOVE_ROW_STYLE}>
                <button
                  onClick={() => void moveObserverViewRelative(270)}
                  disabled={observerMoveBusy}
                  style={BUTTON_STYLE}
                  title="Sposta l'Observer a sinistra della direzione di vista; la vista segue il punto. Prima il suolo alla nuova posizione viene misurato, poi il punto si sposta già appoggiato"
                >
                  ◀ sinistra
                </button>
                <button
                  onClick={() => void moveObserverViewRelative(0)}
                  disabled={observerMoveBusy}
                  style={BUTTON_STYLE}
                  title="Sposta l'Observer avanti nella direzione di vista; la vista segue il punto. Prima il suolo alla nuova posizione viene misurato, poi il punto si sposta già appoggiato"
                >
                  ▲ avanti
                </button>
                <button
                  onClick={() => void moveObserverViewRelative(180)}
                  disabled={observerMoveBusy}
                  style={BUTTON_STYLE}
                  title="Sposta l'Observer all'indietro rispetto alla direzione di vista; la vista segue il punto. Prima il suolo alla nuova posizione viene misurato, poi il punto si sposta già appoggiato"
                >
                  ▼ indietro
                </button>
                <button
                  onClick={() => void moveObserverViewRelative(90)}
                  disabled={observerMoveBusy}
                  style={BUTTON_STYLE}
                  title="Sposta l'Observer a destra della direzione di vista; la vista segue il punto. Prima il suolo alla nuova posizione viene misurato, poi il punto si sposta già appoggiato"
                >
                  ▶ destra
                </button>
              </div>
              {observerMoveBusy && (
                <div
                  style={ROW_STYLE}
                  title="Prima misura su una zona non ancora vista: l'attesa dipende dal download dei tile necessari (timeout 60 s)."
                >
                  Misuro il suolo alla nuova posizione…
                </div>
              )}
              {!observerMoveBusy && observerMoveNote !== null && (
                <div style={ROW_STYLE}>{observerMoveNote}</div>
              )}
              <div style={OBSERVER_HEIGHT_ROW_STYLE}>
                <label style={ROW_STYLE}>
                  passo{' '}
                  <select
                    value={observerMoveStepM}
                    onChange={(event) =>
                      setObserverMoveStepM(Number.parseInt(event.target.value, 10))
                    }
                    aria-label="Passo dei comandi di spostamento dell'Observer"
                  >
                    <option value={1}>1 m</option>
                    <option value={10}>10 m</option>
                    <option value={100}>100 m</option>
                  </select>
                </label>
              </div>
            </div>
          )}
          {observer === null && target === null && (
            <div style={SIDEBAR_HINT_STYLE}>
              Clicca sulla scena per posizionare Observer e Target: qui compaiono i dati.
            </div>
          )}
          {(observer !== null || target !== null) && (
            <div style={CARD_STYLE}>
              {observer !== null && target !== null && (
                <>
                  {buildMeasurements(observer, target).map((row) => (
                    <div key={row.label} style={ROW_STYLE}>
                      {row.label}: <strong>{row.value}</strong>
                    </div>
                  ))}
                  <hr style={DIVIDER_STYLE} />
                </>
              )}
              {observer !== null && buildMoonRows(observer).map((row) => (
                <div key={row.label} style={ROW_STYLE}>
                  {row.label}: <strong>{row.value}</strong>
                </div>
              ))}
              {observer !== null && target !== null &&
                buildAlignmentNowRows(observer, target).map((row) => (
                  <div key={row.label} style={ROW_STYLE}>
                    {row.label}: <strong>{row.value}</strong>
                  </div>
                ))}
              {observer !== null && target !== null && occlusionBusy && (
                <div style={ROW_STYLE}>Occlusione: scarico i tile della linea di vista…</div>
              )}
              {observer !== null && target !== null && !occlusionBusy && occlusionReport !== null && (
                <div style={ROW_STYLE}>
                  Occlusione: <strong>{describeOcclusion(occlusionReport)}</strong>
                </div>
              )}
              {observer !== null && target !== null && !occlusionBusy && occlusionNote !== null && (
                <div style={ROW_STYLE}>Occlusione: {occlusionNote}</div>
              )}
              {observer === null && target !== null && (
                <div style={ROW_STYLE}>Posiziona l'Osservatore per i valori della Luna.</div>
              )}
            </div>
          )}
          {alignmentWindowOpen && (
            <div style={ALIGNMENT_WINDOW_STYLE}>
              <div style={WINDOW_HEADER_STYLE}>
                <span>Luna sulla linea Observer→Target</span>
                <button
                  onClick={runAlignmentSearch}
                  style={BUTTON_STYLE}
                  title="Ripete la ricerca con i parametri e la data «Ricerca da» attuali"
                >
                  Ricalcola
                </button>
                <button
                  onClick={() => setAlignmentWindowOpen(false)}
                  style={BUTTON_STYLE}
                  title="Chiude la finestra"
                >
                  ×
                </button>
              </div>
              <div style={WINDOW_PARAMS_STYLE}>
                <label style={PARAM_LABEL_STYLE}>
                  Finestra (giorni)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={alignmentDays}
                    onChange={(event) =>
                      setAlignmentDays(
                        clampInt(event.target.value, 1, 365, DEFAULT_ALIGNMENT_DAYS),
                      )
                    }
                    style={NUMBER_INPUT_STYLE}
                  />
                </label>
                <label style={PARAM_LABEL_STYLE}>
                  Passo (min)
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={alignmentStepMin}
                    onChange={(event) =>
                      setAlignmentStepMin(
                        clampInt(event.target.value, 1, 60, DEFAULT_ALIGNMENT_SEARCH.stepMinutes),
                      )
                    }
                    style={NUMBER_INPUT_STYLE}
                  />
                </label>
                <label style={PARAM_LABEL_STYLE}>
                  Tolleranza (°)
                  <input
                    type="number"
                    min={0.05}
                    max={10}
                    step={0.05}
                    value={alignmentToleranceDeg}
                    onChange={(event) =>
                      setAlignmentToleranceDeg(
                        clampFloat(
                          event.target.value,
                          0.05,
                          10,
                          DEFAULT_ALIGNMENT_SEARCH.toleranceDeg,
                        ),
                      )
                    }
                    style={NUMBER_INPUT_STYLE}
                  />
                </label>
                <label style={PARAM_LABEL_STYLE}>
                  Ricerca da
                  <input
                    type="datetime-local"
                    value={alignmentFromInput}
                    onChange={(event) => setAlignmentFromInput(event.target.value)}
                    title="Istante di partenza della ricerca, anche nel passato; la fine è inizio + Finestra (giorni)"
                  />
                </label>
              </div>
              <div style={ROW_STYLE}>
                max {DEFAULT_ALIGNMENT_SEARCH.maxResults} risultati per ricerca
              </div>
              {alignmentNote !== null && <div style={ROW_STYLE}>{alignmentNote}</div>}
              {alignmentNote === null && alignmentSearch !== null &&
                alignmentSearch.candidates.length === 0 && (
                  <div style={ROW_STYLE}>Nessun allineamento nella finestra cercata.</div>
                )}
              {alignmentSearch !== null &&
                alignmentSearch.totalFound > alignmentSearch.candidates.length && (
                  <div style={ROW_STYLE}>
                    Trovati {alignmentSearch.totalFound} passaggi · mostro i primi{' '}
                    {alignmentSearch.candidates.length} (i migliori per separazione)
                  </div>
                )}
              {alignmentSearch !== null && alignmentSearch.discardedBelowHorizon > 0 && (
                <div style={ROW_STYLE}>
                  {alignmentSearch.discardedBelowHorizon}{' '}
                  {alignmentSearch.discardedBelowHorizon === 1
                    ? 'passaggio scartato'
                    : 'passaggi scartati'}{' '}
                  (Luna sotto l'orizzonte)
                </div>
              )}
              {observer !== null &&
                alignmentSearch?.candidates.map((candidate) => (
                  <button
                    key={candidate.dateMs}
                    onClick={() => adoptAlignment(candidate.dateMs)}
                    style={
                      candidate.dateMs === adoptedAlignmentMs
                        ? ALIGNMENT_ROW_ADOPTED_STYLE
                        : ALIGNMENT_ROW_BUTTON_STYLE
                    }
                    title="Adotta questo istante come data/ora della vista"
                  >
                    <div style={ROW_STYLE}>
                      {formatLocalDateTime(new Date(candidate.dateMs))} · sep{' '}
                      {formatAngleDeg(candidate.separationDeg, 2)} ·{' '}
                      {describeAlignmentOffsets(candidate)}
                    </div>
                    <div>
                      fase {moonPhaseLabel(moonPhase(new Date(candidate.dateMs)))} · sole:{' '}
                      {sunTwilightLabel(sunTwilightState(observer, new Date(candidate.dateMs)))}
                    </div>
                  </button>
                ))}
            </div>
          )}
          {reverseWindowOpen && (
            <div style={ALIGNMENT_WINDOW_STYLE}>
              <div style={WINDOW_HEADER_STYLE}>
                <span>Reverse Planner · Luna dietro/il Target</span>
                <button
                  onClick={() => {
                    void runReverseSearch()
                  }}
                  disabled={reverseBusy}
                  style={BUTTON_STYLE}
                  title="Ripete campionamento del terreno e ricerca con i parametri attuali"
                >
                  Ricalcola
                </button>
                <button
                  onClick={() => setReverseWindowOpen(false)}
                  style={BUTTON_STYLE}
                  title="Chiude la finestra"
                >
                  ×
                </button>
              </div>
              <div style={WINDOW_PARAMS_STYLE}>
                <label style={PARAM_LABEL_STYLE}>
                  Finestra (giorni)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={reverseDays}
                    onChange={(event) =>
                      setReverseDays(clampInt(event.target.value, 1, 365, DEFAULT_ALIGNMENT_DAYS))
                    }
                    style={NUMBER_INPUT_STYLE}
                  />
                </label>
                <label style={PARAM_LABEL_STYLE}>
                  Tolleranza (°)
                  <input
                    type="number"
                    min={0.05}
                    max={10}
                    step={0.05}
                    value={reverseToleranceDeg}
                    onChange={(event) =>
                      setReverseToleranceDeg(
                        clampFloat(
                          event.target.value,
                          0.05,
                          10,
                          DEFAULT_ALIGNMENT_SEARCH.toleranceDeg,
                        ),
                      )
                    }
                    style={NUMBER_INPUT_STYLE}
                  />
                </label>
                <label style={PARAM_LABEL_STYLE}>
                  Distanza max (m)
                  <input
                    type="number"
                    min={100}
                    max={20000}
                    step={100}
                    value={reverseMaxDistanceM}
                    onChange={(event) =>
                      setReverseMaxDistanceM(
                        clampInt(event.target.value, 100, 20000, DEFAULT_REVERSE_MAX_DISTANCE_M),
                      )
                    }
                    style={NUMBER_INPUT_STYLE}
                    title="Distanza massima Observer↔Target esplorata lungo il radiale"
                  />
                </label>
                <label style={PARAM_LABEL_STYLE}>
                  Ricerca da
                  <input
                    type="datetime-local"
                    value={reverseFromInput}
                    onChange={(event) => setReverseFromInput(event.target.value)}
                    title="Istante di partenza della ricerca, anche nel passato; la fine è inizio + Finestra (giorni)"
                  />
                </label>
              </div>
              <div style={ROW_STYLE}>
                max {DEFAULT_ALIGNMENT_SEARCH.maxResults} risultati per ricerca
              </div>
              {reverseBusy && <div style={ROW_STYLE}>Campionamento del terreno in corso…</div>}
              {reverseNote !== null && <div style={ROW_STYLE}>{reverseNote}</div>}
              {reverseNote === null && reverseSearch !== null &&
                reverseSearch.candidates.length === 0 && (
                  <div style={ROW_STYLE}>Nessun candidato nella finestra cercata.</div>
                )}
              {reverseSearch !== null &&
                reverseSearch.totalFound > reverseSearch.candidates.length && (
                  <div style={ROW_STYLE}>
                    Trovati {reverseSearch.totalFound} passaggi · mostro i primi{' '}
                    {reverseSearch.candidates.length} (i migliori per separazione)
                  </div>
                )}
              {reverseSearch !== null && reverseSearch.discardedBelowHorizon > 0 && (
                <div style={ROW_STYLE}>
                  {reverseSearch.discardedBelowHorizon}{' '}
                  {reverseSearch.discardedBelowHorizon === 1
                    ? 'passaggio scartato'
                    : 'passaggi scartati'}{' '}
                  (Luna sotto l'orizzonte)
                </div>
              )}
              {reverseSearch !== null && reverseSearch.discardedRefinement > 0 && (
                <div style={ROW_STYLE}>
                  {reverseSearch.discardedRefinement}{' '}
                  {reverseSearch.discardedRefinement === 1
                    ? 'passaggio scartato'
                    : 'passaggi scartati'}{' '}
                  (fuori tolleranza al ricalcolo esatto)
                </div>
              )}
              {reverseSearch?.candidates.map((candidate) => (
                <button
                  key={reverseCandidateKey(candidate)}
                  onClick={() => adoptReverseCandidate(candidate)}
                  style={
                    reverseCandidateKey(candidate) === adoptedReverseKey
                      ? ALIGNMENT_ROW_ADOPTED_STYLE
                      : ALIGNMENT_ROW_BUTTON_STYLE
                  }
                  title="Adotta: sposta l'Observer sul punto candidato (quota = suolo campionato) e imposta l'orario"
                >
                  <div style={ROW_STYLE}>
                    {formatPoint(candidate.observer)} · {formatDistanceM(candidate.distanceM)} dal
                    Target
                  </div>
                  <div style={ROW_STYLE}>
                    {formatLocalDateTime(new Date(candidate.dateMs))} · sep{' '}
                    {formatAngleDeg(candidate.separationDeg, 2)} ·{' '}
                    {describeAlignmentOffsets(candidate)}
                  </div>
                  <div>
                    fase {moonPhaseLabel(moonPhase(new Date(candidate.dateMs)))}
                  </div>
                </button>
              ))}
            </div>
          )}
          {keysWindowOpen && (
            <div style={ALIGNMENT_WINDOW_STYLE}>
              <div style={WINDOW_HEADER_STYLE}>
                <span>Chiavi API</span>
                <button
                  onClick={() => setKeysWindowOpen(false)}
                  style={BUTTON_STYLE}
                  title="Chiude la finestra"
                >
                  ×
                </button>
              </div>
              <div style={ROW_STYLE}>
                In uso:{' '}
                <strong>
                  {userKeys.googleMapsApiKey !== '' ||
                  userKeys.cesiumIonToken !== '' ||
                  userProvider !== undefined
                    ? 'configurazione tua (questo browser)'
                    : 'chiavi del sito (build)'}
                </strong>
              </div>
              <div style={ROW_STYLE}>
                Le chiavi qui sotto sovrascrivono quelle del sito e restano nel localStorage di
                questo browser: vengono usate solo verso Google e Cesium ion.
              </div>
              <label style={PARAM_LABEL_STYLE}>
                Google Maps API key (provider «google»)
                <input
                  type="password"
                  value={keysGoogleInput}
                  onChange={(event) => setKeysGoogleInput(event.target.value)}
                  style={KEY_INPUT_STYLE}
                  autoComplete="off"
                  spellCheck={false}
                  title="Chiave della Map Tiles API (console Google Cloud): usata quando il provider è «google»"
                />
              </label>
              <label style={PARAM_LABEL_STYLE}>
                Token Cesium ion (provider «google-ion»)
                <input
                  type="password"
                  value={keysIonInput}
                  onChange={(event) => setKeysIonInput(event.target.value)}
                  style={KEY_INPUT_STYLE}
                  autoComplete="off"
                  spellCheck={false}
                  title="Token da ion.cesium.com/tokens con l'asset Google Photorealistic 3D Tiles abilitato: usato quando il provider è «google-ion»"
                />
              </label>
              <label style={PARAM_LABEL_STYLE}>
                Provider della scena
                <select
                  value={keysProviderInput}
                  onChange={(event) =>
                    setKeysProviderInput(event.target.value as SceneDataProvider | '')
                  }
                  title="Sovrascrive il provider di default del sito; ?provider= nell'URL ha comunque la priorità"
                >
                  <option value="">Come da sito / URL</option>
                  <option value="google">Google diretto (la tua chiave)</option>
                  <option value="google-ion">Cesium ion (il tuo token)</option>
                </select>
              </label>
              <div style={WINDOW_PARAMS_STYLE}>
                <button
                  onClick={applyUserKeys}
                  style={BUTTON_STYLE}
                  title="Salva le chiavi e la scelta di provider in questo browser e ricrea la scena con le nuove credenziali"
                >
                  Salva e applica
                </button>
                <button
                  onClick={removeUserKeys}
                  style={BUTTON_STYLE}
                  disabled={
                    userKeys.googleMapsApiKey === '' &&
                    userKeys.cesiumIonToken === '' &&
                    userProvider === undefined
                  }
                  title="Rimuove chiavi e provider salvati in questo browser: tornano in uso le chiavi del sito"
                >
                  Rimuovi le mie chiavi
                </button>
              </div>
              {keysNote !== null && <div style={ROW_STYLE}>{keysNote}</div>}
              <div style={ROW_STYLE}>
                «Salva e applica» ricrea la scena: la camera torna alla vista di partenza,
                Observer/Target e orario restano dove sono.
              </div>
            </div>
          )}
        </div>
        <div style={VIEW_CONTAINER_STYLE}>
          <CesiumViewer
            key={sceneGeneration}
            observer={observer}
            target={target}
            time={effectiveDate}
            moonPath={moonPath}
            moonPathVisible={moonPathVisible}
            occlusionPoint={
              occlusionReport !== null && occlusionReport.status === 'occluded'
                ? occlusionReport.mostRestrictive
                : null
            }
            tileQuality={tileQuality}
            onTileLoadProgress={setTileLoad}
            onScenePick={handleScenePick}
            onViewerReady={(viewer) => {
              viewerRef.current = viewer
              setViewer(viewer)
            }}
          />
        </div>
      </div>
      <div style={TEMPO_CARD_STYLE}>
        <div style={TEMPO_LEFT_STYLE}>
          <div style={TIME_ROW_STYLE}>
            <label style={ROW_STYLE}>
              Data/ora (fuso: {browserTimeZone()})
              <input
                type="datetime-local"
                value={dateToLocalInputValue(new Date(baseDateMs))}
                onChange={(event) => {
                  const ms = localInputValueToMs(event.target.value)
                  if (!Number.isNaN(ms)) {
                    setBaseDateMs(ms)
                    setSliderOffsetMin(0)
                  }
                }}
              />
            </label>
            <button
              onClick={() => setBaseDateMs(baseDateMs - 60_000)}
              style={BUTTON_STYLE}
              title="Indietro di 1 minuto (non muove lo slider)"
            >
              −1 min
            </button>
            <button
              onClick={() => setBaseDateMs(baseDateMs + 60_000)}
              style={BUTTON_STYLE}
              title="Avanti di 1 minuto (non muove lo slider)"
            >
              +1 min
            </button>
          </div>
          <div style={TIME_ROW_STYLE}>
            <div
              style={ROW_STYLE}
              title="Orario effettivo della scena (Data/ora + slider): aggiorna con slider, ±1 min e adozioni"
            >
              Orario in uso: <strong>{formatLocalDateTime(effectiveDate)}</strong>
            </div>
            <input
              type="range"
              min={-720}
              max={720}
              step={5}
              value={sliderOffsetMin}
              onChange={(event) => setSliderOffsetMin(Number(event.target.value))}
              style={{ width: 220 }}
              aria-label="Scostamento temporale in minuti"
            />
            <span>
              {sliderOffsetMin >= 0 ? '+' : ''}
              {sliderOffsetMin} min
            </span>
            <button
              onClick={() => {
                setBaseDateMs(Date.now())
                setSliderOffsetMin(0)
              }}
              style={BUTTON_STYLE}
            >
              Adesso
            </button>
          </div>
          <div style={ROW_STYLE}>
            Tempo effettivo (UTC): {effectiveDate.toISOString().replace('T', ' ').slice(0, 19)} UTC
            · ora locale {localUtcOffsetLabel(effectiveDate)} (con ora legale/solare del fuso{' '}
            {browserTimeZone()})
          </div>
        </div>
        <MoonPhaseCard phase={phaseNow} />
        {sunStateNow !== null && <SunStateCard state={sunStateNow} />}
      </div>
    </div>
  )
}

