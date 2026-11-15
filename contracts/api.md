# Contract 2 — FastAPI API (owner: Said)

Local base URL: `http://localhost:8000`. Everything is UTF-8 JSON. CORS is open in development (the frontend runs on another port).

Real request/response examples, generated from `graph_fake.json`, are in [`ejemplos/`](ejemplos/). If your code works with those files, it works with the API.

> **Rule:** this file only changes after telling the group. Adding an optional field is safe; renaming or removing one breaks someone.

The routes and field names are in Spanish because they are the contract shared by the four modules; this document explains each one in English.

## Endpoints

| Method | Path | Input | Output | Example |
| --- | --- | --- | --- | --- |
| GET | `/estaciones` | — | list of `EstacionResumen` (station summaries) | `get_estaciones.response.json` |
| GET | `/estaciones/{id}` | — | full `graph.json` node (layers and photos) | `get_estacion_E1.response.json` |
| GET | `/grafo` | `?pendiente_max=15` (optional) | filtered `{meta, zonas, nodes, edges}` | — (**added**, see below) |
| POST | `/ruta` | `{origen, destino, pendiente_max}` | `RespuestaMision` | `post_ruta.*.json` |
| POST | `/mision` | `{estaciones[], tiempo_max_min, pendiente_max, modo}` | `RespuestaMision` | `post_mision.*.json` |
| POST | `/alerta` | `{zona, tipo}` | `RespuestaMision` + `aristas_afectadas` | `post_alerta.*.json` |
| POST | `/reset` | — | `{"ok": true}` | — |
| POST | `/chat` | `{message, history}` | `{answer, calls, route}` | — (implemented by Manuel, in English) |

Glossary: `estaciones` = stations, `grafo` = graph, `ruta` = route, `mision` = mission, `alerta` = alert, `origen` / `destino` = origin / destination, `pendiente_max` = maximum slope, `tiempo_max_min` = maximum time in minutes, `modo` = mode, `zona` = zone, `tipo` = type, `tramos` = legs, `omitidas` = skipped stations, `totales` = totals, `factible` = feasible.

### GET `/estaciones`

```json
[{"id": "E1", "nombre": "Frente del delta", "tipo": "ciencia",
  "valor_cientifico": 9, "lon": 77.40144, "lat": 18.45073}]
```

### POST `/ruta`

```json
{"origen": "HAB", "destino": "E1", "pendiente_max": 15}
```

Shortest path in time (Dijkstra). Returns a `RespuestaMision` with `ruta` from origin to destination (it may go through intermediate nodes) and `margen_min: null`.

### POST `/mision`

```json
{"estaciones": ["E1", "M1", "M2", "E2"], "tiempo_max_min": 240,
 "pendiente_max": 15, "modo": "orientacion", "origen": "HAB"}
```

| Field | Type | Default | Note |
| --- | --- | --- | --- |
| `estaciones` | `string[]` | — | ids to visit |
| `tiempo_max_min` | number | `null` | no cap if `null` (only in `tsp`) |
| `pendiente_max` | number | `15` | degrees |
| `modo` | `"tsp"` \| `"orientacion"` | `"tsp"` | `tsp`: all of them in the best order, or `factible: false`. `orientacion` (orienteering): maximizes `valor_cientifico` within `tiempo_max_min` and skips the ones that do not fit |
| `origen` | string | `"HAB"` | the mission starts and ends here |

Total `tiempo_min` = walking + the `permanencia_min` (stay time) of each visited station (nodes the route only passes through add no stay time).

### POST `/alerta`

```json
{"zona": "Z2", "tipo": "polvo"}
```

- `polvo` (dust): edges whose `zonas` contain the zone are removed, and the **last mission** requested from `/mision` is run again.
- `comms`: edges with `cobertura_com_pct` < `umbral_cobertura_com_pct` from `params.yaml` are removed.
- Alerts add up until `/reset`. If there was no previous mission: `409`.

