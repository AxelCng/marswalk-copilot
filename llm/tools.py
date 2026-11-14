"""
The 5 tools the LLM can call. Each one calls an endpoint of the engine API (contracts/api.md).
The LLM never receives the full graph and never computes anything: it only picks a tool and its arguments.

The model sees English tool names and arguments; this file translates them to the engine API fields
(which are part of the Spanish contract owned by the engine: estaciones, pendiente_max, zona...).
"""
import json
import os
import re
import unicodedata
from pathlib import Path

import requests

from config import API_URL, DEFAULT_SLOPE_DEG, DEFAULT_TIME_MIN

TIMEOUT = 30

TOOLS = [
    {"type": "function", "function": {
        "name": "list_stations",
        "description": "Lists every station (id, name, type, science value). Use it to translate the place names "
                       "the astronaut says into ids before calling other tools.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "station_info",
        "description": "Full data for one station: task, dwell time, geologic unit, zone, elevation, slope and photos.",
        "parameters": {"type": "object", "properties": {
            "id": {"type": "string", "description": "Station id, for example E1"}},
            "required": ["id"]}}},
    {"type": "function", "function": {
        "name": "point_to_point_route",
        "description": "Fastest path between two stations that respects a maximum slope.",
        "parameters": {"type": "object", "properties": {
            "origin": {"type": "string", "description": "Origin station id, for example HAB"},
            "destination": {"type": "string", "description": "Destination station id"},
            "max_slope_deg": {"type": "number",
                              "description": f"Maximum slope in degrees. If not given, use {DEFAULT_SLOPE_DEG:g}"}},
            "required": ["origin", "destination"]}}},
    {"type": "function", "function": {
        "name": "optimize_mission",
        "description": "Computes the best walk that leaves the habitat and comes back, visiting stations, with a "
                       "time limit and a maximum slope. Returns the order, the legs, the skipped stations with "
                       "their reason, the totals and the comparison with the previous mission.",
        "parameters": {"type": "object", "properties": {
            "stations": {"type": "array", "items": {"type": "string"},
                         "description": "Ids of ALL the stations to visit, for example [\"E1\", \"M1\"]"},
            "max_time_min": {"type": "number",
                             "description": f"Maximum total time in MINUTES (3 hours = 180, 4 hours = 240). "
                                            f"If not given, use {DEFAULT_TIME_MIN:g}"},
            "max_slope_deg": {"type": "number",
                              "description": f"Maximum slope in degrees. If not given, use {DEFAULT_SLOPE_DEG:g}"}},
            "required": ["stations"]}}},
    {"type": "function", "function": {
        "name": "reroute_for_alert",
        "description": "Registers an alert (dust storm in a zone or loss of communications) and recalculates the "
                       "last mission. Returns the new route and the affected legs.",
        "parameters": {"type": "object", "properties": {
            "zone": {"type": "string", "description": "Affected zone id, for example Z2 (or its name)"},
            "type": {"type": "string", "enum": ["dust", "comms"]}},
            "required": ["type"]}}},
]

# English names: ONE dictionary for the screen and the copilot, web/shared/i18n_en.json (web/ui/src/i18n.ts
# reads it too). The catalog (estaciones.csv / graph.json) is in Spanish and owned by other people.
# If the file is missing the copilot still works, with the Spanish names.
I18N_PATH = Path(os.getenv("I18N_PATH", Path(__file__).resolve().parents[1] / "web" / "shared" / "i18n_en.json"))


def _load_i18n(path=I18N_PATH):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as e:
        print(f"Warning: English names not loaded ({path}): {e}")
        return {}


_I18N = _load_i18n()
STATION_NAMES_EN = _I18N.get("estaciones", {})          # by station id
STATION_TASKS_EN = _I18N.get("tareas", {})              # by station id
# Zones go by their normalized Spanish NAME, not by id: the fake and the real graph reuse Z1..Z4 for
# different zones. Unknown zones keep their Spanish name.
ZONE_NAMES_EN = _I18N.get("zonas", {})
TYPES_EN = _I18N.get("tipos", {})
REASONS_EN = _I18N.get("motivos", {})
# Extra ways the crew may name a zone (only the copilot needs them), by normalized Spanish name.
ZONE_ALIASES = {
    "campo de dunas": ["dunes"],
    "llanura norte": ["north plain"],
    "campo de dunas seitah": ["dune field", "dunes", "seitah"],
    "corredor de acceso": ["corridor"],
    "entrada al delta": ["delta entrance", "delta"],
    "borde norte de seitah": ["seitah"],
    "corredor del habitat": ["corridor"],
}

