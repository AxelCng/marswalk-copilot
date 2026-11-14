"""
Las 5 herramientas que el LLM puede llamar. Cada una llama a un endpoint de la API (contracts/api.md).
El LLM nunca recibe el grafo completo ni calcula nada: solo elige herramienta y argumentos.
"""
import unicodedata

import requests

from config import API_URL, PENDIENTE_DEFAULT, TIEMPO_DEFAULT

TIMEOUT = 30

TOOLS = [
    {"type": "function", "function": {
        "name": "listar_estaciones",
        "description": "Lista todas las estaciones (id, nombre, tipo, valor científico). Úsala para traducir "
                       "los nombres que dice el astronauta a ids antes de llamar a otras herramientas.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "info_estacion",
        "description": "Datos completos de una estación: tarea, tiempo de permanencia, unidad geológica, "
                       "zona, elevación, pendiente y fotos.",
        "parameters": {"type": "object", "properties": {
            "id": {"type": "string", "description": "Id de la estación, por ejemplo E1"}},
            "required": ["id"]}}},
    {"type": "function", "function": {
        "name": "ruta_punto_a_punto",
        "description": "Camino más rápido entre dos estaciones respetando una pendiente máxima.",
        "parameters": {"type": "object", "properties": {
            "origen": {"type": "string", "description": "Id de la estación de origen, por ejemplo HAB"},
            "destino": {"type": "string", "description": "Id de la estación de destino"},
            "pendiente_max": {"type": "number",
                              "description": f"Pendiente máxima en grados. Si no la dicen, usa {PENDIENTE_DEFAULT:g}"}},
            "required": ["origen", "destino"]}}},
    {"type": "function", "function": {
        "name": "optimizar_mision",
        "description": "Calcula la mejor caminata que sale del hábitat y vuelve, visitando estaciones, con tiempo "
                       "límite y pendiente máxima. Devuelve el orden, los tramos, las estaciones omitidas con su "
                       "motivo, los totales y la comparación con la misión anterior.",
        "parameters": {"type": "object", "properties": {
            "estaciones": {"type": "array", "items": {"type": "string"},
                           "description": "Ids de TODAS las estaciones a visitar, por ejemplo [\"E1\", \"M1\"]"},
            "tiempo_max_min": {"type": "number",
                               "description": f"Tiempo máximo total en MINUTOS (3 horas = 180, 4 horas = 240). "
                                              f"Si no lo dicen, usa {TIEMPO_DEFAULT:g}"},
            "pendiente_max": {"type": "number",
                              "description": f"Pendiente máxima en grados. Si no la dicen, usa {PENDIENTE_DEFAULT:g}"}},
            "required": ["estaciones"]}}},
    {"type": "function", "function": {
        "name": "recalcular_por_alerta",
        "description": "Registra una alerta (tormenta de polvo en una zona o pérdida de comunicación) y "
                       "recalcula la última misión. Devuelve la nueva ruta y los tramos afectados.",
        "parameters": {"type": "object", "properties": {
            "zona": {"type": "string", "description": "Id de la zona afectada, por ejemplo Z2 (o su nombre)"},
            "tipo": {"type": "string", "enum": ["polvo", "comms"]}},
            "required": ["tipo"]}}},
]


# ---------- tolerancia: acepta nombres además de ids (ayuda mucho a modelos chicos) ----------
def _norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return " ".join(s.replace("_", " ").replace("-", " ").replace(",", " ").split())


_cache = {"estaciones": None, "zonas": None}


def _estaciones():
    if _cache["estaciones"] is None:
        r = requests.get(f"{API_URL}/estaciones", timeout=TIMEOUT)
        r.raise_for_status()
        _cache["estaciones"] = r.json()
    return _cache["estaciones"]


def _zonas():
    if _cache["zonas"] is None:
        try:
            r = requests.get(f"{API_URL}/grafo", timeout=TIMEOUT)
            _cache["zonas"] = [{"id": z["id"], "nombre": z.get("nombre", "")} for z in r.json().get("zonas", [])]
        except (requests.RequestException, ValueError):
            _cache["zonas"] = []
    return _cache["zonas"]


def _mejor_por_nombre(ref, items):
    """Busca por nombre normalizado: igualdad, inclusión o más palabras en común."""
    r = _norm(ref)
    if not r:
        return None
    for it in items:
        n = _norm(it["nombre"])
        if r == n or r in n or n in r:
            return it["id"]
    palabras = [p for p in r.split() if len(p) > 3]
    mejor = max(items, key=lambda it: sum(p in _norm(it["nombre"]) for p in palabras), default=None)
    if mejor and any(p in _norm(mejor["nombre"]) for p in palabras):
        return mejor["id"]
    return None


