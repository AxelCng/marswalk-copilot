# Copilot in the visor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the astronaut talk to the copilot from the visor (Talk button / `T`), hear the answer and read it, in one conversation shared with the console.

**Architecture:** The chat history moves from `ChatPanel` into a shared store (`services/copiloto.ts`) that both the console and the visor read. The store syncs between windows as snapshots over the existing `BroadcastChannel` in `services/eva.ts`. `App.tsx` applies the route of each new assistant message once per window. The visor gets a voice hook (speech recognition + speech synthesis) and a small copilot panel.

**Tech Stack:** React 19 + TypeScript (`web/ui`, Vite), browser Web Speech API (`SpeechRecognition`, `speechSynthesis`), `BroadcastChannel`.

**Spec:** `docs/superpowers/specs/2026-11-15-copilot-in-visor-design.md`

## Global Constraints

- All UI text in English (project requirement).
- No new npm dependencies. `web/ui` has no test runner: every task is checked with `npm run build` (runs `tsc -b`, must pass with 0 errors) plus the browser checks listed in the task, against `docker compose up --build -d` on `http://localhost:8080` or `npm run dev` on `http://localhost:5173`.
- Speech recognition: `lang = 'en-US'`, `continuous = false`, `interimResults = false` (same as the console today).
- Never show or speak a made-up answer: on `/chat` failure, keep today's message *"The copilot isn't reachable right now. Mission Planner plans the same walk with the route engine directly."*
- Only the visor speaks; the console never calls `speechSynthesis`.
- The console chat looks and behaves exactly as today (presets, review-before-send dictation, wait counter, tool calls, Plan B link, New button).

## Review Focus

- **Two windows open, question asked in one:** the other window shows the same messages within a second and applies the route once; asking from the other window while the first is still thinking is disabled. (Task 3 browser check.)
- **Visor window opened after a conversation already exists:** it shows that conversation but does not replace the current mission with an old route from it. (Task 3 browser check.)
- **Microphone denied / no speech / unsupported browser:** the visor panel says so in English; in a browser without `SpeechRecognition` the Talk button opens a text field. (Task 4 browser check.)
- **`T` pressed while typing** in the visor text field or any input: it types a "t", it does not start listening. (Task 4 browser check.)
- **Leaving the visor while it speaks or listens:** speech stops and the microphone is released. (Task 4 browser check.)

---

### Task 1: Shared conversation store synced between windows

**Files:**
- Modify: `web/ui/src/services/eva.ts` (add two message types)
- Create: `web/ui/src/services/copiloto.ts`

**Interfaces:**
- Produces (in `copiloto.ts`):
  - `interface EstadoCopiloto { mensajes: MensajeHistorial[]; cargando: boolean; desde: number | null; version: number }` — `desde` is `Date.now()` when the current question started, `null` when idle.
  - `const copiloto: { estado(): EstadoCopiloto; suscribir(fn: () => void): () => void; preguntar(texto: string): Promise<void>; reiniciar(): void }`
  - `function useCopiloto(): EstadoCopiloto` (via `useSyncExternalStore(copiloto.suscribir, copiloto.estado)`).
  - `const SALUDO: string` — moved verbatim from `ChatPanel.tsx`.
- Produces (in `eva.ts`): `eva.publicarChat(e: EstadoCopiloto)`, `eva.alChat(fn: (e: EstadoCopiloto) => void): () => void`, `eva.pedirChat()`, `eva.alPedidoChat(fn: () => void): () => void`, with message types `{ tipo: 'chat'; estado: EstadoCopiloto }` and `{ tipo: 'chat-pedir' }`. Add both to the header comment of `eva.ts`.

- [ ] **Step 1: Add the `chat` / `chat-pedir` messages to `eva.ts`** with the four functions above, following the existing `publicarMision` / `alMision` / `pedirMision` / `alPedido` pattern. Import the type with `import type` from `./copiloto` to avoid a runtime cycle.

