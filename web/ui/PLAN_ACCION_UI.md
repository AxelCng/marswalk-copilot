# Action plan: Frontend B (astronaut UI and HUD)
**Project:** MarsWalk Copilot (NASA Space Apps Challenge 2026)  
**Owner:** Axl (Frontend B – `web/ui/`)  
**Date:** November 14, 2026  
**Design system:** AeroHUD Jezero (aligned with Añe in `web/map/`)

---

## 1. Project summary and context

MarsWalk Copilot is an assistant and planner for astronaut spacewalks (EVAs) in Jezero crater (Mars).
It combines:
- A **graph and optimization engine** (OR-Tools / networkx in `engine/`).
- NASA/USGS geospatial and geologic data (SIM 3464, DTM, slopes, THEMIS in `data/`).
- An **LLM assistant with tool calling** (Ollama in `llm/`).
- Two complementary frontend views:
  - **Frontend A (Añe - `web/map/`):** interactive MapLibre map of Jezero with the CTX/HiRISE orthophoto, the geology layer, the nodes and the edges.
  - **Frontend B (Axl - `web/ui/`):** helmet HUD (heads-up display) layer, interaction panel with the AI copilot, station cards and the Plan B contingency form.

---

## 2. Roles: Añe vs. Axl

| Dimension | Añe (`web/map/`) | Axl (`web/ui/`) |
| :--- | :--- | :--- |
| **Visual metaphor** | **View of the Martian terrain** (geospatial map) | **HUD projected on the astronaut's helmet** (cockpit/EVA HUD) |
| **Core component** | `MarsMap.jsx` (MapLibre GL JS) | AI conversation panel, POI cards, telemetry and Plan B |
| **Data consumed** | CTX mosaic, geologic GeoJSON, station `[lon, lat]` coordinates and alert polygons | `POST /chat` (LLM and tool calls), `GET /estaciones/{id}` (Navcam photos and science data), `POST /mision` |
| **Goal in the demo** | Show the route, the topography and the dust-alert detour in space | Guide the astronaut by voice/chat, inspect science samples and operate the contingency controls |

---

## 3. Design system spec: AeroHUD Jezero

So that both modules fit together visually, `web/ui/` adopts the tokens and components defined in `web/map/`:

### 3.1. Color palette and tokens

```javascript
export const HUD = {
  bgDeep: '#0b0e14',        // Base space background
  panel: '#10131a',         // Module and panel background
  glass: '#151b26',         // Glassmorphism cards
  border: '#2a3447',        // Main panel borders
  borderSubtle: '#1e2638',  // Inner separators
  onSurface: '#e1e2eb',     // Main text
  onSurfaceVariant: '#bac9cc', // Secondary text / metadata
  outline: '#849396',       // Inactive elements or faint borders
  cyan: '#00e5ff',          // Main accent, HUD glow, active links
  marsRust: '#e05a2b',      // Science accent / Martian rust
  nominal: '#10b981',       // Safe state / feasible
  warning: '#f59e0b',       // Warnings / limits close by
  critical: '#ef4444',      // Dust alerts / emergencies
};
```

### 3.2. Node colors by station type
- **Habitat / start:** `#e1e2eb`
- **Rover (Perseverance):** `#c3f5ff`
- **Science / key sample:** `#e05a2b` (Mars Rust)
- **Sampling:** `#ffb59d`
- **Shelter:** `#10b981` (Nominal)
- **Comms:** `#a8ffd2`

### 3.3. Typography
- **Headings and brand:** `'Space Grotesk', system-ui, sans-serif`
- **Body text and chat:** `Inter, system-ui, sans-serif`
- **Telemetry and tool calls:** `'JetBrains Mono', 'Fira Code', monospace` (`.label-caps` class at 10px with `letter-spacing: 0.08em; text-transform: uppercase`).

---

## 4. `web/ui/` component architecture

