"""
Copilot loop: the model picks tools, we run them and give it back the result, until it answers in text.
Every number in the answer must come from a tool.

Project rule: the LLM never computes. Anything that must be subtracted or compared (for example, how much
time accepting 12° adds) is computed in this file and handed to the model as part of the result.
"""
import json
import re
import time

from ollama import Client

from config import DEFAULT_SLOPE_DEG, DEFAULT_TIME_MIN, KEEP_ALIVE, MAX_STEPS, MODEL, OLLAMA_TIMEOUT_S, OLLAMA_URL
from tools import (REASONS_EN, STATION_NAMES_EN, STATION_TASKS_EN, TOOLS, TYPES_EN, _norm, _stations, _zones,
                   execute, station_names, zone_in_text)

SYSTEM = """You are MarsWalk Copilot, the EVA (walk) planning assistant for Jezero crater, Mars.
You talk to the crew member in the habitat who supports the astronaut on the surface.

Rules:
1. Never compute routes, distances, times or differences yourself. Always call a tool and use ONLY the numbers it returns.
2. ALWAYS use the exact ids from the catalog below (E1, M1, HAB...). Never invent ids. If the user names a place that is not in the catalog, pass it as is and the tool will say it does not exist.
3. For one or more stations with a time limit use optimize_mission. Convert hours to minutes (3 hours = 180, 4 hours = 240).
4. If the user changes a condition ("what if I accept 12°?"), call optimize_mission again with the SAME stations as the previous mission and the new condition. Use "comparison_with_previous" to say what changed and how much time it adds or saves.
5. For alerts use reroute_for_alert and explain which legs were avoided:
   - storm, dust, wind or sand -> type "dust" with the zone id from the catalog ("dune field" -> its Z id).
   - lost communication, signal, radio or the relay -> type "comms" (no zone needed).
   If there is no previous mission, ask for a mission first.
6. For questions about a place ("what is at...?", "what task...?") use station_info and give its task and dwell time. The catalog below already has ids and names: do not call list_stations unless asked.
7. If no origin is given, start from the habitat (HAB). To go from one point to another without several stops use point_to_point_route.
8. If the place is not in the catalog (for example Olympus Mons), say it is not in the mission area, give no numbers and do not swap it for another station.
9. When a tool returns "summary", base your answer on that summary and do not add data from earlier answers.
10. Explain every skipped station with its reason and detail:
   - slope: "the gentlest path has X° and the limit is Y°"
   - time: "it does not fit in X minutes"
   - alert: "it is cut off by the alert in zone X"
   - comms: "there is no path with enough communication coverage"
   - not_found: "I do not know that station"
11. If a piece of data cannot be obtained with tools, ask. Do not invent.
12. ALWAYS answer in English, short and clear: route order with names, total time, margin and skipped stations. No tables or heavy markdown."""

# With a timeout: if the GPU laptop hangs, /chat answers with an error and the UI offers Plan B.
_client = Client(host=OLLAMA_URL, timeout=OLLAMA_TIMEOUT_S)
# Same options for chat and warm-up: if num_ctx changes, Ollama reloads the model.
_OPTIONS = {"temperature": 0, "num_ctx": 8192}
_LEG_FIELDS = ("origen", "destino", "distancia_m", "tiempo_min", "pendiente_max_deg", "cobertura_com_pct", "zonas")
_TOOL_NAMES = {t["function"]["name"] for t in TOOLS}
_MISSION_TOOLS = ("optimize_mission", "reroute_for_alert")

# State of the current conversation (the demo has a single user). Cleared with an empty history.
_STATE = {"mission": None, "result": None}


def reset():
    _STATE.update(mission=None, result=None)


# Engine error messages are in Spanish: translate the ones the copilot may show.
_ERRORS_EN = [
    (re.compile(r"no hay mision para recalcular", re.I), "there is no mission to recalculate"),
    (re.compile(r"zona (\S+) no existe", re.I), r"zone \1 does not exist"),
    (re.compile(r"estacion (\S+) no existe", re.I), r"station \1 does not exist"),
]


