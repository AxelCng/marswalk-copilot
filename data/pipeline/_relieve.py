"""Cálculos de relieve sobre la DTM alineada: blindaje, sombra y zonas.

Todo aquí es un **modelo declarado**, no una medición:

* ``blindaje``: fracción de cielo tapada por el terreno, en 8 azimuts.
* ``sombra``: celdas sin sol para una hora fija (hillshade binario).
* ``cobertura``: línea de vista celda a celda sobre la DTM.

En Jezero no hay dosímetro RAD, así que ``dosis_rel`` es un índice relativo;
estos cálculos solo aportan el factor de blindaje que multiplica al tiempo.
"""
from __future__ import annotations

import math

import numpy as np

AZIMUTS = 8
PASO_AZIMUT_DEG = 360.0 / AZIMUTS
ALTURA_OBSERVADOR_M = 1.8
#: Hora fija del cálculo de sombra: sol bajo, que es cuando hay sombra que medir.
#: Con el sol alto, este terreno casi llano no proyecta sombra y la métrica
#: sería siempre 0. Es un supuesto declarado del modelo.
ALTURA_SOL_DEG = 10.0
AZIMUT_SOL_DEG = 225.0


def blindaje(dtm: np.ndarray, celda: float) -> np.ndarray:
    """Fracción de cielo tapada por el relieve, en 8 azimuts.

    Para cada azimut se toma el mayor ángulo de elevación entre la celda y
    cualquier punto del rayo (el horizonte). El promedio de ``sen(horizonte)``
    sobre los 8 azimuts aproxima la fracción de cielo obstruida.
    """
    alto, ancho = dtm.shape
    acumulado = np.zeros(dtm.shape, dtype="float64")
    largo = max(1, int(math.hypot(alto, ancho) / 2))
    filas = np.arange(alto)[:, None]
    cols = np.arange(ancho)[None, :]

    for k in range(AZIMUTS):
        ang = math.radians(k * PASO_AZIMUT_DEG)
        df, dc = round(math.cos(ang)), round(math.sin(ang))
        if df == 0 and dc == 0:
            continue
        mayor = np.zeros(dtm.shape, dtype="float64")
        for r in range(1, largo + 1):
            f = np.clip(filas + df * r, 0, alto - 1)
            c = np.clip(cols + dc * r, 0, ancho - 1)
            tan_h = (dtm[f, c] - dtm) / (r * celda)
            mayor = np.maximum(mayor, tan_h)
        acumulado += np.arctan(np.maximum(mayor, 0.0))

    acumulado /= AZIMUTS
    return np.clip(np.sin(acumulado), 0.0, 1.0)


def sombra(dtm: np.ndarray, celda: float) -> np.ndarray:
    """Celdas en sombra para una hora fija, por **sombra proyectada**.

    No basta con mirar la normal de la celda: en terreno suave casi ninguna
    cara se aparta del sol. Lo que produce sombra es que el relieve tape el sol,
    así que se compara el horizonte en la dirección del sol con su altura. Es el
    mismo cálculo que el blindaje, pero en un solo azimut.
    """
    alto, ancho = dtm.shape
    ang = math.radians(AZIMUT_SOL_DEG)
    df, dc = round(math.cos(ang)), round(math.sin(ang))
    if df == 0 and dc == 0:
        return np.zeros(dtm.shape, dtype=bool)

    largo = max(1, int(math.hypot(alto, ancho) / 2))
    filas = np.arange(alto)[:, None]
    cols = np.arange(ancho)[None, :]
    mayor = np.zeros(dtm.shape, dtype="float64")

    for r in range(1, largo + 1):
        f = np.clip(filas + df * r, 0, alto - 1)
        c = np.clip(cols + dc * r, 0, ancho - 1)
        tan_h = (dtm[f, c] - dtm) / (r * celda)
        mayor = np.maximum(mayor, tan_h)

    horizonte = np.arctan(np.maximum(mayor, 0.0))
    return horizonte > math.radians(ALTURA_SOL_DEG)


def _vista(dtm: np.ndarray, origen, destino) -> bool:
    """¿Hay línea de vista entre dos celdas, con la DTM como obstáculo?"""
    f1, c1 = origen
    f2, c2 = destino
    n = int(max(abs(f2 - f1), abs(c2 - c1)))
    if n == 0:
        return True
    z0 = dtm[f1, c1] + ALTURA_OBSERVADOR_M
    z1 = dtm[f2, c2] + ALTURA_OBSERVADOR_M
    if z1 <= z0:
        # Hacia abajo no hay obstáculo posible por encima del rayo.
        return True
    pendiente = (z1 - z0) / n
    for i in range(1, n):
        f = int(round(f1 + (f2 - f1) * i / n))
        c = int(round(c1 + (c2 - c1) * i / n))
        if dtm[f, c] > z0 + pendiente * i:
            return False
    return True


def cobertura(puntos, dtm: np.ndarray, celda: float, antenas) -> float:
    """% de celdas del camino con línea de vista a alguna antena."""
    if not antenas or not puntos:
        return 0.0
    vistos = sum(1 for p in puntos if any(_vista(dtm, p, a) for a in antenas))
    return 100.0 * vistos / len(puntos)


def zonas_de_alerta(aoi: dict) -> list[dict]:
    """Zonas de alerta para la demo, en lon/lat y dentro del AOI.

    El SIM 3464 no trae zonas de alerta: son un supuesto del spec para poder
    cerrar una zona en la demo de polvo. Se derivan del AOI en fracciones.
    """
    from . import crs

    x0, x1 = aoi["x_min"], aoi["x_max"]
    y0, y1 = aoi["y_min"], aoi["y_max"]
    ancho, alto = x1 - x0, y1 - y0
    inverso = crs.mtm_a_lonlat()

    def caja(fx0, fy0, fx1, fy1):
        esquinas = [
            (x0 + fx0 * ancho, y0 + fy0 * alto),
            (x0 + fx1 * ancho, y0 + fy0 * alto),
            (x0 + fx1 * ancho, y0 + fy1 * alto),
            (x0 + fx0 * ancho, y0 + fy1 * alto),
            (x0 + fx0 * ancho, y0 + fy0 * alto),
        ]
        return [[round(lo, 6), round(la, 6)] for lo, la in
                (inverso.transform(x, y) for x, y in esquinas)]

    return [
        {"id": "Z1", "nombre": "Frente del delta", "poligono": caja(0.00, 0.40, 0.38, 1.00)},
        {"id": "Z2", "nombre": "Campo de dunas Séítah", "poligono": caja(0.45, 0.00, 0.82, 0.38)},
        {"id": "Z3", "nombre": "Llanura norte", "poligono": caja(0.38, 0.40, 0.82, 1.00)},
        {"id": "Z4", "nombre": "Corredor de acceso", "poligono": caja(0.82, 0.00, 1.00, 1.00)},
    ]