# ---------- tolerance: accepts names as well as ids (helps small models a lot) ----------
def _norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return " ".join(s.replace("_", " ").replace("-", " ").replace(",", " ").split())


_cache = {"stations": None, "zones": None}


def _stations():
    """Stations from the API, with the English name added as `name`."""
    if _cache["stations"] is None:
        r = requests.get(f"{API_URL}/estaciones", timeout=TIMEOUT)
        r.raise_for_status()
        _cache["stations"] = [{**e, "name": STATION_NAMES_EN.get(e["id"], e.get("nombre", e["id"]))}
                              for e in r.json()]
    return _cache["stations"]


def _zones():
    """Zones of the loaded graph with English name and aliases. A failed call is not cached."""
    if _cache["zones"] is None:
        try:
            r = requests.get(f"{API_URL}/grafo", timeout=TIMEOUT)
            r.raise_for_status()
            zones = []
            for z in r.json().get("zonas", []):
                nombre = z.get("nombre", "")
                name = ZONE_NAMES_EN.get(_norm(nombre), nombre)
                aliases = ZONE_ALIASES.get(_norm(nombre), [])
                zones.append({"id": z["id"], "nombre": nombre, "name": name, "aliases": aliases})
            _cache["zones"] = zones
        except (requests.RequestException, ValueError):
            return []
    return _cache["zones"]


def zone_in_text(text):
    """Zone id named in a (normalized) text, by English name, Spanish name or alias; longest match wins."""
    candidates = []
    for z in _zones():
        for phrase in [z["name"], z["nombre"], *z["aliases"]]:
            p = _norm(phrase)
            if p and re.search(rf"\b{re.escape(p)}\b", text):
                candidates.append((len(p), z["id"]))
    return max(candidates)[1] if candidates else None


def station_names():
    """{id: English name} for every station; {} if the API is down."""
    try:
        return {e["id"]: e["name"] for e in _stations()}
    except Exception:
        return {}


def _names_of(item):
    return [n for n in (item.get("name"), item.get("nombre")) if n]


def _best_by_name(ref, items):
    """Looks up by normalized name (English or Spanish): equality, inclusion or most words in common."""
    r = _norm(ref)
    if not r:
        return None
    for it in items:
        for name in _names_of(it):
            n = _norm(name)
            if r == n or r in n or n in r:
                return it["id"]
    words = [p for p in r.split() if len(p) > 3]

    def score(it):
        return max((sum(p in _norm(n) for p in words) for n in _names_of(it)), default=0)

    best = max(items, key=score, default=None)
    if best and score(best) > 0:
        return best["id"]
    return None


def resolve_id(ref):
    """'E1', 'e1', 'delta front', 'frente del delta' -> 'E1'. If nothing matches, returns ref unchanged
    (the API will mark it as not found and the LLM can say so)."""
    stations = _stations()
    ids = {e["id"].upper(): e["id"] for e in stations}
    s = str(ref or "").strip()
    if s.upper() in ids:
        return ids[s.upper()]
    # 'E1 (delta front)', 'station E1', 'E 1' -> the id inside
    for token in re.findall(r"\b([A-Za-z]{1,3})\s?(\d)\b", s):
        if (token[0] + token[1]).upper() in ids:
            return ids[(token[0] + token[1]).upper()]
    for word in re.findall(r"\b[A-Za-z]{3}\b", s):
        if word.upper() in ids:
            return ids[word.upper()]
    if _norm(s) in ("habitat", "the habitat", "base", "home", "home base", "base camp", "hab", "el habitat"):
        return next((e["id"] for e in stations if e["tipo"] == "habitat"), s)
    if len(_norm(s)) < 3:  # 'a', 'x': do not guess
        return s
    return _best_by_name(s, stations) or s


