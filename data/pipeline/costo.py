"""Paso 50: mapa de costo por celda, en minutos con traje.

Implementa la fórmula del spec sobre la malla alineada del paso 10:

    c = Δx / v(θ) · f_terreno          (minutos por celda de 20 m)
    c = ∞ si θ > θ_max_fisico

``Δx`` es el lado de la celda. ``route_through_array(..., geometric=True)``
multiplica el costo de cada paso por su longitud (1 en ortogonal, √2 en
diagonal), así que basta con guardar el costo de un paso recto y la geometría
queda correcta sola.

THEMIS: el raster llega en DN de 8 bits, no en Kelvin. ``params.yaml`` fija los
umbrales en K (roca 220, arena 200), así que aquí se declara la calibración
DN→K como supuesto explícito y auditable.
"""
from __future__ import annotations

import json

import numpy as np
import rasterio

from . import parametros, rutas

# Calibración declarada del DN de THEMIS a temperatura de brillo.
# El mosaico se distribuye en 8 bits sin tabla de calibración; este rango
# reproduce los valores que usa el grafo falso (205–230 K en las estaciones).
DN_MIN_K = 150.0
DN_MAX_K = 300.0

NOMBRE_COSTO = "costo.tif"
NOMBRE_FACTOR = "f_terreno.tif"


def dn_a_k(dn: np.ndarray) -> np.ndarray:
    """Temperatura de brillo aproximada, a partir del DN de 8 bits."""
    return DN_MIN_K + (dn.astype("float64") / 255.0) * (DN_MAX_K - DN_MIN_K)


def factor_terreno(themis_dn: np.ndarray, p: parametros.Parametros) -> np.ndarray:
    """Multiplicador del costo por tipo de suelo, según THEMIS noche.

    Roca expuesta se mantiene caliente de noche; arena fina se enfría. El
    umbral está en Kelvin en ``params.yaml``, así que se calibra primero.
    """
    k = dn_a_k(themis_dn)
    factor = np.full(k.shape, p.f_normal, dtype="float64")
    factor[k >= p.themis_roca_k] = p.f_roca
    factor[k <= p.themis_arena_k] = p.f_arena
    return factor


def costo_por_celda(pendiente_deg: np.ndarray, factor: np.ndarray,
                    p: parametros.Parametros) -> np.ndarray:
    """Costo en minutos de un paso recto de una celda, sin aplicar límites."""
    theta = np.radians(pendiente_deg)
    tan_theta = np.tan(theta)
    velocidad = p.tobler.velocidad_kmh(tan_theta) * p.factor_traje
    velocidad = np.maximum(velocidad, 1e-6)
    minutos_por_m = (1.0 / velocidad) * (60.0 / 1000.0)
    return minutos_por_m * p.celda_m * factor


def matriz_bloqueada(pendiente_deg: np.ndarray, p: parametros.Parametros,
                     limite_deg: float) -> np.ndarray:
    """Máscara de celdas intransitables: por límite del astronauta o físico."""
    tope = min(limite_deg, p.theta_max_fisico_deg)
    return pendiente_deg > tope


def costo_para_limite(base: np.ndarray, pendiente_deg: np.ndarray,
                     p: parametros.Parametros, limite_deg: float) -> np.ndarray:
    """Costo con las celdas fuera de límite marcadas como intransitables."""
    costo = base.copy()
    costo[matriz_bloqueada(pendiente_deg, p, limite_deg)] = np.inf
    return costo