def _error_reason(content):
    """Readable text of a tool error: {"error": [{"msg": "zona Z9 no existe"}]} -> 'zone Z9 does not exist'."""
    try:
        err = json.loads(content).get("error", content)
    except (ValueError, AttributeError):
        err = str(content)
    if isinstance(err, list):
        err = "; ".join(str(e.get("msg", e)) if isinstance(e, dict) else str(e) for e in err)
    elif isinstance(err, dict):
        err = str(err.get("detail") or err.get("msg") or err)
    err = str(err)
    for pattern, english in _ERRORS_EN:
        err = pattern.sub(english, err)
    return err[:200]


def warm_up(model=None):
    """Loads the model on the GPU without generating anything (empty prompt), so the first demo question
    does not wait for the load. Keeps it loaded for KEEP_ALIVE. Returns {model, seconds} or {error}."""
    model = model or MODEL
    t0 = time.time()
    try:
        _client.generate(model=model, prompt="", options=_OPTIONS, keep_alive=KEEP_ALIVE)
    except Exception as e:  # Ollama down or model not downloaded
        return {"model": model, "error": f"{type(e).__name__}: {e}"}
    return {"model": model, "seconds": round(time.time() - t0, 1), "keep_alive": KEEP_ALIVE}


# ---------------------------------------------------------------- English view of engine results
_KEYS_EN = {
    "factible": "feasible", "ruta": "route", "tramos": "legs", "omitidas": "skipped", "totales": "totals",
    "distancia_m": "distance_m", "tiempo_min": "time_min", "margen_min": "margin_min",
    "dosis_rel": "relative_dose", "aristas_afectadas": "affected_edges", "origen": "origin",
    "destino": "destination", "pendiente_max_deg": "max_slope_deg", "cobertura_com_pct": "comms_coverage_pct",
    "zonas": "zones", "zona": "zone", "detalle": "detail", "motivo": "reason", "limite": "limit",
    "tiempo_max_min": "max_time_min", "umbral": "threshold", "estaciones": "stations", "tipo": "type",
    "tarea": "task", "permanencia_min": "dwell_min", "valor_cientifico": "science_value",
    "elev_m": "elevation_m", "unidad_geologica": "geologic_unit", "pendiente_deg": "slope_deg",
    "inclinacion_rover_max_deg": "rover_max_tilt_deg", "foto_sol": "photo_sol",
    "capas": "layers", "themis_noche": "themis_night", "themis_dia": "themis_day",
}
_DROP = {"fotos", "foto_url", "foto_camara", "geometria", "verificacion", "fuente_principal", "nombre", "lon",
         "lat", "waypoint_sol"}


def _en(obj):
    """Engine JSON (Spanish keys) -> English keys and values, for the model."""
    if isinstance(obj, list):
        return [_en(x) for x in obj]
    if not isinstance(obj, dict):
        return obj
    out = {}
    for k, v in obj.items():
        if k in _DROP:
            continue
        if k == "motivo":
            v = REASONS_EN.get(v, v)
        elif k == "tipo":
            v = TYPES_EN.get(v, v)
        out[_KEYS_EN.get(k, k)] = _en(v)
    if "id" in obj and ("nombre" in obj or "name" in obj):
        out["name"] = STATION_NAMES_EN.get(obj["id"], obj.get("name") or obj.get("nombre"))
    if "tarea" in obj:
        out["task"] = STATION_TASKS_EN.get(obj["id"], obj["tarea"])
    return out


# ---------------------------------------------------------------- helpers for the model
def _visited(requested, res):
    skipped = {o["id"] for o in res.get("omitidas", [])}
    return [s for s in requested if s not in skipped and s in res.get("ruta", [])]


