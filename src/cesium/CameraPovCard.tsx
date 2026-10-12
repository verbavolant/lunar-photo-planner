import { useEffect, useState } from 'react'
import type { Viewer } from 'cesium'
import { readCameraPov, type CameraPov } from './cameraPov'
import { formatAngleDeg } from '../planning/format'

// Aggiornamento del readout ~10 Hz: abbastanza fluido per seguire la
// navigazione senza re-render della card a ogni frame.
const POV_UPDATE_INTERVAL_MS = 100

// Stessa veste delle card del box laterale (stili in App.tsx): duplicato
// locale per non esportare stili tra componenti (convenzione del progetto).
const POV_CARD_STYLE = {
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

const POV_TITLE_STYLE = {
  fontWeight: 600 as const,
}

const POV_ROW_STYLE = {
  whiteSpace: 'nowrap' as const,
}

const UNAVAILABLE = '—'

/** Coordinate in gradi decimali con emisfero (stile it: virgola decimale). */
function formatCoordinateDeg(value: number, positive: string, negative: string): string {
  return `${formatAngleDeg(Math.abs(value), 6)} ${value < 0 ? negative : positive}`
}

function samePov(a: CameraPov | null, b: CameraPov | null): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return (
    a.latitudeDeg === b.latitudeDeg &&
    a.longitudeDeg === b.longitudeDeg &&
    a.heightM === b.heightM &&
    a.headingDeg === b.headingDeg &&
    a.pitchDeg === b.pitchDeg
  )
}

/**
 * Card "POV camera" (T-035): la vista corrente in numeri, aggiornata mentre si
 * naviga. Sottoscrizione a `scene.preRender` con gate ~10 Hz e salto degli
 * snapshot identici; lo stato è LOCALE alla card così l'App non re-renderizza a
 * ogni frame. Con "Vista Luna" la camera sta sull'Observer (+1 m, T-028): la
 * card mostra allora il POV dell'osservatore. Quote ellissoidiche (come i
 * GeoPoint del planner).
 */
export default function CameraPovCard({ viewer }: { viewer: Viewer | null }) {
  const [pov, setPov] = useState<CameraPov | null>(null)

  useEffect(() => {
    if (viewer === null || viewer.isDestroyed()) {
      return undefined
    }
    let lastUpdateMs = Number.NEGATIVE_INFINITY
    const update = (): void => {
      if (viewer.isDestroyed()) {
        return
      }
      const now = performance.now()
      if (now - lastUpdateMs < POV_UPDATE_INTERVAL_MS) {
        return
      }
      lastUpdateMs = now
      setPov((previous) => {
        const next = readCameraPov(viewer)
        return samePov(previous, next) ? previous : next
      })
    }
    update()
    const removePreRender = viewer.scene.preRender.addEventListener(update)
    return () => {
      removePreRender()
    }
  }, [viewer])

  return (
    <div style={POV_CARD_STYLE}>
      <div style={POV_TITLE_STYLE}>POV camera</div>
      <div style={POV_ROW_STYLE}>
        Latitudine:{' '}
        <strong>{pov === null ? UNAVAILABLE : formatCoordinateDeg(pov.latitudeDeg, 'N', 'S')}</strong>
      </div>
      <div style={POV_ROW_STYLE}>
        Longitudine:{' '}
        <strong>{pov === null ? UNAVAILABLE : formatCoordinateDeg(pov.longitudeDeg, 'E', 'O')}</strong>
      </div>
      <div style={POV_ROW_STYLE}>
        Quota (ellissoide): <strong>{pov === null ? UNAVAILABLE : `${pov.heightM.toFixed(0)} m`}</strong>
      </div>
      <div style={POV_ROW_STYLE}>
        Azimut: <strong>{pov === null ? UNAVAILABLE : formatAngleDeg(pov.headingDeg)}</strong>
      </div>
      <div style={POV_ROW_STYLE}>
        Inclinazione: <strong>{pov === null ? UNAVAILABLE : formatAngleDeg(pov.pitchDeg)}</strong>
      </div>
    </div>
  )
}
