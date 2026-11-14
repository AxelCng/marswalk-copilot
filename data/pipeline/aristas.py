"""Paso 60: aristas del grafo con ``route_through_array`` y sus atributos.

Calcula el camino de mínimo costo entre las 8 estaciones con los 3 límites de
pendiente precalculados (15°, 20°, 25°) y en los dos sentidos, porque subir y
bajar no cuestan igual. Si no hay camino bajo un límite, la arista no se emite
en esa versión: así salen las estaciones "omitidas por pendiente" del motor.

Atributos por arista, según el spec:
    distancia_m        suma de pasos (diagonal = Δx·√2)
    tiempo_min         suma del costo del camino
    pendiente_max_deg  máximo de la ruta
    energia_rel        tiempo · (1 + k · pendiente)
    dosis_rel          tiempo · (1 − blindaje del relieve)
    cobertura_com_pct  % de celdas con línea de vista al hábitat o a un nodo comms
    sombra_pct         % de celdas en sombra para una hora fija
    zonas              zonas de alerta que cruza
    geometria          polilínea en lon/lat
"""
from __future__ import annotations

import csv
import json
import math

import numpy as np
import rasterio
from skimage.graph import route_through_array

from . import _relieve, crs, parametros, rutas

NODATA = np.float32(-3.4028235e38)


def cargar(nombre: str) -> np.ndarray:
    with rasterio.open(rutas.OUT_RASTERS / f"{nombre}.tif") as ds:
        datos = ds.read(1).astype("float64")
        if ds.nodata is not None:
            datos[datos == ds.nodata] = np.inf
    return datos


def camino(costo: np.ndarray, inicio, fin):
    """Camino de mínimo costo, o (None, None) si no existe."""
    try:
        puntos, coste = route_through_array(
            costo, inicio, fin, fully_connected=True, geometric=True)
    except ValueError:
        return None, None
    if not np.isfinite(coste):
        return None, None
    return [(int(f), int(c)) for f, c in puntos], float(coste)


def tiempo_direccional(puntos, dtm: np.ndarray, celda: float,
                       p: parametros.Parametros) -> float:
    """Tiempo en minutos recorriendo el camino en este sentido.

    ``route_through_array`` no distingue subir de bajar: el costo de una celda
    depende solo de su pendiente, sin signo, así que A→B y B→A dan el mismo
    resultado. Por eso el trazado se decide con el costo simétrico y el tiempo se
    evalúa después, con el desnivel **con signo** de cada paso. Así subir cuesta
    más que bajar, como exige el contrato.
    """
    total = 0.0
    for (f1, c1), (f2, c2) in zip(puntos, puntos[1:]):
        dx = celda * (math.sqrt(2) if f1 != f2 and c1 != c2 else 1.0)
        dz = dtm[f2, c2] - dtm[f1, c1]
        velocidad = p.tobler.velocidad_kmh(dz / dx) * p.factor_traje
        total += (dx / 1000.0) / max(velocidad, 1e-9) * 60.0
    return total


def distancia_m(puntos, celda: float) -> float:
    """Suma de pasos; la diagonal vale celda·√2."""
    total = 0.0
    for (f1, c1), (f2, c2) in zip(puntos, puntos[1:]):
        total += celda * (math.sqrt(2) if f1 != f2 and c1 != c2 else 1.0)
    return total


def geometria_lonlat(puntos, aoi: dict):
    inverso = crs.mtm_a_lonlat()
    salida = []
    for fila, col in puntos:
        x = aoi["x_min"] + (col + 0.5) * aoi["celda_m"]
        y = aoi["y_max"] - (fila + 0.5) * aoi["celda_m"]
        lon, lat = inverso.transform(x, y)
        salida.append([round(lon, 6), round(lat, 6)])
    return salida