```
web/ui/
├── src/
│   ├── components/
│   │   ├── HudHeader.tsx         # Top bar with logo, UTC, Jezero area and API status
│   │   ├── ChatPanel.tsx         # Copilot panel with history and transcription
│   │   ├── ChatMessage.tsx       # Dialogue bubbles and tool call viewer
│   │   ├── StationCard.tsx       # Compact card for the peripheral view
│   │   ├── StationModal.tsx      # Expanded technical card (Navcam photo, geology, elevation)
│   │   ├── MissionSummary.tsx    # Bottom telemetry strip (distance, time, radiation, margin)
│   │   └── PlanBForm.tsx         # Contingency form (direct /mision with segmented selectors)
│   ├── services/
│   │   └── api.ts                # FastAPI connection (/chat, /mision, /estaciones, /alerta) + fallback to mockData
│   ├── mocks/
│   │   └── mockData.ts           # Offline demos (15°, 20°, dust alert in Z2)
│   └── index.css                 # AeroHUD variables and visual utilities
```

---

## 5. Step-by-step action plan

### Step 1: Visual sync with AeroHUD
- [ ] Add the CSS tokens (`--hud-bg-deep`, `--hud-cyan`, etc.) and the fonts to `web/ui/src/index.css`.
- [ ] Apply Añe's UI patterns to the existing components:
  - `.chip` component for states (`nominal`, `warning`, `critical`).
  - `.segmentado` selector for the slope choice (15°, 20°, 25°).
  - `.bloque` blocks and `.label-caps` labels.

### Step 2: Connect the chat panel to the LLM (`/chat`)
- [ ] Send messages to the `POST /chat` endpoint (Manuel's Ollama backend).
- [ ] If `/chat` returns an optimal route object in the response, pass `mision` on so the map updates live.
- [ ] Format the **tool calls** block in `ChatMessage.tsx` (monochrome terminal style with a mono font).
- [ ] Add the 3 preset buttons for the live demo:
  1. *"Plan a walk with a 15° slope"*
  2. *"Raise the slope limit to 20°"*
  3. *"Alert: dust storm in sector Z2"*

### Step 3: Science station cards with real data
- [ ] Connect to `GET /estaciones/{id}` to get real Perseverance photos (Navcam / Mastcam-Z).
- [ ] Handle a visual fallback if `fotos[0].url` is null (showing the matching sol).
- [ ] Show the SIM 3464 geologic units (matching Añe's labels).

### Step 4: Plan B tactical form (engine fallback)
- [ ] Reproduce Añe's planning rail controls inside the collapsible form:
  - List of stations to pick, with color markers by type.
  - Slider/number input for the maximum time (minutes).
  - Segmented slope buttons (15°, 20°, 25°).
  - Action button: *"Compute optimal route"*, calling `POST /mision` directly.

### Step 5: Integration with the map (`MarsMap.jsx`) and visor mode
- [ ] Prepare the main container to mount `<MarsMap />` in the center.
- [ ] Set up the `onSelectEstacion(id)` callback to open the side station card automatically.
- [ ] Add a view selector to switch between:
  - **Tactical console (split / overlay):** Jezero map + copilot + mission summary.
  - **First-person visor mode (helmet HUD):** the view with vignette, reticle and heading tape built in `web/ui/hud/`.

---

## 6. Demo checks and tests

To confirm everything works as the Space Apps requirements ask:
1. **Offline test (fallback):** with the backend off, the UI loads the JSON files in `contracts/ejemplos/` automatically.
2. **Online test with the engine:** start FastAPI (`engine/main.py`) and check that `/mision` responds and updates the telemetry and the legs.
3. **The 3-step presentation flow:**
   - **Step A:** request at 15° -> returns a feasible mission, highlights the route and the visited stations.
   - **Step B:** raise to 20° -> reaches more science value / an optimized time.
   - **Step C:** trigger a dust alert in Z2 -> recomputes the mission avoiding the risk zone and turns on the critical strip in the HUD.
