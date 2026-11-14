// AeroHUD Jezero: tokens que usa el mapa.
// Fuente: design system "AeroHUD Jezero" (https://claude.ai/artifact/TDBvRbN9wBCZ4PCoCyV3Yh).
// MapLibre no lee variables CSS, por eso los colores del mapa viven aquí en JS.

export const HUD = {
  bgDeep: '#0b0e14',
  glass: '#151b26',
  border: '#2a3447',
  onSurface: '#e1e2eb',
  onSurfaceVariant: '#bac9cc',
  outline: '#849396',
  primary: '#c3f5ff',
  secondary: '#ffb59d',
  tertiary: '#a8ffd2',
  cyan: '#00e5ff',
  cyanDim: '#00838f',
  marsRust: '#e05a2b',
  nominal: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
};

// Color de relleno por tipo de nodo (tabla "Color por tipo de nodo" del README).
export const COLOR_TIPO = {
  habitat: HUD.onSurface,
  rover: HUD.primary,
  ciencia: HUD.marsRust,
  muestreo: HUD.secondary,
  refugio: HUD.nominal,
  comms: HUD.tertiary,
};
