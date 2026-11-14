# MarsWalk Copilot — API (motor de Said + /chat de Manuel cuando esté conectado)
# Construir desde la raíz:  docker build -t marswalk-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DEFAULT_TIMEOUT=180

WORKDIR /app

# Dependencias primero: si solo cambia el código, Docker reutiliza esta capa
COPY engine/requirements.txt engine/requirements.txt
COPY llm/requirements.txt llm/requirements.txt
RUN pip install -r engine/requirements.txt -r llm/requirements.txt

# Código y datos que lee el motor al arrancar (ROOT = /app)
COPY params.yaml ./
COPY contracts/ contracts/
COPY engine/ engine/
COPY llm/ llm/
COPY data/ data/

# Grafo: sin GRAPH_PATH el motor usa data/out/graph.json (el real de Pedro) si existe, y si no
# contracts/graph_fake.json. La demo de 8° → 12° solo funciona con el real.
# GRAPH_PATH=contracts/graph_fake.json fuerza el falso.
# /chat llama a la API desde el mismo contenedor (127.0.0.1: localhost puede probar IPv6 primero)
ENV API_URL=http://127.0.0.1:8000 \
    # Ollama corre fuera del contenedor (laptop, GPU o Colab): se cambia con la variable
    OLLAMA_URL=http://host.docker.internal:11434

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/estaciones', timeout=4)"

# Un solo worker: el estado de alertas y la última misión viven en memoria (engine/README.md)
CMD ["uvicorn", "engine.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
