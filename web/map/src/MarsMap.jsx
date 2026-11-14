import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { HUD, COLOR_TIPO } from './tokens.js';

// ---------------------------------------------------------------------------
// MarsMap: el mapa de la demo.
//
// Props (todo lo que Axl necesita para conectarlo desde web/ui/):
//   grafo     {zonas, nodes, edges}     → de GET /grafo (o graph_fake.json)
//   mision    RespuestaMision | null    → de /mision, /ruta, /alerta o /chat.ruta
//   alerta    {zona, tipo, aristas_afectadas} | null
//   geologia  resultado de getGeologia() | null
//   capas     {base, geologia, aristas, zonas} → visibilidad de cada capa (default: todas)
//   margen    {top, right, bottom, left} px que tapan los paneles (para encuadrar)
//   onSelectEstacion(id)  → click en un nodo (para abrir la ficha)
//   onCursor({lng, lat})  → posición del cursor sobre el mapa
//   onPaso(i)             → tramo que se está dibujando (-1 sin animación)
// ---------------------------------------------------------------------------

// Mapa base (plan B del spec, ya activo): el servicio OnMars/CTX usa una grilla
// geográfica que MapLibre no lee como teselas, así que scripts/descargar_base.mjs
// baja el recorte de Jezero a public/base/ y cada tesela va como image source.
// En un área de ~5 km la diferencia entre equirectangular y Mercator es despreciable.
// Debajo va el mosaico CTX completo del USGS SIM 3464 (~60 × 60 km, ~14 m/px), que
// genera web/scripts/sim3464/importar_sim3464.py: cubre todo el marco del mapa, así que
// al mover el mapa no aparece fondo vacío. Sus límites también fijan maxBounds.
const BASE_INDICE = '/base/teselas.json';
const BASE_AMPLIA = '/base/ctx_sim3464.json';
// Capas ráster del SIM 3464 (web/scripts/sim3464/capas_raster.py), de abajo hacia arriba.
export const CAPAS_INDICE = '/capas/capas.json';
const ORDEN_RASTER = ['themis_noche', 'relieve_dtm', 'pendiente_dtm'];

async function agregarMapaBase(map, antesDe) {
  try {
    const amplia = await (await fetch(BASE_AMPLIA)).json();
    map.addSource('base-amplia', { type: 'image', url: amplia.url, coordinates: amplia.coordinates });
    map.addLayer({
      id: 'base-amplia', type: 'raster', source: 'base-amplia',
      paint: { 'raster-saturation': -0.3, 'raster-brightness-max': 0.85, 'raster-fade-duration': 0 },
    }, antesDe);
    const [o, s, e, n] = amplia.limites;
    map.setMaxBounds([[o, s], [e, n]]);
  } catch {
    // Sin mosaico amplio: quedan solo las teselas de la zona de trabajo.
  }
  try {
    const { teselas } = await (await fetch(BASE_INDICE)).json();
    teselas.forEach((t, i) => {
      map.addSource(`base-${i}`, { type: 'image', url: t.url, coordinates: t.coordinates });
      map.addLayer({
        id: `base-${i}`, type: 'raster', source: `base-${i}`,
        paint: { 'raster-saturation': -0.3, 'raster-brightness-max': 0.85, 'raster-fade-duration': 0 },
      }, antesDe);
    });
  } catch {
    // Sin mapa base: queda el fondo hud-bg-deep y el resto del mapa funciona igual.
  }
  try {
    const capas = await (await fetch(CAPAS_INDICE)).json();
    for (const clave of ORDEN_RASTER) {
      const c = capas[clave];
      if (!c) continue;
      map.addSource(`r-${clave}`, { type: 'image', url: c.url, coordinates: c.coordinates });
      map.addLayer({
        id: `r-${clave}`, type: 'raster', source: `r-${clave}`,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
      }, antesDe);
    }
  } catch {
    // Sin capas ráster: el panel las muestra como no disponibles.
  }
  map.fire('marswalk:capas');
}

export { COLOR_TIPO };

const PASO_MS = 700; // tiempo entre tramos al animar la ruta

const vacia = () => ({ type: 'FeatureCollection', features: [] });

