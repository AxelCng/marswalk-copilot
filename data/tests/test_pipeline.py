"""Pruebas del pipeline de datos. Requieren las descargas del SIM 3464."""
from __future__ import annotations

import json
import math

import numpy as np
import pytest
import rasterio

from data.pipeline import aoi, crs, dim_map, geologia, rasters, rutas, verificar, waypoints

requiere_raw = pytest.mark.skipif(
    not rutas.GDB.exists(), reason="faltan las descargas del SIM 3464 en data/raw/")


# ---------------------------------------------------------------- CRS
def test_crs_es_de_marte():
    assert crs.RADIO_MARTE_M == 3_396_190.0
    assert "+R=3396190" in crs.proj4(crs.MTM)
    assert crs.CRS_NAME == "MTM 77.5E"


def test_ida_y_vuelta_lonlat_mtm():
    directo = crs.lonlat_a_mtm()
    inverso = crs.mtm_a_lonlat()
    for lon, lat in [(77.45089, 18.44463), (77.40144, 18.45073), (77.39224, 18.42267)]:
        x, y = directo.transform(lon, lat)
        lon2, lat2 = inverso.transform(x, y)
        assert lon2 == pytest.approx(lon, abs=1e-9)
        assert lat2 == pytest.approx(lat, abs=1e-9)


def test_mtm_es_metrico_en_el_meridiano_central():
    """Sobre el meridiano central, 1° de latitud es R·π/180 metros."""
    directo = crs.lonlat_a_mtm()
    _, y1 = directo.transform(77.5, 18.0)
    _, y2 = directo.transform(77.5, 19.0)
    esperado = crs.RADIO_MARTE_M * math.pi / 180.0
    assert (y2 - y1) == pytest.approx(esperado, rel=1e-9)


def test_un_grado_de_longitud_se_encoge_con_el_coseno():
    directo = crs.lonlat_a_mtm()
    x1, _ = directo.transform(77.0, 18.45)
    x2, _ = directo.transform(78.0, 18.45)
    esperado = crs.RADIO_MARTE_M * math.pi / 180.0 * math.cos(math.radians(18.45))
    assert (x2 - x1) == pytest.approx(esperado, rel=1e-3)


# ---------------------------------------------------------------- AOI
@requiere_raw
def test_aoi_contiene_todas_las_estaciones():
    a = aoi.calcular_aoi()
    for e in aoi.estaciones_mtm(aoi.leer_estaciones()):
        assert a["x_min"] <= e["x_m"] <= a["x_max"]
        assert a["y_min"] <= e["y_m"] <= a["y_max"]


@requiere_raw
def test_aoi_es_de_pocos_km2_y_esta_anclado_a_la_malla():
    a = aoi.calcular_aoi()
    assert 5.0 <= a["area_km2"] <= 25.0, "el spec pide un recorte de pocos km²"
    for clave in ("x_min", "x_max", "y_min", "y_max"):
        assert a[clave] % a["celda_m"] == 0, f"{clave} no está anclado a la malla"
    assert a["ancho_px"] * a["celda_m"] == a["x_max"] - a["x_min"]
    assert a["alto_px"] * a["celda_m"] == a["y_max"] - a["y_min"]


@requiere_raw
def test_aoi_cae_dentro_de_la_extension_de_dim_map():
    a = aoi.calcular_aoi()
    d = dim_map.leer_metadata()
    assert d["lon_min"] < a["lon_min"] and a["lon_max"] < d["lon_max"]
    assert d["lat_min"] < a["lat_min"] and a["lat_max"] < d["lat_max"]


# ---------------------------------------------------------------- dim_map
@requiere_raw
def test_dim_map_trae_crs_y_datum_del_prj():
    d = dim_map.leer_metadata()
    assert d["crs_name"] == "MTM 77.5E"
    assert "Mars_2000" in d["datum"]
    assert d["map_scale"] == 75000
    assert d["series"] == "SIM 3464"
    assert d["pub_year"] == 2020


@requiere_raw
def test_dim_map_extension_coincide_con_el_xml():
    d = dim_map.leer_metadata()
    assert (d["lon_min"], d["lon_max"]) == (76.8, 77.8)
    assert (d["lat_min"], d["lat_max"]) == (17.7, 18.7)


# ---------------------------------------------------------------- rasters
@requiere_raw
def test_todas_las_capas_comparten_malla():
    with rasterio.open(rutas.OUT_RASTERS / "dtm.tif") as ref:
        esperado = (ref.width, ref.height, ref.res, tuple(ref.transform)[:6])
        for clave, *_ in rasters.CAPAS:
            with rasterio.open(rutas.OUT_RASTERS / f"{clave}.tif") as ds:
                assert (ds.width, ds.height) == esperado[:2], f"{clave}: tamaño distinto"
                assert ds.res == esperado[2], f"{clave}: resolución distinta"
                assert tuple(ds.transform)[:6] == esperado[3], f"{clave}: origen distinto"


