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
# data/out/graph.json llega el sábado 22:00; mientras tanto se usa el grafo falso
COPY data/ data/

# El grafo se elige sin tocar código (contracts/README.md)
ENV GRAPH_PATH=contracts/graph_fake.json \
    # /chat llama a la API desde el mismo contenedor
    API_URL=http://localhost:8000 \
    # Ollama corre fuera del contenedor (laptop, GPU o Colab): se cambia con la variable
    OLLAMA_URL=http://host.docker.internal:11434

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/estaciones', timeout=4)"

# Un solo worker: el estado de alertas y la última misión viven en memoria (engine/README.md)
CMD ["uvicorn", "engine.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