def resolve_zone(ref):
    """'Z2', 'z2', 'zone 2', 'dune field' -> 'Z2'."""
    s = str(ref).strip()
    zones = _zones()
    ids = {z["id"].upper(): z["id"] for z in zones}
    if s.upper() in ids:
        return ids[s.upper()]
    compact = s.upper().replace("ZONE", "Z").replace("ZONA", "Z").replace(" ", "")
    if compact in ids or (not zones and compact[:1] == "Z"):
        return ids.get(compact, compact)
    return zone_in_text(_norm(s)) or _best_by_name(s, zones) or s.upper()


def _num(x, default):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _as_list(x):
    if isinstance(x, str):  # some models send "E1, E3" or '["E1","E3"]'
        x = x.replace("[", "").replace("]", "").replace('"', "").replace("'", "").split(",")
    return [str(s).strip() for s in (x or []) if str(s).strip()]


def _arg(args, *keys, default=None):
    """First argument present among English keys (and the old Spanish ones, in case a model uses them)."""
    for k in keys:
        if args.get(k) not in (None, ""):
            return args[k]
    return default


# ---------- execution ----------
def execute(name, args):
    """Runs a tool and returns (arguments_used, result). arguments_used are in English (what the UI shows).
    Never raises: errors go in result['error']."""
    args = dict(args or {})
    used = args
    try:
        if name == "list_stations":
            _cache["stations"] = None
            return {}, {"estaciones": _stations()}

        if name == "station_info":
            id_ = resolve_id(_arg(args, "id", default=""))
            used = {"id": id_}
            if not id_:
                return used, {"error": "station id is empty"}
            r = requests.get(f"{API_URL}/estaciones/{id_}", timeout=TIMEOUT)

        elif name == "point_to_point_route":
            used = {"origin": resolve_id(_arg(args, "origin", "origen", default="HAB")),
                    "destination": resolve_id(_arg(args, "destination", "destino", default="")),
                    "max_slope_deg": _num(_arg(args, "max_slope_deg", "pendiente_max"), DEFAULT_SLOPE_DEG)}
            r = requests.post(f"{API_URL}/ruta", timeout=TIMEOUT,
                              json={"origen": used["origin"], "destino": used["destination"],
                                    "pendiente_max": used["max_slope_deg"]})

        elif name == "optimize_mission":
            used = {"stations": list(dict.fromkeys(resolve_id(s) for s in
                                                   _as_list(_arg(args, "stations", "estaciones")))),
                    "max_time_min": _num(_arg(args, "max_time_min", "tiempo_max_min"), DEFAULT_TIME_MIN),
                    "max_slope_deg": _num(_arg(args, "max_slope_deg", "pendiente_max"), DEFAULT_SLOPE_DEG)}
            if not [s for s in used["stations"] if s != "HAB"]:
                # "How many minutes does the walk take?" with no mission: the model tended to plan HAB -> HAB
                # and answer "0 minutes". Without stations to visit there is nothing to optimize: ask.
                return used, {"error": "No stations to visit. Do not plan anything: ask the astronaut which "
                                       "stations to visit, the time limit and the maximum slope."}
            r = requests.post(f"{API_URL}/mision", timeout=TIMEOUT,
                              json={"estaciones": used["stations"], "tiempo_max_min": used["max_time_min"],
                                    "pendiente_max": used["max_slope_deg"], "modo": "orientacion"})

        elif name == "reroute_for_alert":
            kind = str(_arg(args, "type", "tipo", default="dust")).lower()
            kind = "comms" if kind.startswith("com") else "dust"
            ref = _arg(args, "zone", "zona", default="")
            zone = resolve_zone(ref) if ref else ""
            if kind == "comms" and zone not in {z["id"] for z in _zones()}:
                # comms affects every edge, but the API requires a valid zone: use the first one in the graph
                zone = next((z["id"] for z in _zones()), "Z1")
            used = {"zone": zone, "type": kind}
            r = requests.post(f"{API_URL}/alerta", timeout=TIMEOUT,
                              json={"zona": zone, "tipo": "polvo" if kind == "dust" else "comms"})

        else:
            return args, {"error": f"Unknown tool: {name}"}

        if r.status_code >= 400:
            try:
                detail = r.json().get("detail", r.text)
            except ValueError:
                detail = r.text
            return used, {"error": detail, "status": r.status_code}
        return used, r.json()

    except requests.RequestException as e:
        return used, {"error": f"Could not reach the API ({API_URL}): {e}"}
