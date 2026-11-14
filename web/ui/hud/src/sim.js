// Datos reales del mapa geológico USGS SIM 3464 (Sun y Stack, 2020), generados por
// web/scripts/sim3464/importar_sim3464.py y compartidos con web/map.
//   estaciones_capas.json → unidad, DTM CTX 20 m, pendiente, HRSC y THEMIS en cada estación
//   geologia_ruta.geojson → polígonos de unidades alrededor de la ruta (minimapa)

import capas from '@shared/sim3464/estaciones_capas.json';
import geologia from '@shared/sim3464/geologia_ruta.geojson?raw';

export const SIM_META = capas.meta;
export const capasEstacion = (id) => capas.estaciones[id] ?? null;
export const UNIDADES = JSON.parse(geologia).features;

function enAnillo([x, y], anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function enPoligono(p, coords) {
  return enAnillo(p, coords[0]) && !coords.slice(1).some((h) => enAnillo(p, h));
}

/** Unidad geológica bajo un [lon, lat], o null si cae fuera del recorte. */
export function unidadEn(p) {
  for (const f of UNIDADES) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (polys.some((c) => enPoligono(p, c))) return f.properties;
  }
  return null;
}

/** Secuencia de unidades que atraviesa una geometría (sin repetir consecutivas). */
export function unidadesDelTramo(geometria) {
  const out = [];
  for (const p of geometria) {
    const u = unidadEn(p)?.unit_symbol;
    if (u && out[out.length - 1] !== u) out.push(u);
  }
  return out;
}
