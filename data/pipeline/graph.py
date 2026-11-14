"""Paso 70: ``graph.json`` real, con la forma del Contrato 1.

Une el resultado de los pasos anteriores:

* nodos de ``estaciones_mtm.csv`` (lon/lat para el mapa, MTM para los cálculos)
* capas por nodo de los rasters alineados (elevación, pendiente, THEMIS)
* unidad geológica de ``geologia.geojson``
* aristas de ``aristas.json`` (3 límites, ambos sentidos)
* zonas de ``zonas.json``

Se valida con ``contracts/tools/validar_graph.py`` antes de darlo por bueno.
"""
from __future__ import annotations

import csv
import json

import rasterio
from shapely.geometry import Point, Polygon, shape

from . import parametros, rutas

ELEV_CORREGIDA = "dtm"   # o "csv": ver nota de datum vertical en data/README.md


def _capas_de(nodo: dict) -> dict:
    with rasterio.open(rutas.OUT_RASTERS / "dtm.tif") as ds:
        elev = float(ds.read(1)[nodo["fila"], nodo["col"]])
    with rasterio.open(rutas.OUT_RASTERS / "pendiente.tif") as ds:
        pend = float(ds.read(1)[nodo["fila"], nodo["col"]])
    with rasterio.open(rutas.OUT_RASTERS / "themis_noche.tif") as ds:
        dn = float(ds.read(1)[nodo["fila"], nodo["col"]])
    return {
        "elev_m": round(elev, 1) if ELEV_CORREGIDA == "dtm" else nodo["elev_m"],
        "pendiente_deg": round(pend, 1),
        "themis_noche": round(dn, 1),
    }


def _unidad_en(lon: float, lat: float, features: list[dict]) -> str | None:
    punto = Point(lon, lat)
    for f in features:
        if f["properties"].get("geometry_type") != "polygon":
            continue
        geom = shape(f["geometry"])
        if geom.contains(punto):
            return f["properties"].get("unit_name")
    return None


def _zona_de(lon: float, lat: float, zonas: list[dict]) -> str | None:
    punto = Point(lon, lat)
    for z in zonas:
        if Polygon(z["poligono"]).contains(punto):
            return z["id"]
    return None


def ejecutar() -> dict:
    rutas.asegurar_salida()
    p = parametros.cargar()
    aoi = json.loads((rutas.OUT / "aoi.json").read_text(encoding="utf-8"))
    aristas = json.loads((rutas.OUT / "aristas.json").read_text(encoding="utf-8"))
    zonas = json.loads((rutas.OUT / "zonas.json").read_text(encoding="utf-8"))
    geologia = json.loads((rutas.OUT / "geologia.geojson").read_text(encoding="utf-8"))

    with open(rutas.OUT / "estaciones_mtm.csv", encoding="utf-8") as f:
        estaciones = list(csv.DictReader(f))
    with open(rutas.ESTACIONES_CSV, encoding="utf-8") as f:
        fuentes = {r["id"]: r for r in csv.DictReader(f)}

    nodos = []
    for e in estaciones:
        fila = {"fila": int(e["fila"]), "col": int(e["col"]), "elev_m": float(e["elev_m"])}
        fuente = fuentes[e["id"]]
        lon, lat = float(e["lon"]), float(e["lat"])
        nodos.append({
            "id": e["id"],
            "nombre": e["nombre"],
            "tipo": e["tipo"],
            "lon": lon,
            "lat": lat,
            "valor_cientifico": int(e["valor_cientifico"]),
            "tarea": e["tarea"],
            "permanencia_min": int(e["permanencia_min"]),
            "unidad_geologica": _unidad_en(lon, lat, geologia["features"]) or "sin unidad",
            "zona": _zona_de(lon, lat, zonas),
            "capas": _capas_de(fila),
            "fotos": [{
                "url": fuente["foto_url"],
                "camara": fuente["foto_camara"],
                "sol": int(fuente["foto_sol"]),
                "credito": "NASA/JPL-Caltech",
            }],
        })

    grafo = {
        "meta": {
            "area": aoi["area"],
            "crs": aoi["crs_name"],
            "datum": aoi["datum"],
            "modelo_costo": "v1",
            "fake": False,
            "limites_pendiente_deg": [int(v) for v in p.limites_pendiente_deg],
            "celda_m": aoi["celda_m"],
            "aoi": {k: aoi[k] for k in ("x_min", "x_max", "y_min", "y_max",
                                        "lon_min", "lon_max", "lat_min", "lat_max",
                                        "ancho_px", "alto_px", "area_km2")},
            "elevacion_fuente": ELEV_CORREGIDA,
            "generado_por": "data/pipeline/graph.py",
        },
        "zonas": zonas,
        "nodes": nodos,
        "edges": aristas,
    }

    destino = rutas.OUT / "graph.json"
    destino.write_text(json.dumps(grafo, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8")
    print(f"  {len(nodos)} nodos, {len(aristas)} aristas -> "
          f"{destino.relative_to(rutas.RAIZ)} ({destino.stat().st_size / 1e6:.2f} MB)")
    return {"nodos": len(nodos), "aristas": len(aristas)}
