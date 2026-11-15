# MarsWalk Copilot — UI frontend (`web/ui/`)

Tactical HUD-style interface for astronauts and EVA planners in Jezero crater (Mars), built for the **NASA Space Apps Challenge 2026**.

## 🚀 How to run locally

```bash
cd web/ui
npm install
npm run dev
```

The development server runs at `http://localhost:5173` by default.

---

## 🛰️ Features

1. **EVA Copilot panel (chat):**
   - Conversational interface connected to `POST /chat`.
   - Shows the **tool calls** explicitly (`optimize_mission`, `reroute_for_alert`, etc.).
   - Quick buttons with the 3 key questions of the demo script (8°, 12°, dust alert in Z2).

2. **Geological station cards:**
   - The 8 official stations (`HAB`, `ROV`, `E1`, `M1`, `M2`, `E2`, `REF`, `COM`).
   - High-resolution photos taken by Perseverance's instruments (Navcam, Mastcam-Z, SHERLOC/WATSON).
   - Science layers: DTM elevation, slope (°), THEMIS night thermal inertia (K), stay time and science score.
   - Detailed inspection modal with MTM coordinates.

3. **Mission telemetry:**
   - Breakdown of legs and the sequence of stops.
   - Totals for distance (km), walking time from Tobler's function adjusted for the spacesuit, life-support margin and relative radiation dose.
   - **Physical explanation of skipped stops:** shows the exact reason (e.g. the terrain's slope versus the configured limit).

4. **Plan B mode (live backup without the LLM):**
   - Direct control form with station pickers, slope selector (8°, 12°, 15°) and time limit.
   - Calls `POST /mision` on FastAPI directly, through graph algorithms (OR-Tools / Dijkstra).
   - Buttons to trigger a dust alert (`POST /alerta`) and to reset (`POST /reset`).

5. **Offline mode / live backend:**
   - Header switch to toggle between **full local mocks** and the **live backend (`http://localhost:8000`)**.
