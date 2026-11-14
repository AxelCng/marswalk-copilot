"""Paso 30: capa geológica del SIM 3464 en el modelo estrella y en GeoJSON.

Construye las 4 dimensiones y la tabla de hechos que describe el modelo:

    fact_map_feature ── map_key ───────────→ dim_map
                     ── unit_key ──────────→ dim_geologic_unit
                     ── feature_type_key ──→ dim_feature_type
                     ── spatial_context_key → dim_spatial_context

Tres correcciones respecto del modelo nominal, impuestas por los datos reales:

* ``unit_code`` NO es clave única (los enteros ``unit`` 5 y 11 se repiten con
  símbolos distintos); la UK real es ``unit_symbol``.
* En ``GeoContacts`` el campo ``TYPE`` no describe el tipo de rasgo sino la
  certeza del contacto (``certain`` / ``approximate`` / ``boundary``).
* ``dim_map`` no sale de la capa ``MapBoundary`` (sus columnas LON_* / LAT_*
  están en NULL) sino de los metadatos FGDC del mapa.

La geometría se guarda dos veces con propósitos distintos: ``geom_wkt`` en MTM
(metros, para medir áreas y longitudes) y las coordenadas del GeoJSON en lon/lat
(grados, para que MapLibre las dibuje directo).
"""
from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np
import pyogrio
import shapely
from shapely import STRtree, wkb
from shapely.geometry import mapping

from . import crs, rutas


