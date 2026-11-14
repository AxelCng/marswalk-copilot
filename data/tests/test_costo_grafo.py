"""Pruebas del mapa de costo, las aristas y el grafo real."""
from __future__ import annotations

import json

import numpy as np
import pytest

from data.pipeline import costo, parametros, rutas

requiere_rasters = pytest.mark.skipif(
    not (rutas.OUT_RASTERS / "dtm.tif").exists(),
    reason="falta correr los pasos 00-20")
requiere_aristas = pytest.mark.skipif(
    not (rutas.OUT / "aristas.json").exists(),
    reason="falta correr el paso 60")


# ---------------------------------------------------------------- Tobler
def test_tobler_es_maxima_en_una_bajada_suave():
    """El óptimo de Tobler está en tanθ = −c, no en el llano."""
    t = parametros.cargar().tobler
    llano = t.velocidad_kmh(0.0)
    optimo = t.velocidad_kmh(-t.c)
    assert optimo > llano


def test_tobler_decrece_con_la_pendiente():
    t = parametros.cargar().tobler
    assert t.velocidad_kmh(0.0) > t.velocidad_kmh(0.3) > t.velocidad_kmh(0.8)


def test_tobler_acepta_arrays():
    t = parametros.cargar().tobler
    valores = t.velocidad_kmh(np.array([0.0, 0.1, 0.2]))
    assert valores.shape == (3,)
    assert np.all(np.diff(valores) < 0)


# ---------------------------------------------------------------- THEMIS
def test_calibracion_themis_dentro_del_rango_declarado():
    assert costo.dn_a_k(np.array([0.0]))[0] == pytest.approx(costo.DN_MIN_K)
    assert costo.dn_a_k(np.array([255.0]))[0] == pytest.approx(costo.DN_MAX_K)


def test_calibracion_themis_reproduce_los_valores_del_grafo_falso():
    """El grafo falso usa 205–230 K; la calibración debe caer ahí."""
    p = parametros.cargar()
    dn_roca = (p.themis_roca_k - costo.DN_MIN_K) / (costo.DN_MAX_K - costo.DN_MIN_K) * 255
    dn_arena = (p.themis_arena_k - costo.DN_MIN_K) / (costo.DN_MAX_K - costo.DN_MIN_K) * 255
    assert 100 <= dn_roca <= 140, "el umbral de roca debe caer en el rango del dato"
    assert 60 <= dn_arena <= 110, "el umbral de arena debe caer en el rango del dato"


def test_factor_terreno_respeta_los_umbrales():
    p = parametros.cargar()
    # DN 0 → 150 K (arena), DN 100 → 209 K (normal), DN 255 → 300 K (roca)
    dn = np.array([[0, 100, 255]], dtype="uint8")
    f = costo.factor_terreno(dn, p)
    assert f[0, 0] == p.f_arena, "DN bajo = frío = arena"
    assert f[0, 2] == p.f_roca, "DN alto = caliente = roca"
    assert f[0, 1] == p.f_normal


# ---------------------------------------------------------------- costo
@requiere_rasters
def test_costo_es_positivo_y_mayor_en_pendiente():
    p = parametros.cargar()
    plano = costo.costo_por_celda(np.array([0.0]), np.ones((1, 1)), p)[0, 0]
    empinado = costo.costo_por_celda(np.array([20.0]), np.ones((1, 1)), p)[0, 0]
    assert plano > 0
    assert empinado > plano


@requiere_rasters
def test_bloqueo_por_limite_y_por_maximo_fisico():
    p = parametros.cargar()
    pendiente = np.array([[5.0, 18.0, 40.0]])
    assert not costo.matriz_bloqueada(pendiente, p, 15.0)[0, 0]
    assert costo.matriz_bloqueada(pendiente, p, 15.0)[0, 1]
    # El tope físico manda aunque el límite pedido sea mayor.
    assert costo.matriz_bloqueada(pendiente, p, 45.0)[0, 2]


# ---------------------------------------------------------------- aristas
@requiere_aristas
def test_aristas_son_unicas_por_par_y_limite():
    datos = json.loads((rutas.OUT / "aristas.json").read_text(encoding="utf-8"))
    claves = [(e["origen"], e["destino"], e["limite_deg"]) for e in datos]
    assert len(claves) == len(set(claves))


