# MarsWalk Copilot — Development spec (Space Apps 2026)

Nov 14, 2026 · @Mel

MarsWalk Copilot plans astronaut walks in Jezero crater: a graph engine computes the optimal route between 6 and 8 stations and an LLM translates the request and explains the result. The LLM never computes; every number it says comes from a function call.

## Team and laptops

Six people, six laptops and one rule: each person has their own laptop, one folder of the repo and one key deliverable. Milestones: on Saturday at 22:00 a mission is requested through the API and drawn on the map; on Sunday at 21:00 the project is submitted, before the 23:59 deadline.

| Person | Role | Laptop | Repo folder | Key deliverable |
| --- | --- | --- | --- | --- |
| Jeicoll | Technical lead and DevOps: repo, contracts, `graph_fake.json`, stations, Docker, deployment and integration | L6 | `contracts/` and root | `graph_fake.json` in the first hour; `estaciones.csv`; deployed demo |
| Pedro | Geospatial data: downloads, cropping, reprojection, cost map and edges | L1 | `data/` | Real `graph.json` |
| Said | Backend: FastAPI, networkx, OR-Tools and the brute-force test | L2 | `engine/` | Stable API |
| Manuel | AI/LLM: Ollama, tool calling, system prompt and `/chat` | L3 | `llm/` | Chat that calls functions |
| Añe | Frontend A: MapLibre map, nodes, edges, highlighted route and alert animation | L4 | `web/map/` | Demo screen |
| Axl | Frontend B: chat panel, station cards, HUD mode and Plan B form | L5 and phone | `web/ui/` | Chat panel and cards |

- **Data first: Pedro is Saturday's bottleneck, so Jeicoll leaves the rasters to him and moves ahead with the repo, contracts and stations**. Jeicoll does the repo, contracts and stations while Pedro processes the rasters.
- **Frontend without clashes:** Añe and Axl work in different folders (`web/map/` and `web/ui/`) and on different branches, so they do not step on each other in git.
- **Said** helps Pedro with geospatial data on Saturday morning if the engine is ahead of schedule.
- **Manuel** is the final integrator: he decides whether something goes into the demo or not.
- **Narrative, script, video and Project page in English:** Jeicoll and Axl on Sunday; Añe provides the screenshots.
- **Open:** confirm who the Statistics teammate is; they review `params.yaml` and the optimality test from whichever laptop is free.
- **Repo rules:** each person only touches their own folder; the contracts live in `contracts/` and only change after telling the group.

## How they unblock each other

&#91;embedded content: dependencies · 6 people, 1 file that unblocks them\]

Jeicoll uploads `graph_fake.json` in the first hour and Said, Manuel, Añe and Axl work against it without waiting for each other. Pedro delivers the real `graph.json` to the engine on Saturday at 22:00; nobody changes code, only the file.

## Data and sources

Everything critical comes from 3 downloads: the USGS SIM 3464 geologic map zip (it includes the CTX DTM and THEMIS day/night), the Jezero slope map and the Perseverance waypoints GeoJSON. The area is a crop of a few km² over Perseverance's real route (crater floor near the landing site + delta front, to be confirmed). Owner of all the critical layers: Pedro.

| Layer | Type | Source | Use in the system | Priority |
| --- | --- | --- | --- | --- |
| CTX DTM 20 m | Topographic | SIM 3464 database (zip \~350 MB) | Elevation and slope for the cost map | Critical |
| Jezero slopes | Topographic | USGS slope map (42 MB) | Slope already computed; shortcut if the DTM gives trouble | Critical |
| THEMIS IR day/night | Thermal | SIM 3464 database | Proxy for rock vs. fine sand: makes edges more expensive | Critical |
| Geologic units | Geologic | SIM 3464 database (shapefile) | Science value of nodes and ground type of edges | Critical |
| Perseverance waypoints | Position + sol | M20\_waypoints.json | Choose real stations and match them with photos | Critical |
| Navcam / Mastcam-Z photos | Surface optical | Perseverance Raw Images | Card for each station (first-person view) | High |
| HiRISE orthoimage / tiles | Orbital optical | Mars Trek WMTS or HiRISE 25 cm ortho | Frontend base map | High |
| HiRISE DTM 1 m | Topographic | USGS Mars 2020 HiRISE DTM | Slope detail in a small crop | Optional |
| Radiation | Modeled | Declared assumption (there is no RAD at Jezero) | Configurable base dose × terrain shielding | Medium |
| Dust | Simulated | Manual alert in the demo | Removes edges or makes them more expensive | Medium |

Curiosity's proposed route is a GIF and only serves as a design reference for the route map. NASA Worldview covers Earth and is not used.

