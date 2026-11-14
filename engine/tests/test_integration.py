"""Integración del router de Manuel y la capa que consume el mapa."""
import json

from fastapi.testclient import TestClient
import llm.router as chat_router

from engine.graph import ROOT
from engine.main import create_app


def test_chat_router_delegates_to_manuel(monkeypatch):
    calls = []

    def respond(message, history, model=None):
        calls.append((message, history, model))
        return {"answer": "prueba", "calls": [], "route": None}

    monkeypatch.setattr(chat_router, "respond", respond)
    with TestClient(create_app()) as client:
        response = client.post("/chat", json={"message": "hola", "history": []})
        assert response.status_code == 200
        assert response.json()["answer"] == "prueba"
        assert calls == [("hola", [], None)]
        assert client.get("/chat/status").status_code == 200
        assert client.post("/chat/reset").json() == {"ok": True}


def test_geology_serves_pipeline_output():
    with TestClient(create_app()) as client:
        response = client.get("/geologia")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/geo+json")
        assert response.json() == json.loads((ROOT / "data/out/geologia.geojson").read_text(encoding="utf-8"))
        assert response.json()["type"] == "FeatureCollection"
