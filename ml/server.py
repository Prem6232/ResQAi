"""
Standalone FastAPI ML Inference Server for ResQAI (GPU Machine / Modal / Docker).

Hosts all 4 trained Indian-emergency models cleanly outside Render's 512 MB API tier:
  - POST /classify-text     (MuRIL Indian-Emergency ONNX)
  - POST /transcribe-voice  (Faster-Whisper-Small CTranslate2 INT8)
  - POST /detect            (FCOS-ResNet50-FPN Fire/Smoke ONNX)
  - POST /match-duplicates  (Multilingual-E5-Small INT8 ONNX + spatial fusion)
  - GET  /health            (model preload status)

Run locally (or via ngrok):
  python ml/server.py
"""

import asyncio
import base64
import contextlib
import hmac
import logging
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional

import httpx
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel

_REPO_ROOT = Path(__file__).resolve().parents[1]
_API_DIR = _REPO_ROOT / "services" / "api"
if _API_DIR.is_dir() and str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from app.ai.adapters.duplicate_matcher import DuplicateMatcherAdapter, _get_runtime as get_dup_runtime  # noqa: E402
from app.ai.adapters.text_classifier import get_onnx_runtime as get_text_runtime  # noqa: E402
from app.ai.adapters.vision_detector import _fetch_s3_image_bytes, _get_runtime as get_vision_runtime  # noqa: E402
from app.ai.adapters.voice_transcriber import _fetch_s3_audio_bytes, get_whisper_runtime  # noqa: E402
from app.ai.hf_bootstrap import ensure_models_downloaded  # noqa: E402
from app.ai.schemas import (  # noqa: E402
    DuplicateCandidateSchema,
    TextAssessmentSchema,
    VisionDetectionSchema,
    VoiceTranscriptionSchema,
)
from app.core.config import settings  # noqa: E402

logger = logging.getLogger("resqai.ml.server")

_LOADED_MODELS: Dict[str, str] = {}


def _verify_api_key(
    authorization: Optional[str] = Header(default=None),
    x_ml_api_key: Optional[str] = Header(default=None),
) -> None:
    expected = (os.getenv("ML_INFERENCE_API_KEY") or settings.ML_INFERENCE_API_KEY or "").strip()
    if not expected:
        return

    provided = (x_ml_api_key or "").strip()
    if not provided and authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()

    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ML API key")


def _preload_local_runtimes() -> Dict[str, str]:
    ensure_models_downloaded(force=True)
    summary: Dict[str, str] = {}

    text_rt = get_text_runtime(
        configured_dir=settings.TEXT_CLASSIFIER_MODEL_DIR,
        preferred_filename=settings.TEXT_CLASSIFIER_ONNX_FILE,
    )
    summary["text_classifier"] = f"muril-indian-emergency-v1-onnx ({text_rt.model_filename})"

    voice_rt = get_whisper_runtime(
        configured_dir=settings.VOICE_TRANSCRIBER_MODEL_DIR,
        device=os.getenv("VOICE_TRANSCRIBER_DEVICE", settings.VOICE_TRANSCRIBER_DEVICE),
        compute_type=os.getenv("VOICE_TRANSCRIBER_COMPUTE_TYPE", settings.VOICE_TRANSCRIBER_COMPUTE_TYPE),
    )
    summary["voice_transcriber"] = f"faster-whisper-small-ct2-{voice_rt.compute_type}"

    dup_rt = get_dup_runtime()
    summary["duplicate_matcher"] = dup_rt.model_version

    vis_rt = get_vision_runtime()
    summary["vision_detector"] = vis_rt.model_version
    return summary


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    global _LOADED_MODELS
    try:
        _LOADED_MODELS = await asyncio.to_thread(_preload_local_runtimes)
        logger.info("ResQAI ML Server models loaded: %s", _LOADED_MODELS)
    except Exception as exc:
        logger.warning("ML Server startup preload warning: %s", exc)
        _LOADED_MODELS = {"error": str(exc)}
    yield


app = FastAPI(title="ResQAI ML Inference Server", version="1.0.0", lifespan=lifespan)


class TextRequest(BaseModel):
    text: str


class VoiceRequest(BaseModel):
    audio_b64: Optional[str] = None
    media_url: Optional[str] = None
    s3_key: Optional[str] = None


class VisionRequest(BaseModel):
    image_b64: Optional[str] = None
    media_url: Optional[str] = None
    s3_key: Optional[str] = None


class DuplicateCandidateInput(BaseModel):
    incidentId: str
    category: str
    dist_m: float
    text: str = ""


