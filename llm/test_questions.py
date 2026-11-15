"""
Tests the copilot with the demo questions and one or more models.
Requires: Ollama running and the engine (or the mock) at API_URL.

Usage:
    python test_questions.py                      # uses MODEL from .env
    python test_questions.py qwen2.5:3b qwen2.5:7b

Each case checks: the expected tool, the key arguments and that there are no unsourced numbers.
Demo with the real graph.json (data/out/): at 8° the upper delta (E2) is skipped for slope and at 12° it is
included (see data/HALLAZGO_pendiente_demo.md). Checked on the Sat 14 graph: 8° -> 164.8 min without E2,
12° -> 200.6 min with E2, dust in Z2 -> 230.9 min.
"""
import json
import re
import sys

import requests

from agent import phrasing_problems, respond
from tools import station_names
from config import API_URL, MODEL


def args_of(r, tool):
    return next((c["arguments"] for c in reversed(r["calls"]) if c["tool"] == tool and c["ok"]), None)


DEMO_SLOPE_1 = 8   # E2 skipped for slope
DEMO_SLOPE_2 = 12  # E2 included
ALL_IDS = {"HAB", "ROV", "E1", "M1", "M2", "E2", "REF", "COM"}


def check_demo1(r):
    a = args_of(r, "optimize_mission")
    return bool(a) and set(a["stations"]) == {"E1", "M1", "M2", "E2"} and a["max_slope_deg"] == DEMO_SLOPE_1 \
        and a["max_time_min"] == 240 and bool(r["route"]) \
        and any(o["id"] == "E2" and o["motivo"] == "pendiente" for o in r["route"]["omitidas"])


def check_demo2(r):
    # Compared with the 8° mission (not with itself): E2 added, time added and said in the answer
    a = args_of(r, "optimize_mission")
    comp = (r["route"] or {}).get("comparison_with_previous") or {}
    return bool(a) and "E2" in a["stations"] and a["max_slope_deg"] == DEMO_SLOPE_2 \
        and bool(r["route"]) and "E2" in r["route"]["ruta"] \
        and comp.get("stations_added") == ["E2"] and (comp.get("time_difference_min") or 0) > 0 \
        and f"{comp['time_difference_min']:g}" in r["answer"]


def check_dust_z2(r):
    a = args_of(r, "reroute_for_alert")
    return bool(a) and a["zone"] == "Z2" and a["type"] == "dust"


def check_comms(r):
    # Global alert: no zone in the call and the answer says it applies to the whole map
    a = args_of(r, "reroute_for_alert")
    return bool(a) and a["type"] == "comms" and "zone" not in a \
        and bool(re.search(r"global|whole map|entire map|all legs", r["answer"], re.I))


def check_info_m1(r):
    a = args_of(r, "station_info")
    return bool(a) and a["id"] == "M1"


def check_alias_e1(r):
    a = args_of(r, "station_info")
    return bool(a) and a["id"] == "E1"


def check_three_hours(r):
    # Delta front + upper delta in 3 hours at 12°: it must plan it and give a route
    a = args_of(r, "optimize_mission")
    return bool(a) and set(a["stations"]) == {"E1", "E2"} and a["max_time_min"] == 180 \
        and a["max_slope_deg"] == 12 and bool(r["route"])


def check_short_mission(r):
    a = args_of(r, "optimize_mission")
    return bool(a) and {"E1", "M2"} <= set(a["stations"]) and a["max_time_min"] == 120


def check_route_m1(r):
    a = args_of(r, "point_to_point_route")
    return bool(a) and a["origin"] == "HAB" and a["destination"] == "M1" and a["max_slope_deg"] == 8


def check_route_shelter(r):
    a = args_of(r, "point_to_point_route")
    return bool(a) and a["origin"] == "HAB" and a["destination"] == "REF"


def check_not_found(r):
    # Enough that it says it does not exist (with or without calling the tool) and invents no data for E9
    asks_e9 = any("E9" in json.dumps(c["arguments"]) for c in r["calls"])
    says_no = re.search(r"not (exist|found|in the (catalog|mission))|does ?n[o']t exist|unknown|no such",
                        r["answer"], re.I)
    return (asks_e9 or bool(says_no)) and not r["unsourced_numbers"]


def check_trap(r):
    # No mission and no stations: it must ask, not invent numbers or plan an empty walk (only HAB -> "0 minutes")
    # nor plan a walk to stations the user never named
    planned = any(c["ok"] and c["tool"] == "optimize_mission" for c in r["calls"])
    return not r["unsourced_numbers"] and not planned


def check_outside_area(r):
    # Olympus Mons is not in the catalog: no invented data and no route to a real station instead
    return not r["unsourced_numbers"] and not any(
        c["ok"] and c["tool"] == "point_to_point_route" and c["arguments"].get("destination") in ALL_IDS
        for c in r["calls"])