**Projection:** the SIM 3464 rasters are in Mars Transverse Mercator, central meridian 77.5°E, sphere of 3,396,190 m. The waypoints come in lon/lat and are reprojected with `pyproj` before matching them.

## Architecture and contracts

Four modules talk to each other only through two contracts: the `graph.json` file and the FastAPI API. If both are fixed at hour 0, each laptop moves ahead without waiting for the others. The engine is the core: if the LLM fails, the frontend calls the same API from a form.

| Module | Owner | Produces | Consumes |
| --- | --- | --- | --- |
| Data pipeline (`data/`) | Pedro | `graph.json` | NASA/USGS downloads |
| Engine and API (`engine/`) | Said | FastAPI API | `graph.json` |
| LLM (`llm/`) | Manuel | `/chat` | API (through tools) |
| Frontend (`web/`) | Añe and Axl | Demo screen | API and `/chat` |

### Contract 1: graph.json (owner: Pedro; Jeicoll uploads the fake one in the first hour)

The data pipeline generates it and the engine reads it at startup. Until there is real data, a fake one with the same shape is used.

```json
{
  "meta": {"area": "jezero_aoi_v1", "crs": "MTM 77.5E", "modelo_costo": "v1"},
  "nodes": [{
    "id": "E1", "nombre": "Frente del delta", "tipo": "ciencia",
    "lon": 77.40, "lat": 18.45,
    "valor_cientifico": 8, "tarea": "Muestreo de capas", "permanencia_min": 30,
    "unidad_geologica": "...",
    "capas": {"elev_m": 0, "pendiente_deg": 0, "themis_noche": 0},
    "fotos": [{"url": "...", "camara": "NAVCAM_LEFT", "sol": 0}]
  }],
  "edges": [{
    "origen": "HAB", "destino": "E1",
    "distancia_m": 0, "tiempo_min": 0, "energia_rel": 0,
    "pendiente_max_deg": 0, "dosis_rel": 0,
    "cobertura_com_pct": 0, "sombra_pct": 0,
    "zonas": ["Z1"], "geometria": [[77.45, 18.44], [77.40, 18.45]]
  }]
}
```

- Node types: `habitat`, `rover`, `ciencia` (science), `muestreo` (sampling), `refugio` (shelter), `comms`.
- Edges are directed: with 8 nodes there are 56, because going up and going down cost differently. The geometry is computed once per pair and reversed.
- `zonas` lists the zones the edge crosses; the dust alert works on that.

### Contract 2: FastAPI API (owner: Said)

| Method | Path | Input | Output |
| --- | --- | --- | --- |
| GET | `/estaciones` | — | list of nodes (id, name, type, value, coordinates) |
| GET | `/estaciones/{id}` | — | full node with layers and photos |
| POST | `/ruta` | origin, destination, pendiente\_max | legs + totals |
| POST | `/mision` | estaciones\[\], tiempo\_max\_min, pendiente\_max, modo (tsp or orientacion) | route, legs, skipped stations with their reason, totals |
| POST | `/alerta` | zone, type (polvo [dust] or comms) | recomputed mission + affected edges |
| POST | `/reset` | — | clears alerts |
| POST | `/chat` | message, history | answer, calls made, route (if any) |

`/mision` response (the same shape for `/ruta` and `/alerta`):

```json
{
  "factible": true,
  "ruta": ["HAB", "E1", "E3", "HAB"],
  "tramos": [{"origen": "HAB", "destino": "E1", "distancia_m": 0,
              "tiempo_min": 0, "pendiente_max_deg": 0, "cobertura_com_pct": 0}],
  "omitidas": [{"id": "E2", "motivo": "pendiente",
                "detalle": {"pendiente_max_deg": 19, "limite": 15}}],
  "totales": {"distancia_m": 0, "tiempo_min": 0, "dosis_rel": 0, "margen_min": 0}
}
```

`omitidas` with its reason lets the LLM say "I skipped E2 because..." without making it up. The contracts live in `contracts/` and only change after telling the group.

## LLM tools

Manuel builds 5 tools, each one calls one of Said's endpoints; the LLM never receives the full graph.

| Tool | Endpoint | When it is used |
| --- | --- | --- |
| `listar_estaciones()` | GET `/estaciones` | To map the names the astronaut says to ids |
| `info_estacion(id)` | GET `/estaciones/{id}` | "What is at E3?" |
| `ruta_punto_a_punto(origen, destino, pendiente_max)` | POST `/ruta` | "How do I get from A to B?" |
| `optimizar_mision(estaciones, tiempo_max_min, pendiente_max)` | POST `/mision` | Missions with several stations or a time limit |
| `recalcular_por_alerta(zona, tipo)` | POST `/alerta` | Dust alerts or comms loss |

(In the final build these tools are named in English: `list_stations`, `station_info`, `point_to_point_route`, `optimize_mission` and `reroute_for_alert`.)

