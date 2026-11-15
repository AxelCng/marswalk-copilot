"""API de estaciones, rutas, misiones y alertas acumulativas."""
from contextlib import asynccontextmanager
import logging
import os
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
import yaml

from engine.graph import GraphStore, SUMMARY_FIELDS, ROOT
from engine.mission import MissionPlanner, MissionSolverUnavailable
from engine.state import MissionState, NoPreviousMission, UnknownZone

logger = logging.getLogger(__name__)

Slope = Annotated[float, Field(ge=0, le=90, allow_inf_nan=False)]


class RouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    origen: str = Field(min_length=1)
    destino: str = Field(min_length=1)
    pendiente_max: Slope = 15


class MissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    estaciones: list[Annotated[str, Field(min_length=1)]]
    tiempo_max_min: Annotated[float, Field(ge=0, le=1_000_000, allow_inf_nan=False)] | None = None
    pendiente_max: Slope = 15
    modo: Literal["tsp", "orientacion"] = "tsp"
    origen: str = Field(default="HAB", min_length=1)

    @model_validator(mode="after")
    def require_orientation_budget(self):
        if self.modo == "orientacion" and self.tiempo_max_min is None:
            raise ValueError("orientacion requires tiempo_max_min")
        return self


class AlertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    zona: str = Field(min_length=1)
    tipo: Literal["polvo", "comms"]


class Tramo(BaseModel):
    origen: str
    destino: str
    distancia_m: float
    tiempo_min: float
    pendiente_max_deg: float
    cobertura_com_pct: float
    dosis_rel: float
    zonas: list[str]
    geometria: list[list[float]]


class EstacionOmitida(BaseModel):
    id: str
    motivo: Literal["pendiente", "tiempo", "alerta", "comms", "no_existe"]
    detalle: dict


class Totales(BaseModel):
    distancia_m: float
    tiempo_min: float
    dosis_rel: float
    margen_min: float | None


class RespuestaMision(BaseModel):
    factible: bool
    ruta: list[str]
    tramos: list[Tramo]
    omitidas: list[EstacionOmitida]
    totales: Totales


class RespuestaAlerta(RespuestaMision):
    aristas_afectadas: list[str]


GRAFO_REAL = "data/out/graph.json"
GRAFO_FALSO = "contracts/graph_fake.json"


def grafo_por_defecto():
    """El graph.json real de data/ si existe; si no, el falso de contracts/ (misma forma)."""
    return GRAFO_REAL if (ROOT / GRAFO_REAL).exists() else GRAFO_FALSO


def create_app(graph_path=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.graph = GraphStore(graph_path or os.getenv("GRAPH_PATH") or grafo_por_defecto())
        params = yaml.safe_load((ROOT / "params.yaml").read_text(encoding="utf-8"))
        app.state.planner = MissionPlanner(app.state.graph, params["mision"]["penalidad_por_valor"])
        app.state.missions = MissionState(app.state.planner, params["comms"]["umbral_cobertura_com_pct"])
        yield

    app = FastAPI(title="MarsWalk Copilot — Engine", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    @app.get("/geologia")
    def geologia():
        path = ROOT / "data" / "out" / "geologia.geojson"
        if not path.is_file():
            raise HTTPException(404, detail="geology layer not available")
        return FileResponse(path, media_type="application/geo+json")

    def require_station(store, station_id):
        if station_id not in store.nodes:
            raise HTTPException(404, detail=f"station {station_id} does not exist")

    @app.get("/estaciones")
    def stations(request: Request):
        return [{key: n[key] for key in SUMMARY_FIELDS} for n in request.app.state.graph.nodes.values()]

    @app.get("/estaciones/{station_id}")
    def station(station_id: str, request: Request):
        store = request.app.state.graph
        require_station(store, station_id)
        return store.nodes[station_id]

    @app.get("/grafo")
    def graph(request: Request, pendiente_max: Annotated[float, Query(ge=0, le=90, allow_inf_nan=False)] = 15):
        return request.app.state.missions.graph(pendiente_max)

    @app.post("/ruta", response_model=RespuestaMision)
    def route(body: RouteRequest, request: Request):
        store = request.app.state.graph
        require_station(store, body.origen)
        require_station(store, body.destino)
        return request.app.state.missions.route(body.origen, body.destino, body.pendiente_max)

    @app.post("/mision", response_model=RespuestaMision)
    def mission(body: MissionRequest, request: Request):
        require_station(request.app.state.graph, body.origen)
        try:
            return request.app.state.missions.mission(body)
        except MissionSolverUnavailable as exc:
            raise HTTPException(503, detail=str(exc)) from exc

    @app.post("/alerta", response_model=RespuestaAlerta)
    def alert(body: AlertRequest, request: Request):
        try:
            return request.app.state.missions.alert(body.zona, body.tipo)
        except NoPreviousMission as exc:
            raise HTTPException(409, detail=str(exc)) from exc
        except UnknownZone as exc:
            raise HTTPException(422, detail=[{"type": "value_error", "loc": ["body", "zona"],
                                            "msg": str(exc), "input": body.zona}]) from exc
        except MissionSolverUnavailable as exc:
            raise HTTPException(503, detail=str(exc)) from exc

    @app.post("/reset")
    def reset(request: Request):
        return request.app.state.missions.reset()

    montar_chat(app)
    return app


def montar_chat(app):
    """POST /chat del copiloto (llm/router.py, Manuel) en la misma API.

    Es opcional: si falta el paquete `ollama` o se arranca con CHAT=0, el motor funciona igual
    y la UI ofrece el Plan B. Las herramientas del copiloto llaman a esta misma API (API_URL)."""
    if os.getenv("CHAT", "1") == "0":
        return
    try:
        from llm.router import router as chat_router
    except ImportError as exc:
        logger.warning("No /chat: could not import llm.router (%s)", exc)
        return
    app.include_router(chat_router)


app = create_app()
