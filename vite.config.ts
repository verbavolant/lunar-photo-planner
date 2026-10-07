import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Directory di build di CesiumJS dentro il pacchetto npm (path con "/" solo:
// su Windows i backslash rompono i glob di tinyglobby).
const cesiumBuildDir = 'node_modules/cesium/Build/Cesium'

// Base relativa (T-004): funziona sia su "/" sia sotto "/<repo>/" (GitHub Pages)
// senza conoscere il nome del repository. Vite genera URL asset relativi a
// index.html; Cesium risolve CESIUM_BASE_URL contro l'URL della pagina
// (verificato in @cesium/engine/Source/Core/buildModuleUrl.js: tryMakeAbsolute
// usa il trucco <a href>).
const cesiumBaseUrl = './cesium/'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        // Il path partito è relativo alla root del progetto (vedi opzioni del
        // plugin): stripBase 4 toglie "node_modules/cesium/Build/Cesium" così
        // la struttura interna di ogni directory finisce sotto /cesium/.
        { src: `${cesiumBuildDir}/Assets/**`, dest: 'cesium', rename: { stripBase: 4 } },
        { src: `${cesiumBuildDir}/ThirdParty/**`, dest: 'cesium', rename: { stripBase: 4 } },
        { src: `${cesiumBuildDir}/Workers/**`, dest: 'cesium', rename: { stripBase: 4 } },
        { src: `${cesiumBuildDir}/Widgets/**`, dest: 'cesium', rename: { stripBase: 4 } },
      ],
    }),
  ],
  define: {
    // Letto da @cesium/engine/Source/Core/buildModuleUrl.js per risolvere
    // Workers/Assets/Widgets serviti come file statici. Relativo alla pagina:
    // compatibile con GitHub Pages sotto /<repo>/.
    CESIUM_BASE_URL: JSON.stringify(cesiumBaseUrl),
  },
})