**System prompt:** answer in Spanish or English depending on the user, always call a tool before giving figures, quote only numbers returned by the tools and explain every skipped station with its reason.

**Final demo (under 1 minute, 3 questions):**

1. Request a mission: "I want to visit the delta front and two sampling sites, back in under 3 hours, with no slopes over 15°".
2. Change a constraint: "What if I accept up to 20°?" → the system adds a station and says how much time it adds.
3. Trigger an alert: "Dust alert in zone X" → it recomputes and explains which leg it avoided.

The exact phrases get adjusted once we have the real stations.

## Cost model and algorithms

Each raster cell has a cost in minutes in a spacesuit; cells above the slope limit are blocked. Pedro implements the cost in `data/`; Said implements the algorithms in `engine/`. Every factor is a parameter in a single `params.yaml` file, and the ones that do not come from NASA data are presented as assumptions.

```latex
c = \frac{\Delta x}{v(\theta)} \cdot f_{\text{terreno}} \cdot f_{\text{alerta}}, \qquad c = \infty \text{ if } \theta > \theta_{\max}
```

| Term | Where it comes from | Note |
| --- | --- | --- |
| Δx | DTM cell size | 20 m with CTX; less if we use HiRISE |
| v(θ) | Tobler's function × suit\_factor | Tobler is an Earth walking formula; suit\_factor is an assumption |
| f\_terreno | THEMIS night + geologic unit | Exposed rock (warm at night) and fine sand (cold) raise the cost |
| f\_alerta | Zones with an active alert | 1 normally; infinite if the zone is closed |
| θ\_max | Configurable physical limit | Assumption; the astronaut's constraint is applied afterwards |

Tobler's function (speed in km/h, slope as a tangent):

```latex
v(\theta) = 6 \, e^{-3.5 \, |\tan\theta + 0.05|} \cdot \text{factor\_traje}
```

### Attributes of each edge (Pedro)

They are computed over the cells of the path returned by `route_through_array(costo, inicio, fin, fully_connected=True, geometric=True)`.

- `distancia_m`: sum of steps (diagonal = Δx · √2).
- `tiempo_min`: sum of the cost; computed in both directions because going up and going down do not cost the same.
- `pendiente_max_deg`: maximum slope along the path.
- `energia_rel`: relative index (time × (1 + k · slope)), not real kcal.
- `dosis_rel`: exposed time × (1 − shielding). Shielding is the fraction of sky blocked by the relief, computed with the DTM in 8 azimuths. It is a model, not a measurement.
- `cobertura_com_pct`: % of path cells with line of sight to the habitat or a comms node (ray over the DTM).
- `sombra_pct`: % of cells in shadow for a fixed time of day (hillshade). Optional.
- `zonas`: predefined alert zones the path crosses.

**Trick for the astronaut's slope:** if we only compute the path with a high θ\_max, an edge can show 19° even when a 14° detour exists. That is why 3 versions of the graph are precomputed, with 15°, 20° and 25° limits. With 8 nodes that is 3 × 56 edges and it takes minutes.

### Algorithm per type of question (Said)

| Question | Problem | Implementation |
| --- | --- | --- |
| From A to B | Shortest path | `networkx.dijkstra_path` over the filtered station graph |
| Visit these N in the best order | TSP starting and ending at the habitat | OR-Tools RoutingModel with a time matrix + stay time per node |
| I have T hours, maximize science | Orienteering problem | OR-Tools: `AddDisjunction` with penalty = valor\_cientifico × K and a time dimension capped at T |
| Dust alert in zone Z | Recompute | Remove edges with Z in their zones and repeat the last mission |
| No communications | Extra constraint | Filter out edges with `cobertura_com_pct` under a threshold |

**Verification for the judges:** with 8 nodes, brute force checks every permutation (8! = 40,320) in seconds. A test compares OR-Tools against brute force and we show it as proof that the route is optimal.

## Saturday the 14th schedule

Saturday ends with a mission requested through the API and drawn on the map at 22:00. Syncs last 15 minutes and are held standing up.

