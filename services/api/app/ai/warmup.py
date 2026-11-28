from __future__ import annotations

import logging
from typing import Dict

from app.core.config import settings

logger = logging.getLogger("sentinelgrid.ai.warmup")


def preload_live_models() -> Dict[str, str]:
    """
    Eagerly load local ONNX / CTranslate2 runtimes so the first citizen SOS
    avoids cold-start model load latency. Safe if any artifact folder is absent.
    """
    status: Dict[str, str] = {}
    if settings.AI_ADAPTER_MODE == "mock":
        return {"mode": "mock"}

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

    try:
        from app.ai.adapters.duplicate_matcher import _get_runtime as get_dup_rt

        rt = get_dup_rt()
        status["duplicate_matcher"] = rt.model_version
    except Exception as exc:
        logger.warning("DuplicateMatcher warmup skipped: %s", exc)
        status["duplicate_matcher"] = f"fallback:{type(exc).__name__}"

    try:
        from app.ai.adapters.vision_detector import _get_runtime as get_vision_rt

        rt = get_vision_rt()
        status["vision_detector"] = rt.model_version
    except Exception as exc:
        logger.warning("VisionDetector warmup skipped: %s", exc)
        status["vision_detector"] = f"fallback:{type(exc).__name__}"

    logger.info("AI live warmup completed: %s", status)
    return status
