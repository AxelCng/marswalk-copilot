"""OpenAI-compatible adapter (Groq) without network: requests.post is faked."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import llm_client  # noqa: E402
from llm_client import OpenAICompatClient, to_openai  # noqa: E402


def test_tool_results_get_the_ids_of_their_calls():
    msgs = [
        {"role": "system", "content": "s"},
        {"role": "user", "content": "plan E1"},
        {"role": "assistant", "content": "", "tool_calls": [
            {"function": {"name": "optimize_mission", "arguments": {"stations": ["E1"]}}},
            {"function": {"name": "station_info", "arguments": {"station": "E1"}}}]},
        {"role": "tool", "tool_name": "optimize_mission", "content": "{}"},
        {"role": "tool", "tool_name": "station_info", "content": "{}"},
    ]
    out = to_openai(msgs)
    calls = out[2]["tool_calls"]
    assert [c["id"] for c in calls] == ["call_1", "call_2"]
    assert json.loads(calls[0]["function"]["arguments"]) == {"stations": ["E1"]}
    assert [m["tool_call_id"] for m in out[3:]] == ["call_1", "call_2"]
    assert all("tool_name" not in m for m in out)


def test_orphan_tool_result_becomes_text():
    out = to_openai([{"role": "tool", "content": "x"}])
    assert out == [{"role": "user", "content": "Tool result: x"}]


def test_response_looks_like_ollama(monkeypatch):
    seen = {}

    class Resp:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": None, "tool_calls": [
                {"id": "a", "type": "function",
                 "function": {"name": "optimize_mission", "arguments": '{"stations": ["E1"]}'}}]}}]}

    def fake_post(url, json, headers, timeout):
        seen.update(url=url, body=json, headers=headers)
        return Resp()

    monkeypatch.setattr(llm_client.requests, "post", fake_post)
    client = OpenAICompatClient("https://api.groq.com/openai/v1/", "k", 5)
    r = client.chat(model="m", messages=[{"role": "user", "content": "hi"}], tools=[{"type": "function"}],
                    options={"temperature": 0, "num_ctx": 8192}, keep_alive="60m")
    assert seen["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert seen["headers"]["Authorization"] == "Bearer k"
    assert "num_ctx" not in seen["body"] and seen["body"]["temperature"] == 0
    tc = r.message.tool_calls[0]
    assert tc.function.name == "optimize_mission" and tc.function.arguments == {"stations": ["E1"]}
    assert r.message.content == ""
    # agent.py appends the response message itself to the history: it must translate back
    again = to_openai([{"role": "user", "content": "hi"}, r.message, {"role": "tool", "content": "{}"}])
    assert again[2]["tool_call_id"] == again[1]["tool_calls"][0]["id"]


def test_http_error_is_raised(monkeypatch):
    class Resp:
        status_code = 429
        text = "rate limit"

    monkeypatch.setattr(llm_client.requests, "post", lambda *a, **k: Resp())
    client = OpenAICompatClient("https://x/v1", "k", 5)
    try:
        client.chat(model="m", messages=[])
    except RuntimeError as e:
        assert "429" in str(e)
    else:
        raise AssertionError("expected an error")
