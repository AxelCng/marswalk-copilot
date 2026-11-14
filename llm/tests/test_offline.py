"""
Copilot tests that do NOT need Ollama: tools, detectors, translations and /chat, against the real engine.

The engine (engine/main.py) runs inside the test on a free port with the real graph.json, so these tests
catch what breaks when the graph, the zone names or the code change. The model itself is tested by
llm/test_questions.py (needs Ollama).

Run from the repo root (needs engine/requirements-dev.txt + llm/requirements.txt):
    python -m pytest llm/tests -q
"""
import json
import socket
import sys
import threading
import time
from pathlib import Path

import pytest
import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "llm"))

import agent  # noqa: E402
import tools  # noqa: E402

REAL_GRAPH = "data/out/graph.json"
FAKE_GRAPH = "contracts/graph_fake.json"
DEMO_STATIONS = {"E1", "M1", "M2", "E2"}
DEMO_1 = ("I want to visit the delta front, Séítah, the Three Forks depot and the upper delta, back in under "
          "4 hours, with no slopes over 8°")  # same phrases as web/ui/src/demo.ts
DEMO_2 = "What if I accept up to 12°?"
DEMO_3 = "Dust alert in zone Z2"


def _graph(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def api():
    """The real engine with the real graph, on a free port, for the whole module."""
    import uvicorn
    from engine.main import create_app

    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(create_app(REAL_GRAPH), host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 30
    while not server.started:
        assert time.time() < deadline, "the engine did not start"
        time.sleep(0.05)
    url = f"http://127.0.0.1:{port}"
    old_url = tools.API_URL
    tools.API_URL = url
    tools._cache.update(stations=None, zones=None)
    yield url
    tools.API_URL = old_url
    tools._cache.update(stations=None, zones=None)
    server.should_exit = True
    thread.join(timeout=5)


@pytest.fixture(autouse=True)
def fresh_state(request):
    agent.reset()
    if "api" in request.fixturenames:
        requests.post(f"{request.getfixturevalue('api')}/reset", timeout=10)


def _run(name, args):
    """Runs a tool like the copilot does; returns (call record, engine result)."""
    calls = []
    agent._run_and_record(name, args, calls, [], agent.station_names())
    return calls[-1], agent._STATE["result"]


# ---------------------------------------------------------------- translations (no engine)
@pytest.mark.parametrize("graph", [REAL_GRAPH, FAKE_GRAPH])
def test_every_station_and_zone_has_an_english_name(graph):
    """If someone adds a station or renames a zone in the graph, the screen and the copilot would show
    Spanish: add it to web/shared/i18n_en.json."""
    g = _graph(graph)
    missing = [n["id"] for n in g["nodes"] if n["id"] not in tools.STATION_NAMES_EN]
    missing += [n["id"] + " task" for n in g["nodes"] if n["id"] not in tools.STATION_TASKS_EN]
    missing += [z["nombre"] for z in g.get("zonas", []) if tools._norm(z["nombre"]) not in tools.ZONE_NAMES_EN]
    missing += [n["tipo"] for n in g["nodes"] if n["tipo"] not in tools.TYPES_EN]
    assert not missing, f"missing in web/shared/i18n_en.json: {missing}"


def test_reasons_cover_the_engine_contract():
    assert set(tools.REASONS_EN) >= {"pendiente", "tiempo", "alerta", "comms", "no_existe"}


# ---------------------------------------------------------------- pure helpers (no engine)
@pytest.mark.parametrize("text, minutes", [
    ("back in 4 hours", 240), ("back in 3h30", 210), ("in 1h 30min", 90), ("3 hours and 30 minutes", 210),
    ("back in under 4 hours and with no slopes over 8 degrees", 240), ("back in 90 min", 90),
    ("in 45 minutes", 45), ("What if it takes 30 minutes longer?", None), ("max slope 12°", None),
])
def test_time_limit(text, minutes):
    assert agent._time_limit(text) == minutes


@pytest.mark.parametrize("answer, sources, unsourced", [
    ("Total time 164.8 min, margin 75.2 min.", ['{"time_min": 164.8, "margin_min": 75.2}'], []),
    ("It takes 2 h 45 min.", ['{"time_min": 165}'], []),           # minutes said as hours
    ("Distance 6.8 km.", ['{"distance_m": 6833}'], []),            # meters said as km
    ("Route E1 then M2, 164.8 min.", ['{"time_min": 164.8}'], []),  # ids are not numbers
    ("It takes 999 minutes.", ['{"time_min": 164.8}'], ["999"]),
])
def test_unsourced_numbers(answer, sources, unsourced):
    assert agent.unsourced_numbers(answer, sources) == unsourced


def test_reason_text_survives_missing_details():
    text = agent._reason_text({"id": "E2", "motivo": "pendiente", "detalle": {}}, {})
    assert text == "E2: the gentlest path has ?° and the limit is ?°"


@pytest.mark.parametrize("message", [
    "Which station has the best signal?",
    "What is the comms coverage on the route to E1?",
    "Radio check: what is at the delta front?",
    "What is at Amalik?",
])
def test_questions_are_not_alerts(message):
    assert agent.detect_alert(message) is None


@pytest.mark.parametrize("message", [
    "We lost the signal from the relay antenna, recalculate the route.",
    "We lost communication with the habitat, recalculate the route.",
    "Comms are down!",
])
def test_comms_alerts(message):
    assert agent.detect_alert(message) == {"type": "comms", "zone": ""}


# ---------------------------------------------------------------- against the real engine
def test_dust_alert_by_zone_id(api):
    assert agent.detect_alert(DEMO_3) == {"type": "dust", "zone": "Z2"}


def test_dust_alert_by_every_zone_name(api):
    """Every zone of the loaded graph can be named in English in an alert."""
    for z in tools._zones():
        assert agent.detect_alert(f"A dust storm is coming over the {z['name']}") == {"type": "dust", "zone": z["id"]}


@pytest.mark.parametrize("ref, expected", [
    ("E1", "E1"), ("e1", "E1"), ("E1 (delta front)", "E1"), ("station E1", "E1"), ("E 1", "E1"),
    ("Amalik", "E1"), ("delta front", "E1"), ("frente del delta", "E1"), ("upper delta", "E2"),
    ("Three Forks", "M2"), ("Hawksbill Gap shelter", "REF"), ("habitat", "HAB"), ("home base", "HAB"),
    ("base camp", "HAB"), ("a", "a"), ("Olympus Mons", "Olympus Mons"),
])
def test_resolve_id(api, ref, expected):
    assert tools.resolve_id(ref) == expected


def test_mission_requests(api):
    assert agent.detect_mission(DEMO_1) == {"stations": ["E1", "M1", "M2", "E2"], "max_time_min": 240.0,
                                            "max_slope_deg": 8.0}
    short = agent.detect_mission("Plan an EVA to the delta front and the Three Forks depot, back in 2 hours, "
                                 "max slope 15 degrees.")
    assert short == {"stations": ["E1", "M2"], "max_time_min": 120.0, "max_slope_deg": 15.0}
    # a mission that mentions dust is still a mission (respond() checks missions before alerts)
    assert agent.detect_mission("Plan a mission to E1 and M2 in 3 hours, avoid the dust in Z2")["stations"] == ["E1", "M2"]
    assert agent.detect_mission("How many minutes does the walk take?") is None


def test_demo_flow(api):
    """The 3 demo buttons, in order: 8° leaves E2 out for slope, 12° adds it, dust in Z2 reroutes."""
    call, res = _run("optimize_mission", agent.detect_mission(DEMO_1))
    assert call["ok"] and set(call["arguments"]["stations"]) == DEMO_STATIONS
    assert [o["id"] for o in res["omitidas"] if o["motivo"] == "pendiente"] == ["E2"]

    change = agent.detect_change(DEMO_2)
    assert change == {"stations": ["E1", "M1", "M2", "E2"], "max_time_min": 240.0, "max_slope_deg": 12.0}
    call, res = _run("optimize_mission", change)
    comp = res["comparison_with_previous"]
    assert call["ok"] and "E2" in res["ruta"]
    assert comp["stations_added"] == ["E2"] and comp["time_difference_min"] > 0

    call, res = _run("reroute_for_alert", agent.detect_alert(DEMO_3))
    assert call == {"tool": "reroute_for_alert", "arguments": {"zone": "Z2", "type": "dust"}, "ok": True}
    assert res["ruta"] and res["aristas_afectadas"]


def test_summary_is_english_and_sourced(api):
    _, res = _run("optimize_mission", agent.detect_mission(DEMO_1))
    text = agent.summary(res, agent.station_names())
    assert text.startswith("Route: Octavia E. Butler habitat")
    assert "Upper delta (Upper Fan): the gentlest path has" in text
    assert agent.unsourced_numbers(text, [json.dumps(res)]) == []


def test_comms_alert_uses_a_valid_zone(api):
    _run("optimize_mission", agent.detect_mission(DEMO_1))
    call, _ = _run("reroute_for_alert", {"type": "comms"})
    assert call["ok"] and call["arguments"]["zone"] in {z["id"] for z in tools._zones()}


def test_tool_errors_are_readable(api):
    call, _ = _run("reroute_for_alert", {"zone": "Z2", "type": "dust"})  # no mission yet: engine 409
    assert not call["ok"]
    _, res = tools.execute("reroute_for_alert", {"zone": "Z2", "type": "dust"})
    assert agent._error_reason(json.dumps(res)) == "there is no mission to recalculate"
    _, res = tools.execute("station_info", {"id": "E9"})
    assert agent._error_reason(json.dumps(res)) == "station E9 does not exist"
    _, res = tools.execute("station_info", {"id": ""})
    assert res == {"error": "station id is empty"}


def test_empty_mission_is_refused(api):
    """'How many minutes does the walk take?' with no mission must not plan HAB -> HAB (0 minutes)."""
    _, res = tools.execute("optimize_mission", {"stations": ["HAB"]})
    assert "error" in res


def test_station_info_reaches_the_model_in_english(api):
    _, res = tools.execute("station_info", {"id": "M1"})
    seen = agent._for_model(res, agent.station_names(), "station_info")
    assert seen["name"] == "South Séítah, Brac outcrop"
    assert seen["task"] == "Core sample of olivine-rich igneous rock"
    assert seen["type"] == "sampling" and "nombre" not in seen and "fotos" not in seen


# ---------------------------------------------------------------- /chat router (model replaced)
def test_chat_router_contract_and_busy(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import router

    seen = []

    def fake_respond(message, history, model=None):
        seen.append((message, history, model))
        return {"answer": "ok", "calls": [], "route": None, "history": [], "seconds": 0.1, "unsourced_numbers": []}

    monkeypatch.setattr(router, "respond", fake_respond)
    app = FastAPI()
    app.include_router(router.router)
    client = TestClient(app)

    r = client.post("/chat", json={"message": "hi", "history": [], "model": "other-model"})
    assert r.status_code == 200 and r.json()["answer"] == "ok"
    assert seen == [("hi", [], None)]  # the model cannot be swapped from outside by default
    assert client.get("/chat/status").json().keys() == {"model", "api_url"}

    # GPU busy: a second question waits CHAT_QUEUE_WAIT_S and gets "busy" instead of piling up
    monkeypatch.setattr(router, "CHAT_QUEUE_WAIT_S", 0.05)
    assert router._slots.acquire(timeout=1)
    try:
        busy = client.post("/chat", json={"message": "hi", "history": []}).json()
    finally:
        router._slots.release()
    assert busy["error"] == "busy" and busy["calls"] == [] and busy["route"] is None
