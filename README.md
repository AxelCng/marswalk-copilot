# MarsWalk Copilot

An LLM copilot that plans astronaut walks (EVAs) between stations in Jezero crater, Mars, using NASA and USGS data.
Built for the **NASA Space Apps Challenge 2026**.

A graph engine computes the optimal route between 6 and 8 stations, and a language model turns the astronaut's
request into tool calls and explains the result in plain English. **The LLM never calculates:** every number it says
comes from a function call to the engine.

## What it does

- **Plans a mission:** "I want to visit the delta front, Séítah, the Three Forks depot and the upper delta, back in
  under 4 hours, with no slopes over 8°". The engine picks the order of stations, the path between them and the time,
  and says which stations had to be skipped and why (for example, too steep).
- **Answers "what if":** "What if I accept up to 12°?" recalculates the mission and reports the difference (stations
  added, extra minutes), computed by code.
- **Reacts to alerts:** "Dust alert in zone Z2" or "we lost communication" reroutes the walk around the affected zone.
- **Shows everything on a map:** geologic map of Jezero (USGS SIM 3464), real elevation, slope and thermal layers,
  the route leg by leg, station cards with Perseverance photos, and a first-person 3D view of the walk.
- **Talks with the astronaut in the visor:** in the first-person 3D view, press **Talk** (or `T`) and ask out loud,
  for example "What's my mission?". The question is sent when you stop speaking, and the copilot answers on the
  visor and out loud, at the start or in the middle of the walk. It is the same conversation as the console chat.
- **Works without the LLM:** the Mission Planner form calls the engine directly, so a mission can always be computed
  even if the model is offline.

## How it works

```
astronaut ──► web/ui (chat, voice, map, Mission Planner)
                 │  /api
                 ▼
          engine/ (FastAPI) ◄── llm/ /chat: Ollama + qwen2.5:3b picks tools, the engine computes
                 │
                 ▼
          data/out/graph.json  ◄── data/ pipeline: USGS SIM 3464 rasters → cost map → graph
```

1. **Data (`data/`):** the USGS SIM 3464 rasters (CTX DTM 20 m, THEMIS day/night, geologic units) are cropped and
   reprojected to Mars Transverse Mercator 77.5°E. Each 20 m cell gets a walking cost from Tobler's hiking function
   (slowed down for a spacesuit) and a terrain factor from THEMIS (exposed rock or fine sand). The paths between the
   8 stations become the edges of `graph.json`, with time, distance, max slope, comms coverage and relative radiation
   dose, precomputed for slope limits of 8°, 12° and 15°.
2. **Engine (`engine/`):** FastAPI + NetworkX (Dijkstra for point-to-point routes) + Google OR-Tools (best order of
   stations under a time limit). It also handles dust and comms alerts by avoiding the edges that cross the zone.
3. **Copilot (`llm/`):** Qwen2.5 3B running locally with Ollama. It has 5 tools (`list_stations`, `station_info`,
   `point_to_point_route`, `optimize_mission`, `reroute_for_alert`) and only chooses tools and phrases answers.
4. **Screen (`web/`):** React + MapLibre console with the chat, the map, station cards, mission telemetry and the
   astronaut's 3D visor. The visor can open in its own window; the chat is shared with it over a browser channel,
   so a question asked in either one shows up in both and the new route is drawn in both.
5. **Voice (browser):** speech recognition turns the astronaut's question into text, and speech synthesis reads the
   answer with the most natural voice the browser has (Edge's neural "Natural" voices, then "Google US English" in
   Chrome). Before speaking, the answer is rewritten for the ear: "HAB → M2" becomes "the habitat, then Three Forks
   sample depot", "7490.8 m" becomes "about 7.5 kilometers", "9.18°" becomes "9.18 degrees". The screen keeps the
   original text.

Every assumption of the cost model (spacesuit speed factor, terrain multipliers, thresholds) is labeled in
[`params.yaml`](params.yaml) as `[dato]` (from NASA/USGS data), `[formula]` (published formula) or `[supuesto]`
(our assumption).