def _compare(previous, new, requested_prev, requested_new):
    """Differences between two missions, computed by code (not by the LLM)."""
    if not previous or not previous.get("totales") or not new.get("totales"):
        return None
    vp, vn = _visited(requested_prev, previous), _visited(requested_new, new)
    tp, tn = previous["totales"].get("tiempo_min"), new["totales"].get("tiempo_min")
    if tp is None or tn is None:
        return None
    return {"previous_time_min": tp, "new_time_min": tn,
            "time_difference_min": round(tn - tp, 1),
            "stations_added": [s for s in vn if s not in vp],
            "stations_removed": [s for s in vp if s not in vn]}


def _f(x):
    """Number for a sentence; "?" if the engine did not send it (avoids crashing on None)."""
    return "?" if x is None else (f"{x:g}" if isinstance(x, (int, float)) else str(x))


def _reason_text(o, names):
    n, d = names.get(o["id"], o["id"]), o.get("detalle") or {}
    m = o.get("motivo")
    if m == "pendiente":
        return f"{n}: the gentlest path has {_f(d.get('pendiente_max_deg'))}° and the limit is {_f(d.get('limite'))}°"
    if m == "tiempo":
        return f"{n}: does not fit in {_f(d.get('tiempo_max_min'))} min"
    if m == "alerta":
        return f"{n}: cut off by the alert in {', '.join(d.get('zonas') or [])}"
    if m == "comms":
        return f"{n}: no path with enough communication coverage"
    if m == "no_existe":
        return f"{o['id']}: not on the map"
    return f"{n}: {REASONS_EN.get(m, m)}"


def summary(res, names):
    """Summary of a mission result built by code: the model only has to phrase it."""
    if not isinstance(res, dict) or "totales" not in res:
        return None
    if not res.get("ruta"):
        parts = ["There is no feasible route with those conditions."]
    else:
        t = res["totales"]
        parts = [f"Route: {' → '.join(names.get(i, i) for i in res['ruta'])}.",
                 f"Total time: {t.get('tiempo_min')} min. Distance: {t.get('distancia_m')} m."]
        if t.get("margen_min") is not None:
            parts.append(f"Margin: {t['margen_min']} min.")
    skipped = res.get("omitidas") or []
    parts.append("Skipped: " + ("; ".join(_reason_text(o, names) for o in skipped) if skipped else "none") + ".")
    c = res.get("comparison_with_previous")
    if c:
        sign = "+" if c["time_difference_min"] >= 0 else ""
        parts.append(f"Compared with the previous mission: {sign}{c['time_difference_min']} min "
                     f"(from {c['previous_time_min']} to {c['new_time_min']} min); "
                     f"added: {', '.join(names.get(s, s) for s in c['stations_added']) or 'none'}; "
                     f"removed: {', '.join(names.get(s, s) for s in c['stations_removed']) or 'none'}.")
    if res.get("aristas_afectadas") is not None:
        avoided = [" → ".join(names.get(x, x) for x in a.split("->")) for a in res["aristas_afectadas"]]
        parts.append("Legs of the previous route that crossed the zone and were avoided: "
                     + ("; ".join(avoided) if avoided else "none") + ".")
    return " ".join(parts)


def _for_model(res, names, tool_name=""):
    """Drops geometry and heavy fields (fewer tokens = faster), translates to English, adds names to ids and,
    for missions, a code-built summary the model only has to phrase."""
    if not isinstance(res, dict):
        return res
    if "error" in res:
        return {"error": _error_reason(json.dumps(res, ensure_ascii=False))}
    if tool_name in _MISSION_TOOLS and "totales" in res:
        return {"summary": summary(res, names), "feasible": res.get("factible"),
                "route": res.get("ruta"), "totals": _en(res.get("totales")),
                "skipped": _en(res.get("omitidas")),
                "comparison_with_previous": res.get("comparison_with_previous"),
                "affected_edges": res.get("aristas_afectadas")}
    out = dict(res)
    if "tramos" in out:
        out["tramos"] = [{k: t.get(k) for k in _LEG_FIELDS} for t in out["tramos"]]
    out = _en(out)
    if out.get("route"):
        out["route_names"] = [names.get(i, i) for i in out["route"]]
    if out.get("skipped"):
        out["skipped"] = [{**o, "name": names.get(o["id"], o["id"])} for o in out["skipped"]]
    if isinstance(out.get("stations"), list):
        out["stations"] = [{k: e.get(k) for k in ("id", "name", "type", "science_value")} for e in out["stations"]]
    return out


