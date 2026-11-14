# llm/ — copiloto MarsWalk (Manuel)

El modelo elige herramientas; la API calcula. Cada número de la respuesta sale de una herramienta.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `config.py` | Lee `.env`: `OLLAMA_URL`, `MODELO`, `API_URL` |
| `tools.py` | Las 5 herramientas (esquemas + llamadas HTTP a la API). Acepta nombres de estación además de ids |
| `agent.py` | Bucle del copiloto + prompt de sistema + detector de números sin fuente |
| `router.py` | `POST /chat` como APIRouter (Said lo incluye en la API real) |
| `mock_api.py` | API falsa con el mismo contrato, 4 estaciones inventadas. Solo para desarrollo |
| `test_preguntas.py` | 5 preguntas de prueba (3 de la demo + cadena + trampa) por modelo |

## Correr en Windows (PowerShell, dentro de llm/)

```
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Terminal 1, la API falsa (incluye /chat):
```
uvicorn mock_api:app --port 8001 --reload
```

Terminal 2, la prueba:
```
python test_preguntas.py qwen2.5:3b qwen2.5:7b
```

Probar /chat a mano: abre http://localhost:8001/docs y usa POST /chat.

## Cuando la API de Said esté lista

1. En `.env` cambia `API_URL` a la URL de Said.
2. Said agrega a su app:
   ```python
   from llm.router import router as chat_router
   app.include_router(chat_router)
   ```

## Respuesta de /chat

```json
{"respuesta": "texto", "llamadas": [{"herramienta": "...", "argumentos": {}, "resultado": {}}],
 "ruta": {"...misma forma que /mision..."}, "historial": [], "segundos": 12.3, "numeros_sin_fuente": []}
```

El frontend dibuja `ruta` y reenvía `historial` en la siguiente pregunta. Si viene `error`, muestra el formulario (plan B).
