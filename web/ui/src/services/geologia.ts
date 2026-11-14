/**
 * Unidad geológica (USGS SIM 3464) bajo cada estación, con las mismas etiquetas y colores
 * que la capa del mapa de Añe (web/map/src/geologia.js).
 *
 * Misma fuente que el mapa: GET /geologia en la API y, si no está, /geologia.geojson
 * (web/map/public). Mientras data/ no lo entregue, devuelve null y la ficha usa
 * `unidad_geologica` de graph.json.
 */
import type { EstacionResumen } from '../types/mission';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export interface UnidadGeologica {
  simbolo: string;
  nombre: string;
  edad: string;
  color: string;
}

type Anillo = [number, number][];
interface Feature {
  properties?: Record<string, unknown> | null;
  geometry?: { type: string; coordinates: unknown } | null;
}

// Misma paleta y misma función de color que web/map/src/geologia.js: así el color de la ficha
// coincide con el polígono del mapa.
const PALETA = [
  '#b8734a', '#8f6a4f', '#c49a5a', '#7d8a5c', '#5f7d7a',
  '#a35d4e', '#9c8b6e', '#6e6a8a', '#b38b8b', '#7a9a8a',
];

function colorDeUnidad(p: Record<string, unknown>): string {
  if (typeof p.color_hex === 'string' && /^#[0-9a-f]{6}$/i.test(p.color_hex)) return p.color_hex;
  const clave = String(p.color_id ?? p.unit_symbol ?? p.unit_key ?? '');
  let h = 0;
  for (const c of clave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

function dentroAnillo([x, y]: [number, number], anillo: Anillo): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Polígono GeoJSON: dentro del anillo exterior y fuera de los huecos. */
function dentroPoligono(p: [number, number], anillos: Anillo[]): boolean {
  if (!anillos.length || !dentroAnillo(p, anillos[0])) return false;
  return !anillos.slice(1).some((hueco) => dentroAnillo(p, hueco));
}

function contiene(f: Feature, p: [number, number]): boolean {
  const g = f.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') return dentroPoligono(p, g.coordinates as Anillo[]);
  if (g.type === 'MultiPolygon') return (g.coordinates as Anillo[][]).some((pol) => dentroPoligono(p, pol));
  return false;
}

async function cargarGeojson(): Promise<Feature[] | null> {
  for (const url of [`${API_BASE}/geologia`, '/geologia.geojson']) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const g = await res.json();
      if (g?.type === 'FeatureCollection' && Array.isArray(g.features)) return g.features as Feature[];
    } catch {
      /* siguiente fuente */
    }
  }
  return null;
}

/** id de estación → unidad SIM 3464 bajo su punto. null si no hay capa geológica. */
export async function unidadesPorEstacion(
  estaciones: EstacionResumen[],
): Promise<Record<string, UnidadGeologica> | null> {
  const features = await cargarGeojson();
  if (!features) return null;
  const poligonos = features.filter((f) => f.geometry && /Polygon$/.test(f.geometry.type));
  const out: Record<string, UnidadGeologica> = {};
  for (const e of estaciones) {
    const f = poligonos.find((pf) => contiene(pf, [e.lon, e.lat]));
    if (!f) continue;
    const p = f.properties ?? {};
    out[e.id] = {
      simbolo: String(p.unit_symbol ?? p.unit_key ?? ''),
      nombre: String(p.unit_name ?? ''),
      edad: String(p.age_prefix ?? '').replace(/Noachiano/g, 'Noachian').replace(/Hesperiano/g, 'Hesperian'), // en inglés para la interfaz
      color: colorDeUnidad(p),
    };
  }
  return out;
}

/** Quita la marca "(FAKE)" del texto de graph_fake.json y avisa si estaba. */
export function limpiarUnidad(texto: string): { texto: string; provisional: boolean } {
  const provisional = /\(FAKE\)/i.test(texto);
  return { texto: texto.replace(/\s*\(FAKE\)\s*/i, '').trim(), provisional };
}
