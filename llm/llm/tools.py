"""
Las 5 herramientas que el LLM puede llamar. Cada una llama a un endpoint de la API (contracts/).
El LLM nunca recibe el grafo completo ni calcula nada: solo elige herramienta y argumentos.
"""
import unicodedata

import requests

from config import API_URL

TIMEOUT = 30

TOOLS = [
    {"type": "function", "function": {
        "name": "listar_estaciones",
        "description": "Lista todas las estaciones (id, nombre, tipo, valor científico). Úsala para traducir "
                       "los nombres que dice el astronauta a ids antes de llamar a otras herramientas.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "info_estacion",
        "description": "Datos completos de una estación: tarea, tiempo de permanencia, unidad geológica, capas y fotos.",
        "parameters": {"type": "object", "properties": {
            "id": {"type": "string", "description": "Id de la estación, por ejemplo E1"}},
            "required": ["id"]}}},
    {"type": "function", "function": {
        "name": "ruta_punto_a_punto",
        "description": "Camino más rápido entre dos estaciones respetando una pendiente máxima.",
        "parameters": {"type": "object", "properties": {
            "origen": {"type": "string", "description": "Id de la estación de origen, por ejemplo HAB"},
            "destino": {"type": "string", "description": "Id de la estación de destino"},
            "pendiente_max": {"type": "number", "description": "Pendiente máxima en grados. Si no la dicen, usa 25"}},
            "required": ["origen", "destino"]}}},
    {"type": "function", "function": {
        "name": "optimizar_mision",
        "description": "Calcula la mejor caminata desde el hábitat visitando estaciones, con tiempo límite y "
                       "pendiente máxima. Devuelve el orden, los tramos, las estaciones omitidas con su motivo y los totales.",
        "parameters": {"type": "object", "properties": {
            "estaciones": {"type": "array", "items": {"type": "string"},
                           "description": "Ids de las estaciones a visitar, por ejemplo [\"E1\", \"E3\"]"},
            "tiempo_max_min": {"type": "number", "description": "Tiempo máximo total en MINUTOS (3 horas = 180)"},
            "pendiente_max": {"type": "number", "description": "Pendiente máxima en grados. Si no la dicen, usa 25"}},
            "required": ["estaciones", "tiempo_max_min"]}}},
    {"type": "function", "function": {
        "name": "recalcular_por_alerta",
        "description": "Registra una alerta (polvo en una zona o pérdida de comunicación) y recalcula la última misión.",
        "parameters": {"type": "object", "properties": {
            "zona": {"type": "string", "description": "Zona afectada, por ejemplo Z2"},
            "tipo": {"type": "string", "enum": ["polvo", "comms"]}},
            "required": ["zona", "tipo"]}}},
]


# ---------- tolerancia: acepta nombres además de ids (ayuda mucho a modelos chicos) ----------
def _norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return " ".join(s.replace("_", " ").replace("-", " ").split())


_cache = {"estaciones": None}


def _estaciones():
    if _cache["estaciones"] is None:
        r = requests.get(f"{API_URL}/estaciones", timeout=TIMEOUT)
        r.raise_for_status()
        _cache["estaciones"] = r.json()
    return _cache["estaciones"]


def resolver_id(ref):
    """'E1', 'e1', 'frente del delta', 'el delta' -> 'E1'. Si no encuentra, devuelve ref tal cual."""
    ests = _estaciones()
    ids = {e["id"].upper(): e["id"] for e in ests}
    if str(ref).strip().upper() in ids:
        return ids[str(ref).strip().upper()]
    r = _norm(ref)
    if r in ("habitat", "base", "el habitat"):
        for e in ests:
            if e["tipo"] == "habitat":
                return e["id"]
    for e in ests:
        if r == _norm(e["nombre"]) or r in _norm(e["nombre"]) or _norm(e["nombre"]) in r:
            return e["id"]
    palabras = [p for p in r.split() if len(p) > 3]
    mejor = max(ests, key=lambda e: sum(p in _norm(e["nombre"]) for p in palabras), default=None)
    if mejor and any(p in _norm(mejor["nombre"]) for p in palabras):
        return mejor["id"]
    return ref


def _num(x, defecto):
    try:
        return float(x)
    except (TypeError, ValueError):
        return defecto


# ---------- ejecución ----------
def ejecutar(nombre, args):
    """Ejecuta una herramienta y devuelve un dict (nunca lanza excepción: los errores van en 'error')."""
    args = dict(args or {})
    try:
        if nombre == "listar_estaciones":
            _cache["estaciones"] = None
            return {"estaciones": _estaciones()}

        if nombre == "info_estacion":
            r = requests.get(f"{API_URL}/estaciones/{resolver_id(args.get('id', ''))}", timeout=TIMEOUT)

        elif nombre == "ruta_punto_a_punto":
            r = requests.post(f"{API_URL}/ruta", timeout=TIMEOUT, json={
                "origen": resolver_id(args.get("origen", "HAB")),
                "destino": resolver_id(args.get("destino", "")),
                "pendiente_max": _num(args.get("pendiente_max"), 25)})

        elif nombre == "optimizar_mision":
            est = args.get("estaciones", [])
            if isinstance(est, str):  # algunos modelos mandan "E1, E3"
                est = [s for s in est.replace("[", "").replace("]", "").replace('"', "").split(",") if s.strip()]
            r = requests.post(f"{API_URL}/mision", timeout=TIMEOUT, json={
                "estaciones": [resolver_id(s.strip()) for s in est],
                "tiempo_max_min": _num(args.get("tiempo_max_min"), 240),
                "pendiente_max": _num(args.get("pendiente_max"), 25),
                "modo": "orientacion"})

        elif nombre == "recalcular_por_alerta":
            r = requests.post(f"{API_URL}/alerta", timeout=TIMEOUT, json={
                "zona": str(args.get("zona", "")).upper(), "tipo": args.get("tipo", "polvo")})

        else:
            return {"error": f"Herramienta desconocida: {nombre}"}

        if r.status_code >= 400:
            return {"error": r.json().get("detail", r.text)}
        return r.json()

    except requests.RequestException as e:
        return {"error": f"No se pudo llamar a la API ({API_URL}): {e}"}
