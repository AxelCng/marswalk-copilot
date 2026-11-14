"""Valida que un graph.json cumpla el Contrato 1. Solo biblioteca estándar.

Uso (desde la raíz del repo):
    python contracts/tools/validar_graph.py contracts/graph_fake.json
    python contracts/tools/validar_graph.py data/out/graph.json

Sale con código 1 si hay errores. Las advertencias no bloquean.
"""
from __future__ import annotations

import json
import sys
from collections import Counter

TIPOS = {"habitat", "rover", "ciencia", "muestreo", "refugio", "comms"}
CAMPOS_NODO = {"id": str, "nombre": str, "tipo": str, "lon": (int, float), "lat": (int, float),
               "valor_cientifico": (int, float), "tarea": str, "permanencia_min": (int, float),
               "unidad_geologica": str, "capas": dict, "fotos": list}
CAMPOS_ARISTA = {"origen": str, "destino": str, "limite_deg": (int, float),
                 "distancia_m": (int, float), "tiempo_min": (int, float), "energia_rel": (int, float),
                 "pendiente_max_deg": (int, float), "dosis_rel": (int, float),
                 "cobertura_com_pct": (int, float), "sombra_pct": (int, float, type(None)),
                 "zonas": list, "geometria": list}
CAPAS = ("elev_m", "pendiente_deg", "themis_noche")


def validar(g: dict) -> tuple[list[str], list[str]]:
    err, adv = [], []
    for k in ("meta", "nodes", "edges"):
        if k not in g:
            err.append(f"falta la clave raíz '{k}'")
    if err:
        return err, adv

    limites = g["meta"].get("limites_pendiente_deg")
    if not limites:
        err.append("meta.limites_pendiente_deg falta o está vacío (esperado [15, 20, 25])")
        limites = []

    zonas_def = {z.get("id") for z in g.get("zonas", [])}
    if not zonas_def:
        adv.append("no hay 'zonas' definidas: el frontend no puede dibujar las alertas")

    ids = [n.get("id") for n in g["nodes"]]
    for nid, c in Counter(ids).items():
        if c > 1:
            err.append(f"id de nodo repetido: {nid}")
    if not 2 <= len(ids) <= 12:
        adv.append(f"{len(ids)} nodos (el spec pide 6 a 8)")
    if not any(n.get("tipo") == "habitat" for n in g["nodes"]):
        err.append("no hay ningún nodo tipo 'habitat'")

    for n in g["nodes"]:
        nid = n.get("id", "?")
        for campo, tipo in CAMPOS_NODO.items():
            if campo not in n:
                err.append(f"nodo {nid}: falta '{campo}'")
            elif not isinstance(n[campo], tipo):
                err.append(f"nodo {nid}: '{campo}' tiene tipo {type(n[campo]).__name__}")
        if n.get("tipo") not in TIPOS:
            err.append(f"nodo {nid}: tipo '{n.get('tipo')}' no está en {sorted(TIPOS)}")
        if not (-180 <= n.get("lon", 999) <= 360 and -90 <= n.get("lat", 999) <= 90):
            err.append(f"nodo {nid}: lon/lat fuera de rango (¿quedó en metros MTM?)")
        for capa in CAPAS:
            if capa not in n.get("capas", {}):
                adv.append(f"nodo {nid}: capas.{capa} falta")
        for f in n.get("fotos", []):
            if not {"url", "camara", "sol"} <= set(f):
                err.append(f"nodo {nid}: foto sin url/camara/sol")

    idset = set(ids)
    vistos = Counter()
    for i, e in enumerate(g["edges"]):
        nombre = f"arista {e.get('origen')}->{e.get('destino')}@{e.get('limite_deg')}"
        for campo, tipo in CAMPOS_ARISTA.items():
            if campo not in e:
                err.append(f"{nombre}: falta '{campo}'")
            elif not isinstance(e[campo], tipo):
                err.append(f"{nombre}: '{campo}' tiene tipo {type(e[campo]).__name__}")
        if e.get("origen") not in idset or e.get("destino") not in idset:
            err.append(f"{nombre}: origen/destino no existe en nodes")
        if e.get("origen") == e.get("destino"):
            err.append(f"{nombre}: lazo (origen == destino)")
        if e.get("limite_deg") not in limites:
            err.append(f"{nombre}: limite_deg no está en meta.limites_pendiente_deg")
        if isinstance(e.get("pendiente_max_deg"), (int, float)) and isinstance(e.get("limite_deg"), (int, float)) \
                and e["pendiente_max_deg"] > e["limite_deg"]:
            err.append(f"{nombre}: pendiente_max_deg {e['pendiente_max_deg']} supera su limite_deg")
        for z in e.get("zonas", []):
            if zonas_def and z not in zonas_def:
                err.append(f"{nombre}: zona '{z}' no está definida en 'zonas'")
        geom = e.get("geometria", [])
        if len(geom) < 2 or not all(isinstance(p, list) and len(p) == 2 for p in geom):
            err.append(f"{nombre}: geometria debe ser [[lon, lat], ...] con 2+ puntos")
        if isinstance(e.get("tiempo_min"), (int, float)) and e["tiempo_min"] <= 0:
            err.append(f"{nombre}: tiempo_min <= 0")
        vistos[(e.get("origen"), e.get("destino"), e.get("limite_deg"))] += 1

    for clave, c in vistos.items():
        if c > 1:
            err.append(f"arista repetida: {clave}")

    # las aristas son dirigidas: si existe A->B debería existir B->A en la misma versión
    for (o, d, l) in vistos:
        if (d, o, l) not in vistos:
            adv.append(f"existe {o}->{d}@{l} pero no {d}->{o}@{l}")

    n = len(ids)
    for l in limites:
        total = sum(1 for k in vistos if k[2] == l)
        maximo = n * (n - 1)
        if total < maximo:
            adv.append(f"versión {l}°: {total}/{maximo} aristas (las que faltan = sin camino bajo ese límite)")
    # monotonía: un límite más alto no debería tener menos aristas
    previas = None
    for l in sorted(limites):
        conj = {(o, d) for (o, d, ll) in vistos if ll == l}
        if previas is not None and not previas <= conj:
            adv.append(f"versión {l}° perdió aristas que sí estaban en una versión más baja")
        previas = conj
    return err, adv


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    with open(sys.argv[1], encoding="utf-8") as f:
        g = json.load(f)
    err, adv = validar(g)
    for a in adv:
        print(f"[aviso] {a}")
    for e in err:
        print(f"[ERROR] {e}")
    print(f"\n{len(g.get('nodes', []))} nodos, {len(g.get('edges', []))} aristas -> "
          f"{'OK' if not err else f'{len(err)} errores'}, {len(adv)} avisos")
    return 1 if err else 0


if __name__ == "__main__":
    sys.exit(main())
