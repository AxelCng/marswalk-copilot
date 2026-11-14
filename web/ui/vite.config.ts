import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'

// El mapa (web/map/src/MarsMap.jsx, de Axl) pide sus datos con rutas absolutas:
// /base/* (mapa base), /capas/* (DTM, pendiente, THEMIS) y /geologia.geojson (SIM 3464).
// Todo eso vive en web/map/public: este plugin lo sirve en desarrollo y lo copia al build,
// así la pantalla principal ve exactamente lo mismo que la página de prueba de web/map.
const PUBLICO_MAPA = resolve(__dirname, '../map/public')
const RUTAS_DEL_MAPA = ['/base/', '/capas/', '/geologia.geojson']
const TIPOS: Record<string, string> = {
  '.json': 'application/json', '.geojson': 'application/geo+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
}

function archivosDe(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? archivosDe(p) : [p]
  })
}

function datosDelMapa(): Plugin {
  return {
    name: 'datos-del-mapa',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const ruta = decodeURIComponent((req.url ?? '').split('?')[0])
        if (!RUTAS_DEL_MAPA.some((r) => ruta === r || ruta.startsWith(r))) return next()
        const archivo = resolve(PUBLICO_MAPA, '.' + ruta)
        if (!archivo.startsWith(PUBLICO_MAPA + sep) || !existsSync(archivo) || statSync(archivo).isDirectory()) return next()
        res.setHeader('Content-Type', TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream')
        res.end(readFileSync(archivo))
      })
    },
    generateBundle() {
      if (!existsSync(PUBLICO_MAPA)) return
      for (const archivo of archivosDe(PUBLICO_MAPA)) {
        const nombre = relative(PUBLICO_MAPA, archivo).split(sep).join('/')
        if (RUTAS_DEL_MAPA.some((r) => ('/' + nombre).startsWith(r))) {
          this.emitFile({ type: 'asset', fileName: nombre, source: readFileSync(archivo) })
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    datosDelMapa(),
  ],
  resolve: {
    // MarsMap está fuera de web/ui: sin esto usaría otra copia de React o MapLibre y se rompe.
    dedupe: ['react', 'react-dom', 'maplibre-gl'],
    // Datos del SIM 3464 que usan los componentes del visor (web/ui/hud/src/sim.js).
    alias: { '@shared': resolve(__dirname, '../shared') },
  },
  // El mapa (web/map) y los datos de prueba (contracts/) están fuera de web/ui.
  // Las rutas relativas se resuelven desde web/ui.
  server: { fs: { allow: ['../..'] } },
})
