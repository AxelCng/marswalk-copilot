"""
POST /chat. Said lo incluye en la API real con:
    from llm.router import router as chat_router
    app.include_router(chat_router)
"""
import os
import sys

from fastapi import APIRouter
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # para que funcione importado desde la raíz del repo
from agent import responder  # noqa: E402

router = APIRouter()


class ChatIn(BaseModel):
    mensaje: str
    historial: list[dict] = []


@router.post("/chat")
def chat(body: ChatIn):
    # def (no async): FastAPI lo corre en un hilo aparte y no bloquea la API mientras el modelo piensa
    return responder(body.mensaje, body.historial)