def ejecutar() -> dict:
    rutas.asegurar_salida()
    p = parametros.cargar()

    with rasterio.open(rutas.OUT_RASTERS / "dtm.tif") as ds:
        dtm = ds.read(1).astype("float64")
        nodata = ds.nodata
        perfil = ds.profile.copy()
    with rasterio.open(rutas.OUT_RASTERS / "pendiente.tif") as ds:
        pendiente = ds.read(1).astype("float64")
        nodata_pend = ds.nodata
    with rasterio.open(rutas.OUT_RASTERS / "themis_noche.tif") as ds:
        themis = ds.read(1)

    valido = (dtm != nodata) & (pendiente != nodata_pend) & np.isfinite(pendiente)
    if not valido.all():
        print(f"  aviso: {int((~valido).sum())} celdas sin dato; se marcan intransitables")

    factor = factor_terreno(themis, p)
    base = costo_por_celda(np.where(valido, pendiente, 0.0), factor, p)
    base[~valido] = np.inf

    valor_nodata = np.float32(-3.4028235e38)

    # Costo sin bloqueo por pendiente: es el insumo de las aristas, que aplican
    # su propio límite (incluido el físico). Solo queda infinito donde no hay dato.
    salida_base = np.where(np.isfinite(base), base, valor_nodata).astype("float32")
    perfil.update(dtype="float32", count=1, nodata=valor_nodata,
                  compress="deflate", predictor=2)
    with rasterio.open(rutas.OUT_RASTERS / NOMBRE_COSTO, "w", **perfil) as dst:
        dst.write(salida_base, 1)

    salida_factor = np.where(valido, factor, valor_nodata).astype("float32")
    with rasterio.open(rutas.OUT_RASTERS / NOMBRE_FACTOR, "w", **perfil) as dst:
        dst.write(salida_factor, 1)

    # Resumen por límite precalculado. No se escriben GeoTIFF por límite: el
    # paso 60 recalcula el costo con su propio tope sobre la malla base.
    versiones = {}
    for limite in p.limites_pendiente_deg:
        costo = costo_para_limite(base, pendiente, p, limite)
        bloqueadas = int(np.isinf(costo).sum())
        versiones[str(int(limite))] = {
            "bloqueadas_pct": round(100.0 * bloqueadas / costo.size, 2),
            "maximo_min_por_celda": round(float(costo[np.isfinite(costo)].max()), 4)
            if np.isfinite(costo).any() else None,
        }
        print(f"  costo {int(limite):2d}°: {bloqueadas:6d} celdas bloqueadas "
              f"({versiones[str(int(limite))]['bloqueadas_pct']:5.2f}%)")

    finitos = base[np.isfinite(base)]
    k = dn_a_k(themis)
    resumen = {
        "celda_m": p.celda_m,
        "formula": "c = Δx / (v(θ)·factor_traje) · f_terreno, en minutos",
        "tobler": {"a": p.tobler.a, "b": p.tobler.b, "c": p.tobler.c},
        "factor_traje": p.factor_traje,
        "theta_max_fisico_deg": p.theta_max_fisico_deg,
        "costo_min_por_celda": {
            "min": round(float(finitos.min()), 4),
            "mediana": round(float(np.median(finitos)), 4),
            "max": round(float(finitos.max()), 4),
        },
        "f_terreno": {
            "roca": p.f_roca, "arena": p.f_arena, "normal": p.f_normal,
            "pct_roca": round(100.0 * float((k >= p.themis_roca_k)[valido].mean()), 1),
            "pct_arena": round(100.0 * float((k <= p.themis_arena_k)[valido].mean()), 1),
        },
        "calibracion_themis": {
            "origen": "DN de 8 bits del mosaico USGS",
            "dn_min_k": DN_MIN_K, "dn_max_k": DN_MAX_K,
            "motivo": ("el mosaico no trae tabla de calibración; el rango se eligió "
                       "para reproducir los 205-230 K del grafo falso"),
            "supuesto_dn_roca": round((p.themis_roca_k - DN_MIN_K) / (DN_MAX_K - DN_MIN_K) * 255, 1),
            "supuesto_dn_arena": round((p.themis_arena_k - DN_MIN_K) / (DN_MAX_K - DN_MIN_K) * 255, 1),
        },
        "versiones": versiones,
    }
    (rutas.OUT / "costo.json").write_text(
        json.dumps(resumen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"  costo por celda: mediana {resumen['costo_min_por_celda']['mediana']:.4f} min "
          f"(min {resumen['costo_min_por_celda']['min']:.4f}, "
          f"max {resumen['costo_min_por_celda']['max']:.4f})")
    print(f"  THEMIS: {resumen['f_terreno']['pct_roca']}% roca, "
          f"{resumen['f_terreno']['pct_arena']}% arena")
    return resumen
