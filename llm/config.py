"""LLM module settings. Reads environment variables or a .env file."""
import os
from pathlib import Path

_env = Path(__file__).with_name(".env")
if _env.exists():
    for line in _env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def _env_any(*names, default):
    """First variable that is set. The old Spanish names (MODELO, PENDIENTE_DEFAULT...) still work."""
    return next((os.environ[n] for n in names if os.environ.get(n)), default)


OLLAMA_URL = _env_any("OLLAMA_URL", default="http://localhost:11434")
# "ollama" (default) or "openai": an OpenAI-compatible API such as Groq, for the cloud deploy (llm_client.py)
LLM_PROVIDER = _env_any("LLM_PROVIDER", default="ollama").lower()
LLM_BASE_URL = _env_any("LLM_BASE_URL", default="https://api.groq.com/openai/v1")
LLM_API_KEY = _env_any("LLM_API_KEY", "GROQ_API_KEY", default="")
MODEL = _env_any("MODEL", "MODELO", default="qwen2.5:3b")
# Real engine (engine/, which also serves /chat). 127.0.0.1 and not "localhost": on Windows "localhost"
# tries IPv6 first while uvicorn listens on IPv4, and every tool call gets slower.
# For the test mock: API_URL=http://127.0.0.1:8001
API_URL = _env_any("API_URL", default="http://127.0.0.1:8000").rstrip("/")
MAX_STEPS = int(_env_any("MAX_STEPS", "MAX_PASOS", default="6"))  # max tool rounds per question
# How long Ollama keeps the model loaded on the GPU when idle. Ollama's default is 5 min, and the first
# question after that waits for the model to load (~2.5 min cold on the RTX 3050).
KEEP_ALIVE = _env_any("KEEP_ALIVE", default="60m")
# Max seconds per Ollama call: if the GPU laptop hangs, /chat returns an error instead of waiting forever.
OLLAMA_TIMEOUT_S = float(_env_any("OLLAMA_TIMEOUT_S", default="120"))
# When the tool was already called by code (alerts, mission requests, changes), the model only phrases the
# answer (~4 s on the GPU). If Ollama hangs there, wait at most this long and answer with the code-built summary
# of the route instead of "copilot not available" (seen 2 of 5 full test runs on the comms question).
PHRASE_TIMEOUT_S = float(_env_any("PHRASE_TIMEOUT_S", default="30"))
# The GPU answers one question at a time: /chat calls beyond this wait CHAT_QUEUE_WAIT_S and then get "busy".
CHAT_CONCURRENCY = int(_env_any("CHAT_CONCURRENCY", default="1"))
CHAT_QUEUE_WAIT_S = float(_env_any("CHAT_QUEUE_WAIT_S", default="20"))
# Lets /chat pick another model (to compare from /docs). Off by default: swapping models on a 4 GB GPU
# unloads qwen and the next question waits minutes.
ALLOW_MODEL_OVERRIDE = _env_any("ALLOW_MODEL_OVERRIDE", default="0") == "1"

# Defaults from params.yaml (mision.*): used when the astronaut does not say them
DEFAULT_SLOPE_DEG = float(_env_any("DEFAULT_SLOPE_DEG", "PENDIENTE_DEFAULT", default="15"))
DEFAULT_TIME_MIN = float(_env_any("DEFAULT_TIME_MIN", "TIEMPO_DEFAULT", default="240"))
