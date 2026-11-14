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
             "poligono": [[77.422, 18.441], [77.434, 18.441], [77.434, 18.453], [77.422, 18.453], [77.422, 18.441]]}],
  "nodes": [{
    "id": "E1", "nombre": "Frente del delta", "tipo": "ciencia",
    "lon": 77.40144, "lat": 18.45073,
    "valor_cientifico": 9, "tarea": "Muestreo de capas sedimentarias", "permanencia_min": 25,
    "unidad_geologica": "...", "zona": "Z1",
    "capas": {"elev_m": -2527, "pendiente_deg": 8.1, "themis_noche": 222},
    "fotos": [{"url": "https://mars.nasa.gov/mars2020-raw-images/...jpg", "camara": "NAVCAM_LEFT", "sol": 565, "credito": "NASA/JPL-Caltech"}]
  }],
  "edges": [{
    "origen": "HAB", "destino": "M2", "limite_deg": 15,
    "distancia_m": 2639, "tiempo_min": 41.6, "energia_rel": 45.6,
    "pendiente_max_deg": 1.9, "dosis_rel": 37.7,
    "cobertura_com_pct": 100, "sombra_pct": 8,
    "zonas": ["Z1", "Z2", "Z4"], "geometria": [[77.45089, 18.44463], [77.40844, 18.45342]]
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
- `fotos[].url` puede ser `null` si una estación no tiene foto (el frontend muestra un placeholder). `credito` es opcional.
- `themis_noche`: temperatura de brillo nocturna en K.

### Agregados respecto al spec original

Son aditivos; no se renombró ni quitó nada.

- `edges[].limite_deg`: el spec pide 3 versiones del grafo pero no decía cómo guardarlas. Van en un mismo archivo, marcadas con este campo.
- `zonas` en la raíz (polígonos) y `nodes[].zona`: el frontend necesita dibujar las zonas de alerta.
- `meta.fake` y `meta.limites_pendiente_deg`.

## Qué trae el grafo falso

8 estaciones **reales**, 4 zonas y 154 aristas (15°: 42, 20°: 56, 25°: 56).

- **Reales** (de [`estaciones.csv`](../estaciones.csv)): posición y elevación de waypoints de Perseverance, inclinación del rover cerca de cada estación y una foto Navcam de Raw Images por estación.
- **Inventado** (lo reemplaza el `graph.json` de Pedro): THEMIS, unidad geológica, zonas y todos los atributos de las aristas. Igual son coherentes con el modelo de costo del spec (Tobler × factor_traje, ida ≠ vuelta).

Con las distancias reales (el delta queda a unos 3 km del hábitat) la demo no entra en 3 h, así que el tope pasó a **4 h**. Está armado para que la demo funcione:

| Caso | Ejemplo | Resultado con datos falsos |
| --- | --- | --- |
| 1. Frente del delta + 2 muestreos (Séítah y Three Forks) + cima, < 4 h, ≤ 15° | `post_mision.demo1_mision_15deg.*` | HAB→M2→E1→M2→M1→HAB, 164.0 min; **E2 (cima) omitida por pendiente** (20.4° > 15°) |
| 2. "¿Y si acepto 20°?" | `post_mision.demo2_mision_20deg.*` | entra la cima: HAB→REF→E2→E1→M2→M1→HAB, 201.6 min (+37.6 min) |
| 3. "Alerta de polvo en Z2" (sobre la misión 1) | `post_alerta.*` | evita los tramos HAB→M2 y M2→M1 rodeando por la repetidora: HAB→COM→M2→E1→M2→COM→HAB→M1→HAB, 186.9 min |

Los ejemplos los calcula una referencia de fuerza bruta dentro del generador. Said puede usarlos como resultado esperado en sus tests (el óptimo de OR-Tools debe dar el mismo tiempo total).
