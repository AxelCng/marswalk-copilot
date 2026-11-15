# Work plan: LLM copilot ready for the demo

**Project:** MarsWalk Copilot (NASA Space Apps 2026)
**Date:** Saturday, November 14, 2026, evening
**Scope:** everything still missing for the 3 demo questions to work from the chat, with the model, against the real engine and with the real `graph.json`.

---

## 1. Where we are

| Piece | Status | Source |
| --- | --- | --- |
| Agent (`llm/agent.py`) and its 5 tools | Ready. It does not make up numbers: it checks every number and, if needed, answers with a summary built by code | `llm/README.md` |
| Model | `qwen2.5:3b` on Ollama: 6/6 checks, 0 unsourced numbers | `llm/README.md` |
| Speed | **~47 s per question on CPU** (~3.5 min for the demo). The spec asks for the demo in < 1 min | `llm/README.md` |
| `/chat` on the real API | **Not mounted** in `engine/main.py`. Today it only works with Manuel's mock (port 8001) | `engine/main.py` |
| Engine with the real graph | The engine loads `contracts/graph_fake.json` unless `GRAPH_PATH` is set | `engine/main.py:86` |
| Demo question 2 with the real graph | **Does not work**: no station is blocked at 15°, so "what if I accept 20°?" changes nothing | `data/HALLAZGO_pendiente_demo.md` |
| UI (`web/ui`) | Ready: chat with error handling, long-wait handling and access to Plan B; tested against the real engine | PR #4 |

**Three blockers:** (1) the model's speed, (2) `/chat` is not in the engine, (3) question 2 makes no sense with the real terrain.

---

## 2. Decisions to make first

Without these two, the rest of the work may have to be redone.

### D1 · Where the model runs · Manuel decides (final integrator) · deadline: Sun 09:00

Goal: **≤ 20 s per question** (3 questions in ~1 min).

| Option | Expected speed | Cost / risk |
| --- | --- | --- |
| A. Ollama on a laptop **with a GPU** | The goal looks reachable, but it has to be measured | That laptop has to be at the demo and at the recording |
| B. **Commercial API** for the demo; Ollama as "offline mode" in the presentation | Fast | It is the spec's Plan B. It needs a key and a client change in `agent.py` |
| C. Stay on CPU with `qwen2.5:3b` | ~47 s per question | The live demo does not fit in 1 min. Only works if the video is edited |

### D2 · Which question 2 we use with the real graph · Pedro + Jeicoll (`params.yaml`) + Manuel decide · deadline: Sat 22:00

Options from `data/HALLAZGO_pendiente_demo.md`:

| Option | Effect |
| --- | --- |
| **A. 8° and 12° limits** (recommended by Pedro) | At 8° E2 and REF are left out; at 12° E2 fits. Changes `limites_pendiente_deg` in `params.yaml` and `graph.json` is regenerated |
| D. Replace question 2 with a **time** one ("what if I have 3 hours?") | Zero technical risk, but the slope contrast is lost |

> Question 3 (dust in Z2) **does** work with the real graph: alerts change the route.

---

## 3. Tasks

The times follow the spec's schedule: milestone Saturday 22:00, Said freezes the backend on Sunday at 15:00 and the first video take is on Sunday at 14:00.

### Phase 1 · Backend (Saturday night → Sunday 12:00)

| # | Task | Owner | Depends on | Done when |
| --- | --- | --- | --- | --- |
| 1 | Mount `/chat` in the engine: `from llm.router import router as chat_router` and `app.include_router(chat_router)` in `engine/main.py` | Said | — | `POST http://127.0.0.1:8000/chat` responds. Already tried with a local launcher: it imports fine from the repo root |
| 2 | Start the engine with the real graph: `GRAPH_PATH=data/out/graph.json` (or change the default) | Said + Jeicoll | D2 | `/estaciones` and `/mision` return data with `meta.fake = false` |
| 3 | If D2 = A: `limites_pendiente_deg: [8, 12, …]` in `params.yaml` and regenerate `graph.json` | Jeicoll (`params.yaml`) + Pedro | D2 | At 8° E2 shows up in `omitidas` for slope and at 12° it fits |
| 4 | `llm/.env`: `API_URL=http://127.0.0.1:8000`. With `localhost`, on Windows one test hung trying IPv6 | Manuel | 1 | The tools call the real engine without delays |