class DuplicateMatchRequest(BaseModel):
    category: str
    text: str
    candidates: List[DuplicateCandidateInput] = []


class DuplicateMatchResponse(BaseModel):
    candidates: List[DuplicateCandidateSchema]


async def _resolve_media_bytes(
    *,
    b64_data: Optional[str],
    media_url: Optional[str],
    s3_key: Optional[str],
    s3_fetcher,
) -> bytes:
    if b64_data:
        return base64.b64decode(b64_data)
    if media_url:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(media_url)
            resp.raise_for_status()
            return resp.content
    if s3_key:
        return await asyncio.to_thread(s3_fetcher, s3_key)
    raise HTTPException(status_code=400, detail="Provide base64 payload, media_url, or s3_key")


@app.get("/health")
async def health() -> Dict[str, object]:
    return {"status": "healthy", "models": _LOADED_MODELS}


@app.post("/classify-text", response_model=TextAssessmentSchema, dependencies=[Depends(_verify_api_key)])
async def classify_text(payload: TextRequest) -> TextAssessmentSchema:
    runtime = get_text_runtime(
        configured_dir=settings.TEXT_CLASSIFIER_MODEL_DIR,
        preferred_filename=settings.TEXT_CLASSIFIER_ONNX_FILE,
    )
    return await asyncio.to_thread(runtime.predict_sync, payload.text)


@app.post("/transcribe-voice", response_model=VoiceTranscriptionSchema, dependencies=[Depends(_verify_api_key)])
async def transcribe_voice(payload: VoiceRequest) -> VoiceTranscriptionSchema:
    raw_bytes = await _resolve_media_bytes(
        b64_data=payload.audio_b64,
        media_url=payload.media_url,
        s3_key=payload.s3_key,
        s3_fetcher=_fetch_s3_audio_bytes,
    )
    runtime = get_whisper_runtime(
        configured_dir=settings.VOICE_TRANSCRIBER_MODEL_DIR,
        device=os.getenv("VOICE_TRANSCRIBER_DEVICE", settings.VOICE_TRANSCRIBER_DEVICE),
        compute_type=os.getenv("VOICE_TRANSCRIBER_COMPUTE_TYPE", settings.VOICE_TRANSCRIBER_COMPUTE_TYPE),
    )
    return await asyncio.to_thread(runtime.transcribe_sync, raw_bytes)


@app.post("/detect", response_model=VisionDetectionSchema, dependencies=[Depends(_verify_api_key)])
async def detect_vision(payload: VisionRequest) -> VisionDetectionSchema:
    raw_bytes = await _resolve_media_bytes(
        b64_data=payload.image_b64,
        media_url=payload.media_url,
        s3_key=payload.s3_key,
        s3_fetcher=_fetch_s3_image_bytes,
    )
    runtime = get_vision_runtime()
    return await asyncio.to_thread(runtime.detect_sync, raw_bytes)


@app.post("/match-duplicates", response_model=DuplicateMatchResponse, dependencies=[Depends(_verify_api_key)])
async def match_duplicates(payload: DuplicateMatchRequest) -> DuplicateMatchResponse:
    if not payload.candidates:
        return DuplicateMatchResponse(candidates=[])

    def _run() -> List[DuplicateCandidateSchema]:
        runtime = get_dup_runtime()
        adapter = DuplicateMatcherAdapter(mode="live")
        with_text = [c for c in payload.candidates if c.text.strip()]
        embs = runtime.embed_batch([payload.text.strip()] + [c.text.strip() for c in with_text]) if with_text else None
        q_emb = embs[0] if embs is not None else None

        out: List[DuplicateCandidateSchema] = []
        text_idx = 1
        for cand in payload.candidates:
            if cand.text.strip() and embs is not None and q_emb is not None:
                sem_sim = float(np.sum(q_emb * embs[text_idx]))
                text_idx += 1
                score, signals, rec = adapter._combine_signals(
                    runtime, cand.dist_m, payload.category, cand.category, sem_sim
                )
            else:
                same_cat = payload.category == cand.category
                score = 0.65 if same_cat else 0.40
                signals = [f"Spatial proximity ({int(cand.dist_m)}m apart)"]
                rec = "review"
            out.append(
                DuplicateCandidateSchema(
                    incidentId=cand.incidentId,
                    score=score,
                    signals=signals,
                    recommendation=rec,
                )
            )
        out.sort(key=lambda item: item.score, reverse=True)
        return out

    return DuplicateMatchResponse(candidates=await asyncio.to_thread(_run))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