function nodosGeoJSON(nodes) {
  return {
    type: 'FeatureCollection',
    features: nodes.map((n) => ({
      type: 'Feature',
      properties: {
        id: n.id,
        nombre: n.nombre,
        tipo: n.tipo,
        color: COLOR_TIPO[n.tipo] ?? HUD.onSurface,
        valor: n.valor_cientifico ?? 0,
        elev: n.capas?.elev_m ?? null,
      },
      geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
    })),
  };
}

// Las aristas son dirigidas pero la geometría de ida y vuelta es la misma:
// se dibuja una sola línea por par.
function aristasGeoJSON(edges) {
  const vistos = new Set();
  const features = [];
  for (const e of edges) {
    const clave = [e.origen, e.destino].sort().join('|');
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    features.push({
      type: 'Feature',
      properties: { clave, origen: e.origen, destino: e.destino, pendiente: e.pendiente_max_deg },
      geometry: { type: 'LineString', coordinates: e.geometria },
    });
  }
  return { type: 'FeatureCollection', features };
}

function zonasGeoJSON(zonas = []) {
  return {
    type: 'FeatureCollection',
    features: zonas.map((z) => ({
      type: 'Feature',
      properties: { id: z.id, nombre: z.nombre },
      geometry: { type: 'Polygon', coordinates: [z.poligono] },
    })),
  };
}

function tramosGeoJSON(tramos) {
  return {
    type: 'FeatureCollection',
    features: tramos.map((t, i) => ({
      type: 'Feature',
      properties: { orden: i, origen: t.origen, destino: t.destino },
      geometry: { type: 'LineString', coordinates: t.geometria },
    })),
  };
}

// Aristas afectadas por la alerta ("HAB->M2"), buscadas en el grafo completo.
function afectadasGeoJSON(edges, ids = []) {
  const pares = new Set(ids.map((s) => s.split('->').sort().join('|')));
  return aristasGeoJSON(edges.filter((e) => pares.has([e.origen, e.destino].sort().join('|'))));
}

const MARGEN_DEFECTO = { top: 60, right: 60, bottom: 60, left: 60 };

function encuadrar(map, nodes, margen) {
  if (!nodes?.length) return;
  map.resize();
  const b = new maplibregl.LngLatBounds();
  nodes.forEach((n) => b.extend([n.lon, n.lat]));
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  // Si los paneles dejan poco espacio libre, se ignoran (pantallas chicas).
  const m = { ...MARGEN_DEFECTO, ...margen };
  const libre = w - m.left - m.right > 240 && h - m.top - m.bottom > 200;
  map.fitBounds(b, { padding: libre ? m : MARGEN_DEFECTO, duration: 0 });
}

// Grupos de capas que se prenden y apagan juntos.
const GRUPOS = {
  relieve: ['r-relieve_dtm'],
  pendiente: ['r-pendiente_dtm'],
  themis: ['r-themis_noche'],
  geologia: ['geo-fill', 'geo-superficies', 'geo-contactos', 'geo-contactos-inciertos', 'geo-rasgos', 'geo-crateres', 'geo-label'],
  aristas: ['aristas'],
  zonas: ['zonas-line', 'zonas-label'],
};

// [propiedad de opacidad, valor con el slider al 100 %]
const OPACIDAD = {
  raster: ['raster-opacity', 1],
  'geo-fill': ['fill-opacity', 0.35],
  'geo-superficies': ['fill-opacity', 0.3],
  'geo-contactos': ['line-opacity', 0.6],
  'geo-contactos-inciertos': ['line-opacity', 0.6],
  'geo-rasgos': ['line-opacity', 0.9],
  'geo-crateres': ['circle-stroke-opacity', 0.7],
  'geo-label': ['text-opacity', 0.8],
  aristas: ['line-opacity', 0.55],
  'zonas-line': ['line-opacity', 0.7],
  'zonas-label': ['text-opacity', 0.9],
};

/** Waypoint cartográfico: retícula + línea guía + etiqueta con código y elevación. */
function crearWaypoint(n, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'wp';
  el.style.setProperty('--c', COLOR_TIPO[n.tipo] ?? HUD.onSurface);
  el.setAttribute('aria-label', `${n.id}, ${n.nombre}`);
  el.title = `${n.id} · ${n.nombre}`;
  const elev = n.capas?.elev_m;
  el.innerHTML = '<span class="wp-ret" aria-hidden="true"></span><span class="wp-guia" aria-hidden="true"></span>'
    + `<span class="wp-tag"><b>${n.id}</b>${elev != null ? `<i>${elev} m</i>` : ''}</span>`;
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(n.id); });
  return el;
}