- [ ] **Step 2: Implement `copiloto.ts`.**
  - Initial state: `{ mensajes: [saludo(SALUDO)], cargando: false, desde: null, version: 0 }`, with `saludo` and `hora` moved from `ChatPanel.tsx`.
  - Every local change: build a new state object with `version: estado.version + 1`, notify subscribers, then `eva.publicarChat(estado)`.
  - `eva.alChat(e)`: adopt `e` only if `e.version > estado.version`; notify subscribers; do **not** re-publish.
  - `eva.alPedidoChat(() => …)`: publish the current state only if `estado.version > 0` (a window with only the greeting does not answer).
  - On module load: `eva.pedirChat()`.
  - `preguntar(texto)`: trim; return if empty or `estado.cargando`. Then exactly what `ChatPanel.handleSend` does today (user message, history payload from non-local messages, `api.postChat`, assistant message with `llamadas/ruta/segundos/numeros_sin_fuente/error/local`, the fixed failure message on throw), setting `cargando: true, desde: Date.now()` before the call and `cargando: false, desde: null` after.
  - `reiniciar()`: `mensajes: [saludo(SALUDO)]`, ignored while `cargando`.

- [ ] **Step 3: Build**

Run: `cd web/ui && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add web/ui/src/services/eva.ts web/ui/src/services/copiloto.ts
git commit -m "feat(web/ui): shared copilot conversation synced between windows"
```

### Task 2: Console chat panel uses the shared store

**Files:**
- Modify: `web/ui/src/components/ChatPanel.tsx`

**Interfaces:**
- Consumes: `useCopiloto()`, `copiloto.preguntar`, `copiloto.reiniciar`, `SALUDO` from Task 1.
- Produces: `ChatPanel` props become `{ onViewRoute?: () => void; onIrPlanB?: () => void }` — `onRouteGenerated` is removed (Task 3 applies routes in `App.tsx`).

- [ ] **Step 1: Replace local chat state.** `messages`, `loading` and the `handleSend` network logic come from the store: `const { mensajes: messages, cargando: loading, desde } = useCopiloto()`. `handleSend(text?)` keeps its dictation cleanup and input clearing, then calls `copiloto.preguntar(text)`. The wait counter (`espera`) is computed from `desde` (seconds since `desde`, ticking every second while `loading`). The New button calls `copiloto.reiniciar()`. Dictation, input, presets and rendering stay as they are.

- [ ] **Step 2: Remove `onRouteGenerated`** from the props and from `App.tsx`'s `<ChatPanel …>` (the call moves to Task 3; until then routes from the chat are not drawn — acceptable between commits on this branch).

- [ ] **Step 3: Build**

Run: `cd web/ui && npm run build`
Expected: exits 0.

- [ ] **Step 4: Browser check** — console only: greeting shows; "Walk at 8°" preset sends, the wait counter counts, the answer and its tool calls show; New resets to the greeting; dictation still fills the input without sending.

- [ ] **Step 5: Commit**

```bash
git add web/ui/src/components/ChatPanel.tsx web/ui/src/App.tsx
git commit -m "refactor(web/ui): console chat reads the shared copilot conversation"
```

### Task 3: Apply chat routes once per window

**Files:**
- Modify: `web/ui/src/App.tsx`

**Interfaces:**
- Consumes: `useCopiloto()` from Task 1; existing `onRutaDelChat(ruta: RespuestaMision, res?: ChatResponse)` in `App.tsx`.

- [ ] **Step 1: Add the effect.** In `App`, read `const { mensajes } = useCopiloto()`. Keep a `useRef<Set<string> | null>(null)` of seen message ids. On every change of `mensajes`:
  - first run: fill the set with all current ids and apply nothing;
  - later runs: for each assistant message whose id is not in the set, add it; if it has `ruta` and no `error`, call `onRutaDelChat(m.ruta, { answer: m.contenido, calls: m.llamadas ?? [], route: m.ruta })`.

  The effect runs in both the console and the visor window (`VENTANA_VISOR`), so both apply routes from questions asked in either.

- [ ] **Step 2: Build**

Run: `cd web/ui && npm run build`
Expected: exits 0.

- [ ] **Step 3: Browser checks**
  - Console: the "Walk at 8°" preset draws the route on the map (as before Task 2).
  - Open the visor window (Visor → Window). In the console send "Allow 12°": the visor window's mission changes to the 12° route.
  - Open a second visor window after a conversation exists: its mission is the console's current one, not an older route from the chat.
  - While the console waits for an answer, a second console tab shows the same pending question and its Send / presets are disabled.

- [ ] **Step 4: Commit**

```bash
git add web/ui/src/App.tsx
git commit -m "feat(web/ui): apply copilot routes once per window"
```

### Task 4: Talk to the copilot from the visor