## Run it

### With Docker (everything together)

Requires Docker Desktop running.

```powershell
docker compose up --build -d     # the first build takes a few minutes
```

- Screen: http://localhost:8080
- API: http://localhost:8000/docs (the screen uses it through nginx at `/api/...`)
- Stop: `docker compose down`

| To | How |
| --- | --- |
| Use the copilot | Run [Ollama](https://ollama.com) with `ollama pull qwen2.5:3b`. By default the API looks for it on the host machine |
| Use Ollama on another machine (e.g. a GPU laptop) | On that machine run Ollama with `OLLAMA_HOST=0.0.0.0`; here: `$env:OLLAMA_URL="http://<its-ip>:11434"; docker compose up -d` |
| Use the test graph | `$env:GRAPH_PATH="contracts/graph_fake.json"; docker compose up -d` (by default the real `data/out/graph.json`) |
| Load a new graph | `docker compose restart api` (no rebuild needed) |
| See the engine logs | `docker compose logs -f api` |

Files: `Dockerfile` (API: engine + chat), `web/Dockerfile` (built screen + nginx), `web/docker/nginx.conf`,
`docker-compose.yml`.

### Without Docker (development)

```powershell
# API (engine + /chat), from the repo root
python -m venv .venv; .venv\Scripts\Activate.ps1
pip install -r engine/requirements-dev.txt -r llm/requirements.txt
python -m uvicorn engine.main:app --port 8000

# Screen
cd web/ui; npm ci; npm run dev     # http://localhost:5173
```

Voice uses the browser: speaking to the copilot needs Chrome or Edge on `localhost` or over HTTPS, and the most
natural spoken answers come from **Edge** (its neural voices). In a browser without speech recognition (e.g.
Firefox), the visor's Talk button opens a text field instead. The 🔊/🔇 button in the visor mutes the voice.

### Tests

```powershell
python -m pytest engine/tests llm/tests -q              # no model needed
python -m pytest data/tests -q                          # needs data/requirements.txt (rasterio, pyproj...)
node web/ui/scripts/probar-voz.ts                       # how answers are rewritten for speech, and voice choice
cd llm; python test_questions.py qwen2.5:3b             # the demo conversation with the real model (needs Ollama)
```

Each folder has its own README with details: [`data/`](data/README.md), [`engine/`](engine/README.md),
[`llm/`](llm/README.md), [`web/`](web/README.md), [`contracts/`](contracts/).

## Repository structure

| Folder | Owner | Contents |
| --- | --- | --- |
| [`contracts/`](contracts/) | Jeicoll | The 2 contracts: `graph_fake.json` (graph shape) and `api.md` (API), with examples and a validator |
| [`data/`](data/) | Pedro | Pipeline: NASA/USGS rasters → cost map → real `graph.json` |
| [`engine/`](engine/) | Said | FastAPI + NetworkX + OR-Tools: routes, missions and alerts |
| [`llm/`](llm/) | Manuel | Ollama copilot: tools, `/chat` and safeguards against invented numbers |
| [`web/map/`](web/map/) | Axl | MapLibre map: stations, edges, highlighted route and alert animation |
| [`web/ui/`](web/ui/) | Axel | Console: chat panel, station cards, astronaut visor (talk to the copilot, spoken answers) and Mission Planner form |
| root | Jeicoll | `params.yaml`, `estaciones.csv` (sources in `estaciones_fuentes.md`), Docker, deployment |

## Team

| Member | Role | Responsibilities |
| --- | --- | --- |
| **Francess Jeicoll Vásquez Peláez** | Technical lead and DevOps | Repository and contracts (`contracts/`), including the fake graph (`graph_fake.json`) that let everyone start in parallel from the first hour. Chose the stations, each with scientific value and a task, and loaded them with their Perseverance photos into `estaciones.csv`. Dockerfile, connection of the real graph, backend deployment and integration. Script, video and Project page together with Axel. |
| **Oder Pedro Quincho Córdova** | Geospatial data | Downloaded the USGS SIM 3464 data, the Jezero slope map and the Perseverance waypoints. Cropped and reprojected the area, built the cost map and the edges in 3 slope versions, with comms coverage, radiation dose and alert zones, and delivered the real `graph.json`. Reviewed `params.yaml` and the optimality test. |
| **Said Andre Alferez Andia** | Backend | Built the FastAPI engine with NetworkX and OR-Tools: `/estaciones`, `/ruta`, `/mision` (tested against brute force), `/alerta` and `/reset`. Kept the API stable, fixed engine and alert bugs and froze the backend for the demo. |
| **Manuel Pierce Ocaña Suárez** | AI / LLM | Built the copilot: Ollama, tool calling with 5 tools over the engine, the system prompt and the `/chat` endpoint. Tested the chat end to end with the interface, tuned the prompt, worked with Axel on the Plan B form, and as final integrator decided what went into the demo. |
| **Axl Mikel Crisóstomo Altamirano** | Frontend A: map | Built the MapLibre map: Jezero base map, stations, edges, the route drawn from `/mision` and highlighted station by station with real data, and the alert animation. Took the screenshots for the Project page. |
| **Axel Josue Chunga Chevez** | Frontend B: interface | Built the chat panel connected to `/chat`, the station cards with photos and data (with Jeicoll), the HUD mode and the Plan B form (now Mission Planner). Wrote the problem statement and the script, and made the video and the Project page with Jeicoll. |

## Data and credits

| Data | Source | Used for |
| --- | --- | --- |
| Geologic map of Jezero crater, CTX DTM 20 m, THEMIS day/night IR, geologic units | USGS Scientific Investigations Map 3464 ([doi:10.3133/sim3464](https://doi.org/10.3133/sim3464)) | Elevation, slope, terrain type, cost map, map layers, cover image |
| Slope map of Jezero crater | USGS | Slope layer and check of the DTM slope |
| Perseverance waypoints | [NASA/JPL MMGIS](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json) | Station locations along the real rover traverse |
| Station context and photos | [Mars 2020 raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/), [Octavia E. Butler Landing (PIA24483)](https://www.jpl.nasa.gov/images/pia24483-welcome-to-octavia-e-butler-landing/), [Three Forks depot (PIA25682)](https://www.jpl.nasa.gov/images/pia25682-perseverances-three-forks-sample-depot-map/), [Amalik outcrop](https://science.nasa.gov/blog/perseverance-activities-at-amalik-outcrop/), [Upper Fan](https://science.nasa.gov/blog/up-and-soon-away-perseverance-continues-exploring-the-upper-fan/), [Hawksbill Gap](https://science.nasa.gov/missions/mars-2020-perseverance/next-stop-hawksbill-gap/), [Mars rock samples](https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples) | Station names, tasks and cards |

Full list of station sources: [`estaciones_fuentes.md`](estaciones_fuentes.md).

Image credits: NASA/JPL-Caltech, USGS, MSSS/ASU, as indicated on each image.
This project is not endorsed by NASA.

Software: FastAPI, NetworkX, Google OR-Tools, Ollama, Qwen2.5, React, Vite, MapLibre GL, Tailwind CSS, Web Speech API.

## Use of AI

- **In the product:** the copilot uses Qwen2.5 3B, an open-weight model run locally with Ollama on a laptop GPU.
  The model only chooses tools and writes the answer; all numbers come from the graph engine and are checked by code
  before reaching the astronaut. Voice uses the browser's built-in Web Speech API. Speech recognition may send audio to
  the browser vendor's online service: in the console the text is shown for review before it is sent; in the visor
  it is sent as soon as the astronaut stops speaking, and shown on screen. Spoken answers use the browser's voices;
  Edge's "Natural" voices are an online Microsoft service, so the answer text is sent to it to be read.
- **During development:** we used AI coding assistants (Claude Code) to write and review parts of the code, translate
  the interface to English and write tests. A team member reviewed every change before it was merged.

## License

See [`LICENSE`](LICENSE).
