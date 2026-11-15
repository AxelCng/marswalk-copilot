"""Pruebas de integración de misión → alertas acumuladas → reset."""
from concurrent.futures import ThreadPoolExecutor
import json
from threading import Event

from fastapi.testclient import TestClient
import pytest

from engine.graph import ROOT, Restrictions
from engine.main import create_app, MissionRequest
from engine.mission import MissionSolverUnavailable


def example(name):
    return json.loads((ROOT / "contracts/ejemplos" / name).read_text(encoding="utf-8"))


@pytest.fixture
def mission():
    return example("post_mision.demo1_mision_15deg.request.json")


@pytest.fixture
def client():
    with TestClient(create_app("contracts/graph_fake.json")) as client:
        yield client


def test_dust_demo_then_reset(client, mission):
    initial = client.post("/mision", json=mission).json()
    response = client.post("/alerta", json={"zona": "Z2", "tipo": "polvo"})
    assert response.status_code == 200, response.text
    result = response.json()
    expected = example("post_alerta.response.json")
    for key in ("factible", "ruta", "tramos", "totales", "aristas_afectadas"):
        assert result[key] == expected[key]
    # La discrepancia 18.5/18.6 del grafo de prueba no depende de la alerta.
    assert result["omitidas"] == initial["omitidas"]
    assert all("Z2" not in leg["zonas"] for leg in result["tramos"])
    assert client.post("/reset").json() == {"ok": True}
    assert client.post("/mision", json=mission).json() == initial


def test_no_previous_mission_and_reset(client):
    for _ in range(2):
        response = client.post("/alerta", json={"zona": "Z2", "tipo": "polvo"})
        assert response.status_code == 409
        assert response.json() == {"detail": "there is no mission to recalculate"}
        assert client.post("/reset").json() == {"ok": True}
    client.post("/mision", json={"estaciones": ["E1"]})
    client.post("/reset")
    assert client.post("/alerta", json={"zona": "Z2", "tipo": "polvo"}).status_code == 409


def test_routes_do_not_set_previous_mission(client):
    client.post("/ruta", json={"origen": "HAB", "destino": "E1"})
    assert client.post("/alerta", json={"zona": "Z2", "tipo": "polvo"}).status_code == 409


def test_accumulation_idempotency_and_graph(client, mission):
    original_graph = client.get("/grafo").json()
    client.post("/mision", json=mission)
    first = client.post("/alerta", json={"zona": "Z2", "tipo": "polvo"}).json()
    repeated = client.post("/alerta", json={"zona": "Z2", "tipo": "polvo"}).json()
    assert repeated["aristas_afectadas"] == []
    assert repeated["ruta"] == first["ruta"]
    assert repeated["totales"] == first["totales"]
    route = client.post("/ruta", json={"origen": "HAB", "destino": "E1"}).json()
    assert route["factible"]
    assert all("Z2" not in e["zonas"] for e in route["tramos"])
    second = client.post("/alerta", json={"zona": "Z3", "tipo": "polvo"})
    assert second.status_code == 200, second.text
    filtered = client.get("/grafo").json()
    expected = [e for e in original_graph["edges"] if not {"Z2", "Z3"}.intersection(e["zonas"])]
    assert filtered["edges"] == expected
    assert filtered["nodes"] == original_graph["nodes"]
    assert filtered["zonas"] == original_graph["zonas"]
    new_mission = client.post("/mision", json=mission).json()
    assert new_mission["totales"] == second.json()["totales"]
    assert any(o["motivo"] == "alerta" for o in new_mission["omitidas"])
    for leg in new_mission["tramos"]:
        assert not {"Z2", "Z3"}.intersection(leg["zonas"])
    client.post("/reset")
    assert client.get("/grafo").json() == original_graph


def test_latest_mission_is_recalculated(client, mission):
    client.post("/mision", json=mission)
    latest = {"estaciones": ["E1"], "origen": "ROV", "pendiente_max": 20, "modo": "tsp"}
    client.post("/mision", json=latest)
    # /ruta no debe reemplazar la última misión.
    client.post("/ruta", json={"origen": "HAB", "destino": "M1"})
    result = client.post("/alerta", json={"zona": "Z2", "tipo": "polvo"}).json()
    assert result["ruta"][0] == result["ruta"][-1] == "ROV"
    assert result["totales"]["margen_min"] is None
    repeated = client.post("/mision", json=latest).json()
    assert {k: v for k, v in result.items() if k != "aristas_afectadas"} == repeated


@pytest.mark.parametrize("body", [{"zona": "Z9", "tipo": "polvo"},
                                  {"zona": "Z2", "tipo": "lluvia"},
                                  {"zona": "", "tipo": "comms"}, {"tipo": "polvo"}])
def test_invalid_alert_does_not_mutate(client, mission, body):
    initial = client.post("/mision", json=mission).json()
    graph = client.get("/grafo").json()
    response = client.post("/alerta", json=body)
    assert response.status_code == 422
    assert client.get("/grafo").json() == graph
    assert client.app.state.missions.last_result == initial