### Phase 2 · Model (Sunday 09:00 → 12:00)

| # | Task | Owner | Depends on | Done when |
| --- | --- | --- | --- | --- |
| 5 | Get the model running where D1 decided (download the model or set up the API) | Manuel | D1 | `GET /chat/estado` shows the right model |
| 6 | Warm up the model before the demo (a test question, or Ollama's `keep_alive`) so the first answer does not load the model live | Manuel | 5 | The first question takes as long as the next ones |
| 7 | Set `PENDIENTE_DEFAULT` and `TIEMPO_DEFAULT` to the chosen demo (if D2 = A, the default slope is no longer 15) | Manuel | D2 | The agent uses the new values when the astronaut does not give them |
| 8 | Update `llm/test_preguntas.py`: phrases and expected values with the real graph (today it expects 15°/20° and fake-graph values) | Manuel | 2, 3 | 6/6 checks and 0 unsourced numbers against the real engine |
| 9 | Run the spec's "10 test questions" and time each one | Manuel | 5, 8 | Results table in `llm/README.md`, with times ≤ the D1 goal |

> `detectar_cambio` in `agent.py` already picks up any number of degrees or hours in the message, so "what if I accept up to 12°?" works without code changes.

### Phase 3 · UI and demo (Sunday 11:00 → 14:00)

| # | Task | Owner | Depends on | Done when |
| --- | --- | --- | --- | --- |
| 10 | Set the chat's "Demo script" buttons and the Plan B questions to the final demo (if D2 = A: 8° / 12° instead of 15° / 20°; the Plan B slope selector too) | Axl | D2 | The 3 buttons send the final phrases |
| 11 | Check that question 1 fits in the requested time: with the real graph the optimal mission to the upper delta is ~200 min, and the current phrase says "back in under 3 hours" (180 min) | Axl + Manuel | 2 | The phrase and the engine's result match in the script |
| 12 | End-to-end test: UI → `/chat` → real engine → map and visor, with the 3 questions | Axl + Manuel | 1, 4, 5 | All 3 give a route on the map and the visor chip says **API** |
| 13 | If the model runs on another laptop: point the UI at it with `VITE_API_BASE=http://<ip>:8000` | Axl | 12 | The UI on the demo laptop talks to that engine |
| 14 | Final script with the real numbers (minutes, margin and added station come from test 12, not from `contracts/ejemplos/`) | Axl + Jeicoll | 12 | No number in the script contradicts what is on screen |

### Phase 4 · Freeze (Sunday 14:00 → 15:00)

| # | Task | Owner | Done when |
| --- | --- | --- | --- |
| 15 | First video take **locally**, in case the internet goes down | Axl + Jeicoll | Take recorded with the real chat |
| 16 | Backend frozen: after this, only critical fixes | Said | 15:00 |
| 17 | Rehearse the backup: if the model fails live, Plan B → same 3 questions | Axl | Plan B gives the same routes as the chat |

---

## 4. Risks

| Risk | Signal | Response |
| --- | --- | --- |
| The model is still slow | > 20 s per question in test 9 | Option B of D1, or record the demo and edit out the waits |
| Ollama is not on the demo laptop | `/chat` answers with `error` | The UI already offers "Open Plan B"; Plan B uses the same engine |
| Question 2 shows no contrast | The mission is the same with both limits | Decision D2; as a last resort, option D (time question) |
| The `contracts/` examples do not match the real graph | Without the engine, the UI shows the fake graph's numbers | They are already marked as "example". For the video, always use the real engine |
| English answers for the video | The question in English fails | It is in `test_preguntas.py` ("ingles"); check it in test 9 |

---

## 5. "Ready for the demo" checklist

- [ ] D1 and D2 decided and announced in the group
- [ ] `/chat` mounted in `engine/main.py` and the engine running with `data/out/graph.json`
- [ ] `llm/.env` with `API_URL=http://127.0.0.1:8000` and the chosen model
- [ ] `test_preguntas.py` 6/6 against the real engine, with measured times
- [ ] UI buttons with the final phrases
- [ ] End-to-end test: chat → map → visor, chip **API**
- [ ] Script with the real numbers
- [ ] First video take (Sun 14:00)
- [ ] Plan B rehearsed as a backup
