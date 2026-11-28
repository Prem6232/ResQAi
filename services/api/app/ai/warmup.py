from __future__ import annotations

import logging
from typing import Dict

from app.ai.hf_bootstrap import ensure_models_downloaded
from app.ai.remote_client import resolve_remote_endpoint
from app.core.config import settings

logger = logging.getLogger("sentinelgrid.ai.warmup")


def preload_live_models() -> Dict[str, str]:
    """
    Download missing live models if HF_MODEL_REPO_ID is configured and eagerly load
    local ONNX / CTranslate2 runtimes. Skips heavy local loads for pipelines routed
    to a remote ML server (e.g., Render -> Modal / GPU PC).
    """
    status: Dict[str, str] = {}
    if settings.AI_ADAPTER_MODE == "mock":
        return {"mode": "mock"}

    remote_endpoints = {
        "text_classifier": resolve_remote_endpoint(settings.TEXT_INFERENCE_URL, "/classify-text"),
        "voice_transcriber": resolve_remote_endpoint(settings.VOICE_INFERENCE_URL, "/transcribe-voice"),
        "duplicate_matcher": resolve_remote_endpoint(settings.DUPLICATE_INFERENCE_URL, "/match-duplicates"),
        "vision_detector": resolve_remote_endpoint(settings.VISION_INFERENCE_URL, "/detect"),
    }

    if not all(remote_endpoints.values()):
        try:
            ensure_models_downloaded()
        except Exception as exc:
            logger.warning("HF Hub bootstrap failed cleanly: %s", exc)

    if remote_endpoints["text_classifier"]:
        status["text_classifier"] = f"remote:{remote_endpoints['text_classifier']}"
    else:
        try:
            from app.ai.adapters.text_classifier import get_onnx_runtime as get_text_rt

            rt = get_text_rt(
                configured_dir=settings.TEXT_CLASSIFIER_MODEL_DIR,
                preferred_filename=settings.TEXT_CLASSIFIER_ONNX_FILE,
            )
            status["text_classifier"] = f"muril-indian-emergency-v1-onnx ({rt.model_filename})"
        except Exception as exc:
            logger.warning("TextClassifier warmup skipped: %s", exc)
            status["text_classifier"] = f"fallback:{type(exc).__name__}"

    if remote_endpoints["voice_transcriber"]:
        status["voice_transcriber"] = f"remote:{remote_endpoints['voice_transcriber']}"
    else:
        try:
            from app.ai.adapters.voice_transcriber import get_whisper_runtime

            rt = get_whisper_runtime(
                configured_dir=settings.VOICE_TRANSCRIBER_MODEL_DIR,
                device=settings.VOICE_TRANSCRIBER_DEVICE,
                compute_type=settings.VOICE_TRANSCRIBER_COMPUTE_TYPE,
            )
            status["voice_transcriber"] = f"faster-whisper-small-ct2-{rt.compute_type}"
        except Exception as exc:
            logger.warning("VoiceTranscriber warmup skipped: %s", exc)
            status["voice_transcriber"] = f"fallback:{type(exc).__name__}"

    if remote_endpoints["duplicate_matcher"]:
        status["duplicate_matcher"] = f"remote:{remote_endpoints['duplicate_matcher']}"
    else:
        try:
            from app.ai.adapters.duplicate_matcher import _get_runtime as get_dup_rt

            rt = get_dup_rt()
            status["duplicate_matcher"] = rt.model_version
        except Exception as exc:
            logger.warning("DuplicateMatcher warmup skipped: %s", exc)
            status["duplicate_matcher"] = f"fallback:{type(exc).__name__}"

    if remote_endpoints["vision_detector"]:
        status["vision_detector"] = f"remote:{remote_endpoints['vision_detector']}"
    else:
        try:
            from app.ai.adapters.vision_detector import _get_runtime as get_vision_rt

            rt = get_vision_rt()
            status["vision_detector"] = rt.model_version
        except Exception as exc:
            logger.warning("VisionDetector warmup skipped: %s", exc)
            status["vision_detector"] = f"fallback:{type(exc).__name__}"

    logger.info("AI live warmup completed: %s", status)
    return status
