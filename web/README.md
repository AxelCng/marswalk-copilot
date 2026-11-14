# web/ — frontend (Añe y Axl)

Dos carpetas y dos ramas para no pisarse en git:

| Carpeta | Persona | Rama | Entrega |
| --- | --- | --- | --- |
| [`map/`](map/) | Añe (L4) | `web-map` | Mapa MapLibre: nodos, aristas, ruta resaltada y animación de alerta |
| [`ui/`](ui/) | Axl (L5 + celular) | `web-ui` | Panel de chat, fichas de estación, modo HUD y formulario plan B |

Solo se consume la API ([`contracts/api.md`](../contracts/api.md)) y `/chat`. **Mientras no esté la API**, se trabaja con los JSON de [`contracts/ejemplos/`](../contracts/ejemplos/) y con [`contracts/graph_fake.json`](../contracts/graph_fake.json), que tienen la forma exacta de las respuestas.

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