**Files:**
- Create: `web/ui/src/hooks/useVozCopiloto.ts`
- Create: `web/ui/src/components/CopilotVisor.tsx`
- Modify: `web/ui/src/components/VisorHud.tsx` (render the panel; add the controls to `nav.eva-controles`)
- Modify: the visor stylesheet that defines `.eva-controles` / `.eva-aviso` (find it with `grep -rn "eva-controles" web/ui/src`), for the panel's styles
- Modify: `web/ui/README.md` (one bullet under the HUD/visor features: talk to the copilot with Talk or `T`, spoken and on-screen answers)

**Interfaces:**
- Consumes: `useCopiloto()`, `copiloto.preguntar` from Task 1.
- Produces:
  - `useVozCopiloto(): { escuchando: boolean; puedeEscuchar: boolean; silencio: boolean; aviso: string; hablar(): void; alternarSilencio(): void }` — `hablar()` starts listening (or stops if already listening); on a final result it calls `copiloto.preguntar(texto)`. Error texts: reuse the five English messages from `ChatPanel`'s `onerror` map. `aviso` is `'Listening…'` while listening.
  - `CopilotVisor: React.FC` — reads the store and the hook; renders the panel and exposes nothing else.

- [ ] **Step 1: Implement `useVozCopiloto`.**
  - Recognition: same constructor lookup and settings as `ChatPanel`. Abort and release on unmount.
  - Speech: when a new assistant message arrives (compare the last message id with a ref; skip the ones present on mount), cancel any current speech and, unless `silencio`, speak `m.contenido` with `new SpeechSynthesisUtterance(text)`, `lang = 'en-US'`. `hablar()` and unmount call `speechSynthesis.cancel()`.
  - `silencio` persists in `localStorage` under `marswalk-visor-silencio` (wrapped in try/catch).
  - `T` key: a `keydown` listener on `window` calling `hablar()` when `e.key.toLowerCase() === 't'`, not repeated (`!e.repeat`), and the focus is not an `INPUT`, `SELECT` or `TEXTAREA` (same rule as `visor3d.js`).

- [ ] **Step 2: Implement `CopilotVisor`.**
  - Panel above the bottom controls: last user message as "You: …", last assistant message as "Copilot: …", and a state line: `aviso` when set, else `Thinking… {n} s` while `cargando` (from `desde`), else nothing. Long answers scroll inside the panel (max height about a third of the visor). Hidden while the conversation has only the greeting and nothing is happening.
  - Buttons rendered by the parent `nav` (Step 3): **Talk (T)** — 🎙 icon, `aria-pressed={escuchando}`, disabled while `cargando`; **mute toggle** — 🔊 / 🔇 with `title` "Mute the copilot's voice" / "Unmute".
  - When `puedeEscuchar` is false, Talk shows a one-line text input in the panel instead (placeholder "Ask the copilot…"), sent with Enter through `copiloto.preguntar`.

- [ ] **Step 3: Wire it into `VisorHud`.** Render `<CopilotVisor />` inside `.eva-visor`, and put Talk and the mute toggle in `nav.eva-controles`, before Autopilot. Add `<kbd>T</kbd> talk` to the `eva-ayuda` line.

- [ ] **Step 4: Build**

Run: `cd web/ui && npm run build`
Expected: exits 0.

- [ ] **Step 5: Browser checks** (Chrome or Edge, `http://localhost:8080` after `docker compose up --build -d`, Ollama running)
  - Visor on top of the console: press Talk, say "what's my mission?" → the panel shows "You: …", then "Thinking… n s", then the answer, read aloud; the console chat shows the same exchange.
  - Press `T` → listening starts; in the visor text field (Firefox) typing "t" just types.
  - Mute → the next answer shows but is not spoken; reload the visor → still muted.
  - "Allow 12°" from the visor → the visor and the dashboard map draw the 12° route.
  - Visor window with the console closed → Talk works and the answer is spoken.
  - Deny the microphone → the panel says "Microphone permission denied. …".
  - Close the visor (Console / Esc) while it speaks → the voice stops.
  - Stop Ollama → asking from the visor shows and speaks the copilot's "not available" answer, never a made-up one.

- [ ] **Step 6: Commit**

```bash
git add web/ui/src/hooks/useVozCopiloto.ts web/ui/src/components/CopilotVisor.tsx web/ui/src/components/VisorHud.tsx web/ui/README.md <visor stylesheet>
git commit -m "feat(web/ui): talk to the copilot from the visor, with spoken answers"
```
