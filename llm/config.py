"""Configuración del módulo LLM. Lee variables de entorno o de un archivo .env."""
import os
from pathlib import Path

_env = Path(__file__).with_name(".env")
if _env.exists():
    for linea in _env.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#") and "=" in linea:
            k, v = linea.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODELO = os.getenv("MODELO", "qwen2.5:3b")
# Motor real (engine/, que también sirve /chat). 127.0.0.1 y no "localhost": en Windows "localhost"
# prueba primero IPv6 y uvicorn escucha en IPv4, y cada llamada a una herramienta se demora.
# Para el mock de pruebas: API_URL=http://127.0.0.1:8001
API_URL = os.getenv("API_URL", "http://127.0.0.1:8000").rstrip("/")
MAX_PASOS = int(os.getenv("MAX_PASOS", "6"))  # máximo de rondas de herramientas por pregunta
# Cuánto tiempo deja Ollama el modelo cargado en la GPU sin uso. Por defecto Ollama usa 5 min y la
# primera pregunta después de eso tarda lo que tarda cargar el modelo (~2.5 min la primera vez en la RTX 3050).
KEEP_ALIVE = os.getenv("KEEP_ALIVE", "60m")

# Defaults de params.yaml (mision.*): se usan si el astronauta no los dice
PENDIENTE_DEFAULT = float(os.getenv("PENDIENTE_DEFAULT", "15"))
TIEMPO_DEFAULT = float(os.getenv("TIEMPO_DEFAULT", "240"))
