"""
API FALSA con el mismo contrato que la de Said (contracts/api.md). Solo para desarrollo.

Lee el mismo grafo que el motor (GRAPH_PATH, por defecto contracts/graph_fake.json), así que las
estaciones, zonas y resultados coinciden con contracts/ejemplos/. Resuelve las misiones por fuerza
bruta (con 8 nodos alcanza). Sirve para probar el copiloto y para que el frontend tenga algo que
llamar mientras el motor real no está listo.

Correr (dentro de llm/):  uvicorn mock_api:app --port 8001 --reload
"""
import itertools
import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

RAIZ = Path(__file__).resolve().parents[1]
GRAPH_PATH = Path(os.getenv("GRAPH_PATH", RAIZ / "contracts" / "graph_fake.json"))
if not GRAPH_PATH.is_absolute():
    GRAPH_PATH = RAIZ / GRAPH_PATH

GRAFO = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
NODOS = {n["id"]: n for n in GRAFO["nodes"]}
IDS = list(NODOS)
LIMITES = sorted(GRAFO["meta"].get("limites_pendiente_deg", [15, 20, 25]))
UMBRAL_COMMS = 60  # params.yaml: comms.umbral_cobertura_com_pct
INF = float("inf")
CAMPOS_TRAMO = ("origen", "destino", "distancia_m", "tiempo_min", "pendiente_max_deg",
                "cobertura_com_pct", "dosis_rel", "zonas", "geometria")

ESTADO = {"zonas": [], "sin_comms": False, "ultima_mision": None, "ultima_respuesta": None}

