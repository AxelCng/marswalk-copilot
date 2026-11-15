# MarsWalk Copilot — UI Frontend (`web/ui/`)

Interfaz táctica estilo HUD para astronautas y planificadores de EVA en el cráter Jezero (Marte), desarrollada para el **NASA Space Apps Challenge 2026**.

## 🚀 Cómo ejecutar localmente

```bash
cd web/ui
npm install
npm run dev
```

El servidor de desarrollo correrá por defecto en `http://localhost:5173`.

---

## 🛰️ Características implementadas

1. **Panel de Copiloto EVA (Chat):**
   - Interfaz conversacional conectada a `POST /chat`.
   - Visualización explícita de **Llamadas a Funciones (Tool Calling)** (`optimize_mission`, `reroute_for_alert`, etc.).
   - Botones rápidos con las 3 preguntas clave del guion de la demo (8°, 12°, alerta de polvo Z2).

2. **Fichas Geológicas de Estación:**
   - Visualización de las 8 estaciones oficiales (`HAB`, `ROV`, `E1`, `M1`, `M2`, `E2`, `REF`, `COM`).
   - Fotos en alta resolución tomadas por los instrumentos de Perseverance (Navcam, Mastcam-Z, Sherloc/Watson).
   - Capas científicas: elevación DTM, pendiente (°), inercia térmica THEMIS noche (K), permanencia y puntuación científica.
   - Modal de inspección detallada con coordenadas MTM.

3. **Telemetría de Misión:**
   - Desglose de tramos y secuencia de paradas.
   - Totales de distancia (km), tiempo de caminata según la función de Tobler ajustada al traje espacial, margen de soporte vital y dosis de radiación relativa.
   - **Explicación física de paradas omitidas:** muestra la razón exacta (ej: pendiente física excesiva vs. límite configurado).

4. **Modo Plan B (Respaldo en Vivo sin LLM):**
   - Formulario de control directo con selectores de estaciones, selector de pendiente (8°, 12°, 15°) y tiempo límite.
   - Llama directamente a `POST /mision` en FastAPI vía algoritmos de grafos (OR-Tools / Dijkstra).
   - Botón de disparo de alerta de polvo (`POST /alerta`) y reinicio (`POST /reset`).

5. **Modo Offline / Live Backend:**
   - Switch en el header para alternar entre **Mocks locales completos** y **Backend vivo (`http://localhost:8000`)**.