@requiere_aristas
def test_cada_arista_tiene_su_inversa():
    datos = json.loads((rutas.OUT / "aristas.json").read_text(encoding="utf-8"))
    claves = {(e["origen"], e["destino"], e["limite_deg"]) for e in datos}
    faltan = [k for k in claves if (k[1], k[0], k[2]) not in claves]
    assert not faltan, f"aristas sin inversa: {faltan[:5]}"


@requiere_aristas
def test_pendiente_nunca_supera_su_limite():
    datos = json.loads((rutas.OUT / "aristas.json").read_text(encoding="utf-8"))
    for e in datos:
        assert e["pendiente_max_deg"] <= e["limite_deg"] + 1e-6, \
            f'{e["origen"]}->{e["destino"]}@{e["limite_deg"]}'


@requiere_aristas
def test_ida_y_vuelta_difieren_por_la_pendiente():
    """El contrato exige aristas dirigidas: subir y bajar no cuestan igual."""
    datos = json.loads((rutas.OUT / "aristas.json").read_text(encoding="utf-8"))
    # el límite más alto: ahí existen todas las aristas (los límites salen de params.yaml)
    limite = max(e["limite_deg"] for e in datos)
    pares = {(e["origen"], e["destino"]): e for e in datos if e["limite_deg"] == limite}
    distintas = 0
    for (a, b), e in pares.items():
        if a >= b:
            continue
        inversa = pares[(b, a)]
        if abs(e["tiempo_min"] - inversa["tiempo_min"]) > 0.01:
            distintas += 1
    assert distintas > len(pares) // 4, "casi todas las aristas dan ida == vuelta"


@requiere_aristas
def test_atributos_coherentes():
    datos = json.loads((rutas.OUT / "aristas.json").read_text(encoding="utf-8"))
    for e in datos:
        assert e["distancia_m"] > 0
        assert e["tiempo_min"] > 0
        assert 0 <= e["cobertura_com_pct"] <= 100
        assert 0 <= e["sombra_pct"] <= 100
        # dosis = tiempo · (1 − blindaje), con blindaje en [0, 1]
        assert e["dosis_rel"] <= e["tiempo_min"] + 1e-6
        # energia = tiempo · (1 + k · pendiente)
        assert e["energia_rel"] >= e["tiempo_min"] - 1e-6


@requiere_aristas
def test_geometria_esta_en_lonlat():
    datos = json.loads((rutas.OUT / "aristas.json").read_text(encoding="utf-8"))
    for e in datos[:20]:
        assert len(e["geometria"]) >= 2
        for lon, lat in e["geometria"]:
            assert -180 <= lon <= 360 and -90 <= lat <= 90


# ---------------------------------------------------------------- grafo
def test_el_validador_del_contrato_acepta_el_grafo_real():
    from contracts.tools.validar_graph import validar
    datos = json.loads((rutas.OUT / "graph.json").read_text(encoding="utf-8"))
    errores, _ = validar(datos)
    assert errores == []


@requiere_rasters
def test_nodos_traen_capas_y_fotos():
    datos = json.loads((rutas.OUT / "graph.json").read_text(encoding="utf-8"))
    assert len(datos["nodes"]) == 8
    for n in datos["nodes"]:
        assert set(n["capas"]) == {"elev_m", "pendiente_deg", "themis_noche"}
        assert n["fotos"] and n["fotos"][0]["url"]


def test_el_motor_carga_el_grafo_real():
    from pydantic import BaseModel
    from engine.graph import GraphStore
    from engine.mission import MissionPlanner

    class Peticion(BaseModel):
        origen: str = "HAB"
        estaciones: list[str]
        tiempo_max_min: int = 240
        pendiente_max: float = 15
        modo: str = "orientacion"

    store = GraphStore(rutas.OUT / "graph.json")
    planner = MissionPlanner(store, 1000)
    r = planner.plan(Peticion(estaciones=["E1", "M1", "M2"]))
    assert r["factible"]
    assert r["ruta"][0] == "HAB" and r["ruta"][-1] == "HAB"
    assert r["totales"]["tiempo_min"] > 0
