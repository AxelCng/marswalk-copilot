# contracts/ — the project's two contracts

The four modules talk to each other **only** through these two contracts. If you respect their shape, you can move forward without waiting for anyone.

| File | What it is | Owner |
| --- | --- | --- |
| [`graph_fake.json`](graph_fake.json) | Contract 1: a **fake** graph with the exact shape of the real `graph.json` | Jeicoll (the real one: Pedro) |
| [`api.md`](api.md) | Contract 2: the API's endpoints, inputs, outputs and errors | Said |
| [`ejemplos/`](ejemplos/) | API requests and responses computed on the fake graph | generated |
| [`tools/generar_graph_fake.py`](tools/generar_graph_fake.py) | Regenerates the fake graph and the examples | Jeicoll |
| [`tools/validar_graph.py`](tools/validar_graph.py) | Checks that a `graph.json` meets the contract | Pedro runs it before delivering |

> **Rule:** the contracts only change after telling the group.

```bash
python contracts/tools/generar_graph_fake.py          # regenerates graph_fake.json and ejemplos/
python contracts/tools/validar_graph.py contracts/graph_fake.json
```

Both use only the Python 3.10+ standard library.

## Contract 1: `graph.json`

The pipeline (`data/`) generates it and the engine reads it at startup. The engine takes the file path from the `GRAPH_PATH` variable (default `contracts/graph_fake.json`). On Saturday at 22:00 that variable changes and nobody touches code.

```json
{
  "meta": {"area": "jezero_aoi_v1", "crs": "MTM 77.5E", "modelo_costo": "v1",
           "fake": false, "limites_pendiente_deg": [8, 12, 15]},
  "zonas": [{"id": "Z2", "nombre": "Campo de dunas",
             "poligono": [[77.422, 18.441], [77.434, 18.441], [77.434, 18.453], [77.422, 18.453], [77.422, 18.441]]}],
  "nodes": [{
    "id": "E1", "nombre": "Frente del delta", "tipo": "ciencia",
    "lon": 77.40144, "lat": 18.45073,
    "valor_cientifico": 9, "tarea": "Muestreo de capas sedimentarias", "permanencia_min": 25,
    "unidad_geologica": "...", "zona": "Z1",
    "capas": {"elev_m": -2527, "pendiente_deg": 8.1, "themis_noche": 222},
    "fotos": [{"url": "https://mars.nasa.gov/mars2020-raw-images/...jpg", "camara": "NAVCAM_LEFT", "sol": 565, "credito": "NASA/JPL-Caltech"}]
  }],
  "edges": [{
    "origen": "HAB", "destino": "M2", "limite_deg": 15,
    "distancia_m": 2639, "tiempo_min": 41.6, "energia_rel": 45.6,
    "pendiente_max_deg": 1.9, "dosis_rel": 37.7,
    "cobertura_com_pct": 100, "sombra_pct": 8,
    "zonas": ["Z1", "Z2", "Z4"], "geometria": [[77.45089, 18.44463], [77.40844, 18.45342]]
  }]
}
```

The field names and the values in `nombre` and `tarea` are in Spanish because they are part of the contract. The screen and the copilot show them in English through [`web/shared/i18n_en.json`](../web/shared/i18n_en.json).

### Rules

- **Node types:** `habitat`, `rover`, `ciencia` (science), `muestreo` (sampling), `refugio` (shelter), `comms`. There must be exactly one `habitat` (id `HAB`).
- **Coordinates** of nodes and `geometria` in **lon/lat degrees** (east positive, 0–360 or −180–180), not MTM meters: the map uses them directly. Pedro reprojects before writing.
- **Directed edges:** A→B and B→A are two edges (going up and going down cost differently). The geometry of B→A is that of A→B reversed.
- **3 versions per slope limit:** each edge carries `limite_deg` ∈ `meta.limites_pendiente_deg`. With 8 nodes that is up to 3 × 56 = 168 edges. **If there is no path under a limit, the edge is left out** of that version (that is how stations get skipped for slope).
- `pendiente_max_deg` ≤ `limite_deg` always.
- An edge's `zonas`: ids of the `zonas` the path crosses. The dust alert works on that.
- `energia_rel` and `dosis_rel` are relative indices (models), not kcal or mSv.
- `fotos[].url` can be `null` if a station has no photo (the frontend shows a placeholder). `credito` is optional.
- `themis_noche`: night brightness temperature in K.

### Additions to the original spec

They are additive; nothing was renamed or removed.

- `edges[].limite_deg`: the spec asks for 3 versions of the graph but did not say how to store them. They go in the same file, tagged with this field.
- `zonas` at the root (polygons) and `nodes[].zona`: the frontend needs to draw the alert zones.
- `meta.fake` and `meta.limites_pendiente_deg`.

## What the fake graph contains

8 **real** stations, 4 zones and 154 edges (15°: 42, 20°: 56, 25°: 56).

- **Real** (from [`estaciones.csv`](../estaciones.csv)): position and elevation of Perseverance waypoints, the rover's tilt near each station and one Navcam photo from Raw Images per station.
- **Made up** (replaced by Pedro's `graph.json`): THEMIS, geologic unit, zones and every edge attribute. They are still consistent with the spec's cost model (Tobler × suit factor, out ≠ back).

With the real distances (the delta is about 3 km from the habitat) the demo does not fit in 3 h, so the cap became **4 h**. It is set up so the demo works:

| Case | Example | Result with fake data |
| --- | --- | --- |
| 1. Delta front + 2 sampling sites (Séítah and Three Forks) + upper delta, < 4 h, ≤ 15° | `post_mision.demo1_mision_15deg.*` | HAB→M2→E1→M2→M1→HAB, 164.0 min; **E2 (upper delta) skipped for slope** (18.5° > 15°: the gentlest path is a detour) |
| 2. "What if I accept 20°?" | `post_mision.demo2_mision_20deg.*` | the upper delta fits: HAB→REF→E2→E1→M2→M1→HAB, 201.6 min (+37.6 min) |
| 3. "Dust alert in Z2" (on mission 1) | `post_alerta.*` | avoids the HAB→M2 and M2→M1 legs by going around through the relay: HAB→COM→M2→E1→M2→COM→HAB→M1→HAB, 186.9 min |

The examples are computed by a brute-force reference inside the generator. Said can use them as the expected result in his tests (the OR-Tools optimum must give the same total time).
