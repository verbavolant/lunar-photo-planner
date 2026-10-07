import { useEffect, useRef, useState } from 'react'
import { Cesium3DTileset, Viewer } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// URL root dei Photorealistic 3D Tiles: sample ufficiale Google
// (developers.google.com/maps/documentation/tile/3d-tiles, agg. 2026-10-05).
// La chiave non va mai hardcodata: arriva da VITE_GOOGLE_MAPS_API_KEY.
const GOOGLE_3D_TILES_ROOT_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json'

const OVERLAY_STYLE = {
  position: 'absolute' as const,
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  maxWidth: '80%',
  padding: '8px 12px',
  backgroundColor: 'rgba(20, 20, 30, 0.85)',
  color: '#f5f5f5',
  fontSize: 13,
  borderRadius: 4,
  pointerEvents: 'none' as const,
}

// Scena CesiumJS + Google Photorealistic 3D Tiles (T-003). L'attribution dei
// tiles resta a schermo: requisito delle Google Map Tiles API Policies.
export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return undefined
    }

    // Evita di toccare il viewer dopo l'unmount (StrictMode: doppio mount).
    let disposed = false

    const viewer = new Viewer(container, {
      // Nessun imagery di default: i tiles Google forniscono il territorio.
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    })

    // CesiumJS non segue automaticamente il ridimensionamento del container.
    const resizeObserver = new ResizeObserver(() => viewer.resize())
    resizeObserver.observe(container)

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
    if (apiKey === undefined || apiKey === '') {
      setNotice(
        'Google Photorealistic 3D Tiles non attivi: imposta VITE_GOOGLE_MAPS_API_KEY in .env.local e riavvia il server di sviluppo.',
      )
    } else {
      Cesium3DTileset.fromUrl(`${GOOGLE_3D_TILES_ROOT_URL}?key=${apiKey}`, {
        // Requisito Google: attribution sempre visibile a schermo.
        showCreditsOnScreen: true,
      })
        .then((tileset) => {
          if (disposed) {
            tileset.destroy()
            return
          }
          viewer.scene.primitives.add(tileset)
          // Sample ufficiale Google: la superficie fotorealistica sostituisce
          // l'ellissoide di base.
          viewer.scene.globe.show = false
        })
        .catch((error: unknown) => {
          if (disposed) {
            return
          }
          console.error('Caricamento Google Photorealistic 3D Tiles fallito:', error)
          const message =
            error instanceof Error && error.message !== ''
              ? error.message
              : 'vedi console per i dettagli'
          setNotice(`Errore nel caricamento di Google Photorealistic 3D Tiles: ${message}`)
        })
    }

    return () => {
      disposed = true
      resizeObserver.disconnect()
      viewer.destroy()
    }
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {notice !== null && <div style={OVERLAY_STYLE}>{notice}</div>}
    </div>
  )
}

