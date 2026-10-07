import { useState } from 'react'
import CesiumViewer from './cesium/CesiumViewer'
import { PLANNER_POINT_LABELS, type PlannerPointId } from './planning/points'
import type { GeoPoint } from './geodesy/geodesy'

const TOOLBAR_STYLE = {
  position: 'absolute' as const,
  top: 12,
  left: 12,
  zIndex: 10,
  display: 'flex',
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

  const points: Record<PlannerPointId, GeoPoint | null> = { observer, target }

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

  return (
    <>
      <CesiumViewer observer={observer} target={target} onScenePick={handleScenePick} />
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
      </div>
    </>
  )
}

