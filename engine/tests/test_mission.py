"""OR-Tools se contrasta con una referencia independiente por fuerza bruta."""
from itertools import combinations, permutations
import json

from fastapi.testclient import TestClient
import pytest

from engine.graph import ROOT
from engine.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app("contracts/graph_fake.json")) as client:
        yield client


def example(name):
    return json.loads((ROOT / "contracts/ejemplos" / name).read_text(encoding="utf-8"))


def brute_force(data, requested, slope, budget, mode, origin="HAB"):
    """Floyd-Warshall + todas las permutaciones; no usa NetworkX ni el motor."""
    nodes = {n["id"]: n for n in data["nodes"]}
    limits = data["meta"]["limites_pendiente_deg"]
    version = max((v for v in limits if v <= slope), default=min(limits))
    dist = {(a, b): 0 if a == b else float("inf") for a in nodes for b in nodes}
    for edge in data["edges"]:
        if edge["limite_deg"] == version and edge["pendiente_max_deg"] <= slope:
            dist[edge["origen"], edge["destino"]] = edge["tiempo_min"]
    for k in nodes:
        for a in nodes:
            for b in nodes:
                dist[a, b] = min(dist[a, b], dist[a, k] + dist[k, b])
    candidates = [n for n in requested if n in nodes and n != origin
                  and dist[origin, n] < float("inf") and dist[n, origin] < float("inf")]
    if mode == "tsp" and len(candidates) != len(requested):
        return None
    best = None
    sizes = [len(candidates)] if mode == "tsp" else range(1, len(candidates) + 1)
    for count in sizes:
        for subset in combinations(candidates, count):
            for order in permutations(subset):
                time = sum(dist[a, b] for a, b in zip((origin, *order), (*order, origin)))
                time += sum(nodes[n]["permanencia_min"] for n in order)
                if budget is not None and time > budget + 1e-8:
                    continue
                score = sum(nodes[n]["valor_cientifico"] for n in order)
                key = (score if mode == "orientacion" else 0, -round(time, 6))
                if best is None or key > best:
                    best = key
    return best


@pytest.mark.parametrize("demo", ["demo1_mision_15deg", "demo2_mision_20deg"])
def test_demo(client, demo):
    response = client.post("/mision", json=example(f"post_mision.{demo}.request.json"))
    assert response.status_code == 200, response.text
    result = response.json()
    expected = example(f"post_mision.{demo}.response.json")
    # El generador calcula la pendiente solo en versión 25, el motor calcula
    # el minimax ida/vuelta. Esta discrepancia de datos está en engine/README.
    assert result["totales"] == expected["totales"]
    assert result["ruta"] == expected["ruta"]
    assert result["tramos"] == expected["tramos"]
    assert result["factible"] is True
    assert [(o["id"], o["motivo"]) for o in result["omitidas"]] == [(o["id"], o["motivo"]) for o in expected["omitidas"]]


@pytest.mark.parametrize("slope", [15, 20, 25])
@pytest.mark.parametrize("mode,budget", [("tsp", None), ("tsp", 140), ("orientacion", 60),
                                       ("orientacion", 120), ("orientacion", 180)])
def test_against_brute_force(client, slope, mode, budget):
    requested = ["E1", "M1", "M2", "E2", "ROV", "REF", "COM"]
    data = json.loads((ROOT / "contracts/graph_fake.json").read_text(encoding="utf-8"))
    expected = brute_force(data, requested, slope, budget, mode)
    response = client.post("/mision", json={"estaciones": requested, "modo": mode,
                           "pendiente_max": slope, "tiempo_max_min": budget})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["factible"] == (expected is not None)
    if expected is None:
        assert result["ruta"] == []
        return
    assert result["totales"]["tiempo_min"] == pytest.approx(-expected[1])
    omitted = {o["id"] for o in result["omitidas"]}
    if mode == "orientacion":
        score = sum(n["valor_cientifico"] for n in data["nodes"] if n["id"] in requested and n["id"] not in omitted)
        assert score == expected[0]
    assert result["ruta"][0] == result["ruta"][-1] == "HAB"
    assert all(t["pendiente_max_deg"] <= slope for t in result["tramos"])
    assert result["totales"]["margen_min"] == (None if budget is None else pytest.approx(budget + expected[1]))


