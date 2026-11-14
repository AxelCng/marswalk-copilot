// Geometría mínima para el HUD: rumbo entre dos [lon, lat] y proyección del minimapa.

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Rumbo inicial (0° = norte, sentido horario) de a hacia b, ambos [lon, lat]. */
export function rumbo([lon1, lat1], [lon2, lat2]) {
  const f1 = rad(lat1);
  const f2 = rad(lat2);
  const dl = rad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Rumbo del tramo: del primer al último punto de su geometría. */
export function rumboTramo(tramo) {
  const g = tramo.geometria;
  return rumbo(g[0], g[g.length - 1]);
}

const PUNTOS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const cardinal = (d) => PUNTOS[Math.round(norm(d) / 45) % 8];

export const norm = (d) => ((d % 360) + 360) % 360;

/** Diferencia firmada b − a en (−180, 180]. */
export function delta(a, b) {
  const d = norm(b - a);
  return d > 180 ? d - 360 : d;
}

/**
 * Proyección equirectangular a una caja de size×size px con margen,
 * corrigiendo lon por cos(lat). Devuelve p([lon, lat]) → [x, y].
 */
export function proyeccion(puntos, size, margen = 14) {
  const lons = puntos.map((p) => p[0]);
  const lats = puntos.map((p) => p[1]);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos(rad(lat0));
  const minX = Math.min(...lons) * k;
  const maxX = Math.max(...lons) * k;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const esc = (size - 2 * margen) / Math.max(maxX - minX, maxY - minY, 1e-9);
  const offX = (size - (maxX - minX) * esc) / 2;
  const offY = (size - (maxY - minY) * esc) / 2;
  return ([lon, lat]) => [offX + (lon * k - minX) * esc, size - offY - (lat - minY) * esc];
}
