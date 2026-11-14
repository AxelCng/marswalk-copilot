# llm/ — copiloto con LLM (Manuel, L3)

**Entrega:** `POST /chat` que llama funciones. El LLM **nunca calcula**: cada número que dice sale de una herramienta.

## Herramientas (cada una llama a un endpoint de [`contracts/api.md`](../contracts/api.md))

| Herramienta | Endpoint |
| --- | --- |
| `listar_estaciones()` | GET `/estaciones` |
| `info_estacion(id)` | GET `/estaciones/{id}` |
| `ruta_punto_a_punto(origen, destino, pendiente_max)` | POST `/ruta` |
| `optimizar_mision(estaciones, tiempo_max_min, pendiente_max)` | POST `/mision` |
| `recalcular_por_alerta(zona, tipo)` | POST `/alerta` |

**Antes de que la API de Said esté lista:** las herramientas pueden devolver los JSON de [`contracts/ejemplos/`](../contracts/ejemplos/) tal cual. Así probás el tool calling desde la primera hora.

**Prompt de sistema:** responder en el idioma del usuario (español o inglés), llamar siempre a una herramienta antes de dar cifras, citar solo números devueltos por las herramientas y explicar cada estación omitida con su `motivo`.

**Corte 13:00:** si el modelo de Ollama no hace bien el tool calling, probá otro modelo local; si tampoco anda, API comercial para la demo y Ollama como "modo offline".

## Las 3 preguntas de la demo (con los datos falsos)

1. "Quiero visitar el frente del delta, Séítah, el depósito Three Forks y la cima del delta, volver en menos de 4 horas, sin pendientes de más de 15°" → la cima (E2) queda omitida por pendiente (20.4°)
2. "¿Y si acepto hasta 20°?" → entra la cima, suma 37.6 min
3. "Alerta de polvo en la zona Z2" → evita los tramos HAB→M2 y M2→M1
