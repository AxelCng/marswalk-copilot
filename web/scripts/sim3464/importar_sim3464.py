"""Importa la base USGS SIM 3464 (Jezero / Nili Planum) para las dos interfaces web.

Entrada: la carpeta `sim3464_database` (Nili.gdb + rásters + modelo_estrella.sql).
Salidas:
  web/scripts/sim3464/out/sim3464_estrella.sqlite   modelo estrella completo (no se sube a git)
  web/map/public/geologia.geojson                   fact_map_feature aplanado, en todo el marco del mapa
  web/map/public/base/ctx_sim3464.jpg + .json       mosaico CTX del SIM 3464 en Mercator de Marte (fondo del mapa)
  web/shared/sim3464/geologia_ruta.geojson          solo unidades, recorte chico (minimapa del HUD)
  web/shared/sim3464/estaciones_capas.json          valores reales muestreados en cada estación

Uso:
  pip install pyogrio rasterio pyproj shapely numpy pillow
  python web/scripts/sim3464/importar_sim3464.py "C:/ruta/a/sim3464_database"

Nada se inventa: cada valor de salida trae el producto del que salió.
"""

import argparse
import csv
import json
import math
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pyogrio.raw as raw
import rasterio
from pyproj import CRS, Transformer
from shapely import wkb
from shapely.geometry import Point, box, mapping
from shapely.ops import transform as sh_transform, unary_union

REPO = Path(__file__).resolve().parents[3]
AQUI = Path(__file__).resolve().parent

# El mapa cubre todo el SIM 3464: el rectángulo lon/lat que cae entero dentro del mosaico CTX
# (se calcula en main). El HUD usa solo el recorte de la ruta.
AOI_RUTA = (77.385, 18.420, 77.470, 18.475)
SIMPLIFICAR_M = {'mapa': 8.0, 'ruta': 12.0}
BASE_ANCHO_PX = 4096  # ~14 m/px sobre ~60 km; las teselas CTX de 5 m siguen encima en la zona de trabajo
R_MARTE = 3396190.0

# capa del gdb → (feature_group, campo TYPE o None)
CAPAS = {
    'GeoUnits_v1': None,
    'GeoContacts': 'TYPE',
    'LinearFeatures': 'TYPE',
    'SurfaceFeatures': 'TYPE',
    'LocationFeatures': 'TYPE',
    'megabreccia_fig2': 'TYPE',
}


def leer(gdb, capa):
    meta, _fid, geoms, campos = raw.read(gdb, layer=capa)
    nombres = list(meta['fields'])
    filas = []
    for i, g in enumerate(geoms):
        props = {n: campos[j][i] for j, n in enumerate(nombres)}
        filas.append((i + 1, props, wkb.loads(bytes(g)) if g is not None else None))
    return CRS.from_wkt(meta['crs']) if meta['crs'].startswith(('PROJCS', 'PROJCRS')) else CRS.from_user_input(meta['crs']), filas


def num(v):
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def crear_sqlite(destino, sql_estrella):
    destino.parent.mkdir(parents=True, exist_ok=True)
    if destino.exists():
        destino.unlink()
    con = sqlite3.connect(destino)
    con.executescript(sql_estrella)
    return con


def rectangulo_interior(tif, a_lonlat):
    """Rectángulo lon/lat más grande alineado a los ejes que cae dentro del ráster en MTM."""
    with rasterio.open(tif) as d:
        b = d.bounds
    t = np.linspace(0, 1, 200)
    izq = a_lonlat.transform(np.full_like(t, b.left), b.bottom + t * (b.top - b.bottom))
    der = a_lonlat.transform(np.full_like(t, b.right), b.bottom + t * (b.top - b.bottom))
    aba = a_lonlat.transform(b.left + t * (b.right - b.left), np.full_like(t, b.bottom))
    arr = a_lonlat.transform(b.left + t * (b.right - b.left), np.full_like(t, b.top))
    margen = 0.002  # ~120 m hacia adentro, para no tocar el borde del mosaico
    return (max(izq[0]) + margen, max(aba[1]) + margen, min(der[0]) - margen, min(arr[1]) - margen)


