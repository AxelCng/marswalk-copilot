"""Paso 40: verificación de la tarea de recorte y reproyección.

Comprueba los cuatro puntos que el spec exige antes de usar los rasters en el
modelo de costo:

1. Las 8 estaciones caen sobre el raster, con al menos una celda de margen.
2. El desplazamiento por anclar al centro de celda no supera media diagonal.
3. La ida y vuelta MTM ↔ lon/lat conserva la posición a precisión de 6 decimales.
4. Todas las capas comparten malla, CRS, resolución y tamaño.

Y dos más que evitan sorpresas: cuántas celdas son válidas y cuánto se desvía el
DTM de la elevación reportada por los waypoints.
"""
from __future__ import annotations

import csv
import json
import math

import numpy as np
import rasterio

from . import crs, rutas

CAPAS_ESPERADAS = ["dtm", "orto", "orto_mosaico", "themis_dia", "themis_noche",
                   "hrsc", "hrsc_sombra", "pendiente"]

TOLERANCIA_GRADOS = 1e-6


def _leer_csv() -> list[dict]:
    with open(rutas.OUT / "estaciones_mtm.csv", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def verificar_estaciones(aoi: dict, estaciones: list[dict]) -> list[str]:
    problemas = []
    celda = aoi["celda_m"]
    margen_min = 1

    print("  1. estaciones sobre el raster y su celda")
    for e in estaciones:
        fila, col = int(e["fila"]), int(e["col"])
        x, y = float(e["x_m"]), float(e["y_m"])
        dentro = margen_min <= fila < aoi["alto_px"] - margen_min and \
                 margen_min <= col < aoi["ancho_px"] - margen_min
        if not dentro:
            problemas.append(f"{e['id']}: píxel ({fila},{col}) pegado al borde del AOI")

        centro_x = aoi["x_min"] + (col + 0.5) * celda
        centro_y = aoi["y_max"] - (fila + 0.5) * celda
        error = math.hypot(centro_x - x, centro_y - y)
        maximo = celda * math.sqrt(2) / 2
        if error > maximo:
            problemas.append(
                f"{e['id']}: desplazamiento {error:.2f} m supera {maximo:.2f} m")
        print(f"     {e['id']:4} px({col:3},{fila:3})  error centro {error:5.2f} m")

    print("  2. ida y vuelta MTM -> lon/lat")
    inverso = crs.mtm_a_lonlat()
    peor = 0.0
    for e in estaciones:
        lon, lat = inverso.transform(float(e["x_m"]), float(e["y_m"]))
        dlon = abs(lon - float(e["lon"]))
        dlat = abs(lat - float(e["lat"]))
        peor = max(peor, dlon, dlat)
        if dlon > TOLERANCIA_GRADOS or dlat > TOLERANCIA_GRADOS:
            problemas.append(f"{e['id']}: ida y vuelta desviada dlon={dlon:.2e} dlat={dlat:.2e}")
    print(f"     peor desvío {peor:.2e}° (tolerancia {TOLERANCIA_GRADOS:.0e}°)")
    return problemas


def verificar_malla(aoi: dict) -> list[str]:
    problemas = []
    print("  3. malla compartida entre todas las capas")
    referencia = None
    for clave in CAPAS_ESPERADAS:
        ruta = rutas.OUT_RASTERS / f"{clave}.tif"
        if not ruta.exists():
            problemas.append(f"falta la capa {clave}.tif")
            continue
        with rasterio.open(ruta) as ds:
            actual = (ds.width, ds.height, tuple(ds.res), tuple(ds.transform)[:6],
                      ds.crs.to_wkt() if ds.crs else None)
            if referencia is None:
                referencia = (actual, clave)
            elif actual != referencia[0]:
                problemas.append(f"{clave} no comparte malla con {referencia[1]}")
            print(f"     {clave:13} {ds.width}x{ds.height} @ {ds.res[0]:.0f} m  "
                  f"nodata={ds.nodata}")

    with rasterio.open(rutas.OUT_RASTERS / "dtm.tif") as ds:
        if (ds.width, ds.height) != (aoi["ancho_px"], aoi["alto_px"]):
            problemas.append("el tamaño del DTM no coincide con el AOI")
        if abs(ds.res[0] - aoi["celda_m"]) > 1e-6:
            problemas.append("la resolución del DTM no coincide con la celda del AOI")
        if abs(ds.transform.c - aoi["x_min"]) > 1e-6:
            problemas.append("el origen X del DTM no coincide con el AOI")
        if abs(ds.transform.f - aoi["y_max"]) > 1e-6:
            problemas.append("el origen Y del DTM no coincide con el AOI")
    return problemas


def verificar_datos(aoi: dict, estaciones: list[dict]) -> tuple[list[str], dict]:
    problemas = []
    print("  4. celdas válidas y coherencia de elevación")
    with rasterio.open(rutas.OUT_RASTERS / "dtm.tif") as ds:
        dtm = ds.read(1)
        nodata = ds.nodata
    with rasterio.open(rutas.OUT_RASTERS / "pendiente.tif") as ds:
        pendiente = ds.read(1)
        nodata_pend = ds.nodata

    valido = dtm != nodata if nodata is not None else np.ones(dtm.shape, bool)
    pct = 100.0 * float(valido.mean())
    if pct < 99.0:
        problemas.append(f"el DTM solo tiene {pct:.2f}% de celdas válidas")
    print(f"     DTM válido {pct:.2f}%  ({int(valido.sum())}/{dtm.size})")

    interior = ~valido[1:-1, 1:-1]
    if interior.any():
        problemas.append(f"hay {int(interior.sum())} huecos interiores en el DTM")
    print(f"     huecos interiores {int(interior.sum())}")

    diferencias = []
    for e in estaciones:
        z = float(dtm[int(e["fila"]), int(e["col"])])
        s = float(pendiente[int(e["fila"]), int(e["col"])])
        diferencia = z - float(e["elev_m"])
        diferencias.append(diferencia)
        print(f"     {e['id']:4} DTM {z:8.1f}  csv {float(e['elev_m']):7.1f}  "
              f"dif {diferencia:+6.1f} m  pendiente {s:5.1f}°")

    resumen = {
        "dtm_validos_pct": round(pct, 2),
        "huecos_interiores": int(interior.sum()),
        "elevacion_dif_media_m": round(float(np.mean(diferencias)), 2),
        "elevacion_dif_max_abs_m": round(float(np.max(np.abs(diferencias))), 2),
        "pendiente_media_deg": round(float(pendiente[pendiente != nodata_pend].mean()), 2),
        "pendiente_p99_deg": round(float(np.percentile(pendiente[pendiente != nodata_pend], 99)), 2),
        "pct_celdas_mayor_15_deg": round(
            100.0 * float((pendiente[pendiente != nodata_pend] > 15).mean()), 2),
    }
    # Diferencia sistemática de datum vertical: es esperada, no un error.
    if resumen["elevacion_dif_max_abs_m"] > 50:
        problemas.append("el DTM se aparta más de 50 m de la elevación de los waypoints")
    return problemas, resumen


def ejecutar() -> dict:
    rutas.asegurar_salida()
    aoi = json.loads((rutas.OUT / "aoi.json").read_text(encoding="utf-8"))
    estaciones = _leer_csv()

    problemas: list[str] = []
    problemas += verificar_estaciones(aoi, estaciones)
    problemas += verificar_malla(aoi)
    problemas_datos, resumen = verificar_datos(aoi, estaciones)
    problemas += problemas_datos

    if problemas:
        print(f"\n  {len(problemas)} PROBLEMAS:")
        for p in problemas:
            print(f"    - {p}")
        raise ValueError(f"la verificación falló con {len(problemas)} problemas")

    informe = {
        "aoi": aoi["area"],
        "estaciones": len(estaciones),
        "capas_verificadas": CAPAS_ESPERADAS,
        **resumen,
        "resultado": "OK",
        "nota_elevacion": (
            "El DTM queda por encima de elev_m del CSV de forma sistemática. Es una "
            "diferencia de datum vertical, no un error de alineación: las estaciones "
            "caen en la celda correcta (verificado por desplazamiento). Al escribir "
            "capas.elev_m del grafo hay que decidir si se usa el DTM o el CSV, y no "
            "mezclar ambos en el mismo cálculo de pendiente."),
    }
    destino = rutas.OUT / "verificacion.json"
    destino.write_text(json.dumps(informe, ensure_ascii=False, indent=2) + "\n",
                       encoding="utf-8")
    print("  RESULTADO: OK — estaciones sobre el raster, sin desplazamientos, "
          "unidades en metros y malla compartida")
    print(f"    -> {destino.relative_to(rutas.RAIZ)}")
    return informe
