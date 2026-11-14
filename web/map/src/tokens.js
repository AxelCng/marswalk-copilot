// Paleta técnica de MarsWalk (estilo OpenMCT / GIS): superficies sólidas, sin brillos.
// MapLibre no lee variables CSS, por eso los colores del mapa viven aquí en JS.
// Reglas de uso:
//   ruta      ámbar #FFB000 con contorno negro de 2 px: se lee sobre cualquier textura
//   terreno   naranja marciano #D9532F solo para terreno y elevación
//   alerta    rojo #DA3633 solo para zonas y tramos en alerta activa

export const HUD = {
  bgDeep: '#0D1117',
  panel: '#0E1117',
  container: '#161B22',
  border: '#2D333B',
  onSurface: '#E6EDF3',
  onSurfaceVariant: '#C9D1D9',
  outline: '#8B949E',
  ruta: '#FFB000',
  casing: '#000000',
  terreno: '#D9532F',
  critical: '#DA3633',
  nominal: '#3FB950',
  info: '#58A6FF',
  warning: '#D29922',
  // compatibilidad con nombres anteriores
  primary: '#E6EDF3',
  secondary: '#E3B341',
  tertiary: '#58A6FF',
  marsRust: '#D9532F',
  cyan: '#FFB000',
  cyanDim: '#8B949E',
};

// Color del núcleo del waypoint por tipo de estación.
export const COLOR_TIPO = {
  habitat: '#E6EDF3',
  rover: '#8B949E',
  ciencia: '#D9532F',
  muestreo: '#E3B341',
  refugio: '#3FB950',
  comms: '#58A6FF',
};
