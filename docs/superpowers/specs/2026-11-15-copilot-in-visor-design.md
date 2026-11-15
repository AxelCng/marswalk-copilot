# Talk to the copilot from the astronaut's visor — design

Date: 2026-11-15 · Branch: `feat/copilot-in-visor`

## Intent

The astronaut is on Mars, in the first-person visor. They press a button, ask the copilot out loud ("what's my mission?") and hear the answer, at the start or at any point during the walk. Today the copilot only lives in the console's chat panel; the visor has no way to reach it.

## Goals

- A **Talk** button in the visor (and the `T` key) that starts listening.
- When the astronaut stops speaking, the question is **sent on its own** (no editing step: gloves, walking).
- The copilot **answers out loud** and the answer also shows **as text on the visor**.
- It is **one conversation** with the console: what is asked in the visor shows up in the console chat and vice versa, so a follow-up like "allow 12°" works no matter where the first question was asked.
- Works with the visor **on top of the console** and **in its own window** (`?vista=visor`), even if the console window is closed.
- A new route from an answer is drawn in the visor and the console, as the chat does today.

## Non-goals

- Talking from another computer (would need a server relay; the window channel only works in one browser).
- A wake word, streaming answers or interrupting the copilot mid-answer.
- Changing the copilot itself (`llm/`) or the console's review-before-send dictation.

## Anti-goals

- Never show or speak a made-up answer: if `/chat` fails, say so (same rule as the console).
- Two windows must not end up with different conversations, or both speaking at once.

## Approaches considered

- **A. Shared conversation synced between windows (chosen).** The chat history moves out of `ChatPanel` into a shared store used by the console and the visor. The window where the question is asked calls `/chat`; the conversation is shared over the existing window channel (`eva.ts`). Works in both visor modes and keeps the demo as one conversation. Cost: the largest change (chat panel refactor, avoiding two simultaneous questions).
- B. The visor only relays the question to the console, which calls `/chat`. Simpler, but the button does nothing when the visor is in its own window and the console is closed.
- C. The visor keeps its own conversation. Fastest, but the console would not see it and follow-ups would lose context.

## Design

### Shared conversation (`web/ui/src/services/copiloto.ts`, new)

- Holds what `ChatPanel` keeps today: the message list (`MensajeHistorial[]`, including the greeting), `loading` and when the current question started (for the wait counter).
- `preguntar(texto)` does what `ChatPanel.handleSend` does today: add the user message, call `api.postChat` with the non-local history, add the answer (or the "not reachable" message on failure).
- React components read it with a small hook (`useCopiloto`), e.g. via `useSyncExternalStore`.
- **Sync between windows:** two new message types on the `eva.ts` channel:
  - `chat`: a snapshot of the conversation (`messages`, `loading`, `desde`), sent after every change.
  - `chat-pedir`: a window that just opened asks for the current conversation; any window that has one answers with a `chat` snapshot.
  Snapshots replace the local copy (the conversation is small), so there is no merging.
- **One question at a time:** `preguntar` does nothing while `loading` is true in any window (the flag travels in the snapshot). The input and the Talk button show the busy state.

### Routes from answers

- Today the console applies a route through `onRouteGenerated` → `onRutaDelChat` in `App.tsx`, and then publishes the mission to the visor window.
- With a shared conversation, **every window applies the route of a new assistant message** (the one it asked or one it received in a snapshot), once per message id. That way the console updates when the question came from the visor window, and the visor window updates when it came from the console, without sending missions from the visor to the console.

### Console (`ChatPanel.tsx`)

- Uses `useCopiloto` instead of its own state. Everything visible stays the same: presets, dictation with review, wait counter, tool calls, Plan B link.

### Visor (`VisorHud.tsx`)

- **Talk button** with a microphone, next to Autopilot and the dust alert, plus the **`T` key** (free today: the visor uses W A S D, Q E, arrows and Shift). Ignored while typing in a field, like the movement keys.
- Press → browser speech recognition (`en-US`, one phrase, as the console does). When it ends with text, `preguntar(texto)` runs right away. Pressing again while listening stops listening.
- **Copilot panel** on the visor, above the bottom controls: the last question ("You: …") and the last answer ("Copilot: …"), plus the state line: *Listening…*, *Thinking… 4 s*, or the error. Only the last exchange, not the whole history; long answers scroll inside the panel.
- **Voice answer:** `speechSynthesis` reads the answer text only (not tool calls or numbers lists), in English. A new question or leaving the visor stops it. A **mute** toggle next to Talk turns the voice off; the text still shows.
- **Only the visor speaks.** The console never speaks, so with two windows open there is a single voice.
- Errors: no microphone permission, no speech detected, or `/chat` unavailable → shown on the panel (and the copilot's own error answer is spoken, it is short).
- Without speech recognition (e.g. Firefox): the Talk button opens a one-line text field in the visor instead, sent with Enter.

### Visor window (`App.tsx`, `VENTANA_VISOR`)

- On open it sends `chat-pedir` so it starts with the current conversation, and it applies routes from answers as above.

## Constraints

- Speech recognition and the microphone need `localhost` or HTTPS (Docker on `localhost:8080` is fine). Chrome and Edge support it; it may use an online service, as the console already warns.
- The window channel works between windows of the same browser and origin only.
- `/chat` answers in ~5 s on GPU and tens of seconds on CPU; the wait counter covers that.
- UI text in English (project requirement).

## Left to the builder

- Exact layout and styling of the copilot panel and buttons, following the visor's existing styles.
- Voice choice and rate for `speechSynthesis` (any English voice; default rate).
- How the store is split into files and named.
- There are no UI tests in `web/ui`; check by hand in the browser: ask from the visor on top of the console, from the visor window with the console open, and with the console closed; confirm the conversation and the route match in both windows.

## Calls made without asking

- `T` as the shortcut, a mute toggle, only the visor speaks, only the last exchange on the visor, and a text field when the browser has no speech recognition.
