"""Lectura de ``params.yaml``: un solo lugar para todos los supuestos.

El pipeline no modifica ``params.yaml`` (es de Jeicoll y se cambia avisando en el
grupo); solo lo lee y expone los valores con nombre.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import yaml
import numpy as np

from . import rutas

PARAMS = rutas.RAIZ / "params.yaml"


@dataclass(frozen=True)
class Tobler:
    a: float
    b: float
    c: float

    def velocidad_kmh(self, tan_theta):
        """v = a · e^(−b·|tanθ + c|), en km/h.

        El término +c hace que el óptimo sea una bajada suave (tanθ = −c),
        no el llano. Es la forma publicada de Tobler.

        Acepta escalares o arrays: el mapa de costo evalúa la fórmula en toda
        la malla de una vez.
        """
        return self.a * np.exp(-self.b * np.abs(tan_theta + self.c))


@dataclass(frozen=True)
class Parametros:
    celda_m: float
    tobler: Tobler
    factor_traje: float
    theta_max_fisico_deg: float
    limites_pendiente_deg: tuple[float, ...]
    f_roca: float
    f_arena: float
    f_normal: float
    themis_roca_k: float
    themis_arena_k: float
    k_energia: float
    radio_visibilidad_m: float
    umbral_cobertura_com_pct: float
    azimuts_blindaje: int


@lru_cache(maxsize=1)
def cargar() -> Parametros:
    with open(PARAMS, encoding="utf-8") as f:
        datos = yaml.safe_load(f)
    c = datos["costo"]
    t = c["tobler"]
    f = c["f_terreno"]
    umbrales = c["themis_noche_umbral_K"]
    return Parametros(
        celda_m=float(c["celda_m"]),
        tobler=Tobler(a=float(t["a"]), b=float(t["b"]), c=float(t["c"])),
        factor_traje=float(c["factor_traje"]),
        theta_max_fisico_deg=float(c["theta_max_fisico_deg"]),
        limites_pendiente_deg=tuple(float(v) for v in c["limites_pendiente_deg"]),
        f_roca=float(f["roca_expuesta"]),
        f_arena=float(f["arena_fina"]),
        f_normal=float(f["normal"]),
        themis_roca_k=float(umbrales["roca"]),
        themis_arena_k=float(umbrales["arena"]),
        k_energia=float(c["k_energia"]),
        radio_visibilidad_m=float(datos["comms"]["radio_visibilidad_m"]),
        umbral_cobertura_com_pct=float(datos["comms"]["umbral_cobertura_com_pct"]),
        azimuts_blindaje=int(datos["radiacion"]["azimuts_blindaje"]),
    )
