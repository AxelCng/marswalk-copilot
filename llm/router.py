"""
POST /chat (contracts/api.md). The engine mounts it in the real API (engine/main.py):
    from llm.router import router as chat_router
    app.include_router(chat_router)
"""
import os
import sys

from fastapi import APIRouter
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # so it works when imported from the repo root
import threading  # noqa: E402

from agent import normalize_history, reset, respond, warm_up  # noqa: E402
from config import (ALLOW_MODEL_OVERRIDE, API_URL, CHAT_CONCURRENCY, CHAT_QUEUE_WAIT_S,  # noqa: E402
                    MODEL)

router = APIRouter()
# One question at a time on the GPU. It also protects the API's thread pool: the tools call this same
# API over HTTP, and many /chat waiting on Ollama could leave /mision (Plan B) without threads.
_slots = threading.BoundedSemaphore(CHAT_CONCURRENCY)


class ChatIn(BaseModel):
    message: str
    history: list[dict] = []
    model: str | None = None  # only with ALLOW_MODEL_OVERRIDE=1, to compare models from /docs


@router.post("/chat")
def chat(body: ChatIn):
    # def (not async): FastAPI runs it in a worker thread and the API is not blocked while the model thinks
    if not _slots.acquire(timeout=CHAT_QUEUE_WAIT_S):
        answer = "The copilot is busy answering another question. Try again in a moment or use the mission form."
        return {"answer": answer, "calls": [], "route": None, "seconds": CHAT_QUEUE_WAIT_S,
                "history": normalize_history(body.history), "unsourced_numbers": [], "error": "busy"}
    try:
        return respond(body.message, body.history, model=body.model if ALLOW_MODEL_OVERRIDE else None)
    finally:
        _slots.release()


@router.post("/chat/reset")
def chat_reset():
    """Forgets the previous mission of the conversation (does not clear alerts: that is POST /reset)."""
    reset()
    return {"ok": True}


@router.post("/chat/warmup")
def chat_warmup():
    """Loads the model on the GPU before the first question (the UI calls it on load)."""
    return warm_up()


@router.get("/chat/status")
def chat_status():
    return {"model": MODEL, "api_url": API_URL}