def _catalog(names):
    """Station and zone ids and names (not the graph): so the model does not invent ids."""
    if not names:
        return ""
    types = {e["id"]: TYPES_EN.get(e["tipo"], e["tipo"]) for e in _stations()}
    lines = ["\n\nStation catalog (id: name, type):"]
    lines += [f"- {i}: {n} ({types.get(i, '')})" for i, n in names.items()]
    zones = _zones()
    if zones:
        lines.append("Alert zones: " + "; ".join(f"{z['id']}: {z['name']}" for z in zones))
    return "\n".join(lines)


def _mission_context(names):
    m = _STATE["mission"]
    if not m:
        return ""
    stations = ", ".join(f"{s} ({names.get(s, s)})" for s in m["stations"])
    return (f"\n\nPrevious mission in this conversation: stations [{stations}], "
            f"max_time_min={m['max_time_min']:g}, max_slope_deg={m['max_slope_deg']:g}.")


# ---------------------------------------------------------------- unsourced numbers
def _allowed_numbers(texts):
    nums = set()
    for t in texts:
        for n in re.findall(r"\d+(?:[.,]\d+)?", t):
            v = float(n.replace(",", "."))
            nums.update({v, round(v), round(v, 1)})
            if v >= 60:  # allows expressing minutes as hours and minutes
                nums.update({float(int(v) // 60), float(round(v) % 60), round(v / 60, 1), round(v / 60, 2)})
            if v >= 1000:  # meters as km
                nums.update({round(v / 1000, 1), round(v / 1000, 2)})
    return nums


def unsourced_numbers(answer, sources):
    """Numbers in the answer that do not appear in any source (tool results or user messages)."""
    allowed = _allowed_numbers(sources)
    clean = re.sub(r"\b[A-Z]{1,3}\d+\b", " ", answer)          # ids like E1, Z2, M1
    clean = re.sub(r"(?m)^\s*\d+[.)]\s", " ", clean)           # numbered bullets
    clean = re.sub(r"(?<=\d)[.,](?=\d{3}\b)", "", clean)       # thousands separator: 6.833 / 6,833
    return [n for n in re.findall(r"\d+(?:[.,]\d+)?", clean)
            if float(n.replace(",", ".")) not in allowed]


# ---------------------------------------------------------------- fallback
def _calls_in_text(text):
    """Some small models write the call as JSON in the text instead of using tool_calls."""
    calls = []
    for m in re.finditer(r"\{[^{}]*\"name\"\s*:\s*\"(\w+)\"[^{}]*(\{[^{}]*\})?[^{}]*\}", text or ""):
        try:
            obj = json.loads(m.group(0))
        except ValueError:
            continue
        if obj.get("name") in _TOOL_NAMES:
            args = obj.get("arguments") or obj.get("parameters") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except ValueError:
                    args = {}
            calls.append((obj["name"], args))
    if calls:
        return calls
    # Format 'station_info {"id": "M1"}' or 'station_info({...})'
    for name in _TOOL_NAMES:
        m = re.search(re.escape(name) + r"\W{0,3}(\{[^{}]*\})", text or "")
        if m:
            try:
                calls.append((name, json.loads(m.group(1))))
            except ValueError:
                pass
    return calls


_RE_DUST = re.compile(r"\b(dust|polvo|storm|tormenta|sand|arena)", re.I)
_RE_COMMS = re.compile(r"\b(comms|communications?|comunicaci|radio|signal|se[ñn]al|contact)", re.I)
# A comms term alone ("which station has the best signal?") is not an alert: it needs an event or "alert".
_RE_COMMS_EVENT = re.compile(r"\b(lost|lose|losing|loss|down|dropped|drop|no|without|blackout|outage|fail\w*|cut"
                             r"|alert|alerta|perdimos|perdi\w*|sin|ca[ií]d\w*)\b", re.I)
_RE_ZONE = re.compile(r"\b(?:z|zone|zona)\s*-?\s*(\d+)\b", re.I)


def detect_alert(message):
    """If the message is an alert, returns the reroute_for_alert arguments (no LLM).
    Small models tend to 'recalculate' from memory; this forces the tool."""
    if _RE_COMMS.search(message) and _RE_COMMS_EVENT.search(message):
        return {"type": "comms", "zone": ""}
    if not _RE_DUST.search(message):
        return None
    m = _RE_ZONE.search(message)
    if m:
        return {"type": "dust", "zone": f"Z{m.group(1)}"}
    zone = zone_in_text(_norm(message))
    return {"type": "dust", "zone": zone} if zone else None  # no zone: let the model ask which one


_RE_SLOPE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:°|º|degrees?|deg|grados?)", re.I)
# '4 hours', '3h30', '1h 30min', '3 hours and 30 minutes'
_RE_HOURS = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|horas?|h)(?![a-z])"
                       r"(?:(\d{1,2})(?!\d)|\s*(?:and\s+|y\s+)?(\d{1,3})\s*(?:minutes?|mins?|minutos?|m)\b)?", re.I)