function centroide(poligono) {
  const pts = poligono.slice(0, -1);
  const s = pts.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
}

export default function MarsMap({
  grafo, mision, alerta, geologia, capas, margen,
  onSelectEstacion, onCursor, onPaso,
}) {
  const contenedor = useRef(null);
  const mapRef = useRef(null);
  const listo = useRef(false);
  const cb = useRef({});
  cb.current = { onSelectEstacion, onCursor, onPaso };
  const margenRef = useRef(margen);
  margenRef.current = margen;
  const nodosRef = useRef(null);
  const waypoints = useRef({});
  const movido = useRef(false);

  // --- Crear el mapa una sola vez -----------------------------------------
  useEffect(() => {
    const map = new maplibregl.Map({
      container: contenedor.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {},
        layers: [
          { id: 'fondo', type: 'background', paint: { 'background-color': HUD.bgDeep } },
        ],
      },
      center: [77.43, 18.445],
      zoom: 13.5,
      renderWorldCopies: false,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'CTX: NASA/JPL-Caltech/MSSS · Murray Lab/Caltech · Esri · DTM, THEMIS y geología: USGS SIM 3464 (Sun y Stack, 2020)',
    }));
    // El contenedor puede medir 0 al montar (estilos aún sin aplicar): seguir su tamaño
    // y volver a encuadrar mientras el usuario no haya movido el mapa.
    const ro = new ResizeObserver(() => {
      map.resize();
      if (!movido.current && nodosRef.current) encuadrar(map, nodosRef.current, margenRef.current);
    });
    ro.observe(contenedor.current);
    const alMover = (e) => { if (e.originalEvent) movido.current = true; };
    map.on('dragstart', alMover);
    map.on('zoomstart', alMover);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      for (const id of ['geo-poligonos', 'geo-lineas', 'geo-rasgos', 'geo-superficies', 'geo-puntos', 'zonas', 'aristas', 'afectadas', 'ruta', 'actual']) {
        map.addSource(id, { type: 'geojson', data: vacia() });
      }
      // Los ids de estación son texto ("HAB", "E1"): promoteId los vuelve ids de feature
      // para que funcione setFeatureState (en_ruta, omitida).
      map.addSource('nodos', { type: 'geojson', data: vacia(), promoteId: 'id' });

      // Geología (SIM 3464): debajo de todo lo operativo
      map.addLayer({
        id: 'geo-fill', type: 'fill', source: 'geo-poligonos',
        paint: { 'fill-color': ['get', '_color'], 'fill-opacity': 0.35 },
      });
      // Manto oscuro y terreno con crestas (SurfaceFeatures): tinte encima de la unidad
      map.addLayer({
        id: 'geo-superficies', type: 'fill', source: 'geo-superficies',
        paint: {
          'fill-color': ['match', ['get', 'feature_type'], 'dark-colored mantling material', '#000000', HUD.onSurfaceVariant],
          'fill-opacity': ['match', ['get', 'feature_type'], 'dark-colored mantling material', 0.28, 0.12],
          'fill-outline-color': HUD.outline,
        },
      });
      // Contactos: certero = continuo; aproximado o inferido = punteado
      const esIncierto = ['any',
        ['in', 'approx', ['downcase', ['to-string', ['get', 'certainty']]]],
        ['in', 'aprox', ['downcase', ['to-string', ['get', 'certainty']]]],
        ['in', 'infer', ['downcase', ['to-string', ['get', 'certainty']]]],
      ];
      const contacto = { 'line-color': HUD.onSurfaceVariant, 'line-opacity': 0.6, 'line-width': 0.8 };
      map.addLayer({
        id: 'geo-contactos', type: 'line', source: 'geo-lineas',
        filter: ['!', esIncierto], paint: contacto,
      });
      map.addLayer({
        id: 'geo-contactos-inciertos', type: 'line', source: 'geo-lineas',
        filter: esIncierto, paint: { ...contacto, 'line-dasharray': [2, 2] },
      });
      // Rasgos lineales: frentes de lóbulo del delta, canales, bordes de cráter
      map.addLayer({
        id: 'geo-rasgos', type: 'line', source: 'geo-rasgos',
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': ['match', ['get', 'feature_type'],
            'delta lobe front', HUD.secondary,
            'channel (fluvial)', HUD.tertiary,
            'crest of crater rim', HUD.marsRust,
            HUD.onSurfaceVariant],
          'line-width': ['match', ['get', 'feature_type'], 'delta lobe front', 1.6, 'channel (fluvial)', 2, 1.2],
          'line-opacity': 0.85,
        },
      });
      // Cráteres chicos y megabrecha (puntos)
      map.addLayer({
        id: 'geo-crateres', type: 'circle', source: 'geo-puntos', minzoom: 12,
        paint: {
          'circle-radius': 3, 'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': HUD.onSurfaceVariant, 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.7,
        },
      });
      map.addLayer({
        id: 'geo-label', type: 'symbol', source: 'geo-poligonos', minzoom: 12,
        layout: {
          'text-field': ['coalesce', ['get', 'unit_symbol'], ''],
          'text-font': ['Open Sans Semibold'],
          'text-size': 11,
        },
        paint: { 'text-color': HUD.onSurface, 'text-opacity': 0.75, 'text-halo-color': HUD.bgDeep, 'text-halo-width': 1 },
      });

      // Zonas de alerta
      map.addLayer({
        id: 'zonas-fill', type: 'fill', source: 'zonas',
        paint: { 'fill-color': HUD.critical, 'fill-opacity': 0 },
      });
      map.addLayer({
        id: 'zonas-line', type: 'line', source: 'zonas',
        paint: { 'line-color': HUD.outline, 'line-opacity': 0.6, 'line-width': 1, 'line-dasharray': [2, 2] },
      });
      map.addLayer({
        id: 'zonas-label', type: 'symbol', source: 'zonas',
        layout: { 'text-field': ['get', 'id'], 'text-size': 11, 'text-font': ['Open Sans Semibold'] },
        paint: { 'text-color': HUD.onSurfaceVariant, 'text-opacity': 0.8, 'text-halo-color': HUD.bgDeep, 'text-halo-width': 1 },
      });

      // Todas las aristas del grafo (fondo tenue)
      map.addLayer({
        id: 'aristas', type: 'line', source: 'aristas',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': HUD.outline, 'line-opacity': 0.55, 'line-width': 1, 'line-dasharray': [3, 2] },
      });

      // Aristas cortadas por la alerta
      map.addLayer({
        id: 'afectadas', type: 'line', source: 'afectadas',
        paint: { 'line-color': HUD.critical, 'line-width': 4, 'line-opacity': 0.9, 'line-dasharray': [1, 1.5] },
      });

      // Ruta: halo + línea
      map.addLayer({
        id: 'ruta-halo', type: 'line', source: 'ruta',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': HUD.casing, 'line-width': 7.5 },
      });
      map.addLayer({
        id: 'ruta', type: 'line', source: 'ruta',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': HUD.ruta, 'line-width': 3.5 },
      });

      // Nodo actual de la animación
      map.addLayer({
        id: 'actual', type: 'circle', source: 'actual',
        paint: {
          'circle-radius': 17, 'circle-opacity': 0,
          'circle-stroke-color': HUD.ruta, 'circle-stroke-width': 2,
        },
      });

      map.on('mousemove', (e) => cb.current.onCursor?.(e.lngLat));

      // Unidad geológica bajo el cursor (solo si no hay un nodo encima)
      const popupGeo = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      map.on('mousemove', 'geo-fill', (e) => {
        if (e.originalEvent?.target?.closest?.('.wp')) return popupGeo.remove();
        const p = e.features[0].properties;
        const titulo = [p.unit_symbol, p.unit_name].filter(Boolean).join(' · ');
        const sub = [p.age_prefix, p.feature_type].filter(Boolean).join(' · ');
        popupGeo.setLngLat(e.lngLat).setHTML(`<b>${titulo || 'Unidad'}</b>${sub ? `<br/>${sub}` : ''}`).addTo(map);
      });
      map.on('mouseleave', 'geo-fill', () => popupGeo.remove());
      const RASGO_ES = {
        'delta lobe front': 'Frente de lóbulo del delta',
        'channel (fluvial)': 'Canal fluvial',
        'crest of crater rim': 'Cresta de borde de cráter',
        'crest of buried crater': 'Cresta de cráter enterrado',
        'ridge crest (type 1), certain': 'Cresta de loma',
        lineament: 'Lineamiento',
      };
      map.on('mousemove', 'geo-rasgos', (e) => {
        const p = e.features[0].properties;
        popupGeo.setLngLat(e.lngLat).setHTML(`<b>${RASGO_ES[p.feature_type] ?? p.feature_type}</b><br/>SIM 3464 · ${p.source_layer}`).addTo(map);
      });
      map.on('mouseleave', 'geo-rasgos', () => popupGeo.remove());

      agregarMapaBase(map, 'geo-fill');

      listo.current = true;
      map.fire('marswalk:listo');
    });

    mapRef.current = map;
    if (import.meta.env.DEV) window.__marsMap = map; // depuración desde la consola
    return () => {
      listo.current = false;
      ro.disconnect();
      map.remove();
    };
  }, []);

  // Ejecuta fn cuando el mapa ya cargó sus capas.
  const cuandoListo = (fn) => {
    const map = mapRef.current;
    if (!map) return () => {};
    if (listo.current) {
      return fn(map) ?? (() => {});
    }
    let limpiar = () => {};
    const h = () => { limpiar = fn(map) ?? (() => {}); };
    map.once('marswalk:listo', h);
    return () => { map.off('marswalk:listo', h); limpiar(); };
  };

  // --- Grafo: nodos, aristas y zonas ---------------------------------------
  useEffect(() => cuandoListo((map) => {
    if (!grafo) return;
    map.getSource('nodos').setData(nodosGeoJSON(grafo.nodes));
    Object.values(waypoints.current).forEach((m) => m.remove());
    waypoints.current = Object.fromEntries(grafo.nodes.map((n) => [
      n.id,
      new maplibregl.Marker({ element: crearWaypoint(n, (id) => cb.current.onSelectEstacion?.(id)), anchor: 'center' })
        .setLngLat([n.lon, n.lat]).addTo(map),
    ]));
    // MapLibre pone aria-label='Map marker': devolverle el nombre de la estación.
    grafo.nodes.forEach((n) => waypoints.current[n.id].getElement().setAttribute('aria-label', `Estación ${n.id}, ${n.nombre}`));
    map.getSource('aristas').setData(aristasGeoJSON(grafo.edges));
    map.getSource('zonas').setData(zonasGeoJSON(grafo.zonas));
    nodosRef.current = grafo.nodes;
    if (!movido.current) encuadrar(map, grafo.nodes, margenRef.current);
  }), [grafo]);

  // --- Geología: unidades y contactos del SIM 3464 -------------------------
  useEffect(() => cuandoListo((map) => {
    map.getSource('geo-poligonos').setData(geologia?.poligonos ?? vacia());
    map.getSource('geo-lineas').setData(geologia?.lineas ?? vacia());
    map.getSource('geo-rasgos').setData(geologia?.rasgos ?? vacia());
    map.getSource('geo-superficies').setData(geologia?.superficies ?? vacia());
    map.getSource('geo-puntos').setData(geologia?.puntos ?? vacia());
  }), [geologia]);

  // --- Capas visibles ------------------------------------------------------
  const claveCapas = JSON.stringify(capas ?? {});
  useEffect(() => cuandoListo((map) => {
    const estado = (g) => {
      const v = capas?.[g];
      if (v == null) return { on: g === 'base' || g === 'geologia' || g === 'aristas' || g === 'zonas', op: 1 };
      return typeof v === 'boolean' ? { on: v, op: 1 } : { on: !!v.on, op: v.op ?? 1 };
    };
    const poner = (id, { on, op }) => {
      const l = map.getLayer(id);
      if (!l) return;
      map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      const [prop, base] = OPACIDAD[l.type === 'raster' ? 'raster' : id] ?? [];
      if (prop) map.setPaintProperty(id, prop, base * op);
    };
    const aplicar = () => {
      Object.entries(GRUPOS).forEach(([g, ids]) => ids.forEach((id) => poner(id, estado(g))));
      map.getStyle().layers.filter((l) => l.id.startsWith('base-')).forEach((l) => poner(l.id, estado('base')));
    };
    aplicar();
    // Las imágenes base y las capas ráster llegan después de 'load': reaplicar cuando aparezcan.
    map.on('sourcedata', aplicar);
    map.on('marswalk:capas', aplicar);
    return () => { map.off('sourcedata', aplicar); map.off('marswalk:capas', aplicar); };
  }), [claveCapas]);

  // --- Ruta: se dibuja tramo por tramo -------------------------------------
  useEffect(() => cuandoListo((map) => {
    if (!grafo) return;
    const nodos = grafo.nodes;
    const clase = (id, c, on) => waypoints.current[id]?.getElement().classList.toggle(c, on);
    nodos.forEach((n) => {
      map.setFeatureState({ source: 'nodos', id: n.id }, { en_ruta: false, omitida: false });
      clase(n.id, 'en-ruta', false);
      clase(n.id, 'omitida', false);
    });
    map.getSource('ruta').setData(vacia());
    map.getSource('actual').setData(vacia());
    cb.current.onPaso?.(-1);
    if (!mision) return;

    (mision.omitidas ?? []).forEach((o) => {
      if (nodos.some((n) => n.id === o.id)) {
        map.setFeatureState({ source: 'nodos', id: o.id }, { omitida: true });
        clase(o.id, 'omitida', true);
      }
    });

    const tramos = mision.tramos ?? [];
    const porId = Object.fromEntries(nodos.map((n) => [n.id, n]));
    let paso = 0;
    const marcar = (id) => {
      const n = porId[id];
      if (!n) return;
      map.setFeatureState({ source: 'nodos', id }, { en_ruta: true });
      clase(id, 'en-ruta', true);
      map.getSource('actual').setData({
        type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
      });
    };
    if (tramos.length) marcar(tramos[0].origen);

    const timer = setInterval(() => {
      if (paso >= tramos.length) {
        clearInterval(timer);
        map.getSource('actual').setData(vacia());
        cb.current.onPaso?.(-1);
        return;
      }
      cb.current.onPaso?.(paso);
      paso += 1;
      map.getSource('ruta').setData(tramosGeoJSON(tramos.slice(0, paso)));
      marcar(tramos[paso - 1].destino);
    }, PASO_MS);
    return () => clearInterval(timer);
  }), [grafo, mision]);

  // --- Alerta: zona parpadeando + aristas cortadas -------------------------
  useEffect(() => cuandoListo((map) => {
    const edges = grafo?.edges ?? [];
    map.getSource('afectadas').setData(afectadasGeoJSON(edges, alerta?.aristas_afectadas));
    if (!alerta?.zona) {
      map.setPaintProperty('zonas-fill', 'fill-opacity', 0);
      return;
    }
    map.setFilter('zonas-fill', ['==', ['get', 'id'], alerta.zona]);

    // Aviso Nivel 3 anclado al centro de la zona
    const zona = grafo?.zonas?.find((z) => z.id === alerta.zona);
    let aviso;
    if (zona) {
      const el = document.createElement('div');
      el.className = 'aviso-mapa';
      const n = alerta.aristas_afectadas?.length ?? 0;
      const tipo = (alerta.tipo ?? 'polvo').toUpperCase();
      el.innerHTML = '<span class="aviso-titulo">Alerta crítica · ' + tipo + '</span>'
        + '<span class="aviso-zona">' + (zona.nombre ?? zona.id) + ' · ' + zona.id + '</span>'
        + '<span class="aviso-dato">' + n + (n === 1 ? ' tramo bloqueado' : ' tramos bloqueados') + '</span>';
      aviso = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(centroide(zona.poligono)).addTo(map);
    }
    let raf;
    const t0 = performance.now();
    const latir = (t) => {
      const fase = (Math.sin((t - t0) / 250) + 1) / 2; // 0..1
      map.setPaintProperty('zonas-fill', 'fill-opacity', 0.15 + 0.3 * fase);
      raf = requestAnimationFrame(latir);
    };
    raf = requestAnimationFrame(latir);
    return () => { cancelAnimationFrame(raf); aviso?.remove(); };
  }), [grafo, alerta]);

  return <div ref={contenedor} className="mapa" />;
}
