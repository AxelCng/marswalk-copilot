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
API_URL = os.getenv("API_URL", "http://localhost:8001").rstrip("/")
MAX_PASOS = int(os.getenv("MAX_PASOS", "6"))  # máximo de rondas de herramientas por pregunta

# Defaults de params.yaml (mision.*): se usan si el astronauta no los dice
PENDIENTE_DEFAULT = float(os.getenv("PENDIENTE_DEFAULT", "15"))
TIEMPO_DEFAULT = float(os.getenv("TIEMPO_DEFAULT", "240"))