@pytest.fixture
def comms_graph(tmp_path):
    data = json.loads((ROOT / "contracts/graph_fake.json").read_text(encoding="utf-8"))
    for edge in data["edges"]:
        # Toda entrada/salida de E1 tiene 59%; el resto justo el umbral de 60%.
        edge["cobertura_com_pct"] = 59 if "E1" in (edge["origen"], edge["destino"]) else 60
    path = tmp_path / "comms.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_comms_global_threshold_and_explanation(comms_graph):
    with TestClient(create_app(comms_graph)) as client:
        original = client.get("/grafo").json()
        mission = {"estaciones": ["E1", "M1"], "tiempo_max_min": 180, "modo": "orientacion"}
        previous = client.post("/mision", json=mission).json()
        # Z3 no limita el filtro: E1 se bloquea aunque esté en otra zona.
        response = client.post("/alerta", json={"zona": "Z3", "tipo": "comms"})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["factible"]
        assert result["omitidas"] == [{"id": "E1", "motivo": "comms",
                                       "detalle": {"cobertura_com_pct": 59, "umbral": 60}}]
        assert result["aristas_afectadas"] == list(dict.fromkeys(
            f'{e["origen"]}->{e["destino"]}' for e in previous["tramos"] if e["cobertura_com_pct"] < 60))
        assert client.get("/grafo").json()["edges"] == [e for e in original["edges"] if e["cobertura_com_pct"] >= 60]
        route = client.post("/ruta", json={"origen": "HAB", "destino": "E1"}).json()
        assert route["factible"] is False
        assert route["omitidas"] == result["omitidas"]
        client.post("/reset")
        assert client.get("/grafo").json() == original
        assert client.post("/mision", json=mission).json() == previous


@pytest.mark.parametrize("kinds", [("polvo", "comms"), ("comms", "polvo")])
def test_dust_and_comms_combine(comms_graph, mission, kinds):
    with TestClient(create_app(comms_graph)) as client:
        original = client.get("/grafo").json()
        client.post("/mision", json=mission)
        for kind in kinds:
            response = client.post("/alerta", json={"zona": "Z2", "tipo": kind})
            assert response.status_code == 200, response.text
        assert client.get("/grafo").json()["edges"] == [e for e in original["edges"]
                if "Z2" not in e["zonas"] and e["cobertura_com_pct"] >= 60]
        omitted = {o["id"]: o["motivo"] for o in response.json()["omitidas"]}
        assert omitted["E1"] == "comms"
        assert omitted["E2"] == "pendiente"


def test_alert_can_make_tsp_infeasible(comms_graph):
    with TestClient(create_app(comms_graph)) as client:
        assert client.post("/mision", json={"estaciones": ["E1"]}).json()["factible"]
        result = client.post("/alerta", json={"zona": "Z1", "tipo": "comms"}).json()
        assert result["factible"] is False
        assert result["ruta"] == []
        assert result["omitidas"][0]["motivo"] == "comms"
        # Una misión inviable también puede volver a recalcularse.
        repeated = client.post("/alerta", json={"zona": "Z1", "tipo": "comms"})
        assert repeated.status_code == 200
        assert repeated.json()["aristas_afectadas"] == []


def test_solver_failure_keeps_previous_state(client, mission, monkeypatch):
    previous = client.post("/mision", json=mission).json()
    graph = client.get("/grafo").json()

    def fail(*args, **kwargs):
        raise MissionSolverUnavailable("timeout de prueba")

    with monkeypatch.context() as patch:
        patch.setattr(client.app.state.planner, "plan", fail)
        assert client.post("/alerta", json={"zona": "Z2", "tipo": "polvo"}).status_code == 503
        assert client.post("/mision", json={"estaciones": ["M1"]}).status_code == 503
    assert client.get("/grafo").json() == graph
    assert client.app.state.missions.last_result == previous
    result = client.post("/alerta", json={"zona": "Z2", "tipo": "polvo"}).json()
    assert result["totales"]["tiempo_min"] == example("post_alerta.response.json")["totales"]["tiempo_min"]


def test_application_instances_do_not_share_state(mission):
    with TestClient(create_app()) as first, TestClient(create_app()) as second:
        first.post("/mision", json=mission)
        first.post("/alerta", json={"zona": "Z2", "tipo": "polvo"})
        assert second.post("/alerta", json={"zona": "Z2", "tipo": "polvo"}).status_code == 409
        assert len(second.get("/grafo").json()["edges"]) > len(first.get("/grafo").json()["edges"])


def test_reset_cannot_interleave_with_recalculation(client, mission, monkeypatch):
    state = client.app.state.missions
    state.mission(MissionRequest(**mission))
    entered, release, reset_started, reset_done = Event(), Event(), Event(), Event()
    original = state.planner.plan

    def blocked(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return original(*args, **kwargs)

    def reset():
        reset_started.set()
        result = state.reset()
        reset_done.set()
        return result

    monkeypatch.setattr(state.planner, "plan", blocked)
    with ThreadPoolExecutor(max_workers=2) as pool:
        alert_future = pool.submit(state.alert, "Z2", "polvo")
        try:
            assert entered.wait(5)
            reset_future = pool.submit(reset)
            assert reset_started.wait(5)
            assert not reset_done.is_set()
        finally:
            release.set()
        assert alert_future.result(timeout=10)["totales"]["tiempo_min"] == example("post_alerta.response.json")["totales"]["tiempo_min"]
        assert reset_future.result(timeout=10) == {"ok": True}
    assert state.last_request is None and state.last_result is None
    assert state.restrictions == Restrictions()
