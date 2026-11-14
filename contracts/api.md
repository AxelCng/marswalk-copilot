# Contrato 2 — API FastAPI (dueño: Said)

Base local: `http://localhost:8000`. Todo es JSON en UTF-8. CORS abierto en desarrollo (el frontend corre en otro puerto).

Ejemplos reales de request/response, generados desde `graph_fake.json`, en [`ejemplos/`](ejemplos/). Si tu código funciona con esos archivos, funciona con la API.

> **Regla:** este archivo solo se cambia avisando en el grupo. Agregar un campo opcional es seguro; renombrar o quitar uno rompe a alguien.

## Endpoints

| Método | Ruta | Entrada | Salida | Ejemplo |
| --- | --- | --- | --- | --- |
| GET | `/estaciones` | — | lista de `EstacionResumen` | `get_estaciones.response.json` |
| GET | `/estaciones/{id}` | — | nodo completo de `graph.json` (capas y fotos) | `get_estacion_E1.response.json` |
| GET | `/grafo` | `?pendiente_max=15` (opcional) | `{meta, zonas, nodes, edges}` filtrado | — (**agregado**, ver abajo) |
| POST | `/ruta` | `{origen, destino, pendiente_max}` | `RespuestaMision` | `post_ruta.*.json` |
| POST | `/mision` | `{estaciones[], tiempo_max_min, pendiente_max, modo}` | `RespuestaMision` | `post_mision.*.json` |
| POST | `/alerta` | `{zona, tipo}` | `RespuestaMision` + `aristas_afectadas` | `post_alerta.*.json` |
| POST | `/reset` | — | `{"ok": true}` | — |
| POST | `/chat` | `{mensaje, historial}` | `{respuesta, llamadas, ruta}` | — (lo implementa Manuel) |

### GET `/estaciones`

```json
[{"id": "E1", "nombre": "Frente del delta", "tipo": "ciencia",
  "valor_cientifico": 9, "lon": 77.40144, "lat": 18.45073}]
```

### POST `/ruta`

```json
{"origen": "HAB", "destino": "E1", "pendiente_max": 15}
```

Camino más corto en tiempo (Dijkstra). Devuelve `RespuestaMision` con `ruta` de origen a destino (puede pasar por nodos intermedios) y `margen_min: null`.

### POST `/mision`

```json
{"estaciones": ["E1", "M1", "M2", "E2"], "tiempo_max_min": 240,
 "pendiente_max": 15, "modo": "orientacion", "origen": "HAB"}
```

| Campo | Tipo | Default | Nota |
| --- | --- | --- | --- |
| `estaciones` | `string[]` | — | ids a visitar |
| `tiempo_max_min` | número | `null` | sin tope si es `null` (solo en `tsp`) |
| `pendiente_max` | número | `15` | grados |
| `modo` | `"tsp"` \| `"orientacion"` | `"tsp"` | `tsp`: todas en el mejor orden, o `factible: false`. `orientacion`: maximiza `valor_cientifico` dentro de `tiempo_max_min` y omite las que no entran |
| `origen` | string | `"HAB"` | la misión sale y vuelve acá |

`tiempo_min` total = marcha + `permanencia_min` de cada estación visitada (los nodos por los que solo se pasa no suman permanencia).

### POST `/alerta`

```json
{"zona": "Z2", "tipo": "polvo"}
```

- `polvo`: se quitan las aristas cuyo `zonas` contiene la zona, y se repite la **última misión** pedida a `/mision`.
- `comms`: se quitan las aristas con `cobertura_com_pct` < `umbral_cobertura_com_pct` de `params.yaml`.
- Las alertas se acumulan hasta `/reset`. Si no hubo misión previa: `409`.

Respuesta = `RespuestaMision` + `"aristas_afectadas": ["HAB->M2", "M2->M1"]` (los tramos de la misión anterior que cruzaban la zona).

### POST `/chat` (Manuel)

