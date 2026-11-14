"""Sistemas de coordenadas del pipeline: MTM 77.5°E sobre la esfera de Marte.

Los CRS de Marte se construyen explícitamente con PROJ. Si se usa un CRS
terrestre (por ejemplo "EPSG:4326"), pyproj aborta con
"Source and target ellipsoid do not belong to the same celestial body".
"""
from __future__ import annotations

import warnings

import pyproj
from pyproj import Transformer

RADIO_MARTE_M = 3_396_190.0
MERIDIANO_CENTRAL_DEG = 77.5

#: Nombre que queda registrado en ``meta.crs`` del grafo y en ``dim_map.crs_name``.
CRS_NAME = "MTM 77.5E"
#: Datum que queda registrado en ``dim_map.datum``.
DATUM = "Mars_2000_(Sphere)"

MARTE_GEOGRAFICO = pyproj.CRS.from_proj4(
    f"+proj=longlat +R={RADIO_MARTE_M} +no_defs +type=crs"
)

MTM = pyproj.CRS.from_proj4(
    f"+proj=tmerc +lat_0=0 +lon_0={MERIDIANO_CENTRAL_DEG} +k=1 "
    f"+x_0=0 +y_0=0 +R={RADIO_MARTE_M} +units=m +no_defs +type=crs"
)


def lonlat_a_mtm() -> Transformer:
    """Transformer lon/lat (grados) → MTM 77.5°E (metros)."""
    return Transformer.from_crs(MARTE_GEOGRAFICO, MTM, always_xy=True)


def mtm_a_lonlat() -> Transformer:
    """Transformer MTM 77.5°E (metros) → lon/lat (grados)."""
    return Transformer.from_crs(MTM, MARTE_GEOGRAFICO, always_xy=True)


def wkt_mtm() -> str:
    """WKT del MTM, para escribirlo en el GeoTIFF de salida."""
    return MTM.to_wkt()


def proj4(crs_obj: pyproj.CRS) -> str:
    """proj4 sin el aviso de pérdida de información de pyproj."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        return crs_obj.to_proj4()
