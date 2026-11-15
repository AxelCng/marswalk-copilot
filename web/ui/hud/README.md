# MarsWalk Copilot — HUD mode (`web/ui/hud/`)

First-person helmet visor to follow the EVA leg by leg. Based on the mockup
"MarsWalk EVA – Visor HUD Proyección Óptica Realista" and on the AeroHUD Jezero design system tokens
(copied from `web/map/src/styles.css` and `web/map/src/tokens.js`).

```bash
cd web/ui/hud
npm install        # if registry.npmjs.org does not respond: --registry=https://registry.yarnpkg.com
npm run dev        # http://localhost:5174
```

## What it shows and where each value comes from

| Element | Value | Source |
| --- | --- | --- |
| Background photo | Navcam image of the leg's destination station | The node's `fotos[0].url` (`/estaciones/{id}` or `graph_fake.json`). If it is `null` or fails to load: `hud-bg-deep` background with a notice |
| Heading tape | Cyan mark = heading to the next station | Computed from the first and last `[lon, lat]` of `tramos[i].geometria` |
| Locked target | id, name, distance, slope, walking pace, heading | `tramos[i]` + destination node |
| Center reticle | Pitch ladder (visor scale) and `PEND` (slope) mark | `tramos[i].pendiente_max_deg` |
| Top left | Leg N of M, total time, margin, distance, route, skipped stations | `RespuestaMision.totales`, `ruta`, `omitidas` |
| Bottom left | Red alert strip | `/alerta` request (`zona`, `tipo`) + `aristas_afectadas` and the new `totales` |
| Bottom right | Tactical SVG minimap | `tramos[].geometria`; with an alert, the zone polygon and the previous mission's avoided legs; underneath, USGS SIM 3464 geologic units |
| Locked target (terrain) | Geologic unit, DTM elevation, THEMIS night and the units the leg crosses | `web/shared/sim3464/` (see `web/scripts/sim3464/README.md`) |

Suit data (O2, pressure, heart rate) does **not** come from the API and is not shown.

## Data

- With the API running (`VITE_API_URL`, default `http://localhost:8000`): `POST /mision` with the
  demo 1 request (15°), `POST /alerta {zona: Z2, tipo: polvo}`, `POST /reset`.
- Without the API: `contracts/ejemplos/post_mision.demo1_mision_15deg.response.json` and `post_alerta.response.json`.
  The panel chip says **API** or **Example**.

## Controls

- `◀ Previous` / `Next ▶` (or the ← → arrows): step through the legs.
- `Dust alert Z2` / `Clear alert`: the API recomputes the whole mission from the origin, so the view goes back to leg 1.
- Dragging the scene turns the view; the target mark moves along the tape and `Center` locks it again.
