"""Teselas de elevación (Terrarium PNG) para el terreno 3D del mapa y el modo caminata.

Fuente: DTM CTX 20 m del USGS SIM 3464 (las dos franjas estéreo). Donde la DTM no cubre,
se rellena con la DTM HRSC 75 m del mismo paquete, para que no haya agujeros en el terreno.

Escribe web/map/public/dem/{z}/{x}/{y}.png y web/map/public/dem/dem.json.

MapLibre arma las teselas por lon/lat igual que en la Tierra; como Mercator solo depende de
la latitud, una tesela z/x/y cubre exactamente los mismos grados en Marte. La elevación va en
metros de Marte; la exageración vertical para corregir la escala la pone el mapa.

Uso: python web/scripts/sim3464/dem_tiles.py "C:/ruta/a/sim3464_database"
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import CRS
from rasterio.warp import Resampling, reproject

REPO = Path(__file__).resolve().parents[3]
R_MARTE = 3396190.0
TAM = 256

# zooms bajos en todo el marco del SIM 3464; altos solo en la zona de trabajo
MARCO = (76.802, 17.702, 77.798, 18.698)
ZONA = (77.33, 18.38, 77.53, 18.51)
ZOOMS = {8: MARCO, 9: MARCO, 10: MARCO, 11: MARCO, 12: ZONA, 13: ZONA}


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def tile_bounds(x, y, z):
    n = 2 ** z
    lon0 = x / n * 360 - 180
    lon1 = (x + 1) / n * 360 - 180
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lon0, lat0, lon1, lat1


class Fuente:
    """Ráster de elevación en memoria (se lee una sola vez)."""

    def __init__(self, tif):
        with rasterio.open(tif) as d:
            self.datos = d.read(1).astype('float32')
            if d.nodata is not None:
                self.datos[np.isclose(self.datos, d.nodata) | (self.datos < -1e30)] = np.nan
            self.transform, self.crs = d.transform, d.crs
        self.nombre = Path(tif).stem


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('db', help='carpeta sim3464_database')
    rasters = Path(ap.parse_args().db) / 'sim3464_JezeroNili_FINAL' / 'Rasters'
    ctx = [Fuente(p) for p in sorted((rasters / 'USGS_CTX_Stereo_DTMs').glob('*_DTM.tif'))]
    hrsc = Fuente(rasters / 'HRSC' / 'nili_h0988_0000_da4_clip.tif')
    merc = CRS.from_proj4(f'+proj=merc +R={R_MARTE} +units=m +no_defs').to_wkt()

    salida = REPO / 'web/map/public/dem'
    total, zmin, zmax = 0, math.inf, -math.inf
    for z, (o, s, e, n) in ZOOMS.items():
        x0, y0 = tile_xy(o, n, z)
        x1, y1 = tile_xy(e, s, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                lo0, la0, lo1, la1 = tile_bounds(x, y, z)
                k = R_MARTE * math.pi / 180
                mx0, mx1 = lo0 * k, lo1 * k
                my0 = R_MARTE * math.log(math.tan(math.pi / 4 + math.radians(la0) / 2))
                my1 = R_MARTE * math.log(math.tan(math.pi / 4 + math.radians(la1) / 2))
                dst_t = rasterio.transform.from_bounds(mx0, my0, mx1, my1, TAM, TAM)
                h = np.full((TAM, TAM), np.nan, dtype='float32')
                for f in ctx + [hrsc]:  # CTX primero; HRSC rellena los huecos
                    tmp = np.full((TAM, TAM), np.nan, dtype='float32')
                    reproject(source=f.datos, destination=tmp, src_transform=f.transform, src_crs=f.crs,
                              src_nodata=np.nan, dst_transform=dst_t, dst_crs=merc, dst_nodata=np.nan,
                              resampling=Resampling.bilinear)
                    h = np.where(np.isnan(h), tmp, h)
                if np.isnan(h).all():
                    continue
                h = np.where(np.isnan(h), np.nanmean(h), h)
                zmin, zmax = min(zmin, float(h.min())), max(zmax, float(h.max()))
                v = h.astype('float64') + 32768.0
                r = np.floor(v / 256)
                g = np.floor(v) - r * 256
                b = np.floor((v - np.floor(v)) * 256)
                rgb = np.dstack([r, g, b]).clip(0, 255).astype('uint8')
                ruta = salida / str(z) / str(x)
                ruta.mkdir(parents=True, exist_ok=True)
                Image.fromarray(rgb, 'RGB').save(ruta / f'{y}.png', optimize=True)
                total += 1
        print(f'  z{z}: listo')

    indice = {
        'tiles': ['/dem/{z}/{x}/{y}.png'], 'encoding': 'terrarium', 'tileSize': TAM,
        'minzoom': min(ZOOMS), 'maxzoom': max(ZOOMS), 'bounds': list(MARCO),
        'elev_min_m': round(zmin), 'elev_max_m': round(zmax),
        'fuente': 'USGS SIM 3464: DTM CTX 20 m (' + ', '.join(f.nombre for f in ctx) + '); relleno HRSC 75 m',
        'nota': 'Elevación en metros de Marte. El mapa aplica exageración 6378137/3396190 para que la proporción vertical sea real.',
    }
    (salida / 'dem.json').write_text(json.dumps(indice, ensure_ascii=False, indent=2), encoding='utf-8')
    tam = sum(p.stat().st_size for p in salida.rglob('*.png')) / 1e6
    print(f'  {total} teselas, {tam:.1f} MB, elevación {zmin:.0f} a {zmax:.0f} m')


if __name__ == '__main__':
    main()
