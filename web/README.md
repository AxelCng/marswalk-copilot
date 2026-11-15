# web/ — frontend (Añe and Axl)

Two folders and two branches so nobody steps on anyone in git:

| Folder | Person | Branch | Deliverable |
| --- | --- | --- | --- |
| [`map/`](map/) | Añe (L4) | `web-map` | MapLibre map: nodes, edges, highlighted route and alert animation |
| [`ui/`](ui/) | Axl (L5 + phone) | `web-ui` | Chat panel, station cards, HUD mode and Plan B form |

The frontend only consumes the API ([`contracts/api.md`](../contracts/api.md)) and `/chat`. **While the API is not ready**, work with the JSON files in [`contracts/ejemplos/`](../contracts/ejemplos/) and with [`contracts/graph_fake.json`](../contracts/graph_fake.json), which have the exact shape of the responses.

## How to run everything together (demo screen)

```powershell
# 1) Said's engine (terminal 1, from the repo root; see engine/README.md)
$env:GRAPH_PATH = "contracts/graph_fake.json"
.\.venv\Scripts\python.exe -m uvicorn engine.main:app --port 8000

# 2) screen (terminal 2). It includes the web/map map: nothing needs to be installed there
cd web/ui; npm install; npm run dev     # http://localhost:5173
```

- The screen starts against the real engine: the top-right button says `Live engine`. Clicking it switches to `Sample data`, which uses the files in `contracts/`.
- The sample data (`web/ui/src/mocks/mockData.ts`) **comes from `contracts/`**: no numbers are written by hand.
- If `/chat` fails, the panel says so and points to Plan B. **It never shows a made-up answer.**
- The map (`web/map/src/MarsMap.jsx`, by Axl) sits above the tabs, with the alert bar (dust per zone, comms loss, reset). Clicking a station on the map opens its card.
- The map labels use a font from `demotiles.maplibre.org`: **without internet the station names do not appear**.

## Añe — `web/map/`

- Nodes: `GET /estaciones` (or `nodes` from `graph_fake.json`), colored by `tipo`.
- Edges and zones: `GET /grafo`, which returns `edges[].geometria` and `zonas[].poligono` in `[lon, lat]`.
- Highlighted route: `tramos[].geometria` from the `/mision` response, in the order of `ruta`.
- Alert: `aristas_afectadas` from `/alerta` + the zone polygon.
- **16:00 cutoff:** if MapLibre does not show the Mars tiles, use the cropped orthoimage as an `image source` with fixed bounds.

## Axl — `web/ui/`

- Cards: `GET /estaciones/{id}` (layers, task and photos). `fotos[].url` can be `null`: show a placeholder and the sol.
- Chat: `POST /chat` → show `respuesta`; if `ruta` is not `null`, pass it to the map.
- Plan B form (if the LLM fails): stations + `tiempo_max_min` + `pendiente_max` → `POST /mision` directly.
