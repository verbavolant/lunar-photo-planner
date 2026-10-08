import { useRef, useState } from 'react'
import type { Viewer } from 'cesium'
import CesiumViewer from './cesium/CesiumViewer'
import { flyToOverhead } from './cesium/camera'
import { moonTopocentric } from './astronomy/moon'
import { DEMO_VIEW, PLANNER_POINT_LABELS, type PlannerPointId } from './planning/points'
import { buildMeasurements, type MeasurementRow } from './planning/measurements'
import { formatAngleDeg, formatDistanceM } from './planning/format'
import {
  browserTimeZone,
  dateToLocalInputValue,
  effectiveTimeMs,
  localInputValueToMs,
} from './planning/time'
import type { GeoPoint } from './geodesy/geodesy'

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

// Coordinate leggibili in gradi decimali con emisfero e quota in metri.
function formatPoint(point: GeoPoint): string {
  const latitudeAbs = Math.abs(point.latitudeDeg).toFixed(6)
  const longitudeAbs = Math.abs(point.longitudeDeg).toFixed(6)
  const latitudeHemisphere = point.latitudeDeg < 0 ? 'S' : 'N'
  const longitudeHemisphere = point.longitudeDeg < 0 ? 'O' : 'E'
  return `${latitudeAbs}°${latitudeHemisphere} ${longitudeAbs}°${longitudeHemisphere} · ${point.heightM.toFixed(0)} m`
}

export default function App() {
  const [observer, setObserver] = useState<GeoPoint | null>(null)
  const [target, setTarget] = useState<GeoPoint | null>(null)
  const [activePoint, setActivePoint] = useState<PlannerPointId>('observer')
  const viewerRef = useRef<Viewer | null>(null)
  const [baseDateMs, setBaseDateMs] = useState<number>(() => Date.now())
  const [sliderOffsetMin, setSliderOffsetMin] = useState(0)
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
    </>
  )
}