```json
// entrada
{"mensaje": "¿Y si acepto hasta 20°?",
 "historial": [{"rol": "usuario", "contenido": "..."}, {"rol": "asistente", "contenido": "..."}]}
// salida
{"respuesta": "Con 20° sumo la Cima del delta (E2)...",
 "llamadas": [{"herramienta": "optimizar_mision",
               "argumentos": {"estaciones": ["E1","M1","M2","E2"], "tiempo_max_min": 240, "pendiente_max": 20},
               "ok": true}],
 "ruta": { "...": "RespuestaMision o null si no hubo ruta" }}
```

## `RespuestaMision` (la misma forma para `/ruta`, `/mision` y `/alerta`)

```json
{
  "factible": true,
  "ruta": ["HAB", "M2", "E1", "M2", "M1", "HAB"],
  "tramos": [{"origen": "HAB", "destino": "M2", "distancia_m": 2639, "tiempo_min": 41.6,
              "pendiente_max_deg": 1.9, "cobertura_com_pct": 100,
              "dosis_rel": 37.7, "zonas": ["Z1", "Z2", "Z4"],
              "geometria": [[77.45089, 18.44463], [77.40844, 18.45342]]}],
  "omitidas": [{"id": "E2", "motivo": "pendiente",
                "detalle": {"pendiente_max_deg": 20.4, "limite": 15}}],
  "totales": {"distancia_m": 6833, "tiempo_min": 164.0, "dosis_rel": 95.6, "margen_min": 76.0}
}
```

`motivo` de una omitida es uno de estos, con su `detalle`:

| `motivo` | `detalle` | El LLM dice… |
| --- | --- | --- |
| `pendiente` | `{pendiente_max_deg, limite}` — la mínima pendiente con que se llega vs. lo pedido | "omití la cima del delta: el camino más suave tiene 20.4° y pediste 15°" |
| `tiempo` | `{tiempo_max_min}` | "no entra en 240 min" |
| `alerta` | `{zonas}` | "queda aislada por la alerta en Z2" |
| `comms` | `{cobertura_com_pct, umbral}` | "no hay camino con cobertura suficiente" |
| `no_existe` | `{}` | "no conozco esa estación" |

`margen_min` = `tiempo_max_min − tiempo_min` (`null` si no hubo tope).

## Cómo se elige la versión del grafo según `pendiente_max`

`graph.json` trae 3 versiones de cada arista (`limite_deg` 15, 20 y 25). Para una `pendiente_max` pedida:

1. Se usa la versión más grande que **no supere** lo pedido (17° → versión 15; 22° → versión 20; menos de 15° → versión 15).
2. Además se descartan las aristas con `pendiente_max_deg` > `pendiente_max`.

Así nunca se devuelve un tramo más empinado de lo pedido.

## Errores

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `404` | id de estación inexistente en `/estaciones/{id}` o `/ruta` | `{"detail": "estacion E9 no existe"}` |
| `409` | `/alerta` sin misión previa | `{"detail": "no hay mision para recalcular"}` |
| `422` | JSON mal formado o campos inválidos (FastAPI lo hace solo) | formato estándar de FastAPI |

En `/mision`, una estación inexistente **no** es error: va a `omitidas` con `motivo: "no_existe"`, para que el LLM pueda explicarlo.

## Agregados respecto al spec original (avisados en el grupo)

Son cambios aditivos; nada del spec se renombró ni se quitó.

- **`GET /grafo`**: el mapa necesita todas las aristas y los polígonos de las zonas para dibujarlos; ninguna ruta del spec los exponía.
- **`tramos[].geometria`, `tramos[].zonas` y `tramos[].dosis_rel`**: para dibujar la ruta resaltada y la animación de alerta sin pedir otra cosa.
- **`origen`** opcional en `/mision` (default `HAB`).
- **`motivo`** con valores cerrados (tabla de arriba).