def resolver_id(ref):
    """'E1', 'e1', 'frente del delta', 'el delta' -> 'E1'. Si no encuentra, devuelve ref tal cual
    (la API la marcará como no_existe y el LLM podrá decirlo)."""
    ests = _estaciones()
    ids = {e["id"].upper(): e["id"] for e in ests}
    if str(ref).strip().upper() in ids:
        return ids[str(ref).strip().upper()]
    if _norm(ref) in ("habitat", "base", "el habitat", "hab"):
        return next((e["id"] for e in ests if e["tipo"] == "habitat"), ref)
    return _mejor_por_nombre(ref, ests) or str(ref).strip()


def resolver_zona(ref):
    """'Z2', 'z2', 'zona 2', 'campo de dunas' -> 'Z2'."""
    s = str(ref).strip()
    zonas = _zonas()
    ids = {z["id"].upper(): z["id"] for z in zonas}
    if s.upper() in ids:
        return ids[s.upper()]
    compacto = s.upper().replace("ZONA", "Z").replace(" ", "")
    if compacto in ids or (not zonas and compacto[:1] == "Z"):
        return ids.get(compacto, compacto)
    return _mejor_por_nombre(s, zonas) or s.upper()


def _num(x, defecto):
    try:
        return float(x)
    except (TypeError, ValueError):
        return defecto


def _lista(x):
    if isinstance(x, str):  # algunos modelos mandan "E1, E3" o '["E1","E3"]'
        x = x.replace("[", "").replace("]", "").replace('"', "").replace("'", "").split(",")
    return [str(s).strip() for s in (x or []) if str(s).strip()]


# ---------- ejecución ----------
def ejecutar(nombre, args):
    """Ejecuta una herramienta y devuelve (argumentos_enviados, resultado).
    Nunca lanza excepción: los errores van en resultado['error']."""
    args = dict(args or {})
    enviado = args
    try:
        if nombre == "listar_estaciones":
            _cache["estaciones"] = None
            return {}, {"estaciones": _estaciones()}

        if nombre == "info_estacion":
            id_ = resolver_id(args.get("id", ""))
            enviado = {"id": id_}
            r = requests.get(f"{API_URL}/estaciones/{id_}", timeout=TIMEOUT)

        elif nombre == "ruta_punto_a_punto":
            enviado = {"origen": resolver_id(args.get("origen") or "HAB"),
                       "destino": resolver_id(args.get("destino", "")),
                       "pendiente_max": _num(args.get("pendiente_max"), PENDIENTE_DEFAULT)}
            r = requests.post(f"{API_URL}/ruta", timeout=TIMEOUT, json=enviado)

        elif nombre == "optimizar_mision":
            enviado = {"estaciones": list(dict.fromkeys(resolver_id(s) for s in _lista(args.get("estaciones")))),
                       "tiempo_max_min": _num(args.get("tiempo_max_min"), TIEMPO_DEFAULT),
                       "pendiente_max": _num(args.get("pendiente_max"), PENDIENTE_DEFAULT),
                       "modo": "orientacion"}
            r = requests.post(f"{API_URL}/mision", timeout=TIMEOUT, json=enviado)

        elif nombre == "recalcular_por_alerta":
            tipo = str(args.get("tipo") or "polvo").lower()
            tipo = "comms" if tipo.startswith("com") else "polvo"
            if tipo == "polvo":
                zona = resolver_zona(args.get("zona", ""))
            else:
                # comms afecta a todas las aristas, pero la API exige una zona válida: sin zona, la primera del grafo
                zona = str(args.get("zona") or "") or next((z["id"] for z in _zonas()), "Z1")
            enviado = {"zona": zona, "tipo": tipo}
            r = requests.post(f"{API_URL}/alerta", timeout=TIMEOUT, json=enviado)

        else:
            return args, {"error": f"Herramienta desconocida: {nombre}"}

        if r.status_code >= 400:
            try:
                detalle = r.json().get("detail", r.text)
            except ValueError:
                detalle = r.text
            return enviado, {"error": detalle, "status": r.status_code}
        return enviado, r.json()

    except requests.RequestException as e:
        return enviado, {"error": f"No se pudo llamar a la API ({API_URL}): {e}"}
