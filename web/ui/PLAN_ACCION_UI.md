# Plan de Acción: Frontend B (UI & HUD del Astronauta)
**Proyecto:** MarsWalk Copilot (NASA Space Apps Challenge 2026)  
**Responsable:** Axl (Frontend B – `web/ui/`)  
**Fecha:** 14 de Noviembre, 2026  
**Sistema de Diseño:** AeroHUD Jezero (alineado con Añe en `web/map/`)

---

## 1. Resumen y Contexto del Proyecto

MarsWalk Copilot es un asistente y planificador para caminatas espaciales (EVA) de astronautas en el cráter Jezero (Marte). 
Combina:
- Un **motor de grafos y optimización** (OR-Tools / networkx en `engine/`).
- Datos geoespaciales y geológicos de NASA/USGS (SIM 3464, DTM, pendientes, THEMIS en `data/`).
- Un **asistente LLM con tool calling** (Ollama en `llm/`).
- Dos vistas frontend complementarias:
  - **Frontend A (Añe - `web/map/`):** Mapa interactivo de Jezero en MapLibre con ortofoto CTX/HiRISE, capa geológica, nodos y trazado de aristas.
  - **Frontend B (Axl - `web/ui/`):** Capa HUD (Heads-Up Display) de casco, panel de interacción con el Copiloto IA, fichas de estación y formulario de contingencia Plan B.

---

## 2. Diferenciación de Roles: Añe vs. Axl

| Dimensión | Añe (`web/map/`) | Axl (`web/ui/`) |
| :--- | :--- | :--- |
| **Metáfora visual** | **Visión del terreno marciano** (Geospatial Map) | **Proyección HUD en el casco del astronauta** (Cockpit/EVA HUD) |
| **Componente central** | `MarsMap.jsx` (MapLibre GL JS) | Panel de conversación con IA, fichas de POIs, telemetría y Plan B |
| **Datos consumidos** | Mosaico CTX, GeoJSON geológico, coordenadas `[lon, lat]` de estaciones y polígonos de alerta | `POST /chat` (LLM y tool calls), `GET /estaciones/{id}` (fotos Navcam y datos de ciencia), `POST /mision` |
| **Objetivo en la demo** | Ver espacialmente la ruta, la topografía y el desvío por alerta de polvo | Guiar al astronauta por voz/chat, inspeccionar muestras científicas y operar controles de contingencia |

---

## 3. Especificación del Sistema de Diseño: AeroHUD Jezero

Para que ambos módulos se integren visualmente de forma impecable, `web/ui/` adopta los tokens y componentes definidos en `web/map/`:

### 3.1. Paleta de Colores y Tokens

```javascript
export const HUD = {
  bgDeep: '#0b0e14',        // Fondo base espacial
  panel: '#10131a',         // Fondo de módulos y paneles
  glass: '#151b26',         // Tarjetas con efecto glassmorphism
  border: '#2a3447',        // Bordes principales de paneles
  borderSubtle: '#1e2638',  // Separadores internos
  onSurface: '#e1e2eb',     // Texto principal
  onSurfaceVariant: '#bac9cc', // Texto secundario / metadata
  outline: '#849396',       // Elementos inactivos o bordes tenues
  cyan: '#00e5ff',          // Acento principal, glow HUD, enlaces activos
  marsRust: '#e05a2b',      // Acento científico / óxido marciano
  nominal: '#10b981',       // Estado seguro / viabilidad positiva
  warning: '#f59e0b',       // Advertencias / límites cercanos
  critical: '#ef4444',      // Alertas de polvo / emergencias
};
```

### 3.2. Colores de Nodo por Tipo de Estación
- **Hábitat / Inicio:** `#e1e2eb`
- **Rover (Perseverance):** `#c3f5ff`
- **Ciencia / Muestra clave:** `#e05a2b` (Mars Rust)
- **Muestreo:** `#ffb59d`
- **Refugio:** `#10b981` (Nominal)
- **Comms:** `#a8ffd2`

### 3.3. Tipografía
- **Titulares y Marca:** `'Space Grotesk', system-ui, sans-serif`
- **Lectura general y Chat:** `Inter, system-ui, sans-serif`
- **Telemetría y Tool Calls:** `'JetBrains Mono', 'Fira Code', monospace` (clase `.label-caps` en 10px con `letter-spacing: 0.08em; text-transform: uppercase`).

---

## 4. Arquitectura de Componentes de `web/ui/`