# minutes as a limit, not as a change ('30 minutes longer' is not a 30 min limit)
_RE_MINUTES = re.compile(r"(\d+)\s*(?:minutes?|minutos?|mins?)\b(?!\s*(?:longer|more|extra|less|shorter|m[aá]s"
                         r"|menos))", re.I)


def _time_limit(message):
    """Time limit in minutes said in the message, or None."""
    h = _RE_HOURS.search(message)
    if h:
        return float(h.group(1).replace(",", ".")) * 60 + float(h.group(2) or h.group(3) or 0)
    mi = _RE_MINUTES.search(message)
    return float(mi.group(1)) if mi else None

# Words from catalog names that do not identify a station (repeated or generic)
_COMMON_WORDS = {"delta", "front", "outcrop", "base", "south", "north", "northern", "plain", "support", "habitat",
                 "octavia", "butler", "depot", "sample", "shelter", "three", "relay", "floor", "rover",
                 "muestras", "afloramiento", "fondo", "llanura", "norte", "apoyo", "deposito", "refugio", "frente"}
_RE_REQUEST = re.compile(r"\b(visit|go to|mission|plan|eva|walk|traverse|visitar|quiero|ir a|mision|caminata)\b")
_RE_SAMPLING = re.compile(r"\bsampling (points?|sites?|stations?)\b|\b(puntos?|sitios?|estaciones?) de muestreo\b")


def _aliases(station):
    """Phrases and words a station can be called by, in English and Spanish:
    'Upper delta (Upper Fan)' -> {'upper delta', 'upper fan', 'upper'}; 'South Séítah, Brac outcrop' ->
    {'south seitah', 'brac outcrop', 'seitah', 'brac'}."""
    aliases = set()
    for name in (station.get("name"), station.get("nombre")):
        if not name:
            continue
        # split before normalizing: _norm removes commas
        phrases = {_norm(f) for f in name.replace("(", ",").replace(")", ",").split(",") if _norm(f)}
        words = {p for f in phrases for p in f.split() if len(p) >= 5 and p not in _COMMON_WORDS}
        aliases |= phrases | words
    return aliases


def _names_station(text):
    """True if the (normalized) text names a station by id or by a distinctive word of its name."""
    try:
        stations = _stations()
    except Exception:
        return False
    for e in stations:
        if re.search(rf"\b{re.escape(e['id'].lower())}\b", text):
            return True
        if any(re.search(rf"\b{re.escape(a)}\b", text) for a in _aliases(e) if a not in _COMMON_WORDS):
            return True
    return False