app = FastAPI(title="MarsWalk API (MOCK)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------------------------------------------------------------- grafo
def version_para(pendiente_max):
    validas = [l for l in LIMITES if l <= pendiente_max]
    return max(validas) if validas else LIMITES[0]


def aristas(pendiente_max, zonas=(), sin_comms=False):
    v = version_para(pendiente_max)
    return {(e["origen"], e["destino"]): e for e in GRAFO["edges"]
            if e["limite_deg"] == v and e["pendiente_max_deg"] <= pendiente_max
            and not set(e["zonas"]) & set(zonas)
            and not (sin_comms and e["cobertura_com_pct"] < UMBRAL_COMMS)}


def caminos(ar):
    """Floyd-Warshall por tiempo: (dist, siguiente)."""
    dist = {(i, j): (0 if i == j else INF) for i in IDS for j in IDS}
    sig = {}
    for (o, d), e in ar.items():
        dist[o, d], sig[o, d] = e["tiempo_min"], d
    for k in IDS:
        for i in IDS:
            for j in IDS:
                if dist[i, k] + dist[k, j] < dist[i, j]:
                    dist[i, j] = dist[i, k] + dist[k, j]
                    sig[i, j] = sig[i, k]
    return dist, sig


def expandir(i, j, sig):
    c = [i]
    while c[-1] != j:
        c.append(sig[c[-1], j])
    return c


def ida_vuelta(origen, s, dist):
    return dist[origen, s] < INF and dist[s, origen] < INF


def motivo_inalcanzable(origen, s, pendiente_max):
    """Por qué no se llega a s: alerta, comms o pendiente (en ese orden de prueba)."""
    if ESTADO["zonas"]:
        d, _ = caminos(aristas(pendiente_max, (), ESTADO["sin_comms"]))
        if ida_vuelta(origen, s, d):
            return {"id": s, "motivo": "alerta", "detalle": {"zonas": list(ESTADO["zonas"])}}
    if ESTADO["sin_comms"]:
        d, _ = caminos(aristas(pendiente_max))
        if ida_vuelta(origen, s, d):
            return {"id": s, "motivo": "comms", "detalle": {"cobertura_com_pct": None, "umbral": UMBRAL_COMMS}}
    pend = min((e["pendiente_max_deg"] for e in GRAFO["edges"]
                if e["destino"] == s and e["limite_deg"] == LIMITES[-1]), default=None)
    return {"id": s, "motivo": "pendiente", "detalle": {"pendiente_max_deg": pend, "limite": pendiente_max}}


def armar(ruta, ar, tiempo_total, tiempo_max, omitidas, factible=True):
    tramos = [{k: ar[a, b][k] for k in CAMPOS_TRAMO} for a, b in zip(ruta, ruta[1:])]
    t = round(tiempo_total, 1)
    return {
        "factible": factible,
        "ruta": ruta,
        "tramos": tramos,
        "omitidas": omitidas,
        "totales": {
            "distancia_m": sum(x["distancia_m"] for x in tramos),
            "tiempo_min": t,
            "dosis_rel": round(sum(x["dosis_rel"] for x in tramos), 1),
            "margen_min": round(tiempo_max - t, 1) if tiempo_max is not None else None,
        },
    }


def resolver_mision(estaciones, tiempo_max, pendiente_max, modo, origen):
    ar = aristas(pendiente_max, ESTADO["zonas"], ESTADO["sin_comms"])
    dist, sig = caminos(ar)
    omitidas, candidatas = [], []
    for s in dict.fromkeys(estaciones):
        if s == origen:
            continue
        if s not in NODOS:
            omitidas.append({"id": s, "motivo": "no_existe", "detalle": {}})
        elif not ida_vuelta(origen, s, dist):
            omitidas.append(motivo_inalcanzable(origen, s, pendiente_max))
        else:
            candidatas.append(s)

    tope = tiempo_max if tiempo_max is not None else INF

    def costo(orden):
        t = sum(dist[a, b] for a, b in zip((origen, *orden), (*orden, origen)))
        return t + sum(NODOS[s]["permanencia_min"] for s in orden)

    mejor = None  # (valor, -tiempo, orden)
    tamanos = [len(candidatas)] if modo == "tsp" else range(len(candidatas), 0, -1)
    for r in tamanos:
        for sub in itertools.combinations(candidatas, r):
            for orden in itertools.permutations(sub):
                t = costo(orden)
                if t <= tope:
                    clave = (sum(NODOS[s]["valor_cientifico"] for s in sub), -t, orden)
                    if mejor is None or clave[:2] > mejor[:2]:
                        mejor = clave

    orden = mejor[2] if mejor else ()
    omitidas += [{"id": s, "motivo": "tiempo", "detalle": {"tiempo_max_min": tiempo_max}}
                 for s in candidatas if s not in orden]
    if not orden:
        return {"factible": False, "ruta": [], "tramos": [], "omitidas": omitidas,
                "totales": {"distancia_m": 0, "tiempo_min": 0, "dosis_rel": 0, "margen_min": tiempo_max}}
    ruta = [origen]
    for a, b in zip((origen, *orden), (*orden, origen)):
        ruta += expandir(a, b, sig)[1:]
    factible = not omitidas if modo == "tsp" else True
    return armar(ruta, ar, costo(orden), tiempo_max, omitidas, factible)


# ---------------------------------------------------------------- endpoints (contracts/api.md)
class RutaIn(BaseModel):
    origen: str
    destino: str
    pendiente_max: float = 15


class MisionIn(BaseModel):
    estaciones: list[str]
    tiempo_max_min: float | None = None
    pendiente_max: float = 15
    modo: str = "tsp"
    origen: str = "HAB"


class AlertaIn(BaseModel):
    zona: str = ""
    tipo: str = "polvo"


def _existe(id):
    if id not in NODOS:
        raise HTTPException(404, f"estacion {id} no existe")


@app.get("/estaciones")
def estaciones():
    return [{k: n[k] for k in ("id", "nombre", "tipo", "valor_cientifico", "lon", "lat")} for n in GRAFO["nodes"]]


@app.get("/estaciones/{id}")
def estacion(id: str):
    _existe(id)
    return NODOS[id]


@app.get("/grafo")
def grafo(pendiente_max: float | None = None):
    edges = GRAFO["edges"] if pendiente_max is None else list(aristas(pendiente_max).values())
    return {"meta": GRAFO["meta"], "zonas": GRAFO.get("zonas", []), "nodes": GRAFO["nodes"], "edges": edges}


@app.post("/ruta")
def ruta(body: RutaIn):
    _existe(body.origen)
    _existe(body.destino)
    ar = aristas(body.pendiente_max, ESTADO["zonas"], ESTADO["sin_comms"])
    dist, sig = caminos(ar)
    if dist[body.origen, body.destino] == INF:
        om = motivo_inalcanzable(body.origen, body.destino, body.pendiente_max)
        return {"factible": False, "ruta": [], "tramos": [], "omitidas": [om],
                "totales": {"distancia_m": 0, "tiempo_min": 0, "dosis_rel": 0, "margen_min": None}}
    camino = expandir(body.origen, body.destino, sig)
    return armar(camino, ar, dist[body.origen, body.destino], None, [])


@app.post("/mision")
def mision(body: MisionIn):
    ESTADO["ultima_mision"] = body.model_dump()
    res = resolver_mision(body.estaciones, body.tiempo_max_min, body.pendiente_max, body.modo, body.origen)
    ESTADO["ultima_respuesta"] = res
    return res


@app.post("/alerta")
def alerta(body: AlertaIn):
    m = ESTADO["ultima_mision"]
    if not m:
        raise HTTPException(409, "no hay mision para recalcular")
    if body.tipo == "comms":
        ESTADO["sin_comms"] = True
        afecta = lambda t: t["cobertura_com_pct"] < UMBRAL_COMMS  # noqa: E731
    else:
        if body.zona not in ESTADO["zonas"]:
            ESTADO["zonas"].append(body.zona)
        afecta = lambda t: body.zona in t["zonas"]  # noqa: E731
    previa = ESTADO["ultima_respuesta"] or {"tramos": []}
    afectadas = sorted({f'{t["origen"]}->{t["destino"]}' for t in previa["tramos"] if afecta(t)})
    res = resolver_mision(m["estaciones"], m["tiempo_max_min"], m["pendiente_max"], m["modo"], m["origen"])
    ESTADO["ultima_respuesta"] = res
    return {**res, "aristas_afectadas": afectadas}


@app.post("/reset")
def reset():
    ESTADO["zonas"].clear()
    ESTADO["sin_comms"] = False
    return {"ok": True}


# /chat de desarrollo: el mismo router que luego incluirá Said en la API real.
try:
    from router import router as chat_router
    app.include_router(chat_router)
except Exception as e:  # si falta ollama, el mock igual funciona sin /chat
    print("Aviso: /chat no disponible en el mock:", e)