def test_unknown_station_and_duplicates(client):
    response = client.post("/mision", json={"estaciones": ["E1", "E1", "E9", "HAB"],
                                           "modo": "orientacion", "tiempo_max_min": 180})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["omitidas"] == [{"id": "E9", "motivo": "no_existe", "detalle": {}}]
    assert result["totales"]["tiempo_min"] == round(sum(t["tiempo_min"] for t in result["tramos"]) + 25, 1)
    tsp = client.post("/mision", json={"estaciones": ["E1", "E9"]}).json()
    assert tsp["factible"] is False


@pytest.mark.parametrize("mode", ["tsp", "orientacion"])
def test_no_time(client, mode):
    response = client.post("/mision", json={"estaciones": ["E1"], "modo": mode, "tiempo_max_min": 0})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["factible"] is False
    assert result["ruta"] == []
    assert result["omitidas"] == [{"id": "E1", "motivo": "tiempo", "detalle": {"tiempo_max_min": 0}}]


def test_empty_and_only_origin(client):
    for stations in [[], ["HAB"]]:
        result = client.post("/mision", json={"estaciones": stations}).json()
        assert result["factible"] is True
        assert result["ruta"] == ["HAB"]
        assert result["totales"]["tiempo_min"] == 0


def test_custom_origin(client):
    result = client.post("/mision", json={"estaciones": ["E1", "M2"], "origen": "ROV", "pendiente_max": 20}).json()
    assert result["factible"] is True
    assert result["ruta"][0] == result["ruta"][-1] == "ROV"
    assert result["totales"]["margen_min"] is None


@pytest.mark.parametrize("extra", [{"modo": "orientacion"}, {"modo": "invalido"},
                                   {"tiempo_max_min": -1}, {"pendiente_max": -1}])
def test_invalid_request(client, extra):
    assert client.post("/mision", json={"estaciones": ["E1"], **extra}).status_code == 422


def test_unknown_origin(client):
    response = client.post("/mision", json={"estaciones": ["E1"], "origen": "E9"})
    assert response.status_code == 404


def test_exact_budget_boundary(client):
    body = example("post_mision.demo1_mision_15deg.request.json")
    body.update(estaciones=["E1", "M1", "M2"], modo="tsp", tiempo_max_min=138.4)
    result = client.post("/mision", json=body).json()
    assert result["factible"] and result["totales"]["margen_min"] == 0
    body["tiempo_max_min"] = 138.399
    assert client.post("/mision", json=body).json()["factible"] is False


def test_transit_nodes_do_not_add_service(client):
    result = client.post("/mision", json={"estaciones": ["E2"], "pendiente_max": 20}).json()
    assert result["factible"]
    assert "REF" in result["ruta"]
    service = client.get("/estaciones/E2").json()["permanencia_min"]
    assert result["totales"]["tiempo_min"] == round(sum(t["tiempo_min"] for t in result["tramos"]) + service, 1)


def test_zero_science_still_visits_requested_station(tmp_path):
    data = json.loads((ROOT / "contracts/graph_fake.json").read_text(encoding="utf-8"))
    for node in data["nodes"]:
        node["valor_cientifico"] = 0
    path = tmp_path / "zero-science.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    with TestClient(create_app(path)) as client:
        response = client.post("/mision", json={"estaciones": ["E1"], "modo": "orientacion", "tiempo_max_min": 180})
        assert response.status_code == 200, response.text
        assert response.json()["factible"]
        assert "E1" in response.json()["ruta"]


def test_one_way_station_requires_return(tmp_path):
    data = json.loads((ROOT / "contracts/graph_fake.json").read_text(encoding="utf-8"))
    data["edges"] = [e for e in data["edges"] if e["origen"] != "E1"]
    path = tmp_path / "one-way.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    with TestClient(create_app(path)) as client:
        assert client.post("/ruta", json={"origen": "HAB", "destino": "E1"}).json()["factible"]
        result = client.post("/mision", json={"estaciones": ["E1"]}).json()
        assert result["factible"] is False
        assert result["omitidas"][0]["id"] == "E1"


def test_solver_timeout_is_not_reported_as_infeasible(client, monkeypatch):
    from engine.mission import MissionSolverUnavailable

    def timeout(*args, **kwargs):
        raise MissionSolverUnavailable("timeout de prueba")

    monkeypatch.setattr("engine.mission.solve_order", timeout)
    response = client.post("/mision", json={"estaciones": ["E1"]})
    assert response.status_code == 503
    assert response.json() == {"detail": "timeout de prueba"}
