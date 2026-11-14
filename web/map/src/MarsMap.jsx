import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { HUD, COLOR_TIPO } from './tokens.js';

// ---------------------------------------------------------------------------
// MarsMap: el mapa de la demo.
//
// Props (todo lo que Axl necesita para conectarlo desde web/ui/):
//   grafo   {zonas, nodes, edges}    → de GET /grafo (o graph_fake.json)
//   mision  RespuestaMision | null   → de /mision, /ruta, /alerta o /chat.ruta
//   alerta  {zona, aristas_afectadas} | null
//   onSelectEstacion(id)             → click en un nodo (para abrir la ficha)
// ---------------------------------------------------------------------------

// Mapa base (plan B del spec, ya activo): el servicio OnMars/CTX usa una grilla
// geográfica que MapLibre no lee como teselas, así que scripts/descargar_base.mjs
// baja el recorte de Jezero a public/base/ y cada tesela va como image source.
// En un área de ~5 km la diferencia entre equirectangular y Mercator es despreciable.
const BASE_INDICE = '/base/teselas.json';

async function agregarMapaBase(map, antesDe) {
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

function encuadrar(map, nodes) {
  if (!nodes?.length) return;
  map.resize();
  const b = new maplibregl.LngLatBounds();
  nodes.forEach((n) => b.extend([n.lon, n.lat]));
  // A la izquierda queda el panel (320px + márgenes): no tapar estaciones con él.
  const ancho = map.getContainer().clientWidth;
  const izq = ancho > 700 ? 380 : 40;
  map.fitBounds(b, { padding: { top: 60, bottom: 60, left: izq, right: 60 }, duration: 0 });
}

const CAPAS_GEO = ['geo-fill', 'geo-contactos', 'geo-contactos-inciertos', 'geo-label'];

export default function MarsMap({ grafo, mision, alerta, geologia, mostrarGeologia = true, onSelectEstacion }) {
  const contenedor = useRef(null);
  const mapRef = useRef(null);
  const listo = useRef(false);
  const onSelectRef = useRef(onSelectEstacion);
  onSelectRef.current = onSelectEstacion;

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
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'CTX: NASA/JPL-Caltech/MSSS · Murray Lab/Caltech · Esri',
    }));
    // El contenedor puede medir 0 al montar (estilos aún sin aplicar): seguir su tamaño.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(contenedor.current);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      for (const id of ['geo-poligonos', 'geo-lineas', 'zonas', 'aristas', 'afectadas', 'ruta', 'actual']) {
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
        paint: { 'line-color': HUD.cyanDim, 'line-opacity': 0.55, 'line-width': 1.2 },
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
        paint: { 'line-color': HUD.cyan, 'line-opacity': 0.25, 'line-width': 10, 'line-blur': 4 },
      });
      map.addLayer({
        id: 'ruta', type: 'line', source: 'ruta',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': HUD.cyan, 'line-width': 3.5 },
      });

      // Nodo actual de la animación
      map.addLayer({
        id: 'actual', type: 'circle', source: 'actual',
        paint: {
          'circle-radius': 16, 'circle-color': HUD.cyan, 'circle-opacity': 0.15,
          'circle-stroke-color': HUD.cyan, 'circle-stroke-width': 1.5,
        },
      });

      // Nodos
      map.addLayer({
        id: 'nodos', type: 'circle', source: 'nodos',
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'en_ruta'], false], 9, 7],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': [
            'case',
            ['boolean', ['feature-state', 'omitida'], false], HUD.warning,
            ['boolean', ['feature-state', 'en_ruta'], false], HUD.cyan,
            HUD.bgDeep,
          ],
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'omitida'], false], 3, 2],
          'circle-opacity': ['case', ['boolean', ['feature-state', 'omitida'], false], 0.5, 1],
        },
      });
      map.addLayer({
        id: 'nodos-label', type: 'symbol', source: 'nodos',
        layout: {
          'text-field': ['get', 'id'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 12,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
        },
        paint: { 'text-color': HUD.onSurface, 'text-halo-color': HUD.bgDeep, 'text-halo-width': 1.5 },
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      map.on('mouseenter', 'nodos', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        popup.setLngLat(e.lngLat).setHTML(`<b>${p.id}</b> · ${p.nombre}<br/>${p.tipo} · valor ${p.valor}`).addTo(map);
      });
      map.on('mouseleave', 'nodos', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });
      map.on('click', 'nodos', (e) => onSelectRef.current?.(e.features[0].properties.id));

      // Unidad geológica bajo el cursor (solo si no hay un nodo encima)
      const popupGeo = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      map.on('mousemove', 'geo-fill', (e) => {
        if (map.queryRenderedFeatures(e.point, { layers: ['nodos'] }).length) return popupGeo.remove();
        const p = e.features[0].properties;
        const titulo = [p.unit_symbol, p.unit_name].filter(Boolean).join(' · ');
        const sub = [p.age_prefix, p.feature_type].filter(Boolean).join(' · ');
        popupGeo.setLngLat(e.lngLat).setHTML(`<b>${titulo || 'Unidad'}</b>${sub ? `<br/>${sub}` : ''}`).addTo(map);
      });
      map.on('mouseleave', 'geo-fill', () => popupGeo.remove());

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
    map.getSource('aristas').setData(aristasGeoJSON(grafo.edges));
    map.getSource('zonas').setData(zonasGeoJSON(grafo.zonas));
    encuadrar(map, grafo.nodes);
  }), [grafo]);

  // --- Geología: unidades y contactos del SIM 3464 -------------------------
  useEffect(() => cuandoListo((map) => {
    map.getSource('geo-poligonos').setData(geologia?.poligonos ?? vacia());
    map.getSource('geo-lineas').setData(geologia?.lineas ?? vacia());
  }), [geologia]);

  useEffect(() => cuandoListo((map) => {
    const v = mostrarGeologia ? 'visible' : 'none';
    CAPAS_GEO.forEach((id) => map.setLayoutProperty(id, 'visibility', v));
  }), [mostrarGeologia]);

  // --- Ruta: se dibuja tramo por tramo -------------------------------------
  useEffect(() => cuandoListo((map) => {
    if (!grafo) return;
    const nodos = grafo.nodes;
    nodos.forEach((n) => map.setFeatureState({ source: 'nodos', id: n.id }, { en_ruta: false, omitida: false }));
    map.getSource('ruta').setData(vacia());
    map.getSource('actual').setData(vacia());
    if (!mision) return;

    (mision.omitidas ?? []).forEach((o) => {
      if (nodos.some((n) => n.id === o.id)) map.setFeatureState({ source: 'nodos', id: o.id }, { omitida: true });
    });

    const tramos = mision.tramos ?? [];
    const porId = Object.fromEntries(nodos.map((n) => [n.id, n]));
    let paso = 0;
    const marcar = (id) => {
      const n = porId[id];
      if (!n) return;
      map.setFeatureState({ source: 'nodos', id }, { en_ruta: true });
      map.getSource('actual').setData({
        type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
      });
    };
    if (tramos.length) marcar(tramos[0].origen);

    const timer = setInterval(() => {
      if (paso >= tramos.length) {
        clearInterval(timer);
        map.getSource('actual').setData(vacia());
        return;
      }
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
    let raf;
    const t0 = performance.now();
    const latir = (t) => {
      const fase = (Math.sin((t - t0) / 250) + 1) / 2; // 0..1
      map.setPaintProperty('zonas-fill', 'fill-opacity', 0.15 + 0.3 * fase);
      raf = requestAnimationFrame(latir);
    };
    raf = requestAnimationFrame(latir);
    return () => cancelAnimationFrame(raf);
  }), [grafo, alerta]);

  return <div ref={contenedor} className="mapa" />;
}