def exportar_base(tif, aoi, crs_mtm):
    """Reproyecta el mosaico CTX a Mercator de Marte para usarlo como image source de MapLibre."""
    from PIL import Image
    from rasterio.warp import Resampling, reproject

    merc = CRS.from_proj4(f'+proj=merc +R={R_MARTE} +units=m +no_defs')
    a_merc = Transformer.from_crs(crs_mtm.geodetic_crs, merc, always_xy=True)
    x0, y0 = a_merc.transform(aoi[0], aoi[1])
    x1, y1 = a_merc.transform(aoi[2], aoi[3])
    ancho = BASE_ANCHO_PX
    alto = round(ancho * (y1 - y0) / (x1 - x0))
    destino = np.zeros((alto, ancho), dtype='uint8')
    with rasterio.open(tif) as d:
        reproject(
            source=rasterio.band(d, 1), destination=destino,
            dst_transform=rasterio.transform.from_bounds(x0, y0, x1, y1, ancho, alto),
            dst_crs=merc.to_wkt(), resampling=Resampling.average,
        )
    salida = REPO / 'web/map/public/base/ctx_sim3464.jpg'
    salida.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(destino, 'L').save(salida, quality=78, optimize=True, progressive=True)
    indice = {
        'fuente': 'Mosaico CTX Caltech (Murray Lab, feb 2018) incluido en USGS SIM 3464 · NASA/JPL-Caltech/MSSS',
        'metros_por_pixel': round((x1 - x0) / ancho, 1),
        'limites': [round(v, 6) for v in aoi],
        'url': '/base/ctx_sim3464.jpg',
        'coordinates': [[aoi[0], aoi[3]], [aoi[2], aoi[3]], [aoi[2], aoi[1]], [aoi[0], aoi[1]]],
    }
    (salida.parent / 'ctx_sim3464.json').write_text(json.dumps(indice, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'  web/map/public/base/ctx_sim3464.jpg  {ancho}x{alto}  {salida.stat().st_size / 1e6:.2f} MB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('db', help='carpeta sim3464_database')
    args = ap.parse_args()
    base = Path(args.db)
    fin = base / 'sim3464_JezeroNili_FINAL'
    gdb = str(fin / 'Geodatabase' / 'Nili.gdb')
    rasters = fin / 'Rasters'

    # ---------- modelo estrella ----------
    sql = (base / 'modelo_estrella.sql').read_text(encoding='utf-8')
    con = crear_sqlite(AQUI / 'out' / 'sim3464_estrella.sqlite', sql)
    cur = con.cursor()
    unidades = {(str(r[1]), r[3]): r[0] for r in cur.execute('SELECT unit_key, unit_code, unit_name, unit_symbol FROM dim_geologic_unit WHERE unit_key > 0')}
    dim_unidad = {r[0]: r for r in cur.execute('SELECT * FROM dim_geologic_unit')}
    tipos = {(r[1], r[3]): r for r in cur.execute('SELECT * FROM dim_feature_type')}
    contextos = {(r[1], r[2], r[3]): r[0] for r in cur.execute('SELECT * FROM dim_spatial_context')}
    mapa = cur.execute('SELECT * FROM dim_map').fetchone()

    crs_mtm, elipse = leer(gdb, 'LandingEllipse')
    _, figuras = leer(gdb, 'Figures')
    _, cortes = leer(gdb, 'CrossSections')
    g_elipse = unary_union([g for _, _, g in elipse])
    g_figuras = unary_union([g for _, _, g in figuras])
    g_cortes = unary_union([g for _, _, g in cortes])

    a_lonlat = Transformer.from_crs(crs_mtm, crs_mtm.geodetic_crs, always_xy=True)
    a_mtm = Transformer.from_crs(crs_mtm.geodetic_crs, crs_mtm, always_xy=True)
    def caja_mtm(aoi):
        xs, ys = a_mtm.transform([aoi[0], aoi[2], aoi[0], aoi[2]], [aoi[1], aoi[1], aoi[3], aoi[3]])
        return box(min(xs), min(ys), max(xs), max(ys))
    ctx_tif = rasters / 'Caltech_CTX_mosaic_feb2018' / 'Nili_CTX_Mosaic_Beta01_Feb2018_MTM.tif'
    AOI_MAPA = rectangulo_interior(ctx_tif, a_lonlat)
    print('Marco del mapa (lon/lat):', [round(v, 5) for v in AOI_MAPA])
    aoi_mapa, aoi_ruta = caja_mtm(AOI_MAPA), caja_mtm(AOI_RUTA)
    exportar_base(ctx_tif, AOI_MAPA, crs_mtm)
    a_ll = lambda geom: sh_transform(lambda x, y, z=None: a_lonlat.transform(x, y), geom)

    def redondear(o):
        if isinstance(o, (list, tuple)):
            if o and isinstance(o[0], float):
                return [round(o[0], 5), round(o[1], 5)]
            return [redondear(x) for x in o]
        return o

    feats_mapa, feats_ruta, poligonos_unidad, superficies = [], [], [], []
    clave = 0
    avisos = []
    for capa, campo_tipo in CAPAS.items():
        _, filas = leer(gdb, capa)
        for oid, p, geom in filas:
            if geom is None:
                continue
            if capa == 'GeoUnits_v1':
                tipo = tipos[(capa, 'unit')]
                uk = unidades.get((str(p['unit']), p['symbol']))
                if uk is None:
                    avisos.append(f'GeoUnits_v1 {oid}: unidad ({p["unit"]}, {p["symbol"]}) no está en dim_geologic_unit')
                    uk = 0
            else:
                tipo = tipos.get((capa, p[campo_tipo]))
                uk = 0
                if tipo is None:
                    avisos.append(f'{capa} {oid}: TYPE {p[campo_tipo]!r} no está en dim_feature_type')
                    continue
            ctx = contextos[(int(geom.intersects(g_elipse)), int(geom.intersects(g_figuras)), int(geom.intersects(g_cortes)))]
            largo = num(p.get('SHAPE_Length'))
            area = num(p.get('SHAPE_Area'))
            c = geom.centroid if not geom.is_empty else None
            clave += 1
            cur.execute(
                'INSERT INTO fact_map_feature VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (clave, mapa[0], uk, tipo[0], ctx, capa, oid, 1, largo, area,
                 c.x if c else None, c.y if c else None, geom.wkt),
            )

            u = dim_unidad[uk]
            props = {
                'feature_key': clave, 'unit_key': uk, 'feature_type_key': tipo[0], 'spatial_context_key': ctx,
                'source_layer': capa, 'source_objectid': oid, 'feature_count': 1,
                'length_m': round(largo, 1) if largo is not None else None,
                'area_m2': round(area, 1) if area is not None else None,
                'unit_code': u[1], 'unit_name': u[2], 'unit_symbol': u[3] if uk else None, 'symbol_base': u[4],
                'subscript': u[5], 'color_id': u[6], 'age_prefix': u[7],
                'feature_group': tipo[2], 'feature_type': tipo[3], 'certainty': tipo[4], 'geometry_type': tipo[5],
                'in_landing_ellipse': int(geom.intersects(g_elipse)),
                'in_figure_area': int(geom.intersects(g_figuras)),
                'on_cross_section': int(geom.intersects(g_cortes)),
            }
            if capa == 'GeoUnits_v1':
                poligonos_unidad.append((geom, props))
            elif capa == 'SurfaceFeatures':
                superficies.append((geom, props))

            for destino, aoi, tol in ((feats_mapa, aoi_mapa, SIMPLIFICAR_M['mapa']), (feats_ruta, aoi_ruta, SIMPLIFICAR_M['ruta'])):
                if destino is feats_ruta and capa != 'GeoUnits_v1':
                    continue
                if not geom.intersects(aoi):
                    continue
                recorte = geom.intersection(aoi)
                if recorte.is_empty:
                    continue
                if recorte.geom_type not in ('Point', 'MultiPoint'):
                    recorte = recorte.simplify(tol, preserve_topology=True)
                if recorte.is_empty:
                    continue
                gj = mapping(a_ll(recorte))
                if gj['type'] == 'GeometryCollection':
                    continue
                gj = {'type': gj['type'], 'coordinates': redondear(gj['coordinates'])}
                destino.append({'type': 'Feature', 'properties': props, 'geometry': gj})
    con.commit()

    meta_fuente = {
        'series': mapa[1], 'title': mapa[2], 'authors': mapa[3], 'pub_year': mapa[4], 'publisher': mapa[5],
        'map_scale': mapa[6], 'crs_origen': mapa[7], 'datum': mapa[8],
        'url': 'https://doi.org/10.3133/sim3464',
    }

    def escribir(ruta, obj):
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'  {ruta.relative_to(REPO)}  {ruta.stat().st_size / 1e6:.2f} MB')

    print('Salidas:')
    escribir(REPO / 'web/map/public/geologia.geojson',
             {'type': 'FeatureCollection', 'meta': {**meta_fuente, 'aoi_lonlat': AOI_MAPA, 'simplificado_m': SIMPLIFICAR_M['mapa']}, 'features': feats_mapa})
    escribir(REPO / 'web/shared/sim3464/geologia_ruta.geojson',
             {'type': 'FeatureCollection', 'meta': {**meta_fuente, 'aoi_lonlat': AOI_RUTA, 'simplificado_m': SIMPLIFICAR_M['ruta']}, 'features': feats_ruta})

    # ---------- valores por estación ----------
    def muestrear(ruta_tif, lon, lat, pendiente=False):
        with rasterio.open(ruta_tif) as d:
            crs = CRS.from_wkt(d.crs.to_wkt())
            t = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
            x, y = t.transform(lon, lat)
            fila, col = d.index(x, y)
            if not (1 <= fila < d.height - 1 and 1 <= col < d.width - 1):
                return None
            w = d.read(1, window=((fila - 1, fila + 2), (col - 1, col + 2))).astype('float64')
            nd = d.nodata
            if nd is not None and (np.isclose(w, nd).any() or (w < -1e30).any()):
                return None
            out = {'valor': float(w[1, 1])}
            if pendiente:
                rx, ry = abs(d.res[0]), abs(d.res[1])
                dzdx = ((w[0, 2] + 2 * w[1, 2] + w[2, 2]) - (w[0, 0] + 2 * w[1, 0] + w[2, 0])) / (8 * rx)
                dzdy = ((w[2, 0] + 2 * w[2, 1] + w[2, 2]) - (w[0, 0] + 2 * w[0, 1] + w[0, 2])) / (8 * ry)
                out['pendiente_deg'] = math.degrees(math.atan(math.hypot(dzdx, dzdy)))
                out['resolucion_m'] = round(rx, 1)
            return out

    dtms = sorted((rasters / 'USGS_CTX_Stereo_DTMs').glob('*_DTM.tif'))
    hrsc = rasters / 'HRSC' / 'nili_h0988_0000_da4_clip.tif'
    themis = rasters / 'USGS_THEMIS_IR_controlled_mosaic_oct2018'
    estaciones = list(csv.DictReader((REPO / 'estaciones.csv').open(encoding='utf-8')))
    salida = {
        'meta': {
            **meta_fuente,
            'productos': {
                'dtm': 'USGS CTX stereo DTM 20 m (' + ', '.join(p.stem for p in dtms) + ')',
                'pendiente': 'Calculada de la DTM CTX 20 m, ventana 3×3 (Horn)',
                'hrsc': 'HRSC h0988_0000 DA4, 75 m',
                'themis': 'USGS THEMIS IR controlled mosaic oct 2018, 100 m. DN 0–255: brillo relativo, no temperatura',
                'unidad': 'GeoUnits_v1 de SIM 3464 (polígono que contiene la estación)',
            },
        },
        'estaciones': {},
    }
    for e in estaciones:
        lon, lat = float(e['lon']), float(e['lat'])
        pt = Point(*a_mtm.transform(lon, lat))
        unidad = next((p for g, p in poligonos_unidad if g.contains(pt)), None)
        sup = [p['feature_type'] for g, p in superficies if g.contains(pt)]
        dtm = None
        for f in dtms:
            m = muestrear(f, lon, lat, pendiente=True)
            if m:
                dtm = {**m, 'producto': f.stem}
                break
        h = muestrear(hrsc, lon, lat)
        dia = muestrear(themis / 'nili_THEMIS_DayIR_Controlled_oct2018.tif', lon, lat)
        noche = muestrear(themis / 'nili_THEMIS_NightIR_Controlled_oct2018.tif', lon, lat)
        salida['estaciones'][e['id']] = {
            'unidad': unidad and {k: unidad[k] for k in ('unit_symbol', 'unit_name', 'age_prefix', 'unit_key')},
            'rasgos_superficie': sup,
            'en_elipse_aterrizaje': int(pt.intersects(g_elipse)),
            'dtm_elev_m': round(dtm['valor'], 1) if dtm else None,
            'dtm_pendiente_deg': round(dtm['pendiente_deg'], 1) if dtm else None,
            'dtm_producto': dtm and dtm['producto'],
            'hrsc_elev_m': round(h['valor']) if h else None,
            'themis_dia_dn': round(dia['valor']) if dia else None,
            'themis_noche_dn': round(noche['valor']) if noche else None,
        }
    escribir(REPO / 'web/shared/sim3464/estaciones_capas.json', salida)

    n = cur.execute('SELECT COUNT(*) FROM fact_map_feature').fetchone()[0]
    print(f'fact_map_feature: {n} filas · mapa: {len(feats_mapa)} · ruta: {len(feats_ruta)}')
    for a in avisos[:20]:
        print('AVISO', a)
    con.close()


if __name__ == '__main__':
    sys.exit(main())
