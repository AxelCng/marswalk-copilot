# web/map — demo map (Añe)

React + Vite + MapLibre with the **AeroHUD Jezero** style (the team's design system). It draws the Jezero CTX mosaic, the SIM 3464 geology, the stations, the edges, the alert zones, the route leg by leg and the alert animation.

## Run

```bash
cd web/map
npm install          # if registry.npmjs.org does not respond: npm install --registry=https://registry.yarnpkg.com
npm run dev          # http://localhost:5173
```

If Said's API is at `http://localhost:8000` the map uses it (`GET /grafo`, `POST /mision`, `/alerta`, `/reset`, `GET /geologia`). If it does not respond, it falls back on its own to `contracts/graph_fake.json` and `contracts/ejemplos/`. For another URL: `VITE_API_URL=http://... npm run dev`.

## Files

| File | What it does |
| --- | --- |
| `src/MarsMap.jsx` | The map component. This is what gets integrated into `web/ui/`. |
| `src/api.js` | API calls, with a fallback to the JSON files in `contracts/`. |
| `src/geologia.js` | Loads and prepares the geology layer (SIM 3464 star schema). |
| `src/tokens.js` | AeroHUD colors for MapLibre (it does not read CSS variables) and the color for each node type. |
| `src/App.jsx` | Test bench with the 3 demo questions (mission at 15°, at 20° and dust in Z2). |
| `scripts/descargar_base.mjs` | Downloads the CTX mosaic of the study area into `public/base/`. |
| `public/base/` | 6 CTX tiles (~5 m/px) and their index `teselas.json`. |

## `MarsMap` props (for Axl)

```jsx
<MarsMap
  grafo={grafo}               // {zonas, nodes, edges} from GET /grafo
  mision={respuesta}          // RespuestaMision from /mision, /ruta, /alerta or /chat.ruta (or null)
  alerta={{ zona: 'Z2', aristas_afectadas: ['HAB->M2'] }}  // or null
  geologia={geo}              // result of getGeologia() (or null)
  mostrarGeologia={true}
  onSelectEstacion={(id) => abrirFicha(id)}
/>
```

## Base map (Plan B already active)

Esri's `OnMars/CTX` service uses a geographic grid (GCS Mars 2000, 512 px tiles) that MapLibre cannot read as tiles, and it does not send CORS headers either. That is why `scripts/descargar_base.mjs` downloads the study area and each tile is mounted as an `image source` with its 4 corners. Over an area of ~5 km the difference between equirectangular and Mercator is negligible. Level 12 (~5 m/px) is the highest level with coverage over Jezero.

```bash
node scripts/descargar_base.mjs 12
```

## Geology layer (USGS SIM 3464 star schema)

The map reads **a flattened GeoJSON** from `GET /geologia` or, without the API, from `public/geologia.geojson`. Each Feature is a row of `fact_map_feature` with its dimensions already joined by `*_key`, and the `geom_wkt` geometry reprojected from MTM 77.5°E to lon/lat. The conversion from the `.gdb` belongs to `data/` (Pedro).

| Table | Columns the map uses |
| --- | --- |
| `fact_map_feature` | `feature_key`, `unit_key`, `feature_type_key`, `source_layer`, `area_m2`, `length_m` |
| `dim_geologic_unit` | `unit_symbol` (label), `unit_name`, `age_prefix`, `color_id` |
| `dim_feature_type` | `feature_type`, `certainty` (approximate or inferred contact = dotted), `geometry_type` |
| `dim_spatial_context` | `in_landing_ellipse`, `in_figure_area`, `on_cross_section` (kept, not drawn yet) |
| `dim_map` | not needed in the GeoJSON |

- Polygons: geologic units, 35 % fill under routes and nodes. `unit_symbol` label from zoom 12.
- Lines: contacts and linear features.
- Color: `color_hex` if `data/` resolves it from `color_id`; otherwise a fixed earth-tone palette per unit.
- Hover: symbol, name, age and feature type.
- Legend: the 8 units with the largest area.

Until the file exists, the panel says "No layer" and the rest of the map works the same.
