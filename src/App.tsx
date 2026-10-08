import { useRef, useState } from 'react'
import type { Viewer } from 'cesium'
import CesiumViewer from './cesium/CesiumViewer'
import { flyToObserverView, flyToOverhead } from './cesium/camera'
import { moonTopocentric } from './astronomy/moon'
import { DEMO_VIEW, PLANNER_POINT_LABELS, type PlannerPointId } from './planning/points'
import { buildMeasurements, type MeasurementRow } from './planning/measurements'
import {
  DEFAULT_ALIGNMENT_DAYS,
  DEFAULT_ALIGNMENT_SEARCH,
  searchMoonAlignments,
  type AlignmentCandidate,
} from './planning/alignment'
import { formatAngleDeg, formatDistanceM } from './planning/format'
import {
  browserTimeZone,
  dateToLocalInputValue,
  effectiveTimeMs,
  formatLocalDateTime,
  localInputValueToMs,
  localUtcOffsetLabel,
} from './planning/time'
import { lineOfSightAzimuthDeg, verticalAngleDeg, type GeoPoint } from './geodesy/geodesy'

const COLUMN_STYLE = {
  position: 'absolute' as const,
  top: 12,
  left: 12,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'flex-start' as const,
  gap: 8,
  maxWidth: 'calc(100% - 24px)',
}

const TOOLBAR_STYLE = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 6,
  backgroundColor: 'rgba(20, 20, 30, 0.85)',
  color: '#f5f5f5',
  fontFamily: 'sans-serif',
  fontSize: 13,
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

const ROW_STYLE = {
  whiteSpace: 'nowrap' as const,
}

const TIME_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const DIVIDER_STYLE = {
  width: '100%',
  margin: '2px 0',
  border: 'none',
  borderTop: '1px solid #456',
}

