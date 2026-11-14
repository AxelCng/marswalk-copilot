# marswalk-copilot

Copiloto con LLM que calcula rutas óptimas por nodos para caminatas en Marte con datos de la NASA. NASA Space Apps Challenge 2026.

Un motor de grafos calcula la ruta óptima entre 6 y 8 estaciones del cráter Jezero, y un LLM traduce el pedido y explica el resultado. **El LLM nunca calcula**: cada número que dice sale de una llamada a función.

Spec completo: [`MarsWalk Copilot — Spec de desarrollo (Space Apps 2026).md`](<MarsWalk Copilot — Spec de desarrollo (Space Apps 2026).md>)

## Estructura

| Carpeta | Dueño | Qué hay |
| --- | --- | --- |
| [`contracts/`](contracts/) | Jeicoll | Los 2 contratos: `graph_fake.json` (forma del grafo) y `api.md` (API), con ejemplos |
| [`data/`](data/) | Pedro | Pipeline: rasters NASA/USGS → `graph.json` real |
| [`engine/`](engine/) | Said | FastAPI + networkx + OR-Tools |
| [`llm/`](llm/) | Manuel | Ollama, herramientas y `/chat` |
| [`web/map/`](web/map/) | Añe | Mapa MapLibre |
| [`web/ui/`](web/ui/) | Axl | Panel de chat, fichas, HUD y plan B |
| raíz | Jeicoll | `params.yaml`, `estaciones.csv` (con fuentes en `estaciones_fuentes.md`), Docker, despliegue |

## Para arrancar (todos)

```bash
git clone <repo> && cd marswalk-copilot
git checkout -b <tu-rama>          # data, engine, llm, web-map, web-ui
python contracts/tools/validar_graph.py contracts/graph_fake.json
```

Después leé el `README.md` de tu carpeta. **No esperes a nadie:** el grafo falso y los ejemplos de [`contracts/ejemplos/`](contracts/ejemplos/) tienen la forma exacta de lo que vas a recibir.

## Correr todo con Docker

Requiere Docker Desktop abierto ("Engine running").

```powershell
docker compose up --build -d     # la primera vez tarda unos minutos
```

- Pantalla: http://localhost:8080
- API: http://localhost:8000/docs (la pantalla la usa por `/api/...`, a través de nginx)
- Apagar: `docker compose down`

| Para | Cómo |
| --- | --- |
| Grafo | Por defecto el **real** (`data/out/graph.json`). Para el falso: `$env:GRAPH_PATH="contracts/graph_fake.json"; docker compose up -d`. Un grafo nuevo de Pedro se toma con `docker compose restart api` (no hace falta reconstruir) |
| Usar Ollama de otra máquina o de Colab | `$env:OLLAMA_URL="http://<ip-o-túnel>:11434"; docker compose up -d` |
| Ver los logs del motor | `docker compose logs -f api` |

Archivos: `Dockerfile` (API: motor + chat), `web/Dockerfile` (pantalla compilada + nginx), `web/docker/nginx.conf`, `docker-compose.yml`.

## Reglas del repo

- Cada persona toca solo su carpeta y trabaja en su rama; se integra a `main` por PR.
- Los contratos (`contracts/`) y `params.yaml` solo se cambian **avisando en el grupo**.
- Nada de rasters ni zips en git (`data/raw/` está ignorado).
- El sábado a las 22:00 el motor pasa de `graph_fake.json` al `graph.json` real cambiando `GRAPH_PATH`; nadie cambia código.

## Hitos

- **Sábado 14, 22:00:** se pide una misión por API y se dibuja en el mapa.
- **Domingo 15, 21:00:** entrega (cierre 23:59).

## Datos y créditos

NASA/JPL-Caltech, USGS (SIM 3464, mapa de pendientes de Jezero), MSSS/ASU según cada imagen. Este proyecto no tiene aval de la NASA.
