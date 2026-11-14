"""Capas ráster reales del SIM 3464 para el panel de capas del mapa.

Escribe en web/map/public/capas/:
  relieve_dtm.png    sombreado de la DTM CTX 20 m (az 315°, alt 45°)
  pendiente_dtm.png  pendiente por celda en clases de 5°
  themis_noche.png   THEMIS IR noche, DN 0–255 relativo
  capas.json         límites lon/lat de cada imagen y metadatos (producto, resolución, clases)

Todas en Mercator de Marte, para usarlas como image source de MapLibre sin deformarse.
"""

import json
import math
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.warp import Resampling, reproject

R_MARTE = 3396190.0

# Pendiente (grados) → RGBA. Naranja marciano para el terreno; el rojo queda para alertas.
RAMPA_PENDIENTE = [
    (0, 5, (0, 0, 0, 0)),
    (5, 10, (242, 201, 160, 150)),
    (10, 15, (232, 154, 99, 185)),
    (15, 20, (217, 83, 47, 210)),
    (20, 25, (163, 58, 30, 225)),
    (25, 90, (94, 31, 16, 235)),
]


def _merc():
    return CRS.from_proj4(f'+proj=merc +R={R_MARTE} +units=m +no_defs')


def _a_merc(tifs, aoi, crs_geo, ancho):
    """Reproyecta y une uno o más GeoTIFF a una grilla Mercator sobre aoi (lon/lat). NaN = sin dato."""
    merc = _merc()
    t = Transformer.from_crs(crs_geo, merc, always_xy=True)
    x0, y0 = t.transform(aoi[0], aoi[1])
    x1, y1 = t.transform(aoi[2], aoi[3])
    alto = round(ancho * (y1 - y0) / (x1 - x0))
    dst_t = rasterio.transform.from_bounds(x0, y0, x1, y1, ancho, alto)
    out = np.full((alto, ancho), np.nan, dtype='float32')
    for tif in tifs:
        tmp = np.full((alto, ancho), np.nan, dtype='float32')
        with rasterio.open(tif) as d:
            src = d.read(1).astype('float32')
            if d.nodata is not None:
                src[np.isclose(src, d.nodata) | (src < -1e30)] = np.nan
            reproject(source=src, destination=tmp, src_transform=d.transform, src_crs=d.crs,
                      src_nodata=np.nan, dst_transform=dst_t, dst_crs=merc.to_wkt(), dst_nodata=np.nan,
                      resampling=Resampling.bilinear)
        out = np.where(np.isnan(out), tmp, out)
    return out, (x0, y0, x1, y1)


def _recortar(arr, lim, crs_geo):
    """Recorta al rectángulo con datos. Devuelve (arr, aoi lon/lat, tamaño de pixel Mercator)."""
    filas = np.where(~np.isnan(arr).all(axis=1))[0]
    cols = np.where(~np.isnan(arr).all(axis=0))[0]
    f0, f1, c0, c1 = filas[0], filas[-1] + 1, cols[0], cols[-1] + 1
    x0, y0, x1, y1 = lim
    alto, ancho = arr.shape
    px, py = (x1 - x0) / ancho, (y1 - y0) / alto
    t = Transformer.from_crs(_merc(), crs_geo, always_xy=True)
    lo0, la0 = t.transform(x0 + c0 * px, y1 - f1 * py)
    lo1, la1 = t.transform(x0 + c1 * px, y1 - f0 * py)
    return arr[f0:f1, c0:c1], (lo0, la0, lo1, la1), (px, py)