def zonas_cruzadas(puntos, aoi: dict, zonas: list[dict]) -> list[str]:
    """Ids de zona que contiene alguna celda del camino, muestreado."""
    from shapely.geometry import Point, Polygon
    inverso = crs.mtm_a_lonlat()
    poligonos = [(z["id"], Polygon(z["poligono"])) for z in zonas]
    paso = max(1, len(puntos) // 80)
    cruzadas = set()
    for fila, col in puntos[::paso]:
        x = aoi["x_min"] + (col + 0.5) * aoi["celda_m"]
        y = aoi["y_max"] - (fila + 0.5) * aoi["celda_m"]
        lon, lat = inverso.transform(x, y)
        punto = Point(lon, lat)
        for zid, pol in poligonos:
            if pol.contains(punto):
                cruzadas.add(zid)
    return sorted(cruzadas)


def ejecutar() -> dict:
    rutas.asegurar_salida()
    p = parametros.cargar()
    aoi = json.loads((rutas.OUT / "aoi.json").read_text(encoding="utf-8"))
    dtm = cargar("dtm")
    pendiente = cargar("pendiente")
    costo = cargar("costo")
    factor = cargar("f_terreno")

    with open(rutas.OUT / "estaciones_mtm.csv", encoding="utf-8") as f:
        estaciones = list(csv.DictReader(f))
    celdas = {e["id"]: (int(e["fila"]), int(e["col"])) for e in estaciones}
    tipos = {}
    with open(rutas.ESTACIONES_CSV, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            tipos[r["id"]] = r["tipo"]
    ids = [e["id"] for e in estaciones]
    antenas = [celdas[i] for i in ids if tipos[i] in ("habitat", "comms")]

    print("  relieve: blindaje en 8 azimuts y sombra...")
    blindaje = _relieve.blindaje(dtm, aoi["celda_m"])
    sombra = _relieve.sombra(dtm, aoi["celda_m"])
    zona = _relieve.zonas_de_alerta(aoi)

    aristas = []
    for limite in p.limites_pendiente_deg:
        tope = min(limite, p.theta_max_fisico_deg)
        costo_limite = np.where(pendiente > tope, np.inf, costo)
        emitidas = 0
        for origen in ids:
            for destino in ids:
                if origen == destino:
                    continue
                puntos, _ = camino(costo_limite, celdas[origen], celdas[destino])
                if puntos is None:
                    continue
                emitidas += 1
                pend_max = float(np.max([pendiente[f, c] for f, c in puntos]))
                # El trazado lo decide el costo simétrico; el tiempo se evalúa
                # en el sentido de marcha para que subir != bajar.
                f_medio = float(np.mean([factor[f, c] for f, c in puntos]))
                tiempo = tiempo_direccional(puntos, dtm, aoi["celda_m"], p) * f_medio
                b = float(np.mean([blindaje[f, c] for f, c in puntos]))
                aristas.append({
                    "origen": origen,
                    "destino": destino,
                    "limite_deg": int(limite),
                    "distancia_m": round(distancia_m(puntos, aoi["celda_m"]), 1),
                    "tiempo_min": round(tiempo, 2),
                    "pendiente_max_deg": round(pend_max, 2),
                    "energia_rel": round(tiempo * (1 + p.k_energia * pend_max), 2),
                    "dosis_rel": round(tiempo * (1 - b), 2),
                    "cobertura_com_pct": round(
                        _relieve.cobertura(puntos, dtm, aoi["celda_m"], antenas), 1),
                    "sombra_pct": round(
                        100.0 * float(np.mean([sombra[f, c] for f, c in puntos])), 1),
                    "blindaje": round(b, 4),
                    "zonas": zonas_cruzadas(puntos, aoi, zona),
                    "geometria": geometria_lonlat(puntos, aoi),
                })
        print(f"  {int(limite):2d}°: {emitidas} aristas de {len(ids) * (len(ids) - 1)} posibles")

    (rutas.OUT / "zonas.json").write_text(
        json.dumps(zona, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (rutas.OUT / "aristas.json").write_text(
        json.dumps(aristas, ensure_ascii=False) + "\n", encoding="utf-8")

    resumen = {
        "estaciones": len(ids),
        "aristas": len(aristas),
        "por_limite": {str(int(l)): sum(1 for a in aristas if a["limite_deg"] == int(l))
                       for l in p.limites_pendiente_deg},
        "zonas": len(zona),
    }
    print(f"  {len(aristas)} aristas -> data/out/aristas.json")
    return resumen
