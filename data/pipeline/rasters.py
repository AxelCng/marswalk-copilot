"""Paso 10: recorte y reproyección de los rasters a una sola malla.

Todas las capas salen con la misma transformación, el mismo CRS y el mismo
tamaño de celda, de modo que ``(fila, columna)`` identifica el mismo trozo de
suelo en todas. Sin eso, el modelo de costo del spec no tiene sentido: el
``f_terreno`` de una celda tiene que hablar de la elevación de esa misma celda.
"""
from __future__ import annotations

import json

import numpy as np
import pyproj
import rasterio
from rasterio.crs import CRS as RioCRS
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

from . import crs, rutas

# (clave, archivo de entrada, remuestreo, dtype, descripción)
CAPAS = [
    ("dtm", rutas.DTM_CTX, Resampling.bilinear, "float32",
     "DTM CTX estéreo 20 m; elevación del modelo de costo"),
    ("orto", rutas.ORTO_CTX, Resampling.bilinear, "uint8",
     "Ortoimagen CTX 6 m; mapa base de detalle"),
    ("orto_mosaico", rutas.ORTO_CTX_MOSAICO, Resampling.bilinear, "uint8",
     "Mosaico CTX Caltech 5 m; ya está en MTM"),
    ("themis_dia", rutas.THEMIS_DIA, Resampling.nearest, "uint8",
     "THEMIS IR día; complemento térmico"),
    ("themis_noche", rutas.THEMIS_NOCHE, Resampling.nearest, "uint8",
     "THEMIS IR noche; proxy roca (caliente) vs arena (fría)"),
    ("hrsc", rutas.HRSC_DTM, Resampling.bilinear, "float32",
     "DTM HRSC 75 m; contraste de elevación"),
    ("hrsc_sombra", rutas.HRSC_SOMBRA, Resampling.nearest, "uint8",
     "Hillshade HRSC; relieve para el mapa"),
]

NODATA = {"float32": np.float32(-3.4028235e38), "uint8": np.uint8(255)}


def _crs_origen(ds) -> RioCRS:
    """CRS del raster como CRS de rasterio, reconstruido para evitar choques de cuerpo."""
    if ds.crs is None:
        raise ValueError("el raster no declara CRS")
    proj4 = crs.proj4(pyproj.CRS.from_wkt(ds.crs.to_wkt()))
    return RioCRS.from_wkt(pyproj.CRS.from_proj4(proj4).to_wkt())


def destino_malla(aoi: dict):
    """Transformación y CRS destino, comunes a todas las capas."""
    tr = from_origin(aoi["x_min"], aoi["y_max"], aoi["celda_m"], aoi["celda_m"])
    return tr, RioCRS.from_wkt(crs.wkt_mtm())


def reproyectar(ruta_entrada, aoi: dict, remuestreo: Resampling, dtype: str):
    """Recorta y reproyecta una capa a la malla del AOI. Devuelve (datos, perfil)."""
    tr_dst, crs_dst = destino_malla(aoi)
    alto, ancho = aoi["alto_px"], aoi["ancho_px"]
    nodata_dst = NODATA[dtype]
    dst = np.full((alto, ancho), nodata_dst, dtype=dtype)

    with rasterio.open(ruta_entrada) as ds:
        origen_crs = _crs_origen(ds)
        nodata_origen = ds.nodata
        if dtype == "uint8":
            # Los reales (DTM) remuestreados a uint8 no tienen sentido; aquí solo
            # llegan capas de 8 bits, así que el nodata nativo se respeta.
            dst_nodata = nodata_dst if nodata_origen is not None else None
        else:
            dst_nodata = nodata_dst
        reproject(
            source=rasterio.band(ds, 1),
            destination=dst,
            src_transform=ds.transform,
            src_crs=origen_crs,
            src_nodata=nodata_origen,
            dst_transform=tr_dst,
            dst_crs=crs_dst,
            dst_nodata=dst_nodata,
            resampling=remuestreo,
        )
        perfil = {
            "driver": "GTiff",
            "height": alto,
            "width": ancho,
            "count": 1,
            "dtype": dtype,
            "crs": crs_dst,
            "transform": tr_dst,
            "nodata": dst_nodata,
            "compress": "deflate",
            "predictor": 2 if dtype == "float32" else 1,
        }
        origen = {
            "archivo": str(ruta_entrada),
            "crs": str(pyproj.CRS.from_wkt(ds.crs.to_wkt()).name or "Equirectangular Mars"),
            "resolucion_m": tuple(round(v, 4) for v in ds.res),
            "tamano_px": [ds.width, ds.height],
        }
    return dst, perfil, origen


