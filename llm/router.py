"""
POST /chat (contracts/api.md). Said lo incluye en la API real con:
    from llm.router import router as chat_router
    app.include_router(chat_router)
"""
import os
import sys

from fastapi import APIRouter
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # para que funcione importado desde la raíz del repo
from agent import reiniciar, responder  # noqa: E402
from config import API_URL, MODELO  # noqa: E402

router = APIRouter()


class ChatIn(BaseModel):
    mensaje: str
    historial: list[dict] = []
    modelo: str | None = None  # opcional, para comparar modelos desde /docs


@router.post("/chat")
def chat(body: ChatIn):
    # def (no async): FastAPI lo corre en un hilo aparte y no bloquea la API mientras el modelo piensa
    return responder(body.mensaje, body.historial, modelo=body.modelo)


@router.post("/chat/reset")
def chat_reset():
    """Olvida la misión anterior de la conversación (no toca las alertas: eso es POST /reset)."""
    reiniciar()
    return {"ok": True}


@router.get("/chat/estado")
def chat_estado():
    return {"modelo": MODELO, "api_url": API_URL}