| Time | Pedro | Jeicoll | Said | Manuel | Añe | Axl |
| --- | --- | --- | --- | --- | --- | --- |
| 10:00–11:00 | Downloads SIM 3464, slope map and waypoints | Repo, `contracts/` and `graph_fake.json` (unblocks everyone) | Installs FastAPI, networkx and OR-Tools; API skeleton | Installs Ollama and downloads 2 models with tool calling | Starts React + MapLibre | Reads the challenge and the criteria; script skeleton |
| 11:00–14:00 | Area crop and reprojection | Chooses 6–8 stations with science value and a task | `/estaciones` and `/ruta` with networkx over the fake graph | Tools against `graph_fake.json` (13:00 cutoff) | Jezero base map + nodes | Skeleton of the chat panel and the cards; problem statement and why Jezero |
| 14:00–17:00 | Cost map and edges in 3 slope versions | Raw Images photos per sol; fills in `estaciones.csv` | `/mision` with OR-Tools + brute-force test | The 5 tools + system prompt | Edges and route drawn from `/mision` | Cards with photos and data per station (with Jeicoll) |
| 17:00–22:00 | Coverage, dose and zones; delivers the real `graph.json` | Photos in `estaciones.csv`; Dockerfile; connects the real `graph.json` | `/alerta` and `/reset` | `/chat` in FastAPI | Mockup of the alert animation | Mockup of the chat panel; draft of the page in English |

- **13:00 cutoff:** if Ollama does not do tool calling well, the Plan B in the risks section kicks in.
- **14:00 cutoff:** if the rasters do not line up, the cost uses only the USGS slope map.
- **16:00 cutoff:** if MapLibre does not show the Mars tiles, Añe uses the cropped orthoimage as an image source.
- **18:00 cutoff:** if a station has no nearby photo, the one from the closest sol is used, showing the sol on the card.
- Said helps Pedro with rasters on Saturday morning if `/estaciones` and `/ruta` are ahead.
- **22:00 milestone:** request a mission through the API and get the optimal route in JSON, drawn on the map.

## Sunday the 15th schedule

On Sunday the chat gets integrated, the video is recorded and the project is submitted at 21:00, before the 23:59 deadline.

| Time | Pedro | Jeicoll | Said | Manuel | Añe | Axl |
| --- | --- | --- | --- | --- | --- | --- |
| 09:00–12:00 | Optional layers (shadow, HiRISE) until 12:00 | Backend deployment (Docker) | Engine and alert bugs | End-to-end chat with the UI; 10 test questions | Route highlighted node by node with real data | Real chat in the panel; final script and storyboard |
| 12:00–15:00 | README: how to run it, data used and credits | Cards and polish; requests the FortiGuard classification | Bugs; **freezes the backend at 15:00** | Plan B form (with Axl); prompt tuning | Alert animation and visual polish; screenshots for the page | Plan B form in the UI; first video take at 14:00 with Jeicoll |
| 15:00–19:00 | Reviews `params.yaml` and the optimality test | Critical fixes only; edits the video with Axl | Critical fixes only | Critical fixes only | Critical fixes only | Video and Project page (texts and images) |
| 19:00–21:00 | Everyone | Everyone | Everyone | Everyone | Everyone | Everyone: review the page, test links in a private window and submit |

The first video take at 14:00 is recorded with everything running locally, in case the internet goes down.

## Risks, cutoffs and Plan B

Each risk has an owner and a cutoff time: if it is not solved by then, the Plan B kicks in without debate.

| Risk | Owner | Cutoff | Plan B |
| --- | --- | --- | --- |
| The rasters do not line up or the DTM gives trouble | Pedro | Sat 14:00 | Cost from the USGS slope map only; THEMIS and geology are added later |
| The Ollama model does not do tool calling well | Manuel | Sat 13:00 | Try another local model; if that fails too, a commercial API for the demo and Ollama as "offline mode" in the presentation |
| No laptop runs Ollama smoothly | Manuel | Sat 13:00 | Smaller model or commercial API |
| MapLibre does not show the Mars tiles | Añe | Sat 16:00 | Cropped orthoimage as an image source with fixed bounds |
| A station has no nearby photo | Jeicoll | Sat 18:00 | Photo from the closest sol, with the sol shown on the card |
| Internet down on Sunday | Jeicoll | Sun 14:00 | First video take recorded at 14:00 with everything local |
| The LLM fails live | Manuel and Axl | Always | Form with stations, maximum time and slope that calls `/mision` |

## Submission checklist

Everything must be submitted before 21:00 on Sunday; the deadline is 23:59.

- [ ] Confirm the local judging time with the Local Lead (Jeicoll)
- [ ] Public GitHub repo with a README: how to run it, data used and credits (Pedro and Jeicoll)
- [ ] Demo deployed and FortiGuard classification requested, Company Name "N/A" (Jeicoll)
- [ ] Video uploaded as public or unlisted, tested in a private window (Axl and Jeicoll)
- [ ] Project page: summary, detailed description, NASA data with links, tools and use of AI (Axl)
- [ ] Screenshots in JPG or PNG (up to 10 MB) on the page (Añe)
- [ ] Credits: NASA/JPL-Caltech, USGS, MSSS/ASU depending on each image; no text suggests NASA endorsement (Axl)
- [ ] Save Progress often and the edit lock on while editing (everyone)
- [ ] Submitted before 21:00 on Sunday (everyone)
