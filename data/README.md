# data/ — data pipeline (Pedro, L1)

Full geospatial pipeline: USGS SIM 3464 downloads → rasters aligned in
MTM 77.5°E → cost map → real `graph.json`.

## Structure

```
data/
├── README.md
├── HALLAZGO_pendiente_demo.md   # why the slope demo does not hold up
├── requirements.txt
├── pipeline/                    # one module per step
│   ├── crs.py                   # MTM 77.5°E on the Mars sphere
│   ├── rutas.py                 # paths and input layers
│   ├── parametros.py            # reads params.yaml
│   ├── aoi.py                   # 00: crop window
│   ├── dim_map.py               # 00: map metadata
│   ├── rasters.py               # 10: crop + reprojection
│   ├── waypoints.py             # 20: stations to MTM
│   ├── geologia.py              # 30: star schema
│   ├── verificar.py             # 40: grid checks
│   ├── costo.py                 # 50: cost map
│   ├── aristas.py               # 60: paths and attributes
│   ├── _relieve.py              # shielding, shadow, coverage, zones
│   ├── graph.py                 # 70: real graph.json
│   └── correr.py                # CLI
├── tests/                       # 37 tests
├── raw/sim3464/                 # downloads (gitignored)
└── out/                         # products
```

## How to run it

```bash
pip install -r data/requirements.txt
python -m data.pipeline.correr --paso 00   # AOI and dim_map
python -m data.pipeline.correr --paso 10   # rasters
python -m data.pipeline.correr --paso 20   # waypoints
python -m data.pipeline.correr --paso 30   # geology
python -m data.pipeline.correr --paso 40   # verification
python -m data.pipeline.correr --paso 50   # cost map
python -m data.pipeline.correr --paso 60   # edges
python -m data.pipeline.correr --paso 70   # graph.json
python -m data.pipeline.correr --paso todo # all steps

python -m pytest data/tests -q
python contracts/tools/validar_graph.py data/out/graph.json
python -m engine.check_graph data/out/graph.json
```

## Products

| File | Contents |
| --- | --- |
| `out/aoi.json` | Crop window: MTM and lon/lat bbox, grid, CRS |
| `out/dim_map.json` | Map metadata: CRS, datum, scale, extent |
| `out/estaciones_mtm.csv` | The 8 stations in MTM, lon/lat and pixel |
| `out/rasters/*.tif` | 10 layers on the same grid (gitignored) |
| `out/rasters/malla.json` | Manifest of the shared grid |
| `out/costo.json` | Parameters and result of the cost map |
| `out/geologia.geojson` | Flattened geology layer in lon/lat (consumed by `web/map`) |
| `out/geologia/*.json` | 4 dimensions + `fact_map_feature` |
| `out/aristas.json` | 168 edges with all their attributes |
| `out/zonas.json` | Demo alert zones |
| `out/verificacion.json` | Result of the checks |
| **`out/graph.json`** | **The real graph: 8 nodes, 168 edges** |

## Current result

**Area and grid**

- 194 × 141 px AOI at 20 m = **10.94 km²**, anchored to the grid
- The 10 layers share the exact same grid, with 100 % valid cells and no gaps
- Slope: mean 3.58°, p99 21.8°, **2.57 % of cells > 15°**
- Shift from anchoring: at most 12.98 m (theoretical cap 14.14 m)
- MTM ↔ lon/lat round trip: worst deviation 6.79e-09°

**Cost and graph**

- Cost per cell: median 0.417 min (min 0.299, max 6.807)
- THEMIS: 28.4 % rock, 39.5 % sand, 32.1 % normal
- 168 edges: 56 per limit (15°, 20°, 25°)
- Out and back differ: climbing to E2 costs 56.19 min, going down 50.02 min
- `graph.json` validates with **0 warnings** and the engine accepts it
- Test mission: 229.8 min, Z1 alert checked

## Changes on Saturday the 14th (afternoon), applied by Jeicoll

`graph.json` was regenerated with the full pipeline (`--paso todo`). The 15° edges and the nodes
are identical to the previous version, except for what was changed on purpose:

1. **Slope limits `[8, 12, 15]`** (option A of `HALLAZGO_pendiente_demo.md`, already in `params.yaml`).
   8°: 30 edges, 12°: 42, 15°: 56. At 8° the upper delta (E2) is skipped for slope
   (gentlest path 9.18°); at 12° it fits.
