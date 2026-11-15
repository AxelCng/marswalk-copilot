import json

import pytest
from fastapi.testclient import TestClient

from engine.graph import ROOT
from engine.main import create_app


def example(name):
    return json.loads((ROOT / "contracts" / "ejemplos" / name).read_text(encoding="utf-8"))


@pytest.fixture
def client():
    with TestClient(create_app("contracts/graph_fake.json")) as client:
        yield client


@pytest.mark.parametrize("url,filename", [
    ("/estaciones", "get_estaciones.response.json"),
    ("/estaciones/E1", "get_estacion_E1.response.json"),
])
def test_station_examples(client, url, filename):
    response = client.get(url)
    assert response.status_code == 200
    assert response.json() == example(filename)


def test_route_example(client):
    response = client.post("/ruta", json=example("post_ruta.request.json"))
    assert response.status_code == 200
    assert response.json() == example("post_ruta.response.json")


@pytest.mark.parametrize("slope,version", [(10, 15), (15, 15), (17, 15), (20, 20), (22, 20), (25, 25)])
def test_graph_version_and_limit(client, slope, version):
    graph = client.get("/grafo", params={"pendiente_max": slope}).json()
    assert len(graph["nodes"]) == 8
    assert graph["edges"]
    assert all(e["limite_deg"] == version and e["pendiente_max_deg"] <= slope for e in graph["edges"])


def test_unreachable_then_reachable(client):
    blocked = client.post("/ruta", json={"origen": "HAB", "destino": "E2"}).json()
    assert blocked["factible"] is False
    assert blocked["omitidas"] == [{"id": "E2", "motivo": "pendiente",
                                    "detalle": {"pendiente_max_deg": 18.5, "limite": 15}}]
    allowed = client.post("/ruta", json={"origen": "HAB", "destino": "E2", "pendiente_max": 20}).json()
    assert allowed["factible"] is True
    assert allowed["ruta"][0] == "HAB" and allowed["ruta"][-1] == "E2"


def test_same_origin(client):
    result = client.post("/ruta", json={"origen": "HAB", "destino": "HAB"}).json()
    assert result["factible"] and result["ruta"] == ["HAB"]
    assert result["totales"]["tiempo_min"] == 0


def test_missing_station(client):
    for response in [client.get("/estaciones/E9"), client.post("/ruta", json={"origen": "HAB", "destino": "E9"})]:
        assert response.status_code == 404
        assert response.json() == {"detail": "station E9 does not exist"}


@pytest.mark.parametrize("slope", [-1, 91, "no-es-numero"])
def test_invalid_slope(client, slope):
    assert client.post("/ruta", json={"origen": "HAB", "destino": "E1", "pendiente_max": slope}).status_code == 422
    assert client.get("/grafo", params={"pendiente_max": slope}).status_code == 422


def test_cors(client):
    response = client.options("/ruta", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"


def test_graph_path_environment(monkeypatch, tmp_path):
    data = json.loads((ROOT / "contracts/graph_fake.json").read_text(encoding="utf-8"))
    data["nodes"][0]["nombre"] = "Grafo alternativo"
    path = tmp_path / "graph.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    monkeypatch.setenv("GRAPH_PATH", str(path))
    with TestClient(create_app()) as other:
        assert other.get("/estaciones/HAB").json()["nombre"] == "Grafo alternativo"