# Demo conversation: each question sees the history of the previous one
DEMO = [
    ("demo-1 mission", "I want to visit the delta front, the two sampling points (Séítah and Three Forks) and the "
                       "upper delta, back in under 4 hours and with no slopes over 8 degrees.", check_demo1),
    ("demo-2 change", "What if I accept up to 12°?", check_demo2),
    ("demo-3 alert", "Dust alert in zone Z2. Recalculate.", check_dust_z2),
    # Off script, but it can happen live: a second alert on the same mission
    ("comms", "We lost communication with the habitat, recalculate the route.", check_comms),
]
# Live variants: a short mission and then alerts phrased differently (they need a previous mission)
ALERTS = [
    ("short mission", "Plan an EVA to the delta front and the Three Forks depot, back in 2 hours, max slope 15 degrees.",
     check_short_mission),
    ("dust by name", "A dust storm is coming over the dune field, what do we do?", check_dust_z2),
    ("lost relay", "We lost the signal from the relay antenna, recalculate the route.", check_comms),
]
# Single questions (no history)
SINGLE = [
    ("info", "What task has to be done at South Séítah and how long does it take?", check_info_m1),
    ("alias", "What is at Amalik?", check_alias_e1),
    ("route shelter", "How do I get from the habitat to the Hawksbill Gap shelter without going over 15 degrees?",
     check_route_shelter),
    ("route time", "I want to go from the habitat to the delta front, max slope 15 degrees. How long?",
     lambda r: bool(args_of(r, "point_to_point_route") or args_of(r, "optimize_mission"))),
    ("outside area", "How long does it take to get to Olympus Mons?", check_outside_area),
    ("trap", "How many minutes does the walk take?", check_trap),  # no mission: it must ask, not invent
    ("three hours", "I want to visit the delta front and the upper delta, back in under 3 hours, "
                    "with no slopes over 12°.", check_three_hours),
    ("route slope", "How do I get from the habitat to Séítah with a maximum slope of 8 degrees?", check_route_m1),
    ("not found", "What has to be done at station E9?", check_not_found),
]


def conversation(model, cases):
    requests.post(f"{API_URL}/reset", timeout=10)
    rows, hist = [], []
    for name, question, check in cases:
        rows.append(run_case(model, name, question, check, hist))
        hist = rows[-1]["history"]
    return rows


def run_all(model):
    rows = conversation(model, DEMO) + conversation(model, ALERTS)
    requests.post(f"{API_URL}/reset", timeout=10)
    for name, question, check in SINGLE:
        rows.append(run_case(model, name, question, check, []))
    return rows


_ERROR_ANSWER = re.compile(r"^\s*(the copilot is not available|i could not)", re.I)


def failure_reason(r):
    """Why the answer is an error (agent.py: 'error' field when Ollama fails, or an 'I could not...' answer
    when the engine rejects a forced call), or None."""
    if r.get("error"):
        return f"error: {str(r['error'])[:80]}"
    if _ERROR_ANSWER.search(r["answer"]):
        return "error answer"
    return None


def run_case(model, name, question, check, hist):
    print(f"\n=== [{model}] {name}: {question}")
    try:
        r = respond(question, hist, model=model)
    except Exception as e:
        print("   ERROR:", repr(e))
        return {"name": name, "ok": False, "seconds": None, "unsourced": ["ERROR"], "history": hist}
    for c in r["calls"]:
        print(f"   -> {c['tool']}({json.dumps(c['arguments'], ensure_ascii=False)})" + ("" if c["ok"] else "  ERROR"))
    print("   Answer:", r["answer"].strip().replace("\n", "\n           "))
    # An error answer never passes, even if the tool call before it was right (e.g. Ollama timed out
    # while writing the answer: the tool args were fine but the astronaut got no route)
    failed = failure_reason(r)
    # Right numbers are not enough: the wording must match the engine result (stations, reasons, comparison)
    wording = phrasing_problems(r["answer"], r["route"], station_names()) if r.get("route") else []
    if wording and not failed:
        failed = "wording: " + "; ".join(wording)
    ok = not failed and (check(r) if check else not r["unsourced_numbers"])
    print(f"   Time: {r['seconds']} s | check: {'OK' if ok else 'FAIL'}"
          + (f" ({failed})" if failed else "")
          + (f" | answer from {r['fallback']}" if r.get("fallback") else "")
          + f" | unsourced numbers: {r['unsourced_numbers'] or 'none'}")
    return {"name": name, "ok": ok, "seconds": r["seconds"],
            "unsourced": r["unsourced_numbers"], "history": r["history"]}


if __name__ == "__main__":
    models = sys.argv[1:] or [MODEL]
    results = {m: run_all(m) for m in models}
    print("\n\n===== SUMMARY =====")
    for m, rows in results.items():
        ok = sum(f["ok"] for f in rows)
        clean = sum(not f["unsourced"] for f in rows)
        times = [f["seconds"] for f in rows if f["seconds"] is not None]
        avg = round(sum(times) / len(times), 1) if times else None
        print(f"{m}: checks {ok}/{len(rows)} | no invented numbers {clean}/{len(rows)} | "
              f"average {avg} s per question")
        for f in rows:
            print(f"   {f['name']:<15} {'OK  ' if f['ok'] else 'FAIL'}  {f['seconds']} s  unsourced: {f['unsourced'] or '-'}")
