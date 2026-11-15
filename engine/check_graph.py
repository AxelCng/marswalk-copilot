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
        print(f"WARNING: {warning}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return False
    nodes = graph["nodes"]
    habitats = [n for n in nodes if n["id"] == "HAB" and n["tipo"] == "habitat"]
    if len(habitats) != 1 or sum(n["tipo"] == "habitat" for n in nodes) != 1:
        print("ERROR: exactly one habitat with id HAB is required")
        return False
    candidates = [n["id"] for n in nodes if n["id"] != "HAB"]
    if not candidates:
        print("ERROR: there are no stations to check")
        return False
    zones = graph.get("zonas", [])
    if not zones:
        print("ERROR: there are no zones to check alerts")
        return False

    with TestClient(create_app(path)) as client:
        def expect(response, status=200):
            if response.status_code != status:
                raise ValueError(f"HTTP {response.status_code}: {response.text}")
            return response.json()

        stations = expect(client.get("/estaciones"))
        if len(stations) != len(nodes):
            raise ValueError("the number of stations does not match the graph")
        for node in nodes:
            if expect(client.get(f'/estaciones/{node["id"]}')) != node:
                raise ValueError(f'station {node["id"]} does not match')
        slope = max(graph["meta"]["limites_pendiente_deg"])
        filtered = expect(client.get("/grafo", params={"pendiente_max": slope}))
        for edge in filtered["edges"]:
            if edge["limite_deg"] != slope or edge["pendiente_max_deg"] > slope:
                raise ValueError("the slope filter returned an invalid edge")
        request = {"estaciones": candidates, "pendiente_max": slope,
                   "tiempo_max_min": 240, "modo": "orientacion"}
        mission = expect(client.post("/mision", json=request))
        if not mission["factible"]:
            raise ValueError("could not compute a mission within 240 minutes; check times and connectivity")
        if mission["ruta"][0] != "HAB" or mission["ruta"][-1] != "HAB":
            raise ValueError("the mission does not start and end at the habitat")
        if mission["totales"]["tiempo_min"] > request["tiempo_max_min"]:
            raise ValueError("the mission exceeds the time budget")
        alert = expect(client.post("/alerta", json={"zona": zones[0]["id"], "tipo": "polvo"}))
        if any(zones[0]["id"] in leg["zonas"] for leg in alert["tramos"]):
            raise ValueError("the alert route crosses the closed zone")
        if expect(client.post("/reset")) != {"ok": True}:
            raise ValueError("reset did not return ok")
        restored = expect(client.post("/mision", json=request))
        if restored != mission:
            raise ValueError("the mission was not restored after reset")
        print(f"OK: {len(nodes)} stations, {len(graph['edges'])} edges; "
              f"mission {mission['totales']['tiempo_min']} min and alert {zones[0]['id']} checked")
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