2. **Node `themis_noche` in Kelvin.** It used to store the 8-bit DN (49–131), and the contract
   asks for K. It now uses the same calibration as the cost (`costo.dn_a_k`): 179–227 K.
3. **Alert zones with no stations inside** (`_relieve.zonas_de_alerta`). The previous boxes
   enclosed stations, and the alert left them cut off (with Z4 no station could be reached). The new ones
   sit on corridors between stations and divert the route without cutting anyone off. That is why the nodes
   no longer have a `zona`. With the 12° mission:

   | Zone | Avoids | Cost |
   | --- | --- | --- |
   | Z1 Delta entrance | HAB->M2 | +6.6 min |
   | Z2 Dune field (the demo one) | HAB->M2, E1->M1 | +30.3 min |
   | Z3 North edge of Séítah | E1->M1 | +17.1 min |
   | Z4 Habitat corridor | M1->HAB | +8.0 min |

4. `requirements.txt`: added `scikit-image` (used by step 60) and `pyyaml`.
5. `tests/test_costo_grafo.py`: the out ≠ back test used the 20° version, which no longer exists;
   it now uses the highest limit.

Verified: 37 `data/` tests, 67 engine tests, `validar_graph.py` OK and `engine.check_graph` OK.

## Input layers

| Layer | Source | Source CRS | Use |
| --- | --- | --- | --- |
| `dtm` | CTX stereo J03 20 m | Equirectangular | Elevation and slope |
| `orto` | CTX J03 6 m | Equirectangular | Base map |
| `orto_mosaico` | Caltech CTX mosaic 5 m | MTM | Alternative in MTM |
| `themis_dia` | THEMIS day 100 m | MTM | Thermal complement |
| `themis_noche` | THEMIS night 100 m | MTM | Rock vs. sand proxy |
| `hrsc` | HRSC 75 m | MTM | Elevation cross-check |
| `hrsc_sombra` | HRSC hillshade | MTM | Relief |
| `pendiente` | Derived from the DTM | — | Used by the engine |
| `costo` | Derived (Tobler × suit × terrain) | — | Least-cost path |
| `f_terreno` | Derived from THEMIS | — | Ground factor |

## Decisions you need to know about

**1. The key DTM is not in MTM.** The spec says the SIM 3464 rasters
come in MTM, but the 20 m CTX stereo DTM is in Equirectangular, with an
anisotropic pixel (19.16 × 20.20 m). Reprojecting it is the central step.

**2. pyproj aborts across celestial bodies.** With an Earth CRS it fails with
*"ellipsoid do not belong to the same celestial body"*. The Mars CRSs are
built explicitly with `+R=3396190`.

**3. THEMIS comes in DN, not Kelvin.** The mosaic is distributed as 8 bits with no
calibration table, but `params.yaml` sets the thresholds in K. The DN→K
calibration (150–300 K) is declared in `costo.py` and reproduces the 205–230 K of the
fake graph.

**4. `route_through_array` does not tell going up from going down.** A cell's cost
depends only on its slope, without sign, so A→B and B→A gave the same
time. The path is traced with the symmetric cost and the time is evaluated
afterwards with the **signed** height difference of each step.

**5. `unit_code` is not a unique key.** The `unit` integers 5 and 11 repeat with
different symbols. The real unique key is `unit_symbol` (14 units).

**6. `dim_map` does not come from `MapBoundary`.** Its `LON_MIN/LON_MAX/LAT_MIN/LAT_MAX`
are `NULL`. The values come from the FGDC XML; the CRS and datum from the `.prj`.

**7. In `GeoContacts`, `TYPE` is the certainty**, not the feature type.

## Two open issues that need a decision

**Vertical bias.** The DTM sits +7 to +22 m above `elev_m` in
`estaciones.csv`. It is a datum difference, not an alignment one. `graph.json` uses the
**DTM** (the `ELEV_CORREGIDA` constant in `graph.py`), so that elevation and
slope come from the same raster.

**The slope demo does not hold up.** E2 can be reached at 15°, so
"what if I accept 20°?" changes nothing. See
[`HALLAZGO_pendiente_demo.md`](HALLAZGO_pendiente_demo.md): it includes the measured
minimum limits and four options, with a recommendation.

## Downloads

They do not go into git (`data/raw/` is ignored):

1. The USGS SIM 3464 geologic map zip (~350 MB): CTX DTM, THEMIS day/night,
   geodatabase, metadata and coordinate systems
2. Perseverance's `M20_waypoints.json` (already summarized in `estaciones.csv`)
