# engine/ — motor y API (Said, L2)

**Entrega:** API FastAPI estable según [`contracts/api.md`](../contracts/api.md).

## Estado

Implementados: `GET /estaciones`, `GET /estaciones/{id}`, `GET /grafo`
y `POST /ruta`, `POST /mision`, `POST /alerta` y `POST /reset`.
Las rutas usan Dijkstra sobre aristas dirigidas con peso
`tiempo_min`; no suman permanencia. El filtro selecciona la versión del grafo
indicada en el contrato y descarta tramos que exceden la pendiente solicitada.
CORS está abierto para desarrollo.

Las misiones usan OR-Tools y tienen pruebas contra fuerza bruta.
Las alertas se acumulan y recalculan la última misión. El router de Manuel
está incluido: `/chat`, `/chat/reset` y `/chat/estado`. `GET /geologia` entrega
`data/out/geologia.geojson` para el mapa, o 404 si todavía no existe.

## Integración con datos y chat

Para arrancar el backend con el grafo de Pedro desde Git Bash:

```bash
./.venv/Scripts/python.exe -m pip install -r engine/requirements-dev.txt
GRAPH_PATH=data/out/graph.json API_URL=http://localhost:8000 ./.venv/Scripts/python.exe -m uvicorn engine.main:app --port 8000 --reload
```

`API_URL` indica al chat a qué API llamar; debe coincidir con la dirección y
puerto del backend. Una configuración explícita de `llm/.env` o del entorno
puede cambiarla: comprobar `GET /chat/estado`. No usar el puerto 8001 del mock
para una demo con el motor real. El chat requiere además Ollama en ejecución y
el modelo configurado por Manuel; sin ellos se puede usar el formulario Plan B.

Con el grafo real, la misión E1/M1/M2/E2 a 15° y 240 min tarda 200.6 min y no
omite estaciones. La demo de 15° frente a 20° no añade E2 con estos datos;
ver `data/HALLAZGO_pendiente_demo.md` y acordar el guion con el equipo. Los
ejemplos y tiempos de las secciones siguientes corresponden al grafo **falso**.
La integración HTTP de estaciones, grafo, geología, misión y alerta fue probada
con el grafo real; falta probar el modelo Ollama y la interfaz de extremo a extremo.

### Ejecutar en Windows (Git Bash / Antigravity)

Desde la raíz del repositorio, con el entorno `.venv` creado:

```bash
./.venv/Scripts/python.exe -m pip install -r engine/requirements-dev.txt
./.venv/Scripts/python.exe -m uvicorn engine.main:app --reload --port 8000
```

Si Uvicorn ya estaba ejecutándose al instalar dependencias nuevas, reiniciarlo
con Ctrl+C y el segundo comando. Abrir http://localhost:8000/docs y actualizar
la página para ver `POST /mision`.

## Probar una misión

En `/docs`, abrir `POST /mision` → **Try it out** → **Execute**:

```json
{
  "estaciones": ["E1", "M1", "M2", "E2"],
  "tiempo_max_min": 240,
  "pendiente_max": 15,
  "modo": "orientacion",
  "origen": "HAB"
}
```

Resultado: HAB→M2→E1→M2→M1→HAB, 164.0 minutos y 76.0 de margen; E2
omitida por pendiente. Cambiar a 20° incluye E2: 201.6 minutos y 38.4 de margen.
Hay caminos empatados en tiempo a 20°: el motor puede pasar por M2 en lugar
de REF, con diferente distancia y dosis, manteniendo el mismo tiempo óptimo.

- `tsp` visita todas las estaciones solicitadas y vuelve al origen. El tiempo
  máximo es opcional; si una visita es imposible, `factible` es `false`.
- `orientacion` exige `tiempo_max_min`, maximiza el valor científico y, entre
  soluciones de igual valor, minimiza el tiempo. Debe realizar al menos una tarea.
- Se suma permanencia una sola vez por tarea elegida, nunca por nodos de paso.
  Los IDs repetidos se deduplican; el origen no añade permanencia.
- Una lista vacía devuelve `[origen]`, factible y con tiempo cero. Los IDs
  desconocidos aparecen en `omitidas`; un origen desconocido devuelve 404.

### Optimización y límites