def detect_change(message):
    """'What if I accept up to 12°?' after a mission -> same mission with the new condition (no LLM).
    If the message names stations it is not forced: the model handles it."""
    m = _STATE["mission"]
    if not m:
        return None
    if _names_station(_norm(message)):
        return None
    new = dict(m)
    p, limit = _RE_SLOPE.search(message), _time_limit(message)
    if p:
        new["max_slope_deg"] = float(p.group(1).replace(",", "."))
    if limit is not None:
        new["max_time_min"] = limit
    if new == m:
        return None
    return {k: new[k] for k in ("stations", "max_time_min", "max_slope_deg")}


def detect_mission(message):
    """'I want to visit the delta front, the two sampling points and the upper delta, back in under 4 hours,
    no slopes over 8°' -> optimize_mission arguments (no LLM).

    Only if it is a mission request that names at least 2 stations and gives a time or a slope; otherwise the
    model handles it. With qwen2.5:3b this question went wrong 3 out of 4 times (invented stations or minutes)."""
    text = _norm(message)
    if not _RE_REQUEST.search(text):
        return None
    try:
        stations = [e for e in _stations() if e.get("tipo") != "habitat"]
    except Exception:
        return None
    ids = []
    for e in stations:
        if re.search(rf"\b{re.escape(e['id'].lower())}\b", text) or \
                any(re.search(rf"\b{re.escape(a)}\b", text) for a in _aliases(e)):
            ids.append(e["id"])
    if _RE_SAMPLING.search(text):
        ids += [e["id"] for e in stations if e.get("tipo") == "muestreo"]
    ids = list(dict.fromkeys(ids))
    p, limit = _RE_SLOPE.search(message), _time_limit(message)
    if len(ids) < 2 or not (p or limit is not None):
        return None
    max_time = limit if limit is not None else DEFAULT_TIME_MIN
    max_slope = float(p.group(1).replace(",", ".")) if p else DEFAULT_SLOPE_DEG
    return {"stations": ids, "max_time_min": max_time, "max_slope_deg": max_slope}


def normalize_history(history):
    """Accepts {role, content} (contract and Ollama) or the old {rol, contenido}."""
    out = []
    for h in history or []:
        role = h.get("role") or {"usuario": "user", "asistente": "assistant"}.get(h.get("rol"), h.get("rol"))
        content = h.get("content", h.get("contenido", ""))
        if role in ("user", "assistant") and content:
            out.append({"role": role, "content": str(content)})
    return out


# ---------------------------------------------------------------- main loop
def _run_and_record(name, args, calls, sources, names):
    used, res = execute(name, args)
    ok = isinstance(res, dict) and "error" not in res
    route = None
    if ok and name in _MISSION_TOOLS and "tramos" in res:
        requested = used.get("stations") or (_STATE["mission"] or {}).get("stations", [])
        requested_prev = (_STATE["mission"] or {}).get("stations", [])
        comp = _compare(_STATE["result"], res, requested_prev, requested)
        if comp:
            res = {**res, "comparison_with_previous": comp}
        if name == "optimize_mission":
            _STATE["mission"] = used
        _STATE["result"] = res
        route = res
    elif ok and name == "point_to_point_route" and "tramos" in res:
        route = res
    calls.append({"tool": name, "arguments": used, "ok": ok})
    content = json.dumps(_for_model(res, names, name), ensure_ascii=False)
    sources.append(content)
    return content, route


