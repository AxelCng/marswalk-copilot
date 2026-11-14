import { defineConfig } from 'vite';

// Permite leer contracts/ (dos carpetas arriba) en desarrollo. Las rutas relativas son desde web/map.
export default defineConfig({
  server: { port: 5174, fs: { allow: ['../..'] } },
});
