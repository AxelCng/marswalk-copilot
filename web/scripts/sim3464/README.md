# USGS SIM 3464 importer (Jezero / Nili Planum)

Converts the **USGS SIM 3464** geologic map database (Sun and Stack, 2020, [doi:10.3133/sim3464](https://doi.org/10.3133/sim3464))
into the star schema in [`modelo_estrella.sql`](modelo_estrella.sql) ([ERD](modelo_estrella_DER.mmd)) and into the files the two interfaces read.

```bash
pip install pyogrio rasterio pyproj shapely numpy pillow
python web/scripts/sim3464/importar_sim3464.py "C:/path/to/sim3464_database"
```

`sim3464_database` is the folder with `modelo_estrella.sql` and `sim3464_JezeroNili_FINAL/` (Nili.gdb + Rasters). It is not committed to git (~490 MB).

## Outputs

| File | What it is | Used by |
| --- | --- | --- |
| `out/sim3464_estrella.sqlite` | Full star schema: 5,169 rows in `fact_map_feature` (WKT geometry in MTM 77.5°E). ~90 MB, not in git | queries, `engine/` if needed |
| `web/map/public/geologia.geojson` | `fact_map_feature` flattened (dimensions joined) over the whole map frame (76.80–77.80°E, 17.70–18.70°N), simplified to 8 m, in lon/lat. ~6.5 MB | Geology layer of the map |
| `web/map/public/base/ctx_sim3464.jpg` + `.json` | SIM 3464 CTX mosaic reprojected to Mars Mercator, 4096 px (~14 m/px). Its bounds set the map's `maxBounds`, so panning or zooming out never shows an empty background | map background (under the 5 m CTX tiles) |
| `web/shared/sim3464/geologia_ruta.geojson` | Units only, clipped to the route, simplified to 12 m | HUD minimap |
| `web/shared/sim3464/estaciones_capas.json` | For each station in `estaciones.csv`: unit, surface features, CTX DTM 20 m elevation, slope (Horn 3×3), HRSC 75 m elevation, THEMIS IR day/night | map station card and HUD target |

## Honesty notes

- THEMIS in this database is an **8-bit brightness mosaic (DN 0–255)**, not temperature or thermal inertia: the interfaces show it as "relative DN".
- The slope is that of a 20 m cell around the station, not that of the leg. Edge slopes still come from the graph (today `graph_fake.json`).
- Unit colors in the interfaces are our own shades, not the official SIM 3464 symbology (binary `.lyr`).
- A source anomaly is kept as is: one polygon with `unit = 5` and symbol `Nue` (row 15 of `dim_geologic_unit`).
