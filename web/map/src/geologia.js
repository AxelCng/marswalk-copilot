// Capa geológica del mapa, basada en el modelo estrella del USGS SIM 3464
// (Jezero / Nili Planum): fact_map_feature + dim_geologic_unit, dim_feature_type,
// dim_spatial_context y dim_map.
//
// El mapa consume UN GeoJSON "aplanado": cada Feature es una fila de
// fact_map_feature con sus dimensiones ya unidas (join por *_key) y la
// geometría de geom_wkt reprojectada de MTM 77.5°E a lon/lat (EPSG:4326 Marte).
// La conversión desde el .gdb la hace data/ (Pedro); aquí solo se dibuja.
//
// properties esperadas (las que falten se ignoran):
//   fact_map_feature : feature_key, unit_key, feature_type_key, spatial_context_key,
//                      source_layer, source_objectid, feature_count, length_m, area_m2
//   dim_geologic_unit: unit_code, unit_name, unit_symbol, symbol_base, subscript,
//                      color_id, age_prefix
//   dim_feature_type : feature_group, feature_type, certainty, geometry_type
//   dim_spatial_context: in_landing_ellipse, in_figure_area, on_cross_section
//   opcional         : color_hex  → color oficial de la unidad (si data/ lo resuelve desde color_id)

import { API_URL } from './api.js';

/**
 * Busca la capa geológica: primero GET /geologia en la API, luego
 * web/map/public/geologia.geojson. Devuelve null si no hay ninguna.
 */
export async function getGeologia() {
  for (const url of [`${API_URL}/geologia`, '/geologia.geojson']) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const g = await res.json();
      if (g?.type === 'FeatureCollection' && Array.isArray(g.features)) {
        return separar(g);
      }
    } catch {
      /* siguiente fuente */
    }
  }
  return null;
}

// Paleta de respaldo cuando no viene color_hex: tonos tierra y minerales,
// apagados para que la ruta cian y los nodos sigan mandando sobre el mapa.
const PALETA = [
  '#b8734a', '#8f6a4f', '#c49a5a', '#7d8a5c', '#5f7d7a',
  '#a35d4e', '#9c8b6e', '#6e6a8a', '#b38b8b', '#7a9a8a',
];

function colorDeUnidad(p) {
  if (typeof p.color_hex === 'string' && /^#[0-9a-f]{6}$/i.test(p.color_hex)) return p.color_hex;
  const clave = String(p.color_id ?? p.unit_symbol ?? p.unit_key ?? '');
  let h = 0;
  for (const c of clave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

/**
 * Separa por feature_group del modelo estrella:
 *   Unidad → poligonos · Contacto → lineas · Rasgo lineal → rasgos
 *   Rasgo superficial → superficies · Rasgo puntual / Megabrecha → puntos
 * Si no viene feature_group, decide por geometría (polígono = unidad, línea = contacto).
 * Agrega `_color` a cada feature y arma la leyenda por unidad.
 */
function separar(fc) {
  const poligonos = [];
  const lineas = [];
  const rasgos = [];
  const superficies = [];
  const puntos = [];
  const unidades = new Map();

  for (const f of fc.features) {
    if (!f?.geometry) continue;
    const p = { ...(f.properties ?? {}) };
    p._color = colorDeUnidad(p);
    const feat = { type: 'Feature', properties: p, geometry: f.geometry };
    const tipo = f.geometry.type;

    const grupo = p.feature_group;
    if (grupo === 'Rasgo superficial') {
      superficies.push(feat);
    } else if (grupo === 'Rasgo lineal') {
      rasgos.push(feat);
    } else if (tipo === 'Point' || tipo === 'MultiPoint') {
      puntos.push(feat);
    } else if (tipo === 'Polygon' || tipo === 'MultiPolygon') {
      poligonos.push(feat);
      const clave = p.unit_key ?? p.unit_symbol;
      if (clave != null && !unidades.has(clave)) {
        unidades.set(clave, {
          clave,
          simbolo: p.unit_symbol ?? String(clave),
          nombre: p.unit_name ?? '',
          edad: p.age_prefix ?? '',
          color: p._color,
          area_m2: 0,
        });
      }
      if (clave != null) unidades.get(clave).area_m2 += Number(p.area_m2) || 0;
    } else if (tipo === 'LineString' || tipo === 'MultiLineString') {
      lineas.push(feat);
    }
  }

  return {
    poligonos: { type: 'FeatureCollection', features: poligonos },
    lineas: { type: 'FeatureCollection', features: lineas },
    rasgos: { type: 'FeatureCollection', features: rasgos },
    superficies: { type: 'FeatureCollection', features: superficies },
    puntos: { type: 'FeatureCollection', features: puntos },
    meta: fc.meta ?? null,
    // Leyenda ordenada por área cubierta: las unidades que más se ven, primero.
    leyenda: [...unidades.values()].sort((a, b) => b.area_m2 - a.area_m2),
  };
}

/** Unidad geológica bajo un punto [lon, lat] (para la ficha de estación). */
export function unidadEnPunto(map, lngLat) {
  if (!map?.getLayer('geo-fill')) return null;
  const px = map.project(lngLat);
  const f = map.queryRenderedFeatures(px, { layers: ['geo-fill'] })[0];
  return f ? f.properties : null;
}
