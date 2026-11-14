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
    cerrar una zona en la demo de polvo. La alerta quita las aristas que CRUZAN
    la zona, así que una zona no debe contener estaciones: si las contiene, las
    deja aisladas (la versión anterior, cajas por fracción del AOI, encerraba a
    E1/M2/E2/REF en Z1 y a HAB en Z4, y con Z4 no se llegaba a ninguna estación).

    Cada caja está entre estaciones, sobre corredores que usan los caminos reales,
    y se eligió probando el motor con el grafo real (misión de 12°, 4 estaciones):
    las cuatro desvían la ruta sin dejar estaciones aisladas.
      Z1 Entrada al delta       evita HAB->M2          (+6.6 min)
      Z2 Campo de dunas         evita HAB->M2, E1->M1  (+30.3 min)  <- la de la demo
      Z3 Borde norte de Séítah  evita E1->M1           (+17.1 min)
      Z4 Corredor del hábitat   evita M1->HAB          (+8.0 min)
    """
    cajas = {   # (lon_min, lat_min, lon_max, lat_max)
        "Z1": ("Entrada al delta", (77.4140, 18.4470, 77.4200, 18.4530)),
        "Z2": ("Campo de dunas", (77.4250, 18.4400, 77.4370, 18.4520)),
        "Z3": ("Borde norte de Séítah", (77.4340, 18.4355, 77.4420, 18.4395)),
        "Z4": ("Corredor del hábitat", (77.4440, 18.4360, 77.4490, 18.4420)),
    }
    zonas = []
    for zid, (nombre, (x0, y0, x1, y1)) in cajas.items():
        assert aoi["lon_min"] <= x0 < x1 <= aoi["lon_max"] and aoi["lat_min"] <= y0 < y1 <= aoi["lat_max"], zid
        zonas.append({"id": zid, "nombre": nombre,
                      "poligono": [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]})
    return zonas
