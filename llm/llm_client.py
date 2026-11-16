"""Which model server the copilot talks to.

LLM_PROVIDER=ollama (default): Ollama, as always (laptop, GPU laptop or Docker).
LLM_PROVIDER=openai: any OpenAI-compatible API (Groq by default, also OpenRouter...). Used in the cloud
deploy so no laptop has to stay on. The adapter below speaks Ollama's shapes to agent.py, so the agent loop
does not change: chat(...) returns an object with .message.content and .message.tool_calls
(each with .function.name and .function.arguments as a dict), like the `ollama` library.
"""
import json
from types import SimpleNamespace

import requests
from ollama import Client

from config import LLM_API_KEY, LLM_BASE_URL, LLM_PROVIDER, OLLAMA_URL


def make_client(timeout):
    if LLM_PROVIDER == "openai":
        return OpenAICompatClient(LLM_BASE_URL, LLM_API_KEY, timeout)
    return Client(host=OLLAMA_URL, timeout=timeout)


def _as_dict(msg):
    """agent.py appends dicts and also the response messages themselves."""
    if isinstance(msg, dict):
        return msg
    calls = [{"function": {"name": tc.function.name, "arguments": tc.function.arguments}}
             for tc in (getattr(msg, "tool_calls", None) or [])]
    out = {"role": getattr(msg, "role", "assistant"), "content": getattr(msg, "content", "") or ""}
    if calls:
        out["tool_calls"] = calls
    return out


def to_openai(messages):
    """Ollama messages -> OpenAI messages. OpenAI links each tool result to its call by id; Ollama does it
    by order, so ids are made up here in the same order."""
    out, pending, n = [], [], 0
    for raw in messages:
        m = _as_dict(raw)
        role, content = m.get("role"), m.get("content") or ""
        if role == "assistant" and m.get("tool_calls"):
            calls = []
            for tc in m["tool_calls"]:
                n += 1
                call_id = f"call_{n}"
                pending.append(call_id)
                args = tc["function"].get("arguments") or {}
                calls.append({"id": call_id, "type": "function", "function": {
                    "name": tc["function"]["name"],
                    "arguments": args if isinstance(args, str) else json.dumps(args)}})
            out.append({"role": "assistant", "content": content or None, "tool_calls": calls})
        elif role == "tool":
            if pending:
                out.append({"role": "tool", "tool_call_id": pending.pop(0), "content": content})
            else:  # a tool result with no call before it: pass it as plain text
                out.append({"role": "user", "content": f"Tool result: {content}"})
        else:
            out.append({"role": role, "content": content})
    return out


def _arguments(raw):
    if isinstance(raw, dict):
        return raw
    try:
        value = json.loads(raw or "{}")
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


class OpenAICompatClient:
    def __init__(self, base_url, api_key, timeout):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.headers = {"Authorization": f"Bearer {api_key}"}
        self.timeout = timeout

    def chat(self, model, messages, tools=None, options=None, keep_alive=None):
        body = {"model": model, "messages": to_openai(messages),
                "temperature": (options or {}).get("temperature", 0)}
        if tools:
            body["tools"] = tools
        r = requests.post(self.url, json=body, headers=self.headers, timeout=self.timeout)
        if r.status_code >= 400:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
        msg = r.json()["choices"][0]["message"]
        calls = [SimpleNamespace(function=SimpleNamespace(name=tc["function"]["name"],
                                                          arguments=_arguments(tc["function"].get("arguments"))))
                 for tc in (msg.get("tool_calls") or [])]
        return SimpleNamespace(message=SimpleNamespace(role="assistant", content=msg.get("content") or "",
                                                       tool_calls=calls or None))

    def generate(self, model, prompt="", options=None, keep_alive=None):
        """Warm-up: nothing to load on a hosted API. Checks the key and model with a tiny request."""
        self.chat(model, [{"role": "user", "content": "ok"}])