@requiere_raw
def test_dtm_cubre_todo_el_aoi_sin_huecos():
    with rasterio.open(rutas.OUT_RASTERS / "dtm.tif") as ds:
        datos = ds.read(1)
        nodata = ds.nodata
    valido = datos != nodata
    assert valido.mean() > 0.99
    assert not (~valido[1:-1, 1:-1]).any(), "hay huecos interiores en el DTM"


@requiere_raw
def test_pendiente_es_coherente_con_la_dtm():
    with rasterio.open(rutas.OUT_RASTERS / "dtm.tif") as ds:
        dtm = ds.read(1)
        nodata = ds.nodata
        celda = ds.res[0]
    with rasterio.open(rutas.OUT_RASTERS / "pendiente.tif") as ds:
        pendiente = ds.read(1)

    valido = dtm != nodata
    gy, gx = np.gradient(dtm.astype("float64"), celda)
    esperado = np.degrees(np.arctan(np.hypot(gx, gy)))
    assert np.allclose(pendiente[valido], esperado[valido], atol=1e-4)
    assert 0.0 <= pendiente[valido].min() and pendiente[valido].max() < 90.0


# ---------------------------------------------------------------- waypoints
@requiere_raw
def test_estaciones_caen_dentro_del_raster():
    a = aoi.calcular_aoi()
    for e in waypoints.ejecutar():
        assert 1 <= e["fila"] < a["alto_px"] - 1
        assert 1 <= e["col"] < a["ancho_px"] - 1


@requiere_raw
def test_desplazamiento_por_snapping_menor_que_media_diagonal():
    a = aoi.calcular_aoi()
    maximo = a["celda_m"] * math.sqrt(2) / 2
    for e in waypoints.ejecutar():
        cx = a["x_min"] + (e["col"] + 0.5) * a["celda_m"]
        cy = a["y_max"] - (e["fila"] + 0.5) * a["celda_m"]
        assert math.hypot(cx - e["x_m"], cy - e["y_m"]) <= maximo


# ---------------------------------------------------------------- geología
@requiere_raw
def test_modelo_estrella_tiene_las_cuatro_dimensiones_y_el_hecho():
    geologia.ejecutar()
    for nombre in ("dim_map", "dim_geologic_unit", "dim_feature_type",
                   "dim_spatial_context", "fact_map_feature"):
        assert (rutas.OUT_GEOLOGIA / f"{nombre}.json").exists(), f"falta {nombre}"


@requiere_raw
def test_unidad_es_unica_por_simbolo_no_por_codigo():
    """El código entero colisiona (5 y 11 se repiten); el símbolo no."""
    unidades, indice = geologia._unidades(rutas.GDB)
    simbolos = [u["unit_symbol"] for u in unidades]
    assert len(simbolos) == len(set(simbolos))
    assert len(indice) == len(unidades)


@requiere_raw
def test_contexto_espacial_tiene_como_maximo_ocho_filas():
    filas = [geologia._fila_contexto(k) for k in range(8)]
    assert len(filas) == 8
    assert geologia._fila_contexto(0b101)["on_cross_section"] == 1
    assert geologia._fila_contexto(0b101)["in_figure_area"] == 0


@requiere_raw
def test_geojson_es_consumible_por_el_mapa():
    geologia.ejecutar()
    datos = json.loads((rutas.OUT / "geologia.geojson").read_text(encoding="utf-8"))
    assert datos["type"] == "FeatureCollection"
    assert datos["features"]
    for f in datos["features"]:
        assert f["geometry"] is not None
        props = f["properties"]
        for campo in ("feature_key", "source_layer", "source_objectid",
                      "unit_symbol", "feature_type", "geometry_type"):
            assert campo in props, f"falta {campo} en el GeoJSON aplanado"


@requiere_raw
def test_geometria_del_geojson_esta_en_lonlat():
    datos = json.loads((rutas.OUT / "geologia.geojson").read_text(encoding="utf-8"))

    def coordenadas(geom):
        tipo = geom["type"]
        if tipo == "Point":
            yield geom["coordinates"]
        elif tipo in ("LineString", "MultiPoint"):
            yield from geom["coordinates"]
        elif tipo in ("Polygon", "MultiLineString"):
            for anillo in geom["coordinates"]:
                yield from anillo
        elif tipo == "MultiPolygon":
            for poligono in geom["coordinates"]:
                for anillo in poligono:
                    yield from anillo

    vistos = 0
    for f in datos["features"]:
        for x, y in coordenadas(f["geometry"]):
            assert -180 <= x <= 360, "la coordenada X parece estar en metros MTM"
            assert -90 <= y <= 90, "la coordenada Y parece estar en metros MTM"
            vistos += 1
    assert vistos > 0


# ---------------------------------------------------------------- verificación
@requiere_raw
def test_verificacion_completa_pasa():
    a = aoi.calcular_aoi()
    estaciones = waypoints.ejecutar()
    assert verificar.verificar_estaciones(a, estaciones) == []
    assert verificar.verificar_malla(a) == []
    problemas, _ = verificar.verificar_datos(a, estaciones)
    assert problemas == []
