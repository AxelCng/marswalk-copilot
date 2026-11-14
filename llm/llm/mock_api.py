"""
API FALSA con el mismo contrato que la de Said (contracts/). Solo para desarrollo.
Sirve para probar las herramientas del LLM y para que el frontend tenga algo que llamar
mientras el motor real no está listo. Los números son inventados.

Correr:  uvicorn mock_api:app --port 8001 --reload
"""
from itertools import combinations, permutations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="MarsWalk API (MOCK)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ORIGEN = "HAB"

NODOS = {
    "HAB": {"id": "HAB", "nombre": "Hábitat", "tipo": "habitat", "lon": 77.450, "lat": 18.440,
            "valor_cientifico": 0, "tarea": "Base", "permanencia_min": 0},
    "E1": {"id": "E1", "nombre": "Frente del delta", "tipo": "ciencia", "lon": 77.400, "lat": 18.450,
           "valor_cientifico": 8, "tarea": "Observar capas del delta", "permanencia_min": 30},
    "E2": {"id": "E2", "nombre": "Afloramiento norte", "tipo": "ciencia", "lon": 77.410, "lat": 18.462,
           "valor_cientifico": 6, "tarea": "Fotografiar afloramiento", "permanencia_min": 20},
    "E3": {"id": "E3", "nombre": "Punto de muestreo sur", "tipo": "muestreo", "lon": 77.430, "lat": 18.428,
           "valor_cientifico": 7, "tarea": "Tomar muestra de suelo", "permanencia_min": 25},
}
for n in NODOS.values():
    n.setdefault("unidad_geologica", "por definir")
    n.setdefault("capas", {"elev_m": 0, "pendiente_deg": 0, "themis_noche": 0})
    n.setdefault("fotos", [])

# (a, b): distancia_m, tiempo_min, pendiente_max_deg, cobertura_com_pct, zonas
_BASE = {
    ("HAB", "E1"): (620, 14, 11, 100, ["Z1"]),
    ("HAB", "E3"): (900, 19, 9, 90, ["Z3"]),
    ("E1", "E3"): (480, 12, 14, 80, ["Z2"]),
    ("E1", "E2"): (540, 15, 19, 60, ["Z2"]),
    ("HAB", "E2"): (1100, 28, 22, 50, ["Z1"]),
    ("E2", "E3"): (700, 18, 17, 70, ["Z4"]),
}
ARISTAS = {}
for (a, b), (d, t, p, c, z) in _BASE.items():
    for o, de in ((a, b), (b, a)):
        ARISTAS[(o, de)] = {"origen": o, "destino": de, "distancia_m": d, "tiempo_min": t,
                            "pendiente_max_deg": p, "energia_rel": round(t * (1 + 0.02 * p), 1),
                            "dosis_rel": round(t * 0.1, 1), "cobertura_com_pct": c,
                            "sombra_pct": 0, "zonas": z}

ESTADO = {"zonas_bloqueadas": set(), "sin_comms": False, "ultima_mision": None}
UMBRAL_COMMS = 80


# ---------- utilidades del grafo ----------
def _aristas_validas(pendiente_max):
    out = {}
    for k, e in ARISTAS.items():
        if e["pendiente_max_deg"] > pendiente_max:
            continue
        if set(e["zonas"]) & ESTADO["zonas_bloqueadas"]:
            continue
        if ESTADO["sin_comms"] and e["cobertura_com_pct"] < UMBRAL_COMMS:
            continue
        out[k] = e
    return out


def _camino(origen, destino, aristas):
    """Dijkstra por tiempo. Devuelve (lista_de_nodos, minutos) o (None, inf)."""
    dist, prev, pend = {origen: 0}, {}, {origen}
    visit = set()
    while pend:
        u = min(pend, key=lambda x: dist[x])
        pend.remove(u)
        if u == destino:
            break
        visit.add(u)
        for (a, b), e in aristas.items():
            if a != u or b in visit:
                continue
            nd = dist[u] + e["tiempo_min"]
            if nd < dist.get(b, float("inf")):
                dist[b], prev[b] = nd, u
                pend.add(b)
    if destino not in dist:
        return None, float("inf")
    nodos = [destino]
    while nodos[-1] != origen:
        nodos.append(prev[nodos[-1]])
    return nodos[::-1], dist[destino]


def _tramos(nodos, aristas):
    return [aristas[(a, b)] for a, b in zip(nodos, nodos[1:])]


def _pendiente_minima_necesaria(estacion):
    """Menor límite de pendiente con el que la estación sería alcanzable (ida y vuelta)."""
    for lim in sorted({e["pendiente_max_deg"] for e in ARISTAS.values()}):
        a = _aristas_validas(lim)
        if _camino(ORIGEN, estacion, a)[0] and _camino(estacion, ORIGEN, a)[0]:
            return lim
    return None


def _resultado(nodos, aristas, tiempo_max=None, permanencia=0, omitidas=None, factible=True):
    tr = _tramos(nodos, aristas)
    caminar = sum(e["tiempo_min"] for e in tr)
    total = caminar + permanencia
    return {
        "factible": factible,
        "ruta": nodos,
        "tramos": tr,
        "omitidas": omitidas or [],
        "totales": {
            "distancia_m": sum(e["distancia_m"] for e in tr),
            "tiempo_caminata_min": caminar,
            "tiempo_estaciones_min": permanencia,
            "tiempo_min": total,
            "dosis_rel": round(sum(e["dosis_rel"] for e in tr), 1),
            "margen_min": (tiempo_max - total) if tiempo_max is not None else None,
        },
        "alertas_activas": sorted(ESTADO["zonas_bloqueadas"]) + (["sin_comms"] if ESTADO["sin_comms"] else []),
    }