def _leer(gdb: Path, sql: str):
    """pyogrio avisa por polígonos con muchos anillos; el aviso no aporta nada aquí."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return pyogrio.read_arrow(gdb, sql=sql)


# Las 5 capas que aportan filas de hecho. Las demás (MapBoundary, Nomenclature,
# Figures, GeoUnitsAnno, LandingEllipse, CrossSections, megabreccia_fig2) son
# muebles de mapa y solo alimentan dim_spatial_context.
CAPAS_HECHO = [
    # capa, grupo, tipo base (None = el TYPE manda), geometría, columnas
    ("GeoUnits_v1", "unidad geológica", None, "polygon",
     "OBJECTID, unit, name, symbol, SHAPE"),
    ("GeoContacts", "contacto geológico", "certainty", "line",
     "OBJECTID, TYPE, SHAPE_Length, SHAPE"),
    ("LinearFeatures", "rasgo lineal", "line", "line",
     "OBJECTID, TYPE, SHAPE_Length, SHAPE"),
    ("SurfaceFeatures", "rasgo superficial", "surface", "polygon",
     "OBJECTID, TYPE, SHAPE_Area, SHAPE"),
    ("LocationFeatures", "rasgo puntual", "point", "point",
     "OBJECTID, TYPE, SHAPE"),
]


def _unidades(gdb: Path) -> tuple[list[dict], dict[str, int]]:
    """dim_geologic_unit, con ``unit_symbol`` como clave única."""
    _, tabla = _leer(
        gdb, sql="SELECT OBJECTID, unit, name, symbol_noSub, subscript, symbol, Color_ID "
                 "FROM GeoUnits_v1")
    vistos: dict[str, dict] = {}
    for fila in tabla.to_pylist():
        simbolo = (fila.get("symbol") or "").strip()
        if not simbolo or simbolo in vistos:
            continue
        base = (fila.get("symbol_noSub") or "").strip() or simbolo
        vistos[simbolo] = {
            "unit_key": len(vistos) + 1,
            "unit_code": str(fila.get("unit")).strip(),
            "unit_name": (fila.get("name") or "").strip(),
            "unit_symbol": simbolo,
            "symbol_base": base,
            "subscript": (fila.get("subscript") or "").strip(),
            "color_id": int(fila["Color_ID"]) if fila.get("Color_ID") is not None else None,
            "age_prefix": "".join(c for c in base if c.isupper()) or None,
        }
    unidades = sorted(vistos.values(), key=lambda u: u["unit_key"])
    return unidades, {u["unit_symbol"]: u["unit_key"] for u in unidades}


def _contexto(gdb: Path) -> dict[str, shapely.Geometry]:
    """Geometrías de las capas que definen el contexto espacial."""
    contexto = {}
    for capa in ("LandingEllipse", "Figures", "CrossSections"):
        _, tabla = _leer(gdb, sql=f"SELECT SHAPE FROM {capa}")
        geoms = [wkb.loads(v.as_py()) for v in tabla.column("SHAPE") if v.is_valid]
        contexto[capa] = shapely.union_all(geoms)
    return contexto


def _fila_contexto(clave: int) -> dict:
    """Una de las 8 combinaciones posibles de las tres banderas."""
    return {
        "spatial_context_key": clave,
        "in_landing_ellipse": (clave >> 0) & 1,
        "in_figure_area": (clave >> 1) & 1,
        "on_cross_section": (clave >> 2) & 1,
    }


def _banderas(geom: shapely.Geometry, contexto: dict[str, shapely.Geometry]) -> int:
    clave = 0
    for bit, capa in ((0, "LandingEllipse"), (1, "Figures"), (2, "CrossSections")):
        if geom.intersects(contexto[capa]):
            clave |= 1 << bit
    return clave


def ejecutar() -> dict:
    rutas.asegurar_salida()
    aoi = json.loads((rutas.OUT / "aoi.json").read_text(encoding="utf-8"))
    ventana = shapely.box(aoi["x_min"], aoi["y_min"], aoi["x_max"], aoi["y_max"])

    gdb = rutas.GDB
    unidades, indice_unidades = _unidades(gdb)
    contexto = _contexto(gdb)
    a_grados = crs.mtm_a_lonlat()

    def a_lonlat(geom):
        def _convertir(coordenadas):
            x, y = a_grados.transform(coordenadas[:, 0], coordenadas[:, 1])
            return np.column_stack([x, y])
        return shapely.transform(geom, _convertir)

    # Polígonos de unidad recortados al AOI, para asignar unidad a los rasgos
    # que no la traen (contactos, lineales, superficiales, puntuales).
    _, tabla_unidades = _leer(
        gdb, sql="SELECT symbol, SHAPE FROM GeoUnits_v1")
    poligonos, claves_unidad = [], []
    for fila in tabla_unidades.to_pylist():
        simbolo = (fila.get("symbol") or "").strip()
        if not simbolo or not fila.get("SHAPE"):
            continue
        geom = wkb.loads(fila["SHAPE"]).intersection(ventana)
        if not geom.is_empty:
            poligonos.append(geom)
            claves_unidad.append(indice_unidades[simbolo])
    arbol = STRtree(poligonos) if poligonos else None

    def unidad_en(geom) -> int | None:
        if arbol is None:
            return None
        punto = geom.representative_point()
        for indice in arbol.query(punto):
            if poligonos[indice].contains(punto):
                return claves_unidad[indice]
        return None

    tipos: dict[tuple[str, str, str | None], dict] = {}
    hechos: list[dict] = []
    por_capa: dict[str, int] = {}

    for capa, grupo, tipo_base, geometria, columnas in CAPAS_HECHO:
        _, tabla = _leer(gdb, sql=f"SELECT {columnas} FROM {capa}")
        encontrados = 0

        for fila in tabla.to_pylist():
            crudo = fila.get("SHAPE")
            if not crudo:
                continue
            geom = wkb.loads(crudo)
            if geom.is_empty or not geom.intersects(ventana):
                continue
            recortado = geom.intersection(ventana)
            if recortado.is_empty:
                continue
            encontrados += 1

            valor = (fila.get("TYPE") or "").strip()
            if capa == "GeoUnits_v1":
                valor = (fila.get("symbol") or "").strip()
                certeza = None
                unidad = indice_unidades.get(valor)
            elif tipo_base == "certainty":
                # El TYPE de los contactos es la certeza; el tipo de rasgo es fijo.
                valor = "contacto"
                certeza = (fila.get("TYPE") or "").strip() or None
                unidad = unidad_en(recortado)
            else:
                valor = valor or "sin_tipo"
                certeza = None
                unidad = unidad_en(recortado)

            clave_tipo = (capa, valor, certeza)
            if clave_tipo not in tipos:
                tipos[clave_tipo] = {
                    "feature_type_key": len(tipos) + 1,
                    "source_layer": capa,
                    "feature_group": grupo,
                    "feature_type": valor,
                    "certainty": certeza,
                    "geometry_type": geometria,
                }

            centro = recortado.centroid
            hechos.append({
                "feature_key": len(hechos) + 1,
                "map_key": 1,
                "unit_key": unidad,
                "feature_type_key": tipos[clave_tipo]["feature_type_key"],
                "spatial_context_key": _banderas(recortado, contexto),
                "source_layer": capa,
                "source_objectid": int(fila["OBJECTID"]),
                "feature_count": 1,
                "length_m": round(recortado.length, 2) if geometria == "line" else None,
                "area_m2": round(recortado.area, 2) if geometria == "polygon" else None,
                "centroid_x": round(centro.x, 3),
                "centroid_y": round(centro.y, 3),
                "geom_wkt": recortado.wkt,
                "_lonlat": a_lonlat(recortado),
            })

        por_capa[capa] = encontrados
        print(f"  {capa:16} {tabla.num_rows:5} en origen -> {encontrados:4} en el AOI")

    dim_map = json.loads((rutas.OUT / "dim_map.json").read_text(encoding="utf-8"))
    dimensiones = {
        "dim_map": [dim_map],
        "dim_geologic_unit": unidades,
        "dim_feature_type": sorted(tipos.values(), key=lambda t: t["feature_type_key"]),
        "dim_spatial_context": [_fila_contexto(k) for k in
                                sorted({h["spatial_context_key"] for h in hechos})],
    }
    for nombre, contenido in dimensiones.items():
        (rutas.OUT_GEOLOGIA / f"{nombre}.json").write_text(
            json.dumps(contenido, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    (rutas.OUT_GEOLOGIA / "fact_map_feature.json").write_text(
        json.dumps([{k: v for k, v in h.items() if not k.startswith("_")} for h in hechos],
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # GeoJSON aplanado: una Feature por hecho, con las dimensiones ya unidas.
    por_unidad = {u["unit_key"]: u for u in unidades}
    por_tipo = {t["feature_type_key"]: t for t in tipos.values()}
    por_contexto = {c["spatial_context_key"]: c for c in dimensiones["dim_spatial_context"]}
    features = []
    for hecho in hechos:
        unidad = por_unidad.get(hecho["unit_key"], {})
        tipo = por_tipo[hecho["feature_type_key"]]
        ctx = por_contexto[hecho["spatial_context_key"]]
        features.append({
            "type": "Feature",
            "geometry": mapping(hecho["_lonlat"]),
            "properties": {
                **_sin_geometria(hecho),
                "unit_code": unidad.get("unit_code"),
                "unit_name": unidad.get("unit_name"),
                "unit_symbol": unidad.get("unit_symbol"),
                "symbol_base": unidad.get("symbol_base"),
                "subscript": unidad.get("subscript"),
                "color_id": unidad.get("color_id"),
                "age_prefix": unidad.get("age_prefix"),
                "feature_group": tipo["feature_group"],
                "feature_type": tipo["feature_type"],
                "certainty": tipo["certainty"],
                "geometry_type": tipo["geometry_type"],
                "in_landing_ellipse": ctx["in_landing_ellipse"],
                "in_figure_area": ctx["in_figure_area"],
                "on_cross_section": ctx["on_cross_section"],
            },
        })

    destino = rutas.OUT / "geologia.geojson"
    destino.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                                  ensure_ascii=False) + "\n", encoding="utf-8")

    resumen = {
        "features": len(features),
        "por_capa": por_capa,
        "unidades": len(unidades),
        "tipos": len(tipos),
        "contextos": len(dimensiones["dim_spatial_context"]),
        "con_unidad": sum(1 for h in hechos if h["unit_key"] is not None),
    }
    print(f"  {resumen['unidades']} unidades, {resumen['tipos']} tipos, "
          f"{resumen['contextos']} contextos, {resumen['con_unidad']}/{resumen['features']} "
          f"rasgos con unidad")
    print(f"  -> {destino.relative_to(rutas.RAIZ)} "
          f"({destino.stat().st_size / 1e6:.2f} MB)")
    return resumen


CAMPOS_SIN_GEOMETRIA = (
    "feature_key", "map_key", "unit_key", "feature_type_key", "spatial_context_key",
    "source_layer", "source_objectid", "feature_count", "length_m", "area_m2",
    "centroid_x", "centroid_y",
)


def _sin_geometria(hecho: dict) -> dict:
    return {k: hecho[k] for k in CAMPOS_SIN_GEOMETRIA}