const ALIGNMENT_WINDOW_STYLE = {
  position: 'absolute' as const,
  top: 12,
  right: 12,
  zIndex: 10,
  display: 'grid',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 6,
  backgroundColor: 'rgba(20, 20, 30, 0.85)',
  color: '#f5f5f5',
  fontFamily: 'sans-serif',
  fontSize: 13,
  colorScheme: 'dark' as const,
  minWidth: 360,
  maxWidth: 'calc(100% - 24px)',
  maxHeight: '80%',
  overflowY: 'auto' as const,
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
  whiteSpace: 'nowrap' as const,
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

// Coordinate leggibili in gradi decimali con emisfero e quota in metri.
function formatPoint(point: GeoPoint): string {
  const latitudeAbs = Math.abs(point.latitudeDeg).toFixed(6)
  const longitudeAbs = Math.abs(point.longitudeDeg).toFixed(6)
  const latitudeHemisphere = point.latitudeDeg < 0 ? 'S' : 'N'
  const longitudeHemisphere = point.longitudeDeg < 0 ? 'O' : 'E'
  return `${latitudeAbs}°${latitudeHemisphere} ${longitudeAbs}°${longitudeHemisphere} · ${point.heightM.toFixed(0)} m`
}

/** Offset rispetto alla linea di vista in italiano, con segno esplicito. */
function describeAlignmentOffsets(candidate: AlignmentCandidate): string {
  const horizontal =
    Math.abs(candidate.horizontalOffsetDeg) < 0.005
      ? 'in azimut'
      : `${formatAngleDeg(Math.abs(candidate.horizontalOffsetDeg), 2)} ${candidate.horizontalOffsetDeg > 0 ? 'a destra' : 'a sinistra'}`
  const vertical =
    Math.abs(candidate.verticalOffsetDeg) < 0.005
      ? 'in quota'
      : `${formatAngleDeg(Math.abs(candidate.verticalOffsetDeg), 2)} ${candidate.verticalOffsetDeg > 0 ? 'sopra' : 'sotto'}`
  return `${horizontal} · ${vertical}`
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

export default function App() {
  const [observer, setObserver] = useState<GeoPoint | null>(null)
  const [target, setTarget] = useState<GeoPoint | null>(null)
  const [activePoint, setActivePoint] = useState<PlannerPointId>('observer')
  const viewerRef = useRef<Viewer | null>(null)
  const [baseDateMs, setBaseDateMs] = useState<number>(() => Date.now())
  const [sliderOffsetMin, setSliderOffsetMin] = useState(0)
  const [alignmentWindowOpen, setAlignmentWindowOpen] = useState(false)
  const [alignmentResults, setAlignmentResults] = useState<AlignmentCandidate[]>([])
  const [alignmentNote, setAlignmentNote] = useState<string | null>(null)
  const [alignmentDays, setAlignmentDays] = useState(DEFAULT_ALIGNMENT_DAYS)
  const [alignmentStepMin, setAlignmentStepMin] = useState<number>(
    DEFAULT_ALIGNMENT_SEARCH.stepMinutes,
  )
  const [alignmentToleranceDeg, setAlignmentToleranceDeg] = useState<number>(
    DEFAULT_ALIGNMENT_SEARCH.toleranceDeg,
  )
  const effectiveDate = new Date(effectiveTimeMs(baseDateMs, sliderOffsetMin))

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

  function handleScenePick(point: GeoPoint): void {
    if (activePoint === 'observer') {
      setObserver(point)
    } else {
      setTarget(point)
    }
  }

  function clearActivePoint(): void {
    if (activePoint === 'observer') {
      setObserver(null)
    } else {
      setTarget(null)
    }
  }

  function flyToDemoView(): void {
    const viewer = viewerRef.current
    if (viewer === null || viewer.isDestroyed()) {
      return
    }
    flyToOverhead(viewer, DEMO_VIEW)
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
    flyToObserverView(viewer, observer, moon.azimuthDeg, moon.altitudeDeg)
  }

  function runAlignmentSearch(): void {
    if (observer === null || target === null) {
      return
    }
    let losAzimuth: number
    let losAltitude: number
    try {
      losAzimuth = lineOfSightAzimuthDeg(observer, target)
      losAltitude = verticalAngleDeg(observer, target)
    } catch {
      setAlignmentNote('Linea di vista indefinita: Observer e Target coincidono.')
      setAlignmentResults([])
      setAlignmentWindowOpen(true)
      return
    }
    setAlignmentNote(null)
    setAlignmentResults(
      searchMoonAlignments({
        observer,
        losAzimuthDeg: losAzimuth,
        losAltitudeDeg: losAltitude,
        fromDateMs: effectiveDate.getTime(),
        durationHours: alignmentDays * 24,
        stepMinutes: alignmentStepMin,
        toleranceDeg: alignmentToleranceDeg,
        maxResults: DEFAULT_ALIGNMENT_SEARCH.maxResults,
      }),
    )
    setAlignmentWindowOpen(true)
  }

  function adoptAlignment(dateMs: number): void {
    setBaseDateMs(dateMs)
    setSliderOffsetMin(0)
    setAlignmentWindowOpen(false)
  }

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

  return (
    <>
      <CesiumViewer
        observer={observer}
        target={target}
        time={effectiveDate}
        onScenePick={handleScenePick}
        onViewerReady={(viewer) => {
          viewerRef.current = viewer
        }}
      />
      <div style={COLUMN_STYLE}>
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
          onClick={flyToDemoView}
          style={BUTTON_STYLE}
          title="Vista demo: 45,5°N 10,22°E, scala ≈ 1 km/cm"
        >
          Demo vista
        </button>
        <button
          onClick={flyToMoonView}
          style={BUTTON_STYLE}
          title="Camera sull'Osservatore rivolta verso la Luna (posa reale)"
        >
          Vista Luna
        </button>
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
          title="Cerca i prossimi istanti in cui la Luna passa sulla linea Observer→Target"
        >
          Allineamenti Luna
        </button>
        </div>
        <div style={CARD_STYLE}>
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
          <div style={TIME_ROW_STYLE}>
            <button
              onClick={() => setBaseDateMs(baseDateMs - 60_000)}
              style={BUTTON_STYLE}
              title="Indietro di 1 minuto (non muove lo slider)"
            >
              −1 min
            </button>
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
            <button
              onClick={() => setBaseDateMs(baseDateMs + 60_000)}
              style={BUTTON_STYLE}
              title="Avanti di 1 minuto (non muove lo slider)"
            >
              +1 min
            </button>
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
            {observer === null && target !== null && (
              <div style={ROW_STYLE}>Posiziona l'Osservatore per i valori della Luna.</div>
            )}
          </div>
        )}
      </div>
      {alignmentWindowOpen && (
        <div style={ALIGNMENT_WINDOW_STYLE}>
          <div style={WINDOW_HEADER_STYLE}>
            <span>Luna sulla linea Observer→Target</span>
            <button
              onClick={runAlignmentSearch}
              style={BUTTON_STYLE}
              title="Ripete la ricerca con i parametri e il tempo attuali"
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
                  setAlignmentDays(clampInt(event.target.value, 1, 365, DEFAULT_ALIGNMENT_DAYS))
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
                max={5}
                step={0.05}
                value={alignmentToleranceDeg}
                onChange={(event) =>
                  setAlignmentToleranceDeg(
                    clampFloat(
                      event.target.value,
                      0.05,
                      5,
                      DEFAULT_ALIGNMENT_SEARCH.toleranceDeg,
                    ),
                  )
                }
                style={NUMBER_INPUT_STYLE}
              />
            </label>
          </div>
          <div style={ROW_STYLE}>
            Ricerca da {formatLocalDateTime(effectiveDate)} · max{' '}
            {DEFAULT_ALIGNMENT_SEARCH.maxResults} risultati
          </div>
          {alignmentNote !== null && <div style={ROW_STYLE}>{alignmentNote}</div>}
          {alignmentNote === null && alignmentResults.length === 0 && (
            <div style={ROW_STYLE}>Nessun allineamento nella finestra cercata.</div>
          )}
          {alignmentResults.map((candidate) => (
            <button
              key={candidate.dateMs}
              onClick={() => adoptAlignment(candidate.dateMs)}
              style={ALIGNMENT_ROW_BUTTON_STYLE}
              title="Adotta questo istante come data/ora della vista"
            >
              {formatLocalDateTime(new Date(candidate.dateMs))} · sep{' '}
              {formatAngleDeg(candidate.separationDeg, 2)} · {describeAlignmentOffsets(candidate)}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

