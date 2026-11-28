from __future__ import annotations

from typing import Any, Dict

import httpx

from app.core.config import settings


def resolve_remote_endpoint(explicit_url: str, default_path: str) -> str:
    """
    Resolve full HTTP endpoint URL for a model pipeline:
    1) Per-model explicit URL (e.g. VISION_INFERENCE_URL -> <url>/detect)
    2) Shared ML_INFERENCE_BASE_URL + default_path (e.g. https://.../classify-text)
    """
    explicit = (explicit_url or "").strip().rstrip("/")
    if explicit:
        if explicit.endswith(default_path):
            return explicit
        return f"{explicit}{default_path}"

    base = (getattr(settings, "ML_INFERENCE_BASE_URL", "") or "").strip().rstrip("/")
    if base:
        return f"{base}{default_path}"

    return ""


async def post_remote_inference(endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Send authenticated JSON inference request to the remote GPU / Modal ML server."""
    headers: Dict[str, str] = {}
    api_key = (getattr(settings, "ML_INFERENCE_API_KEY", "") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["X-ML-API-Key"] = api_key

    timeout_s = float(getattr(settings, "ML_REMOTE_TIMEOUT_SECONDS", 25.0) or 25.0)
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.post(endpoint, json=payload, headers=headers)
        if resp.status_code != 200:
            raise ValueError(f"Remote ML server responded with HTTP {resp.status_code}: {resp.text[:200]}")
        return resp.json()
