"""Comprueba un grafo de entrega contra la API sin modificar el servidor activo.

Uso: python -m engine.check_graph ruta/al/graph.json
"""
import argparse
import json
from pathlib import Path

from fastapi.testclient import TestClient

from contracts.tools.validar_graph import validar
from engine.main import create_app


def check(path):
    path = Path(path).resolve()
    graph = json.loads(path.read_text(encoding="utf-8"))
    errors, warnings = validar(graph)
    for warning in warnings:
        print(f"AVISO: {warning}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return False
    nodes = graph["nodes"]
    habitats = [n for n in nodes if n["id"] == "HAB" and n["tipo"] == "habitat"]
    if len(habitats) != 1 or sum(n["tipo"] == "habitat" for n in nodes) != 1:
        print("ERROR: se requiere un único hábitat con id HAB")
        return False
    candidates = [n["id"] for n in nodes if n["id"] != "HAB"]
    if not candidates:
        print("ERROR: no hay estaciones para comprobar")
        return False
    zones = graph.get("zonas", [])
    if not zones:
        print("ERROR: no hay zonas para comprobar alertas")
        return False

    with TestClient(create_app(path)) as client:
        def expect(response, status=200):
            if response.status_code != status:
                raise ValueError(f"HTTP {response.status_code}: {response.text}")
            return response.json()

        stations = expect(client.get("/estaciones"))
        if len(stations) != len(nodes):
            raise ValueError("el número de estaciones no coincide con el grafo")
        for node in nodes:
            if expect(client.get(f'/estaciones/{node["id"]}')) != node:
                raise ValueError(f'la estación {node["id"]} no coincide')
        slope = max(graph["meta"]["limites_pendiente_deg"])
        filtered = expect(client.get("/grafo", params={"pendiente_max": slope}))
        for edge in filtered["edges"]:
            if edge["limite_deg"] != slope or edge["pendiente_max_deg"] > slope:
                raise ValueError("el filtro de pendiente devolvió una arista inválida")
        request = {"estaciones": candidates, "pendiente_max": slope,
                   "tiempo_max_min": 240, "modo": "orientacion"}
        mission = expect(client.post("/mision", json=request))
        if not mission["factible"]:
            raise ValueError("no se pudo calcular una misión con 240 minutos; revisar tiempos y conectividad")
        if mission["ruta"][0] != "HAB" or mission["ruta"][-1] != "HAB":
            raise ValueError("la misión no sale y vuelve al hábitat")
        if mission["totales"]["tiempo_min"] > request["tiempo_max_min"]:
            raise ValueError("la misión excede el presupuesto")
        alert = expect(client.post("/alerta", json={"zona": zones[0]["id"], "tipo": "polvo"}))
        if any(zones[0]["id"] in leg["zonas"] for leg in alert["tramos"]):
            raise ValueError("la ruta de alerta atraviesa la zona cerrada")
        if expect(client.post("/reset")) != {"ok": True}:
            raise ValueError("reset no devolvió ok")
        restored = expect(client.post("/mision", json=request))
        if restored != mission:
            raise ValueError("la misión no se restauró después de reset")
        print(f"OK: {len(nodes)} estaciones, {len(graph['edges'])} aristas; "
              f"misión {mission['totales']['tiempo_min']} min y alerta {zones[0]['id']} verificadas")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph", help="Ruta al grafo JSON")
    args = parser.parse_args()
    try:
        return 0 if check(args.graph) else 1
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"ERROR: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