def pendiente_en_grados(dtm: np.ndarray, celda_m: float) -> np.ndarray:
    """Pendiente por diferencias finitas centrales sobre la malla regular."""
    gy, gx = np.gradient(dtm.astype("float64"), celda_m)
    return np.degrees(np.arctan(np.hypot(gx, gy))).astype("float32")


def ejecutar() -> dict:
    rutas.asegurar_salida()
    aoi = json.loads((rutas.OUT / "aoi.json").read_text(encoding="utf-8"))
    tr_dst, crs_dst = destino_malla(aoi)
    nodata_float = NODATA["float32"]

    manifiesto = {
        "crs_name": aoi["crs_name"],
        "datum": aoi["datum"],
        "celda_m": aoi["celda_m"],
        "ancho_px": aoi["ancho_px"],
        "alto_px": aoi["alto_px"],
        "transform": list(tr_dst)[:6],
        "origen_x": aoi["x_min"],
        "origen_y": aoi["y_max"],
        "capas": {},
    }

    dtm = None
    for clave, relativa, remuestreo, dtype, descripcion in CAPAS:
        entrada = rutas.RASTERS_IN / relativa
        datos, perfil, origen = reproyectar(entrada, aoi, remuestreo, dtype)
        salida = rutas.OUT_RASTERS / f"{clave}.tif"
        with rasterio.open(salida, "w", **perfil) as dst:
            dst.write(datos, 1)

        valido = datos != perfil["nodata"] if perfil["nodata"] is not None else np.ones_like(datos, bool)
        info = {
            **origen,
            "capa": clave,
            "descripcion": descripcion,
            "salida": str(salida.relative_to(rutas.RAIZ)),
            "remuestreo": remuestreo.name,
            "validos_pct": round(100.0 * float(valido.mean()), 2),
        }
        if dtype == "float32":
            valores = datos[valido]
            info["rango"] = [round(float(valores.min()), 2), round(float(valores.max()), 2)]
        manifiesto["capas"][clave] = info
        print(f"  {clave:13} {info['validos_pct']:6.2f}% válido  "
              f"{_resumen_origen(origen)} -> {salida.name}")
        if clave == "dtm":
            dtm = datos

    if dtm is None:
        raise RuntimeError("no se generó la capa 'dtm'")

    # Pendiente derivada de la DTM ya alineada: es la capa que usa el motor.
    pendiente = pendiente_en_grados(np.where(dtm == nodata_float, np.nan, dtm), aoi["celda_m"])
    pendiente = np.where(np.isnan(pendiente), nodata_float, pendiente).astype("float32")
    salida_pend = rutas.OUT_RASTERS / "pendiente.tif"
    with rasterio.open(salida_pend, "w", driver="GTiff", height=aoi["alto_px"],
                       width=aoi["ancho_px"], count=1, dtype="float32",
                       crs=crs_dst, transform=tr_dst, nodata=nodata_float,
                       compress="deflate", predictor=2) as dst:
        dst.write(pendiente, 1)

    pv = pendiente[pendiente != nodata_float]
    manifiesto["capas"]["pendiente"] = {
        "capa": "pendiente",
        "descripcion": "Pendiente en grados derivada de la DTM alineada",
        "salida": str(salida_pend.relative_to(rutas.RAIZ)),
        "derivada_de": "dtm",
        "validos_pct": round(100.0 * float((pendiente != nodata_float).mean()), 2),
        "rango": [round(float(pv.min()), 2), round(float(pv.max()), 2)],
        "media": round(float(pv.mean()), 2),
        "mediana": round(float(np.median(pv)), 2),
        "p99": round(float(np.percentile(pv, 99)), 2),
        "pct_mayor_15": round(100.0 * float((pv > 15).mean()), 2),
        "pct_mayor_20": round(100.0 * float((pv > 20).mean()), 2),
        "pct_mayor_25": round(100.0 * float((pv > 25).mean()), 2),
    }
    print(f"  {'pendiente':13} media {manifiesto['capas']['pendiente']['media']:.2f}°  "
          f"p99 {manifiesto['capas']['pendiente']['p99']:.1f}°  "
          f">15° {manifiesto['capas']['pendiente']['pct_mayor_15']:.2f}%")

    destino = rutas.OUT_RASTERS / "malla.json"
    destino.write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2) + "\n",
                       encoding="utf-8")
    print(f"  malla {aoi['ancho_px']}x{aoi['alto_px']} @ {aoi['celda_m']:.0f} m -> "
          f"{destino.relative_to(rutas.RAIZ)}")
    return manifiesto


def _resumen_origen(origen: dict) -> str:
    """Texto corto con la resolución de origen, para la salida por consola."""
    res = origen["resolucion_m"]
    return f"{res[0]:g} m"