def exportar_capas(rasters: Path, aoi, crs_mtm, repo: Path):
    from PIL import Image

    crs_geo = crs_mtm.geodetic_crs
    carpeta = repo / 'web/map/public/capas'
    carpeta.mkdir(parents=True, exist_ok=True)
    indice = {}

    def guardar(nombre, rgba, aoi_c, meta):
        ruta = carpeta / f'{nombre}.png'
        Image.fromarray(rgba, 'RGBA').save(ruta, optimize=True)
        indice[nombre] = {
            **meta,
            'url': f'/capas/{nombre}.png',
            'limites': [round(float(v), 6) for v in aoi_c],
            'coordinates': [[aoi_c[0], aoi_c[3]], [aoi_c[2], aoi_c[3]], [aoi_c[2], aoi_c[1]], [aoi_c[0], aoi_c[1]]],
        }
        print(f'  web/map/public/capas/{nombre}.png  {rgba.shape[1]}x{rgba.shape[0]}  {ruta.stat().st_size / 1e6:.2f} MB')

    # ---- DTM CTX 20 m (las dos DTM del SIM 3464), ~25 m/px en el marco ----
    dtms = sorted((rasters / 'USGS_CTX_Stereo_DTMs').glob('*_DTM.tif'))
    z, lim = _a_merc(dtms, aoi, crs_geo, 2400)
    z, aoi_c, (px, py) = _recortar(z, lim, crs_geo)
    k = math.cos(math.radians((aoi_c[1] + aoi_c[3]) / 2))  # Mercator → metros en el suelo
    dx, dy = px * k, py * k
    gy, gx = np.gradient(z, dy, dx)
    gy = -gy  # las filas crecen hacia el sur
    incl = np.arctan(np.hypot(gx, gy))
    valido = ~np.isnan(z)

    az, alt = math.radians(315), math.radians(45)
    aspecto = np.arctan2(gx, gy)
    sombra = np.sin(alt) * np.cos(incl) + np.cos(alt) * np.sin(incl) * np.cos(az - aspecto)
    gris = np.clip(np.nan_to_num(sombra) * 255, 0, 255).astype('uint8')
    rgba = np.dstack([gris, gris, gris, np.where(valido, 255, 0).astype('uint8')])
    guardar('relieve_dtm', rgba, aoi_c, {
        'nombre': 'Relieve DTM',
        'producto': 'USGS CTX DTM 20 m: ' + ', '.join(p.stem for p in dtms),
        'metros_por_pixel': round(dx, 1),
        'elev_min_m': round(float(np.nanmin(z))), 'elev_max_m': round(float(np.nanmax(z))),
        'nota': 'Sombreado az 315°, alt 45°',
    })

    pend = np.degrees(incl)
    rgba = np.zeros(z.shape + (4,), dtype='uint8')
    clases = []
    for lo, hi, color in RAMPA_PENDIENTE:
        m = valido & (pend >= lo) & (pend < hi)
        rgba[m] = color
        clases.append({'desde': lo, 'hasta': hi, 'rgba': list(color),
                       'pct': round(100 * float(m.sum()) / max(1, int(valido.sum())), 1)})
    guardar('pendiente_dtm', rgba, aoi_c, {
        'nombre': 'Pendiente DTM',
        'producto': 'Calculada de la DTM CTX 20 m',
        'metros_por_pixel': round(dx, 1), 'clases': clases,
        'nota': 'Pendiente por celda; la de cada tramo sale del grafo',
    })

    # ---- THEMIS IR noche, 100 m nativo, todo el marco ----
    tif = rasters / 'USGS_THEMIS_IR_controlled_mosaic_oct2018' / 'nili_THEMIS_NightIR_Controlled_oct2018.tif'
    t, lim = _a_merc([tif], aoi, crs_geo, 640)
    t, aoi_c, (px, _) = _recortar(t, lim, crs_geo)
    g = np.clip(np.nan_to_num(t), 0, 255).astype('uint8')
    rgba = np.dstack([g, g, g, np.where(np.isnan(t), 0, 255).astype('uint8')])
    guardar('themis_noche', rgba, aoi_c, {
        'nombre': 'THEMIS IR noche',
        'producto': 'USGS ' + tif.stem,
        'metros_por_pixel': round(px * math.cos(math.radians((aoi_c[1] + aoi_c[3]) / 2)), 1),
        'nota': 'Brillo IR nocturno, DN 0–255 relativo: claro = más inercia térmica (roca), oscuro = material suelto',
    })

    (carpeta / 'capas.json').write_text(json.dumps(indice, ensure_ascii=False, indent=2), encoding='utf-8')
