# engine/ — engine and API (Said, L2)

**Deliverable:** a stable FastAPI API following [`contracts/api.md`](../contracts/api.md).

## Status

Implemented: `GET /estaciones`, `GET /estaciones/{id}`, `GET /grafo`
and `POST /ruta`, `POST /mision`, `POST /alerta` and `POST /reset`.
Routes use Dijkstra over directed edges weighted by
`tiempo_min`; they add no stay time. The filter picks the graph version
set by the contract and drops legs steeper than the requested slope.
CORS is open for development.

Missions use OR-Tools and are tested against brute force.
Alerts add up and recompute the last mission. `GET /geologia` serves
`data/out/geologia.geojson` for the map, or 404 if it does not exist yet.

## Integration with the data and the chat

The engine loads `data/out/graph.json` (Pedro's real graph) if it exists; otherwise
`contracts/graph_fake.json`. `GRAPH_PATH` forces another file.

`/chat` (Manuel's copilot, `llm/router.py`) is mounted on this same API, together with
`/chat/reset`, `/chat/status` and `/chat/warmup`. It needs Ollama running with the
model from `llm/.env`; without the `ollama` package, or with `CHAT=0`, the engine still starts
without `/chat` and the UI offers the Plan B form.

```bash
./.venv/Scripts/python.exe -m pip install -r engine/requirements-dev.txt
./.venv/Scripts/python.exe -m uvicorn engine.main:app --host 127.0.0.1 --port 8000
```

`API_URL` tells the chat which API to call (default `http://127.0.0.1:8000`, not
`localhost`: on Windows `localhost` tries IPv6 first and every tool call gets slower).
An explicit setting in `llm/.env` or in the environment takes priority: check
`GET /chat/status`. Do not use the mock's port 8001 for a demo with the real engine.

With the real graph, the slope demo uses 8° and 12° with a 4-hour cap
(`data/HALLAZGO_pendiente_demo.md`): at 8° the upper delta (E2) is skipped for
slope (230.7 min); at 12° it fits (200.6 min); dust in Z2 → 175.2 min. The examples
and times in the following sections belong to the **fake** graph.

### Run on Windows (Git Bash / Antigravity)

From the repository root, with the `.venv` environment created:

```bash
./.venv/Scripts/python.exe -m pip install -r engine/requirements-dev.txt
./.venv/Scripts/python.exe -m uvicorn engine.main:app --reload --port 8000
```

If Uvicorn was already running when you installed new dependencies, restart it
with Ctrl+C and the second command. Open http://localhost:8000/docs and refresh
the page to see `POST /mision`.

## Try a mission

In `/docs`, open `POST /mision` → **Try it out** → **Execute**:

```json
{
  "estaciones": ["E1", "M1", "M2", "E2"],
  "tiempo_max_min": 240,
  "pendiente_max": 15,
  "modo": "orientacion",
  "origen": "HAB"
}
```

Result: HAB→M2→E1→M2→M1→HAB, 164.0 minutes and 76.0 of margin; E2
skipped for slope. Changing to 20° includes E2: 201.6 minutes and 38.4 of margin.
There are paths tied in time at 20°: the engine may go through M2 instead
of REF, with a different distance and dose, keeping the same optimal time.

- `tsp` visits every requested station and returns to the origin. The maximum
  time is optional; if a visit is impossible, `factible` is `false`.
- `orientacion` (orienteering) requires `tiempo_max_min`, maximizes the science value and, among
  solutions of equal value, minimizes time. It must do at least one task.
- Stay time is added once per chosen task, never for nodes the route passes through.
  Repeated IDs are deduplicated; the origin adds no stay time.
- An empty list returns `[origen]`, feasible and with zero time. Unknown
  IDs show up in `omitidas`; an unknown origin returns 404.

### Optimization and limits

The engine builds the shortest-path matrix and uses `RoutingModel` with a
time dimension and `AddDisjunction` for optional visits. It reads K from
`params.yaml`; it raises it if needed to put science ahead of time.
The generalized CP-SAT backend certifies the optimum of the integer model, with a
5-second search limit. If it does not get a certified optimum, it answers
503 (try again); it does not report a timeout as an infeasible mission.

The internal resolution is 0.001 minutes: walking and stay times are rounded
up and the budget down. It is conservative and exact for the
demo graph (tenths of a minute). Data with more than three decimals
may change the selection near the limit. Public totals keep
the one-decimal format of the examples.

The independent tests use Floyd-Warshall and enumerate subsets and
permutations, without calling the optimizer or NetworkX. They compare value and time
across 15 combinations of mode, slope and budget, with seven stations.
References: [OR-Tools penalties](https://developers.google.com/optimization/routing/penalties)
and [time dimensions](https://developers.google.com/optimization/routing/dimensions).

## Try alerts and reset

Refresh `/docs` after Uvicorn reloads. To repeat a demo
without depending on earlier tests:

1. Run `POST /reset` with no body: it returns `{"ok": true}`.
2. Run the mission above with **15°**, 240 minutes and `orientacion` mode:
   it should take **164.0 minutes**.
3. Run `POST /alerta` with:

   ```json
   {"zona": "Z2", "tipo": "polvo"}
   ```

   It returns HAB→COM→M2→E1→M2→COM→HAB→M1→HAB, **186.9 minutes**,
   **53.1 of margin** and `aristas_afectadas: ["HAB->M2", "M2->M1"]`. No leg crosses Z2.
4. Repeat the same alert: it keeps the route and returns `aristas_afectadas: []`
   because the previous route already avoided Z2.
5. Run `/reset` and request `/mision` again: it goes back to **164.0 minutes**.

For communications, send `{"zona": "Z2", "tipo": "comms"}` after
a mission. The contract requires a zone, but the communications filter is global:
it removes every edge with coverage **below** the threshold in `params.yaml`
(currently 60%). Coverage of exactly 60% is kept. The route may
not change if it already had enough coverage; the tests also use a
controlled graph with 59%/60% to check isolation, skipped stations and the exact limit.

### State and errors

- Dust and communications alerts add up until `/reset` and also apply to
  new missions, `/ruta` and `/grafo`. The original file is not modified.
- The last `/mision` request is recomputed, keeping origin, stations,
  budget, slope and mode. `/ruta` does not replace that request.
- `aristas_afectadas` lists, without duplicates, the legs of the previous response
  blocked by the new alert (zone for dust, coverage for comms).
- Isolation reasons are evaluated in this order: slope without alerts,
  dust closures, and communications on the graph already closed by dust.
  `comms.detalle.cobertura_com_pct` gives the best possible minimum coverage
  of the path; for missions it checks both the way out and the way back.
- `/reset` removes every restriction and the previous mission. It is idempotent.
  `/alerta` without a previous mission, also after a reset, returns **409**.
- An unknown zone, an invalid type or malformed fields return **422**.
  A mission that becomes infeasible returns **200** with `factible: false` and its cause.
- If the optimizer returns **503**, the operation is not applied: the previous
  restrictions and mission are kept. Fix or retry the request.
- State lives **in the memory of a single process**, shared by the clients
  of that instance. Use a single worker for the demo. Restarting or reloading the
  server clears the state. Operations are serialized with a lock to
  keep a reset from landing in the middle of a recomputation. Multiple
  users or workers would need shared state and a session id.

The integration tests cover the full demo, repetition and accumulation,
dust/comms mixed in both orders, the inclusive threshold, reset, errors without
side effects, isolation between instances and concurrency between alert and reset.

### Run on Windows (PowerShell)

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r engine/requirements-dev.txt
$env:GRAPH_PATH = "contracts/graph_fake.json"
.\.venv\Scripts\python.exe -m uvicorn engine.main:app --reload --port 8000
```

Open http://localhost:8000/docs to try the endpoints. There is no need to
activate the virtual environment. Relative `GRAPH_PATH` paths are resolved
from the repository root; absolute paths work too. Restart
the server when you change the graph file.

### Check

```powershell
.\.venv\Scripts\python.exe -m pytest engine/tests -q
```

### Check Pedro's graph before integrating it

From the root, in Git Bash (requires `engine/requirements-dev.txt`):

```bash
./.venv/Scripts/python.exe -m engine.check_graph data/out/graph.json
```

The check validates the contract, queries stations and graph, computes a
240-minute mission, applies an alert and checks the reset using an isolated
test instance. It does not modify the file or the state of the running server.
It exits with code 1 on errors. A mission that is infeasible within 240 minutes is also
reported as a demo error: it may require changing the budget, it does not
necessarily mean the graph is invalid. To test the server with
the received graph, restart it with:

```bash
GRAPH_PATH=data/out/graph.json ./.venv/Scripts/python.exe -m uvicorn engine.main:app --reload --port 8000
```

Until the real graph arrives it can run with `contracts/graph_fake.json`.

The tests compare full responses with the shared examples and
check slope limits, E2 unreachable at 15°, 404/422 errors, CORS,
origin equal to destination and replacing the graph through `GRAPH_PATH`.

Note on the test data: the mission example gives 20.4° as the minimum
slope for E2; the graph includes REF→E2 at 18.5° in the 20° version.
`/ruta` computes the minimum of the maximum slope over the available paths
and returns 18.5°. That describes the physical slope of the path; choosing
the version still requires asking for 20°. `/mision` also checks the way back
and uses the larger of the out and back minimums. The shared contracts stay
untouched; the demo tests compare the optimal time, margin and reasons, and check
the legs and their sums against the graph (allowing time ties),
without requiring the example's incorrect slope detail. Reconciling this
discrepancy with the data owner is still pending.

Reference: [FastAPI TestClient](https://fastapi.tiangolo.com/tutorial/testing/)
and [NetworkX Dijkstra](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.shortest_paths.weighted.dijkstra_path.html).

Start against the fake graph; the real one arrives on Saturday at 22:00 and only the variable changes:

```bash
pip install fastapi uvicorn networkx ortools pyyaml
GRAPH_PATH=contracts/graph_fake.json uvicorn engine.main:app --reload --port 8000
```

## Suggested order

1. `GET /estaciones`, `GET /estaciones/{id}` and `GET /grafo` (11:00–14:00)
2. `POST /ruta` with `networkx.dijkstra_path`, weight `tiempo_min`, on the matching graph version (rule in `api.md`)
3. `POST /mision` with OR-Tools (14:00–17:00): time matrix from shortest paths + stay time per node; `orientacion` = `AddDisjunction` with a `valor_cientifico × K` penalty and a capped time dimension
4. Test against brute force: the total time has to match `contracts/ejemplos/post_mision.*.response.json`
5. `POST /alerta` and `POST /reset` (17:00–22:00)

Each skipped station needs its `motivo` and its `detalle`: that is what lets the LLM explain without making things up.
