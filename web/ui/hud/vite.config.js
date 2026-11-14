import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Permite importar los JSON de ../../../contracts (grafo falso y ejemplos de API).
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@contracts': `${repoRoot}contracts` },
  },
  server: {
    port: 5174,
    fs: { allow: [repoRoot] },
  },
});
