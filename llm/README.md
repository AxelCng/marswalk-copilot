# llm/ — copiloto MarsWalk (Manuel, L3)

El modelo elige herramientas; la API calcula. Cada número de la respuesta sale de una herramienta
(o de una resta hecha por código en `agent.py`, nunca por el LLM).

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `config.py` | Lee `.env`: `OLLAMA_URL`, `MODELO`, `API_URL` y los defaults de `params.yaml` (15°, 240 min) |
| `tools.py` | Las 5 herramientas del spec (esquemas + llamadas HTTP). Acepta nombres de estación y de zona además de ids |
| `agent.py` | Bucle del copiloto, prompt de sistema con el catálogo de estaciones, comparación con la misión anterior y detector de números sin fuente |
| `router.py` | `POST /chat` (+ `/chat/reset`, `/chat/estado`) como APIRouter: Said lo incluye en la API real |
| `mock_api.py` | API falsa con el contrato de `contracts/api.md`, sobre `contracts/graph_fake.json`. Reproduce `contracts/ejemplos/` exactos |
| `test_preguntas.py` | Las 3 preguntas de la demo encadenadas + 3 sueltas (ficha, inglés, trampa), por modelo |

## Correr en Windows (PowerShell, dentro de `llm/`)

```
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
ollama pull qwen2.5:3b
```

Terminal 1, la API falsa (incluye `/chat`):
```
uvicorn mock_api:app --port 8001 --reload
```

Terminal 2, la prueba:
```
python test_preguntas.py qwen2.5:3b qwen2.5:7b
```

Probar `/chat` a mano: http://localhost:8001/docs → `POST /chat`.

Para que el frontend (Axl) use el mock con chat: `VITE_API_BASE=http://localhost:8001` en `web/ui`.

## Cuando la API de Said esté lista

1. En `.env` cambia `API_URL` a la URL de Said (por defecto `http://localhost:8000`).
2. Said agrega a su app:
   ```python
   from llm.router import router as chat_router
   app.include_router(chat_router)
   ```
   y agrega `ollama` a sus dependencias.
3. Corre `python test_preguntas.py` de nuevo: los chequeos usan los resultados de `contracts/ejemplos/`.
   Con el `graph.json` real hay que ajustar las frases y los valores esperados.

## `/chat` (contracts/api.md)

```json
// entrada
{"mensaje": "¿Y si acepto hasta 12°?",
 "historial": [{"rol": "usuario", "contenido": "..."}, {"rol": "asistente", "contenido": "..."}]}
// salida
{"respuesta": "texto",
 "llamadas": [{"herramienta": "optimizar_mision", "argumentos": {"estaciones": ["E1","M1","M2","E2"], "...": "..."}, "ok": true}],
 "ruta": {"...": "RespuestaMision o null"},
 "historial": [{"rol": "usuario", "contenido": "..."}, {"rol": "asistente", "contenido": "..."}],
 "segundos": 12.3, "numeros_sin_fuente": []}
```

- `historial`, `segundos` y `numeros_sin_fuente` son agregados (aditivos). El frontend puede reenviar
  `historial` tal cual o armar el suyo con `{rol, contenido}`; también se acepta `{role, content}`.
- `ruta` trae `geometria` y `zonas` por tramo: el mapa la dibuja directo. En una alerta trae además
  `aristas_afectadas`. Si el resultado es de una misión que sigue a otra, trae `comparacion_con_anterior`
  (`diferencia_tiempo_min`, `estaciones_agregadas`, `estaciones_quitadas`).
- Si viene `error` (Ollama caído, modelo no descargado), la UI muestra el formulario plan B que llama a `/mision`.
- Un historial vacío empieza una conversación nueva (olvida la misión anterior).

## Garantías contra números inventados

1. El prompt prohíbe calcular; las herramientas devuelven todo lo que hay que decir.
2. Las diferencias entre misiones (demo 2: "cuánto tiempo suma") las calcula `agent.py`, no el modelo.
3. `numeros_sin_fuente` lista cualquier número de la respuesta que no aparezca en una herramienta ni en lo que
   escribió el usuario (con conversión min↔h y m↔km). Si no está vacío, el test lo marca.
4. Si la respuesta trae números sin fuente, se le pide al modelo que corrija una vez; si insiste, se responde
   con el resumen hecho por código (o se pide el dato que falta). Lo mismo si el modelo no llega a responder.
5. Las alertas ("alerta de polvo en Z2", "perdimos comunicación") y los cambios de condición sobre la misión
   anterior ("¿y si acepto 20°?", "¿y si tengo 3 horas?") se detectan por código y la herramienta se llama
   siempre: los modelos chicos tendían a responder de memoria.

## Plan B (spec, corte sáb 13:00)

Si ningún modelo local hace bien el tool calling: API comercial para la demo y Ollama como "modo offline".
Si el LLM falla en vivo: formulario de Axl → `POST /mision`.

## Resultados (sáb 14, laptop L3, solo CPU, contra el mock con `graph_fake.json`)

| Modelo | Chequeos | Números sin fuente | Promedio por pregunta | Demo (3 preguntas) |
| --- | --- | --- | --- | --- |
| qwen2.5:3b | 6/6 | 0/6 | 47 s | ~3.5 min |
| qwen2.5:7b | 6/6 | 0/6 | 94 s | ~7.5 min |

Los dos usan bien las herramientas. El 7b redacta mejor; el 3b a veces se equivoca al explicar y cae en el
resumen hecho por código. **Problema: la velocidad.** El spec pide la demo en menos de 1 minuto y en CPU no
se llega. Opciones (plan B del spec): correr Ollama en una laptop con GPU, o usar una API comercial para la demo
y mostrar Ollama como "modo offline".
