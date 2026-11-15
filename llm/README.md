# llm/ — MarsWalk copilot (Manuel, L3)

The model picks tools; the API computes. Every number in an answer comes from a tool
(or from a subtraction done by code in `agent.py`, never by the LLM). The copilot always answers in English.

## Files

| File | What it does |
| --- | --- |
| `config.py` | Reads `.env`: `OLLAMA_URL`, `MODEL`, `API_URL` and the `params.yaml` defaults (15°, 240 min). The old Spanish names (`MODELO`, `PENDIENTE_DEFAULT`, `TIEMPO_DEFAULT`, `MAX_PASOS`) still work |
| `tools.py` | The 5 tools (schemas + HTTP calls). English tool names and arguments, translated to the engine's Spanish fields. Accepts English or Spanish station and zone names as well as ids. English names come from `web/shared/i18n_en.json`, the same file the screen uses |
| `agent.py` | Copilot loop, system prompt with the station catalog (English names), comparison with the previous mission and unsourced-number detector |
| `router.py` | `POST /chat` (+ `/chat/reset`, `/chat/warmup`, `/chat/status`) as an APIRouter, mounted by `engine/main.py` |
| `mock_api.py` | Fake API with the `contracts/api.md` contract, over `contracts/graph_fake.json` |
| `test_questions.py` | The demo conversation + alert variants + single questions, per model (needs Ollama) |
| `tests/test_offline.py` | 51 tests without Ollama: tools, detectors, translations, demo flow and `/chat`, against the real engine started inside the test |

## Tools

| Tool | Arguments | Engine endpoint |
| --- | --- | --- |
| `list_stations` | — | GET `/estaciones` |
| `station_info` | `id` | GET `/estaciones/{id}` |
| `point_to_point_route` | `origin`, `destination`, `max_slope_deg` | POST `/ruta` |
| `optimize_mission` | `stations`, `max_time_min`, `max_slope_deg` | POST `/mision` |
| `reroute_for_alert` | `zone`, `type` (`dust` \| `comms`) | POST `/alerta` |

## Run on Windows (PowerShell, inside `llm/`)

```
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
ollama pull qwen2.5:3b
```

Terminal 1, the fake API (includes `/chat`):
```
uvicorn mock_api:app --port 8001 --reload
```

Terminal 2, the tests (with `API_URL=http://127.0.0.1:8001` in `.env`):
```
python test_questions.py qwen2.5:3b
```

With the real engine (from the repo root): `python -m uvicorn engine.main:app --port 8000` and
`API_URL=http://127.0.0.1:8000`. The engine already mounts `/chat`.

Using the GPU of another laptop on the same network: on that laptop run Ollama with `OLLAMA_HOST=0.0.0.0`,
and here set `OLLAMA_URL=http://<its-IP>:11434`.

## Tests without the model

From the repo root (with `engine/requirements-dev.txt` and `llm/requirements.txt` installed):
```
python -m pytest llm/tests -q
```
They start the real engine with `data/out/graph.json`. If the graph changes (a new station, a renamed zone,
the 8°/12° demo no longer separating E2), a test fails and says what to update. New station or zone names go in
`web/shared/i18n_en.json`: the screen and the copilot both read it.

## `/chat` (contracts/api.md)

```json
// request
{"message": "What if I accept up to 12°?",
 "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
// response
{"answer": "text",
 "calls": [{"tool": "optimize_mission", "arguments": {"stations": ["E1","M1","M2","E2"], "max_time_min": 240, "max_slope_deg": 12}, "ok": true}],
 "route": {"...": "engine MissionResponse or null"},
 "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}],
 "seconds": 2.1, "unsourced_numbers": []}
```

- `route` keeps the engine shape (`ruta`, `tramos`, `omitidas`, `totales`...): the map draws it as is. On an alert
  it also has `aristas_afectadas`. If the mission follows another one it has `comparison_with_previous`
  (`time_difference_min`, `stations_added`, `stations_removed`, `previous_time_min`, `new_time_min`).
- If `error` is present (Ollama down, model not downloaded) the UI shows the Plan B form, which calls `/mision`.
- An empty `history` starts a new conversation (forgets the previous mission).

## Guarantees against invented numbers

1. The prompt forbids computing; the tools return everything that has to be said.
2. Differences between missions (demo 2: "how much time it adds") are computed by `agent.py`, not by the model.
3. `unsourced_numbers` lists any number in the answer that does not appear in a tool result or in what the user
   wrote (with min↔h and m↔km conversion). If it is not empty, the test flags it.
4. If the answer has unsourced numbers, the model is asked to fix it once; if it insists, the answer is the
   code-built summary (or a request for the missing data). Same if the model does not answer at all.
5. Alerts ("dust alert in Z2", "we lost communication"), condition changes on the previous mission
   ("what if I accept 12°?", "what if I have 3 hours?") and mission requests that name 2+ stations with a
   time or slope are detected by code and the tool is always called: small models tended to answer from memory.
   After a forced call the model only phrases the answer and gets no tools.

## Plan B

If the LLM fails live: Axl's form → `POST /mision`.

## Results with GPU and the real engine (Sun 15, English version)

RTX 3050 laptop (4 GB, model 100% on GPU), `qwen2.5:3b`, the API in Docker (`docker compose up`) with the real
`graph.json`. `test_questions.py`: 16/16 checks, 0 invented numbers, 2.5 s per question on average.

| Demo question | Time | Result |
| --- | --- | --- |
| 1. Mission at 8° | 2.7 s | 164.8 min, margin 75.2; E2 skipped for slope |
| 2. "What if I accept up to 12°?" | 3.1 s | 200.6 min, +35.8 min, E2 added |
| 3. Dust alert in Z2 | 3.8 s | 230.9 min, +30.3 min; legs HAB→M2 and E1→M1 avoided |

The 3 demo questions take about 10 s in total. The answers match the map, the Mission Planner and the visor.
With the model warm, `POST /chat/warmup` takes 0–5 s; a cold load took 151 s. `KEEP_ALIVE=60m` keeps it on the
GPU: call the warm-up again if the copilot was idle for more than an hour.

Besides counting invented numbers, `test_questions.py` now checks the wording against the engine result
(`phrasing_problems` in `agent.py`): a route station left out, a wrong skip reason, the comparison with the
previous mission dropped, or a comms alert presented as local. When the model's wording fails these checks,
the answer is the code summary (`answer from summary (...)` in the test output); demo 3 often ends up there.
