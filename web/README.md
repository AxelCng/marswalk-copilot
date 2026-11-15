# web/ — frontend (Añe y Axl)

Dos carpetas y dos ramas para no pisarse en git:

| Carpeta | Persona | Rama | Entrega |
| --- | --- | --- | --- |
| [`map/`](map/) | Añe (L4) | `web-map` | Mapa MapLibre: nodos, aristas, ruta resaltada y animación de alerta |
| [`ui/`](ui/) | Axl (L5 + celular) | `web-ui` | Panel de chat, fichas de estación, modo HUD y formulario plan B |

Solo se consume la API ([`contracts/api.md`](../contracts/api.md)) y `/chat`. **Mientras no esté la API**, se trabaja con los JSON de [`contracts/ejemplos/`](../contracts/ejemplos/) y con [`contracts/graph_fake.json`](../contracts/graph_fake.json), que tienen la forma exacta de las respuestas.

## Cómo correr todo junto (pantalla de la demo)

```powershell
# 1) motor de Said (terminal 1, desde la raíz; ver engine/README.md)
$env:GRAPH_PATH = "contracts/graph_fake.json"
.\.venv\Scripts\python.exe -m uvicorn engine.main:app --port 8000

# 2) pantalla (terminal 2). Incluye el mapa de web/map: no hace falta instalar nada allá
cd web/ui; npm install; npm run dev     # http://localhost:5173
```

- La pantalla arranca contra el motor real: el botón de arriba a la derecha dice `Live engine`. Al hacerle clic cambia a `Sample data`, que usa los archivos de `contracts/`.
- Los datos de prueba (`web/ui/src/mocks/mockData.ts`) **salen de `contracts/`**: no se escriben números a mano.
- Si `/chat` falla, el panel lo dice y manda al Plan B. **Nunca muestra una respuesta inventada.**
- El mapa (`web/map/src/MarsMap.jsx`, de Axl) está arriba de las pestañas, con la barra de alertas (polvo por zona, sin comunicación, reset). Al hacer clic en una estación del mapa se abre su ficha.
- Las etiquetas del mapa usan una fuente de `demotiles.maplibre.org`: **sin internet no aparecen** los nombres de las estaciones.

## Añe — `web/map/`

- Nodos: `GET /estaciones` (o `nodes` de `graph_fake.json`), color por `tipo`.
- Aristas y zonas: `GET /grafo`, que trae `edges[].geometria` y `zonas[].poligono` en `[lon, lat]`.
- Ruta resaltada: `tramos[].geometria` de la respuesta de `/mision`, en el orden de `ruta`.
- Alerta: `aristas_afectadas` de `/alerta` + el polígono de la zona.
- **Corte 16:00:** si MapLibre no muestra las teselas de Marte, usá la ortoimagen recortada como `image source` con límites fijos.

## Axl — `web/ui/`

- Fichas: `GET /estaciones/{id}` (capas, tarea y fotos). `fotos[].url` puede ser `null`: mostrá un placeholder y el sol.
- Chat: `POST /chat` → mostrar `respuesta`; si `ruta` no es `null`, pasarla al mapa.
- Formulario plan B (si el LLM falla): estaciones + `tiempo_max_min` + `pendiente_max` → `POST /mision` directo.
