# engine/ — motor y API (Said, L2)

**Entrega:** API FastAPI estable según [`contracts/api.md`](../contracts/api.md).

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
