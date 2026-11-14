import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// El mapa (web/map/src/MarsMap.jsx, de Axl) pide su mapa base en /base/*.
// Esas teselas viven en web/map/public/base: este plugin las sirve en desarrollo y las copia al build.
const DIR_BASE = resolve(__dirname, '../map/public/base')
const GEOLOGIA = resolve(__dirname, '../map/public/geologia.geojson')

function teselasDelMapa(): Plugin {
  return {
    name: 'teselas-del-mapa',
    configureServer(server) {
      server.middlewares.use('/base', (req, res, next) => {
        const archivo = join(DIR_BASE, decodeURIComponent((req.url ?? '').split('?')[0]))
        if (!archivo.startsWith(DIR_BASE) || !existsSync(archivo)) return next()
        res.setHeader('Content-Type', archivo.endsWith('.json') ? 'application/json' : 'image/png')
        res.end(readFileSync(archivo))
      })
      // Capa geológica SIM 3464 (la entrega data/ en web/map/public): la usan el mapa y las fichas
      server.middlewares.use('/geologia.geojson', (_req, res, next) => {
        if (!existsSync(GEOLOGIA)) return next()
        res.setHeader('Content-Type', 'application/geo+json')
        res.end(readFileSync(GEOLOGIA))
      })
    },
    generateBundle() {
      if (existsSync(GEOLOGIA)) {
        this.emitFile({ type: 'asset', fileName: 'geologia.geojson', source: readFileSync(GEOLOGIA) })
      }
      if (!existsSync(DIR_BASE)) return
      for (const f of readdirSync(DIR_BASE)) {
        this.emitFile({ type: 'asset', fileName: `base/${f}`, source: readFileSync(join(DIR_BASE, f)) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    teselasDelMapa(),
  ],
  resolve: {
    // MarsMap está fuera de web/ui: sin esto usaría otra copia de React o MapLibre y se rompe.
    dedupe: ['react', 'react-dom', 'maplibre-gl'],
  },
  // El mapa (web/map) y los datos de prueba (contracts/) están fuera de web/ui.
  // Las rutas relativas se resuelven desde web/ui.
  server: { fs: { allow: ['../..'] } },
})
