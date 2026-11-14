"""Paso 20: waypoints de Perseverance de lon/lat a MTM y a píxel.

El contrato pide lon/lat en el ``graph.json``, pero todo el cálculo (pixel del
raster, distancias, pendientes) se hace en metros MTM. Aquí se guardan las dos
vistas del mismo punto para no reproyectar dentro del modelo de costo.
"""
from __future__ import annotations

import csv
import json

from . import crs, rutas

CAMPOS = ["id", "nombre", "tipo", "lon", "lat", "x_m", "y_m", "fila", "col",
          "elev_m", "valor_cientifico", "tarea", "permanencia_min", "waypoint_sol",
          "inclinacion_rover_max_deg"]


def ejecutar() -> list[dict]:
    rutas.asegurar_salida()
    aoi = json.loads((rutas.OUT / "aoi.json").read_text(encoding="utf-8"))
    directo = crs.lonlat_a_mtm()
    inverso = crs.mtm_a_lonlat()

    filas = []
    with open(rutas.ESTACIONES_CSV, encoding="utf-8") as f:
        for e in csv.DictReader(f):
            lon, lat = float(e["lon"]), float(e["lat"])
            x, y = directo.transform(lon, lat)
            col = int((x - aoi["x_min"]) / aoi["celda_m"])
            fila = int((aoi["y_max"] - y) / aoi["celda_m"])
            dentro = 0 <= fila < aoi["alto_px"] and 0 <= col < aoi["ancho_px"]
            if not dentro:
                raise ValueError(
                    f"la estación {e['id']} cae fuera del AOI: píxel ({fila}, {col})")

            # Centinela: el lon/lat se escribe tal cual vino del CSV, que es lo que
            # el frontend ya usa. La ida y vuelta MTM solo se usa para verificar.
            lon_rt, lat_rt = inverso.transform(x, y)
            filas.append({
                "id": e["id"], "nombre": e["nombre"], "tipo": e["tipo"],
                "lon": lon, "lat": lat,
                "x_m": round(x, 3), "y_m": round(y, 3),
                "fila": fila, "col": col,
                "elev_m": float(e["elev_m"]),
                "valor_cientifico": int(e["valor_cientifico"]),
                "tarea": e["tarea"],
                "permanencia_min": int(e["permanencia_min"]),
                "waypoint_sol": int(e["waypoint_sol"]),
                "inclinacion_rover_max_deg": float(e["inclinacion_rover_max_deg"]),
                "_lon_rt": lon_rt, "_lat_rt": lat_rt,
            })

    destino = rutas.OUT / "estaciones_mtm.csv"
    with open(destino, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS, extrasaction="ignore")
        w.writeheader()
        w.writerows(filas)

    for fila in filas:
        print(f"  {fila['id']:4} MTM({fila['x_m']:9.1f},{fila['y_m']:10.1f}) "
              f"px({fila['col']:3},{fila['fila']:3})")
    print(f"  {len(filas)} estaciones -> {destino.relative_to(rutas.RAIZ)}")
    return filas