```
web/ui/
├── src/
│   ├── components/
│   │   ├── HudHeader.tsx         # Barra superior con logo, UTC, área Jezero y estado API
│   │   ├── ChatPanel.tsx         # Panel de copiloto con historial y transcripción
│   │   ├── ChatMessage.tsx       # Burbujas de diálogo y visor de Tool Calls
│   │   ├── StationCard.tsx       # Tarjeta compacta para el visor periférico
│   │   ├── StationModal.tsx      # Ficha técnica ampliada (foto Navcam, geología, elevación)
│   │   ├── MissionSummary.tsx    # Franja inferior de telemetría (distancia, tiempo, radiación, margen)
│   │   └── PlanBForm.tsx         # Formulario de contingencia (/mision directo con selectores segmentados)
│   ├── services/
│   │   └── api.ts                # Conexión con FastAPI (/chat, /mision, /estaciones, /alerta) + fallback a mockData
│   ├── mocks/
│   │   └── mockData.ts           # Demos offline (15°, 20°, alerta de polvo Z2)
│   └── index.css                 # Implementación de variables AeroHUD y utilidades visuales
```

---

## 5. Plan de Acción Paso a Paso

### Paso 1: Sincronización Estética con AeroHUD
- [ ] Incorporar los tokens CSS (`--hud-bg-deep`, `--hud-cyan`, etc.) y las fuentes en `web/ui/src/index.css`.
- [ ] Aplicar los patrones de UI de Añe a los componentes existentes:
  - Componente `.chip` para estados (`nominal`, `warning`, `critical`).
  - Selector `.segmentado` para la selección de pendientes (15°, 20°, 25°).
  - Bloques `.bloque` y etiquetas `.label-caps`.

### Paso 2: Integración del Panel de Chat con el LLM (`/chat`)
- [ ] Conectar el envío de mensajes con el endpoint `POST /chat` (Ollama backend de Manuel).
- [ ] Si `/chat` devuelve un objeto de ruta óptima en la respuesta, propagar `mision` para actualizar el mapa en vivo.
- [ ] Formatear el bloque de **Tool Calls** en `ChatMessage.tsx` (estilo terminal monocromática con tipografía mono).
- [ ] Integrar los 3 botones de presets para la demo en vivo:
  1. *"Planificar caminata con 15° de pendiente"*
  2. *"Ajustar límite de pendiente a 20°"*
  3. *"Alerta: tormenta de polvo en sector Z2"*

### Paso 3: Fichas Científicas de Estación con Datos Reales
- [ ] Conectar con `GET /estaciones/{id}` para obtener fotos reales de Perseverance (Navcam / Mastcam-Z).
- [ ] Manejar fallback visual si `fotos[0].url` es nula (indicando el Sol correspondiente).
- [ ] Mostrar unidades geológicas del SIM 3464 (coincidiendo con las etiquetas de Añe).

### Paso 4: Formulario Táctico Plan B (Fallback del Motor)
- [ ] Replicar los controles del riel de planificación de Añe dentro del formulario colapsable:
  - Lista de estaciones a seleccionar con indicadores de color según su tipo.
  - Slider/input numérico de tiempo máximo (minutos).
  - Botones segmentados de pendiente (15°, 20°, 25°).
  - Botón de acción: *"Calcular ruta óptima"* conectando directamente a `POST /mision`.

### Paso 5: Integración con el Mapa (`MarsMap.jsx`) y Modo Visor
- [ ] Preparar el contenedor principal para montar `<MarsMap />` en el centro.
- [ ] Configurar el callback `onSelectEstacion(id)` para abrir automáticamente la ficha de estación lateral.
- [ ] Habilitar un selector de vista para alternar entre:
  - **Consola Táctica (Split / Overlay):** Mapa de Jezero + Copiloto + Resumen de misión.
  - **Modo Visor en Primera Persona (HUD de Casco):** La vista con viñeta, retícula y cinta de rumbo desarrollada en `web/ui/hud/`.

---

## 6. Verificación y Pruebas de la Demo

Para validar que todo funciona según los requerimientos del Space Apps:
1. **Prueba Offline (Fallback):** Verificar que con el backend apagado, la UI cargue automáticamente los JSONs de `contracts/ejemplos/`.
2. **Prueba Online con el Motor:** Levantar FastAPI (`engine/main.py`) y comprobar que `/mision` responde y actualiza la telemetría y los tramos.
3. **Flujo de los 3 Pasos de la Presentación:**
   - **Paso A:** Petición a 15° -> Devuelve misión viable, resalta ruta y estaciones visitadas.
   - **Paso B:** Aumento a 20° -> Permite alcanzar mayor valor científico / tiempo optimizado.
   - **Paso C:** Disparo de alerta de polvo en Z2 -> Recalcula la misión evitando la zona de riesgo y activa la franja crítica en el HUD.
