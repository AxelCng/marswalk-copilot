/**
 * Mapa de la misión (Añe, web/map).
 *
 * Módulo sin React: lo usa la página de prueba de web/map (demo.ts) y lo inserta
 * la pantalla de Axl (web/ui) con un componente chico. Solo depende de maplibre-gl.
 *
 *   const mapa = crearMapa(divContenedor, { onClickEstacion: (id) => ... });
 *   mapa.cargarGrafo(grafo);          // nodos, aristas y zonas (GET /grafo o graph_fake.json)
 *   mapa.mostrarMision(respuesta);    // ruta resaltada (respuesta de /mision o /ruta)
 *   mapa.mostrarAlerta(respuesta, 'Z2'); // zona en alerta + tramos evitados (respuesta de /alerta)
 *   mapa.limpiar();
 *
 * Mapa base: mosaico HiRISE de Jezero (25 cm/px, controlado) de NASA Mars Trek,
 * recortado y guardado en assets/ para que funcione sin internet en la demo.
 */
import { AttributionControl, Map as MapaLibre, Marker, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import type { GeoJSONSource, LngLatBoundsLike } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import imagenJezero from './assets/jezero_hirise.jpg';

setWorkerUrl(workerUrl);

// ------------------------------------------------------------------ tipos (forma de contracts/)
export type Punto = [number, number]; // [lon, lat]

export interface Nodo {
  id: string;
  nombre: string;
  tipo: string;
  lon: number;
  lat: number;
}

export interface Arista {
  origen: string;
  destino: string;
  limite_deg?: number;
  pendiente_max_deg?: number;
  geometria: Punto[];
}

export interface Zona {
  id: string;
  nombre: string;
  poligono: Punto[];
}

export interface Grafo {
  nodes: Nodo[];
  edges: Arista[];
  zonas?: Zona[];
}

export interface Tramo {
  origen: string;
  destino: string;
  geometria: Punto[];
}

export interface Mision {
  factible: boolean;
  ruta: string[];
  tramos: Tramo[];
  omitidas?: { id: string }[];
  aristas_afectadas?: string[];
}

export interface OpcionesMapa {
  onClickEstacion?: (id: string) => void;
}

export interface MapaMision {
  cargarGrafo(grafo: Grafo): void;
  mostrarMision(mision: Mision | null): void;
  mostrarAlerta(mision: Mision, zona: string): void;
  limpiar(): void;
  destruir(): void;
}

// ------------------------------------------------------------------ constantes
/** Límites de assets/jezero_hirise.jpg (teselas HiRISE z15 de Mars Trek, EPSG:104905). */
const LIMITES_IMAGEN = { oeste: 77.3822021484375, este: 77.4700927734375, norte: 18.47900390625, sur: 18.424072265625 };

export const COLOR_TIPO: Record<string, string> = {
  habitat: '#38bdf8',
  rover: '#a78bfa',
  ciencia: '#f59e0b',
  muestreo: '#34d399',
  refugio: '#94a3b8',
  comms: '#f472b6',
};

const PASOS_HORMIGAS: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

const VACIO: FeatureCollection = { type: 'FeatureCollection', features: [] };

// ------------------------------------------------------------------ estilos de los marcadores
function inyectarEstilos(): void {
  if (document.getElementById('mw-mapa-estilos')) return;
  const css = document.createElement('style');
  css.id = 'mw-mapa-estilos';
  css.textContent = `
    .mw-nodo { display:flex; align-items:center; gap:6px; cursor:pointer; font:600 11px/1.2 ui-monospace,monospace; }
    .mw-nodo__punto { width:14px; height:14px; border-radius:50%; border:2px solid #0b1020; box-shadow:0 0 0 2px rgba(255,255,255,.35); flex:none; }
    .mw-nodo__texto { color:#f8fafc; background:rgba(7,11,18,.78); padding:2px 6px; border-radius:4px; white-space:nowrap; }
    .mw-nodo--ruta .mw-nodo__punto { box-shadow:0 0 0 3px #22d3ee, 0 0 12px #22d3ee; }
    .mw-nodo--omitida { opacity:.55; }
    .mw-nodo--omitida .mw-nodo__texto { text-decoration:line-through; }
    .mw-orden { position:absolute; top:-10px; left:-8px; min-width:16px; height:16px; padding:0 3px; border-radius:8px;
      background:#22d3ee; color:#0b1020; font:700 10px/16px ui-monospace,monospace; text-align:center; }
    .mw-zona { font:700 11px/1 ui-monospace,monospace; color:#fde68a; background:rgba(7,11,18,.6); padding:2px 5px; border-radius:3px; pointer-events:none; }
    .mw-zona--alerta { color:#fff; background:#dc2626; }
  `;
  document.head.appendChild(css);
}

function lineas(tramos: { origen: string; destino: string; geometria: Punto[] }[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: tramos.map((t) => ({
      type: 'Feature',
      properties: { clave: `${t.origen}->${t.destino}` },
      geometry: { type: 'LineString', coordinates: t.geometria },
    })),
  };
}

function limitesDe(puntos: Punto[]): LngLatBoundsLike | null {
  if (!puntos.length) return null;
  const lons = puntos.map((p) => p[0]);
  const lats = puntos.map((p) => p[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

// ------------------------------------------------------------------ mapa
export function crearMapa(contenedor: HTMLElement, opciones: OpcionesMapa = {}): MapaMision {
  inyectarEstilos();
  const { oeste, este, norte, sur } = LIMITES_IMAGEN;

  const mapa = new MapaLibre({
    container: contenedor,
    attributionControl: false,
    bounds: [[oeste, sur], [este, norte]],
    maxBounds: [[oeste - 0.02, sur - 0.015], [este + 0.02, norte + 0.015]],
    style: {
      version: 8,
      sources: {
        jezero: {
          type: 'image',
          url: imagenJezero,
          coordinates: [[oeste, norte], [este, norte], [este, sur], [oeste, sur]],
        },
      },
      layers: [
        { id: 'fondo', type: 'background', paint: { 'background-color': '#16110d' } },
        { id: 'jezero', type: 'raster', source: 'jezero', paint: { 'raster-opacity': 0.95 } },
      ],
    },
  });
  mapa.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  mapa.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
  mapa.addControl(new AttributionControl({
    compact: true,
    customAttribution: 'HiRISE: NASA/JPL-Caltech/University of Arizona, vía NASA Mars Trek · Estaciones: waypoints de Perseverance (NASA/JPL-Caltech)',
  }));

  let grafo: Grafo | null = null;
  let mision: Mision | null = null;
  let zonaAlerta: string | null = null;
  let marcadores: Marker[] = [];
  let etiquetasZona: Marker[] = [];
  let animacion = 0;
  const pendientes: (() => void)[] = [];
  let cargado = false;

  const cuandoCargue = (fn: () => void) => (cargado ? fn() : pendientes.push(fn));

  mapa.on('load', () => {
    mapa.addSource('zonas', { type: 'geojson', data: VACIO });
    mapa.addSource('aristas', { type: 'geojson', data: VACIO });
    mapa.addSource('afectadas', { type: 'geojson', data: VACIO });
    mapa.addSource('ruta', { type: 'geojson', data: VACIO });

    mapa.addLayer({ id: 'zonas-relleno', type: 'fill', source: 'zonas',
      paint: { 'fill-color': ['case', ['get', 'alerta'], '#dc2626', '#fbbf24'], 'fill-opacity': ['case', ['get', 'alerta'], 0.3, 0.06] } });
    mapa.addLayer({ id: 'zonas-borde', type: 'line', source: 'zonas',
      paint: { 'line-color': ['case', ['get', 'alerta'], '#ef4444', '#fbbf24'], 'line-width': ['case', ['get', 'alerta'], 2.5, 1],
        'line-opacity': 0.7, 'line-dasharray': [3, 2] } });
    mapa.addLayer({ id: 'aristas', type: 'line', source: 'aristas',
      paint: { 'line-color': '#e2e8f0', 'line-width': 1, 'line-opacity': 0.25 } });
    mapa.addLayer({ id: 'afectadas', type: 'line', source: 'afectadas',
      paint: { 'line-color': '#ef4444', 'line-width': 4, 'line-opacity': 0.9, 'line-dasharray': [1, 1.5] } });
    mapa.addLayer({ id: 'ruta-borde', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#0b1020', 'line-width': 8, 'line-opacity': 0.75 } });
    mapa.addLayer({ id: 'ruta', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#22d3ee', 'line-width': 4 } });
    mapa.addLayer({ id: 'ruta-hormigas', type: 'line', source: 'ruta',
      paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': PASOS_HORMIGAS[0] } });

    cargado = true;
    pendientes.splice(0).forEach((fn) => fn());
    animar(0);
  });

  /** Ruta con "hormigas" que avanzan y zona en alerta que late. */
  function animar(t: number): void {
    animacion = requestAnimationFrame(animar);
    if (!mapa.getLayer('ruta-hormigas')) return;
    const paso = Math.floor(t / 60) % PASOS_HORMIGAS.length;
    mapa.setPaintProperty('ruta-hormigas', 'line-dasharray', PASOS_HORMIGAS[paso]);
    if (zonaAlerta) {
      const pulso = 0.18 + 0.17 * (1 + Math.sin(t / 250)) / 2;
      mapa.setPaintProperty('zonas-relleno', 'fill-opacity', ['case', ['get', 'alerta'], pulso, 0.06]);
    }
  }

  function fuente(id: string): GeoJSONSource {
    return mapa.getSource(id) as GeoJSONSource;
  }

  function dibujarZonas(): void {
    etiquetasZona.forEach((m) => m.remove());
    etiquetasZona = [];
    const zonas = grafo?.zonas ?? [];
    fuente('zonas').setData({
      type: 'FeatureCollection',
      features: zonas.map((z) => ({
        type: 'Feature',
        properties: { id: z.id, alerta: z.id === zonaAlerta },
        geometry: { type: 'Polygon', coordinates: [z.poligono] },
      })),
    });
    for (const z of zonas) {
      const lons = z.poligono.map((p) => p[0]);
      const lats = z.poligono.map((p) => p[1]);
      const el = document.createElement('div');
      el.className = `mw-zona${z.id === zonaAlerta ? ' mw-zona--alerta' : ''}`;
      el.textContent = z.id === zonaAlerta ? `${z.id} ${z.nombre} · ALERTA` : `${z.id} ${z.nombre}`;
      // esquina superior izquierda de la zona, para no tapar estaciones
      etiquetasZona.push(new Marker({ element: el, anchor: 'top-left', offset: [4, 4] })
        .setLngLat([Math.min(...lons), Math.max(...lats)]).addTo(mapa));
    }
  }

  function dibujarNodos(): void {
    marcadores.forEach((m) => m.remove());
    marcadores = [];
    if (!grafo) return;
    const enRuta = new Set(mision?.ruta ?? []);
    const omitidas = new Set((mision?.omitidas ?? []).map((o) => o.id));
    // orden de visita: primera aparición de cada estación en la ruta (el origen no lleva número)
    const orden = new Map<string, number>();
    const origen = mision?.ruta[0];
    (mision?.ruta ?? []).forEach((id) => { if (id !== origen && !orden.has(id)) orden.set(id, orden.size + 1); });

    for (const n of grafo.nodes) {
      const el = document.createElement('div');
      el.className = 'mw-nodo' + (enRuta.has(n.id) ? ' mw-nodo--ruta' : '') + (omitidas.has(n.id) ? ' mw-nodo--omitida' : '');
      el.title = `${n.id} · ${n.nombre} (${n.tipo})`;
      // ojo: no tocar el "position" del elemento; MapLibre lo posiciona con position:absolute
      el.innerHTML = `<span class="mw-nodo__punto"></span><span class="mw-nodo__texto"></span>`;
      (el.firstElementChild as HTMLElement).style.background = COLOR_TIPO[n.tipo] ?? '#e2e8f0';
      (el.lastElementChild as HTMLElement).textContent = `${n.id} ${n.nombre}`;
      if (orden.has(n.id)) {
        const b = document.createElement('span');
        b.className = 'mw-orden';
        b.textContent = String(orden.get(n.id));
        el.appendChild(b);
      }
      el.addEventListener('click', (ev) => { ev.stopPropagation(); opciones.onClickEstacion?.(n.id); });
      // anclado a la izquierda: el punto queda sobre la coordenada y el texto sale a la derecha
      marcadores.push(new Marker({ element: el, anchor: 'left', offset: [-7, 0] }).setLngLat([n.lon, n.lat]).addTo(mapa));
    }
  }

  function dibujarAristas(): void {
    if (!grafo) return;
    // una línea por par (A-B y B-A comparten geometría), de la versión más permisiva
    const maxLimite = Math.max(...grafo.edges.map((e) => e.limite_deg ?? 0));
    const vistas = new Set<string>();
    const unicas = grafo.edges.filter((e) => {
      const clave = [e.origen, e.destino].sort().join('-');
      if ((e.limite_deg ?? 0) !== maxLimite || vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    });
    fuente('aristas').setData(lineas(unicas));
  }

  function dibujarMision(encuadrar: boolean): void {
    fuente('ruta').setData(mision ? lineas(mision.tramos) : VACIO);
    dibujarNodos();
    if (encuadrar && mision?.tramos.length) {
      const b = limitesDe(mision.tramos.flatMap((t) => t.geometria));
      // más margen a la derecha: las etiquetas salen hacia ese lado
      if (b) mapa.fitBounds(b, { padding: { top: 60, bottom: 60, left: 60, right: 260 }, duration: 900, maxZoom: 15 });
    }
  }

  return {
    cargarGrafo(g) {
      grafo = g;
      cuandoCargue(() => { dibujarZonas(); dibujarAristas(); dibujarNodos(); });
    },
    mostrarMision(m) {
      mision = m;
      cuandoCargue(() => {
        // una misión nueva sin alerta limpia los tramos evitados
        if (!m?.aristas_afectadas) fuente('afectadas').setData(VACIO);
        dibujarMision(true);
      });
    },
    mostrarAlerta(m, zona) {
      const anterior = mision;
      mision = m;
      zonaAlerta = zona;
      cuandoCargue(() => {
        const afectadas = new Set(m.aristas_afectadas ?? []);
        const evitados = (anterior?.tramos ?? []).filter((t) => afectadas.has(`${t.origen}->${t.destino}`));
        fuente('afectadas').setData(lineas(evitados));
        dibujarZonas();
        dibujarMision(true);
      });
    },
    limpiar() {
      mision = null;
      zonaAlerta = null;
      cuandoCargue(() => {
        fuente('afectadas').setData(VACIO);
        mapa.setPaintProperty('zonas-relleno', 'fill-opacity', ['case', ['get', 'alerta'], 0.3, 0.06]);
        dibujarZonas();
        dibujarMision(false);
        mapa.fitBounds([[oeste, sur], [este, norte]], { duration: 600 });
      });
    },
    destruir() {
      cancelAnimationFrame(animacion);
      mapa.remove();
    },
  };
}
