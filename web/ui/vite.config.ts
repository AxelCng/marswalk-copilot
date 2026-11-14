import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // El mapa (web/map) y los datos de prueba (contracts/) están fuera de web/ui.
  // Las rutas relativas se resuelven desde web/ui.
  server: { fs: { allow: ['../..'] } },
})
