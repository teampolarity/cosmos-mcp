"""Polarity Lab stack HTTP stubs (generated — not imported at runtime).

Literal URLs for codebase-memory. Regenerate via sync-lab-stack-from-manifest.mjs.
"""

import httpx

def post_api_mcp(body: dict | None = None) -> httpx.Response:
    return httpx.post("https://cosmos.polarity-lab.com/api/mcp", json=body)

def post_api_capture(body: dict | None = None) -> httpx.Response:
    return httpx.post("https://cosmos.polarity-lab.com/api/capture", json=body)

def post_api_chat(body: dict | None = None) -> httpx.Response:
    return httpx.post("https://cosmos.polarity-lab.com/api/chat", json=body)

def post_api_polarity_capture_turn(body: dict | None = None) -> httpx.Response:
    return httpx.post("https://cosmos.polarity-lab.com/api/polarity/capture-turn", json=body)