Response = `RespuestaMision` + `"aristas_afectadas": ["HAB->M2", "M2->M1"]` (the previous mission's legs that crossed the zone).

### POST `/chat` (Manuel)

The copilot speaks English and its fields are in English (see `llm/README.md`).

```json
// input
{"message": "What if I accept up to 12°?",
 "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
// output
{"answer": "With 12° I add the Upper delta (E2)...",
 "calls": [{"tool": "optimize_mission",
            "arguments": {"stations": ["E1","M1","M2","E2"], "max_time_min": 240, "max_slope_deg": 12},
            "ok": true}],
 "route": { "...": "RespuestaMision, or null if there was no route" }}
```



## `RespuestaMision` (the same shape for `/ruta`, `/mision` and `/alerta`)

```json
{
  "factible": true,
  "ruta": ["HAB", "M2", "E1", "M2", "M1", "HAB"],
  "tramos": [{"origen": "HAB", "destino": "M2", "distancia_m": 2639, "tiempo_min": 41.6,
              "pendiente_max_deg": 1.9, "cobertura_com_pct": 100,
              "dosis_rel": 37.7, "zonas": ["Z1", "Z2", "Z4"],
              "geometria": [[77.45089, 18.44463], [77.40844, 18.45342]]}],
  "omitidas": [{"id": "E2", "motivo": "pendiente",
                "detalle": {"pendiente_max_deg": 18.5, "limite": 15}}],
  "totales": {"distancia_m": 6833, "tiempo_min": 164.0, "dosis_rel": 95.6, "margen_min": 76.0}
}
```

The `motivo` (reason) of a skipped station is one of these, with its `detalle` (details):

| `motivo` | `detalle` | The LLM says… |
| --- | --- | --- |
| `pendiente` (slope) | `{pendiente_max_deg, limite}` — the gentlest slope it can be reached with vs. the one requested | "I skipped the upper delta: the gentlest path has 18.5° and you asked for 15°" |
| `tiempo` (time) | `{tiempo_max_min}` | "it does not fit in 240 min" |
| `alerta` (alert) | `{zonas}` | "it is cut off by the alert in Z2" |
| `comms` | `{cobertura_com_pct, umbral}` | "there is no path with enough coverage" |
| `no_existe` (does not exist) | `{}` | "I do not know that station" |

`margen_min` = `tiempo_max_min − tiempo_min` (`null` if there was no cap).

## How the graph version is chosen from `pendiente_max`

`graph.json` has one version of each edge per limit in `meta.limites_pendiente_deg` (real graph: **8, 12 and 15**; fake graph: 15, 20 and 25). For a requested `pendiente_max`:

1. The largest version that **does not exceed** the request is used. With the real graph: 10° → version 8; 13° → version 12; under 8° → version 8.
2. Edges with `pendiente_max_deg` > `pendiente_max` are also dropped.

That way a leg steeper than requested is never returned.

## Errors

| Code | When | Body |
| --- | --- | --- |
| `404` | unknown station id in `/estaciones/{id}` or `/ruta` | `{"detail": "station E9 does not exist"}` |
| `409` | `/alerta` without a previous mission | `{"detail": "there is no mission to recalculate"}` |
| `422` | malformed JSON or invalid fields (FastAPI does it on its own) | standard FastAPI format |

In `/mision`, an unknown station is **not** an error: it goes to `omitidas` with `motivo: "no_existe"`, so the LLM can explain it.

## Additions to the original spec (announced in the group)

They are additive changes; nothing in the spec was renamed or removed.

- **`GET /grafo`**: the map needs all the edges and the zone polygons to draw them; no route in the spec exposed them.
- **`tramos[].geometria`, `tramos[].zonas` and `tramos[].dosis_rel`**: to draw the highlighted route and the alert animation without asking for anything else.
- Optional **`origen`** in `/mision` (default `HAB`).
- **`motivo`** with a closed set of values (table above).