El motor construye la matriz de caminos mínimos y usa `RoutingModel` con una
dimensión de tiempo y `AddDisjunction` para visitas opcionales. Lee K de
`params.yaml`; lo amplía si hace falta para priorizar ciencia sobre tiempo.
El backend CP-SAT generalizado certifica el óptimo del modelo entero, con un
límite de búsqueda de 5 segundos. Si no obtiene un óptimo certificado, responde
503 (reintentar); no presenta un timeout como misión inviable.

La resolución interna es 0.001 minutos: marcha y permanencia se redondean
hacia arriba y el presupuesto hacia abajo. Es conservador y exacto para el
grafo de demostración (décimas de minuto). Datos con más de tres decimales
pueden cambiar la selección cerca del límite. Los totales públicos conservan
el formato de una décima de los ejemplos.

Las pruebas independientes usan Floyd-Warshall y enumeran subconjuntos y
permutaciones, sin llamar al optimizador ni a NetworkX. Comparan valor y tiempo
en 15 combinaciones de modo, pendiente y presupuesto, con siete estaciones.
Referencias: [penalidades de OR-Tools](https://developers.google.com/optimization/routing/penalties)
y [dimensiones de tiempo](https://developers.google.com/optimization/routing/dimensions).

## Probar alertas y reset

Actualizar `/docs` después de la recarga de Uvicorn. Para repetir una demo
sin depender de pruebas anteriores:

1. Ejecutar `POST /reset` sin cuerpo: devuelve `{"ok": true}`.
2. Ejecutar la misión anterior con **15°**, 240 minutos y modo `orientacion`:
   debe durar **164.0 minutos**.
3. Ejecutar `POST /alerta` con:

   ```json
   {"zona": "Z2", "tipo": "polvo"}
   ```

   Devuelve HAB→COM→M2→E1→M2→COM→HAB→M1→HAB, **186.9 minutos**,
   **53.1 de margen** y `aristas_afectadas: ["HAB->M2", "M2->M1"]`. Ningún tramo cruza Z2.
4. Repetir la misma alerta: mantiene la ruta y devuelve `aristas_afectadas: []`
   porque la ruta anterior ya evitaba Z2.
5. Ejecutar `/reset` y volver a pedir `/mision`: regresa a **164.0 minutos**.

Para comunicaciones, enviar `{"zona": "Z2", "tipo": "comms"}` después de
una misión. El contrato exige zona, pero el filtro de comunicaciones es global:
quita todas las aristas con cobertura **menor** que el umbral de `params.yaml`
(actualmente 60%). Una cobertura exactamente de 60% se conserva. La ruta puede
no cambiar si ya tenía cobertura suficiente; las pruebas usan además un grafo
controlado con 59%/60% para verificar aislamiento, omisiones y el límite exacto.

### Estado y errores

- Polvo y comunicaciones se acumulan hasta `/reset` y se aplican también a
  nuevas misiones, `/ruta` y `/grafo`. El archivo original no se modifica.
- Se recalcula la última petición de `/mision`, conservando origen, estaciones,
  presupuesto, pendiente y modo. `/ruta` no reemplaza esa petición.
- `aristas_afectadas` lista, sin duplicados, los tramos de la respuesta anterior
  bloqueados por la nueva alerta (zona para polvo, cobertura para comms).
- Los motivos de aislamiento se evalúan en este orden: pendiente sin alertas,
  cierres de polvo y comunicaciones sobre el grafo ya cerrado por polvo.
  `comms.detalle.cobertura_com_pct` indica la mejor cobertura mínima posible
  del camino; en misiones comprueba tanto la ida como la vuelta.
- `/reset` elimina todas las restricciones y la misión anterior. Es idempotente.
  `/alerta` sin una misión previa, también después de reset, devuelve **409**.
- Zona inexistente, tipo inválido o campos mal formados devuelven **422**.
  Una misión que queda inviable devuelve **200** con `factible: false` y su causa.
- Si el optimizador devuelve **503**, la operación no se aplica: conserva las
  restricciones y la misión anteriores. Corregir/reintentar la petición.
- El estado vive **en memoria de un solo proceso**, compartido por los clientes
  de esa instancia. Usar un único worker para la demo. Reiniciar o recargar el
  servidor borra el estado. Las operaciones se serializan con un bloqueo para
  evitar que un reset se intercale a mitad de un recálculo. Para múltiples
  usuarios o workers hará falta estado compartido y un identificador de sesión.

Las pruebas de integración cubren la demo completa, repetición y acumulación,
mezcla de polvo/comms en ambos órdenes, umbral inclusivo, reset, errores sin
mutaciones, aislamiento entre instancias y concurrencia entre alerta y reset.

### Ejecutar en Windows (PowerShell)

Desde la raíz del repositorio:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r engine/requirements-dev.txt
$env:GRAPH_PATH = "contracts/graph_fake.json"
.\.venv\Scripts\python.exe -m uvicorn engine.main:app --reload --port 8000
```

Abrir http://localhost:8000/docs para probar los endpoints. No hace falta
activar el entorno virtual. Las rutas relativas de `GRAPH_PATH` se resuelven
desde la raíz del repositorio; también se aceptan rutas absolutas. Reiniciar
el servidor al cambiar el archivo del grafo.

### Verificar

```powershell
.\.venv\Scripts\python.exe -m pytest engine/tests -q
```

### Comprobar el grafo de Pedro antes de integrarlo

Desde la raíz, en Git Bash (requiere `engine/requirements-dev.txt`):

```bash
./.venv/Scripts/python.exe -m engine.check_graph data/out/graph.json
```

La comprobación valida el contrato, consulta estaciones y grafo, calcula una
misión de 240 minutos, aplica una alerta y comprueba el reset usando una instancia
de prueba aislada. No modifica el archivo ni el estado del servidor en marcha.
Termina con código 1 ante errores. Una misión inviable con 240 minutos también
se informa como error de la demo: puede requerir cambiar el presupuesto, no
necesariamente significa que el grafo sea inválido. Para probar el servidor con
el grafo recibido, reiniciarlo con:

```bash
GRAPH_PATH=data/out/graph.json ./.venv/Scripts/python.exe -m uvicorn engine.main:app --reload --port 8000
```

Hasta recibir el grafo real se puede ejecutar con `contracts/graph_fake.json`.

Las pruebas comparan respuestas completas con los ejemplos compartidos y
verifican límites de pendiente, E2 inaccesible a 15°, errores 404/422, CORS,
origen igual a destino y sustitución del grafo mediante `GRAPH_PATH`.

Nota sobre los datos de prueba: el ejemplo de misión indica 20.4° como mínima
pendiente para E2; el grafo incluye REF→E2 a 18.5° en la versión de 20°.
`/ruta` calcula el mínimo máximo de pendiente sobre los caminos disponibles
y devuelve 18.5°. Esto describe la pendiente física del camino; la selección
de versiones sigue requiriendo pedir 20°. `/mision` comprueba además el regreso
y usa el máximo de los mínimos de ida y vuelta. Los contratos compartidos quedan
intactos; las pruebas de las demos comparan el tiempo óptimo, margen y motivos, y validan
los tramos y sus sumas contra el grafo (admitiendo empates de tiempo),
sin exigir el detalle de pendiente incorrecto del ejemplo. Queda pendiente
coordinar esta discrepancia con el dueño de los datos.

Referencia: [TestClient de FastAPI](https://fastapi.tiangolo.com/tutorial/testing/)
y [Dijkstra de NetworkX](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.shortest_paths.weighted.dijkstra_path.html).

Arrancá contra el grafo falso; el real llega el sábado 22:00 y solo cambia la variable:

```bash
pip install fastapi uvicorn networkx ortools pyyaml
GRAPH_PATH=contracts/graph_fake.json uvicorn engine.main:app --reload --port 8000
```

## Orden sugerido

1. `GET /estaciones`, `GET /estaciones/{id}` y `GET /grafo` (11:00–14:00)
2. `POST /ruta` con `networkx.dijkstra_path`, peso `tiempo_min`, sobre la versión del grafo que corresponde (regla en `api.md`)
3. `POST /mision` con OR-Tools (14:00–17:00): matriz de tiempos con caminos mínimos + permanencia por nodo; `orientacion` = `AddDisjunction` con penalidad `valor_cientifico × K` y dimensión de tiempo con tope
4. Test contra fuerza bruta: el tiempo total tiene que coincidir con `contracts/ejemplos/post_mision.*.response.json`
5. `POST /alerta` y `POST /reset` (17:00–22:00)

Cada estación omitida necesita su `motivo` y su `detalle`: es lo que deja al LLM explicar sin inventar.