def _resolver_mision(estaciones, tiempo_max, pendiente_max, modo):
    aristas = _aristas_validas(pendiente_max)
    pedidas = [s for s in dict.fromkeys(estaciones) if s != ORIGEN]
    for s in pedidas:
        if s not in NODOS:
            raise HTTPException(404, f"Estación desconocida: {s}")

    mejor = None  # (valor, -tiempo, orden, nodos)
    for k in range(len(pedidas), -1, -1):
        for sub in combinations(pedidas, k):
            for orden in permutations(sub):
                seq, total, ok = [ORIGEN], 0, True
                for a, b in zip((ORIGEN,) + orden, orden + (ORIGEN,)):
                    tramo, t = _camino(a, b, aristas)
                    if not tramo:
                        ok = False
                        break
                    seq += tramo[1:]
                    total += t
                if not ok:
                    continue
                total += sum(NODOS[s]["permanencia_min"] for s in orden)
                if total > tiempo_max:
                    continue
                valor = sum(NODOS[s]["valor_cientifico"] for s in orden)
                cand = (valor, -total, orden, seq)
                if mejor is None or cand[:2] > mejor[:2]:
                    mejor = cand
        if mejor and len(mejor[2]) == k:
            break  # ya encontramos la mayor cantidad posible

    elegidas = list(mejor[2]) if mejor else []
    omitidas = []
    for s in pedidas:
        if s in elegidas:
            continue
        alcanzable = _camino(ORIGEN, s, aristas)[0] and _camino(s, ORIGEN, aristas)[0]
        if not alcanzable:
            sin_filtro_pend = _aristas_validas(90)
            if ESTADO["zonas_bloqueadas"] or ESTADO["sin_comms"]:
                if not (_camino(ORIGEN, s, sin_filtro_pend)[0] and _camino(s, ORIGEN, sin_filtro_pend)[0]):
                    omitidas.append({"id": s, "motivo": "alerta",
                                     "detalle": {"alertas": sorted(ESTADO["zonas_bloqueadas"])}})
                    continue
            omitidas.append({"id": s, "motivo": "pendiente",
                             "detalle": {"pendiente_necesaria_deg": _pendiente_minima_necesaria(s),
                                         "limite": pendiente_max}})
        else:
            omitidas.append({"id": s, "motivo": "tiempo", "detalle": {"tiempo_max_min": tiempo_max}})

    nodos = mejor[3] if mejor else [ORIGEN]
    perm = sum(NODOS[s]["permanencia_min"] for s in elegidas)
    factible = not omitidas if modo == "tsp" else True
    res = _resultado(nodos, aristas, tiempo_max, perm, omitidas, factible)
    res["estaciones_visitadas"] = elegidas
    return res


# ---------- endpoints (mismo contrato que contracts/) ----------
class RutaIn(BaseModel):
    origen: str
    destino: str
    pendiente_max: float = 25


class MisionIn(BaseModel):
    estaciones: list[str]
    tiempo_max_min: float
    pendiente_max: float = 25
    modo: str = "orientacion"


class AlertaIn(BaseModel):
    zona: str
    tipo: str = "polvo"


@app.get("/estaciones")
def estaciones():
    return [{k: n[k] for k in ("id", "nombre", "tipo", "valor_cientifico", "lon", "lat")} for n in NODOS.values()]


@app.get("/estaciones/{id}")
def estacion(id: str):
    if id not in NODOS:
        raise HTTPException(404, f"Estación desconocida: {id}")
    return NODOS[id]


@app.post("/ruta")
def ruta(body: RutaIn):
    for s in (body.origen, body.destino):
        if s not in NODOS:
            raise HTTPException(404, f"Estación desconocida: {s}")
    aristas = _aristas_validas(body.pendiente_max)
    nodos, _ = _camino(body.origen, body.destino, aristas)
    if not nodos:
        return {"factible": False, "ruta": [], "tramos": [], "omitidas": [
            {"id": body.destino, "motivo": "pendiente",
             "detalle": {"pendiente_necesaria_deg": _pendiente_minima_necesaria(body.destino),
                         "limite": body.pendiente_max}}], "totales": {}}
    return _resultado(nodos, aristas)


@app.post("/mision")
def mision(body: MisionIn):
    ESTADO["ultima_mision"] = body.model_dump()
    return _resolver_mision(body.estaciones, body.tiempo_max_min, body.pendiente_max, body.modo)


@app.post("/alerta")
def alerta(body: AlertaIn):
    if body.tipo == "comms":
        ESTADO["sin_comms"] = True
        afectadas = [e for e in ARISTAS.values() if e["cobertura_com_pct"] < UMBRAL_COMMS]
    else:
        ESTADO["zonas_bloqueadas"].add(body.zona)
        afectadas = [e for e in ARISTAS.values() if body.zona in e["zonas"]]
    afect = sorted({f'{min(e["origen"], e["destino"])}-{max(e["origen"], e["destino"])}' for e in afectadas})
    m = ESTADO["ultima_mision"]
    if not m:
        return {"aviso": "Alerta registrada; no hay misión previa que recalcular.", "aristas_afectadas": afect}
    res = _resolver_mision(m["estaciones"], m["tiempo_max_min"], m["pendiente_max"], m["modo"])
    res["aristas_afectadas"] = afect
    return res


@app.post("/reset")
def reset():
    ESTADO["zonas_bloqueadas"].clear()
    ESTADO["sin_comms"] = False
    return {"ok": True}


# /chat de desarrollo: el mismo router que luego incluirá Said en la API real.
try:
    from router import router as chat_router
    app.include_router(chat_router)
except Exception as e:  # si falta ollama, el mock igual funciona sin /chat
    print("Aviso: /chat no disponible en el mock:", e)
