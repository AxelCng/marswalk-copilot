# contracts/ — los dos contratos del proyecto

Los cuatro módulos se comunican **solo** por estos dos contratos. Si respetás la forma, podés avanzar sin esperar a nadie.

| Archivo | Qué es | Dueño |
| --- | --- | --- |
| [`graph_fake.json`](graph_fake.json) | Contrato 1: grafo **falso** con la forma exacta del `graph.json` real | Jeicoll (el real: Pedro) |
| [`api.md`](api.md) | Contrato 2: endpoints, entradas, salidas y errores de la API | Said |
| [`ejemplos/`](ejemplos/) | Requests y responses de la API calculados sobre el grafo falso | generado |
| [`tools/generar_graph_fake.py`](tools/generar_graph_fake.py) | Regenera el grafo falso y los ejemplos | Jeicoll |
| [`tools/validar_graph.py`](tools/validar_graph.py) | Revisa que un `graph.json` cumpla el contrato | Pedro lo corre antes de entregar |

> **Regla:** los contratos solo se cambian avisando en el grupo.

```bash
python contracts/tools/generar_graph_fake.py          # regenera graph_fake.json y ejemplos/
python contracts/tools/validar_graph.py contracts/graph_fake.json
```

Ambos usan solo la biblioteca estándar de Python 3.10+.

## Contrato 1: `graph.json`

Lo genera el pipeline (`data/`) y lo lee el motor al arrancar. El motor toma la ruta del archivo de la variable `GRAPH_PATH` (default `contracts/graph_fake.json`). El sábado a las 22:00 se cambia esa variable y nadie toca código.

```json
{
  "meta": {"area": "jezero_aoi_v1", "crs": "MTM 77.5E", "modelo_costo": "v1",
           "fake": false, "limites_pendiente_deg": [15, 20, 25]},
  "zonas": [{"id": "Z2", "nombre": "Campo de dunas",
             "poligono": [[77.42, 18.444], [77.431, 18.444], [77.431, 18.453], [77.42, 18.453], [77.42, 18.444]]}],
  "nodes": [{
    "id": "E1", "nombre": "Frente del delta", "tipo": "ciencia",
    "lon": 77.412, "lat": 18.4495,
    "valor_cientifico": 9, "tarea": "Muestreo de capas", "permanencia_min": 25,
    "unidad_geologica": "...", "zona": "Z1",
    "capas": {"elev_m": -2530, "pendiente_deg": 12.0, "themis_noche": 222},
    "fotos": [{"url": "https://...", "camara": "NAVCAM_LEFT", "sol": 0}]
  }],
  "edges": [{
    "origen": "HAB", "destino": "E1", "limite_deg": 15,
    "distancia_m": 2376, "tiempo_min": 41.2, "energia_rel": 70.1,
    "pendiente_max_deg": 14.0, "dosis_rel": 36.7,
    "cobertura_com_pct": 100, "sombra_pct": 10,
    "zonas": ["Z1", "Z2", "Z4"], "geometria": [[77.4508, 18.4447], [77.412, 18.4495]]
  }]
}
```

### Reglas

- **Tipos de nodo:** `habitat`, `rover`, `ciencia`, `muestreo`, `refugio`, `comms`. Tiene que haber exactamente un `habitat` (id `HAB`).
- **Coordenadas** de nodos y `geometria` en **lon/lat grados** (este positivo, 0–360 o −180–180), no en metros MTM: el mapa las usa directo. Pedro reproyecta antes de escribir.
- **Aristas dirigidas:** A→B y B→A son dos aristas (subir y bajar cuestan distinto). La geometría de B→A es la de A→B invertida.
- **3 versiones por límite de pendiente:** cada arista lleva `limite_deg` ∈ `meta.limites_pendiente_deg`. Con 8 nodos son hasta 3 × 56 = 168 aristas. **Si no hay camino bajo un límite, la arista no se incluye** en esa versión (así salen las omitidas por pendiente).
- `pendiente_max_deg` ≤ `limite_deg` siempre.
- `zonas` de una arista: ids de `zonas` que cruza el camino. La alerta de polvo trabaja sobre eso.
- `energia_rel` y `dosis_rel` son índices relativos (modelos), no kcal ni mSv.
- `fotos[].url` puede ser `null` hasta que estén las fotos reales (el frontend muestra un placeholder).
- `themis_noche`: temperatura de brillo nocturna en K.

### Agregados respecto al spec original

Son aditivos; no se renombró ni quitó nada.

- `edges[].limite_deg`: el spec pide 3 versiones del grafo pero no decía cómo guardarlas. Van en un mismo archivo, marcadas con este campo.
- `zonas` en la raíz (polígonos) y `nodes[].zona`: el frontend necesita dibujar las zonas de alerta.
- `meta.fake` y `meta.limites_pendiente_deg`.

## Qué trae el grafo falso

8 nodos alrededor del sitio de aterrizaje de Perseverance, 4 zonas y 154 aristas (15°: 42, 20°: 56, 25°: 56). **Los números son inventados**, pero coherentes con el modelo de costo del spec (Tobler × factor_traje, ida ≠ vuelta). Está armado para que la demo del spec ya funcione:

| Caso | Ejemplo | Resultado con datos falsos |
| --- | --- | --- |
| 1. Delta + 2 muestreos, < 3 h, ≤ 15° | `post_mision.demo1_mision_15deg.*` | HAB→E1→M2→M1→HAB, 138.4 min; **E2 omitida por pendiente** (18.6° > 15°) |
| 2. "¿Y si acepto 20°?" | `post_mision.demo2_mision_20deg.*` | entra E2: HAB→REF→E2→E1→M2→M1→HAB, 169.9 min (+31.5 min) |
| 3. "Alerta de polvo en Z2" | `post_alerta.*` | evita el tramo HAB→E1: HAB→M2→E1→M2→M1→HAB, 140.1 min |

Los ejemplos los calcula una referencia de fuerza bruta dentro del generador. Said puede usarlos como resultado esperado en sus tests (el óptimo de OR-Tools debe dar el mismo tiempo total).