def respond(message, history=None, model=None):
    """
    Returns the POST /chat format (contracts/api.md):
      {answer, calls: [{tool, arguments, ok}], route, history, seconds, unsourced_numbers, error (if it failed)}
    history: list of {"role": "user"|"assistant", "content": str}.
    `route` keeps the engine's MissionResponse shape (the map draws it as is), plus
    `comparison_with_previous` when it follows another mission.
    """
    model = model or MODEL
    history = normalize_history(history)
    if not history:
        reset()
    names = station_names()
    messages = ([{"role": "system", "content": SYSTEM + _catalog(names) + _mission_context(names)}]
                + history + [{"role": "user", "content": message}])
    calls, route, sources = [], None, [message] + [h["content"] for h in history]
    t0 = time.time()
    text, retried = None, False

    def output(answer, error=None):
        hist = history + [{"role": "user", "content": message}, {"role": "assistant", "content": answer}]
        out = {"answer": answer, "calls": calls, "route": route,
               "history": hist, "seconds": round(time.time() - t0, 1),
               "unsourced_numbers": unsourced_numbers(answer, sources) if not error else []}
        if error:
            out["error"] = error
        return out

    def run_batch(requested):
        nonlocal route
        for name, args in requested:
            content, new_route = _run_and_record(name, args, calls, sources, names)
            route = new_route or route
            messages.append({"role": "tool", "content": content, "tool_name": name})

    # Alerts, mission requests and condition changes: the tool is always called, it does not depend on the
    # model remembering to call it or picking the right arguments.
    # A mission request goes first: "plan E1 and M2 in 3 hours, avoid the dust in Z2" is a mission, not an alert.
    request = detect_mission(message)
    forced = ("optimize_mission", request) if request else None
    if not forced:
        alert = detect_alert(message)
        forced = ("reroute_for_alert", alert) if alert else None
    if not forced and history:
        change = detect_change(message)
        forced = ("optimize_mission", change) if change else None
    if forced:
        messages.append({"role": "assistant", "content": "",
                         "tool_calls": [{"function": {"name": forced[0], "arguments": forced[1]}}]})
        run_batch([forced])
        if calls and not calls[-1]["ok"]:
            # If it fails, the model does not phrase it: it tends to repeat the previous route as if it were new.
            return output(f"I could not recalculate: {_error_reason(messages[-1]['content'])}. "
                          "The previous route is still valid; use the mission form if needed.")

    # With the tool already called by code, the model only phrases the answer: no tools, so it does not ask
    # for others (e.g. point_to_point_route) that would overwrite the mission route.
    tools = None if forced else TOOLS
    for _ in range(MAX_STEPS):
        try:
            r = _client.chat(model=model, messages=messages, tools=tools,
                             options=_OPTIONS, keep_alive=KEEP_ALIVE)
        except Exception as e:  # Ollama down, model not downloaded, etc.
            return output(f"The copilot is not available ({type(e).__name__}). Use the mission form.", str(e))
        msg = r.message
        requested = [(tc.function.name, dict(tc.function.arguments or {})) for tc in (msg.tool_calls or [])]
        if not requested:
            requested = _calls_in_text(msg.content)
            if requested:
                msg = {"role": "assistant", "content": "",
                       "tool_calls": [{"function": {"name": n, "arguments": a}} for n, a in requested]}
        if requested:
            messages.append(msg)
            run_batch(requested)
            continue
        text = msg.content or ""
        bad = unsourced_numbers(text, sources)
        if bad and not retried:
            # A second chance: use a tool instead of inventing.
            retried = True
            messages += [{"role": "assistant", "content": text},
                         {"role": "user", "content": f"Check your answer: the numbers {', '.join(bad)} do not come "
                                                     "from any tool. Call the right tool and answer using only its "
                                                     "data, in English."}]
            text = None
            continue
        break

    if text and unsourced_numbers(text, sources):
        # It kept inventing: the code-built summary is better than a fake number in the demo.
        text = summary(route, names) if route else \
            "I do not have that data computed yet. Tell me which stations, max time and max slope you want."
    if not text or not text.strip():
        text = summary(route, names) if route else \
            "I could not complete the calculation. Try rephrasing the request or use the mission form."
    sources.append(text)
    return output(text)
