"""Paso 00: ventana de recorte (AOI) anclada a la malla de la DTM.

El AOI es el bounding box de las estaciones más un margen, redondeado hacia
afuera a múltiplos del tamaño de celda. Así todas las capas se reproyectan a la
misma malla y una celda significa lo mismo en todas.
"""
from __future__ import annotations

import csv
import json
import math

from . import crs, rutas

CELDA_M = 20.0
MARGEN_M = 500.0


def leer_estaciones() -> list[dict]:
    with open(rutas.ESTACIONES_CSV, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def estaciones_mtm(estaciones: list[dict]) -> list[dict]:
    tr = crs.lonlat_a_mtm()
    salida = []
    for e in estaciones:
        x, y = tr.transform(float(e["lon"]), float(e["lat"]))
        salida.append({**e, "x_m": x, "y_m": y})
    return salida


def calcular_aoi(celda_m: float = CELDA_M, margen_m: float = MARGEN_M) -> dict:
    """Ventana MTM que contiene todas las estaciones con margen, anclada a la malla."""
    estaciones = estaciones_mtm(leer_estaciones())
    xs = [e["x_m"] for e in estaciones]
    ys = [e["y_m"] for e in estaciones]

    x_min = math.floor((min(xs) - margen_m) / celda_m) * celda_m
    x_max = math.ceil((max(xs) + margen_m) / celda_m) * celda_m
    y_min = math.floor((min(ys) - margen_m) / celda_m) * celda_m
    y_max = math.ceil((max(ys) + margen_m) / celda_m) * celda_m

    ancho_px = int(round((x_max - x_min) / celda_m))
    alto_px = int(round((y_max - y_min) / celda_m))

    inverso = crs.mtm_a_lonlat()
    lon_min, lat_min = inverso.transform(x_min, y_min)
    lon_max, lat_max = inverso.transform(x_max, y_max)

    return {
        "area": "jezero_aoi_v1",
        "crs_name": crs.CRS_NAME,
        "datum": crs.DATUM,
        "proj4": crs.proj4(crs.MTM),
        "radio_m": crs.RADIO_MARTE_M,
        "meridiano_central_deg": crs.MERIDIANO_CENTRAL_DEG,
        "celda_m": celda_m,
        "margen_m": margen_m,
        "x_min": x_min,
        "x_max": x_max,
        "y_min": y_min,
        "y_max": y_max,
        "ancho_px": ancho_px,
        "alto_px": alto_px,
        "lon_min": round(lon_min, 8),
        "lon_max": round(lon_max, 8),
        "lat_min": round(lat_min, 8),
        "lat_max": round(lat_max, 8),
        "ancho_km": round((x_max - x_min) / 1000, 3),
        "alto_km": round((y_max - y_min) / 1000, 3),
        "area_km2": round((x_max - x_min) * (y_max - y_min) / 1e6, 3),
    }


def ejecutar() -> dict:
    rutas.asegurar_salida()
    aoi = calcular_aoi()
    destino = rutas.OUT / "aoi.json"
    destino.write_text(json.dumps(aoi, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"AOI {aoi['ancho_px']}x{aoi['alto_px']} px @ {aoi['celda_m']:.0f} m "
          f"= {aoi['ancho_km']:.2f} x {aoi['alto_km']:.2f} km ({aoi['area_km2']:.2f} km2)")
    print(f"    MTM  x {aoi['x_min']:.0f}..{aoi['x_max']:.0f}   y {aoi['y_min']:.0f}..{aoi['y_max']:.0f}")
    print(f"    lon/lat {aoi['lon_min']:.5f}..{aoi['lon_max']:.5f}  "
          f"{aoi['lat_min']:.5f}..{aoi['lat_max']:.5f}")
    print(f"    -> {destino.relative_to(rutas.RAIZ)}")
    return aoi
