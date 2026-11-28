from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Dict, Tuple

from app.core.config import settings

logger = logging.getLogger("sentinelgrid.ai.hf_bootstrap")

_DOWNLOAD_LOCK = threading.Lock()

# Maps internal pipeline key -> (candidate weight filenames, repo-relative artifact subpaths)
_MODEL_SPECS: Dict[str, Tuple[Tuple[str, ...], Tuple[str, ...]]] = {
    "text_classifier": (
        ("model_fp32.onnx", "model_int8.onnx"),
        ("ml", "text_classifier", "artifacts", "onnx"),
    ),
    "voice_transcriber": (
        ("model.bin",),
        ("ml", "voice_transcriber", "artifacts", "whisper-small-ct2"),
    ),
    "duplicate_matcher": (
        ("model_int8.onnx", "model_fp32.onnx"),
        ("ml", "duplicate_matcher", "artifacts", "onnx"),
    ),
    "vision_detector": (
        ("model_fp32.onnx", "model_int8.onnx"),
        ("ml", "vision_detector", "artifacts", "onnx"),
    ),
}

_CONFIGURED_DIR_ATTR: Dict[str, str] = {
    "text_classifier": "TEXT_CLASSIFIER_MODEL_DIR",
    "voice_transcriber": "VOICE_TRANSCRIBER_MODEL_DIR",
    "duplicate_matcher": "DUPLICATE_MATCHER_MODEL_DIR",
    "vision_detector": "VISION_DETECTOR_MODEL_DIR",
}


def _has_weights(directory: Path, required_any: Tuple[str, ...]) -> bool:
    return directory.is_dir() and any((directory / fname).is_file() for fname in required_any)


def find_repo_root(anchor_file: Path) -> Path | None:
    """Safely walk upward to locate the monorepo root containing ml/ (returns None in standalone images)."""
    resolved = anchor_file.resolve()
    for parent in resolved.parents:
        if (parent / "ml").is_dir():
            return parent
    return None


def get_models_root() -> Path:
    """Determine writable/mounted model root directory for cloud & Docker deployments."""
    configured = (getattr(settings, "AI_MODELS_ROOT", "") or "").strip()
    if configured:
        return Path(configured)
    for candidate in (Path("/app/models"), Path("/models")):
        if candidate.is_dir():
            return candidate
    return Path("/tmp/resqai_models")


def _existing_local_model_dir(model_key: str, anchor_file: Path) -> Path | None:
    required_any, repo_rel = _MODEL_SPECS[model_key]

    configured = (getattr(settings, _CONFIGURED_DIR_ATTR[model_key], "") or "").strip()
    if configured:
        cand = Path(configured)
        if _has_weights(cand, required_any):
            return cand

    env_root = (getattr(settings, "AI_MODELS_ROOT", "") or "").strip()
    roots = [Path(env_root)] if env_root else []
    roots.extend([Path("/models"), Path("/app/models"), Path("/tmp/resqai_models")])
    for root in roots:
        cand = root / model_key
        if _has_weights(cand, required_any):
            return cand
    # Direct container mount at /models/<model_key> or /app/models/<model_key>
    repo_root = find_repo_root(anchor_file)
    if repo_root is not None:
        cand = repo_root.joinpath(*repo_rel)
        if _has_weights(cand, required_any):
            return cand

    return None


def ensure_models_downloaded(force: bool = False) -> Dict[str, str]:
    """
    Download missing live ML model bundles from HF_MODEL_REPO_ID into AI_MODELS_ROOT.
    Safe no-op when all 4 models already exist locally or when HF_MODEL_REPO_ID is unset.
    """
    anchor = Path(__file__)
    report: Dict[str, str] = {}

    if settings.AI_ADAPTER_MODE == "mock" and not force:
        return {"status": "skipped_mock_mode"}

    missing = [k for k in _MODEL_SPECS if _existing_local_model_dir(k, anchor) is None]
    if not missing:
        for k in _MODEL_SPECS:
            report[k] = str(_existing_local_model_dir(k, anchor))
        return report

    repo_id = (getattr(settings, "HF_MODEL_REPO_ID", "") or "").strip()
    if not repo_id:
        for k in _MODEL_SPECS:
            found = _existing_local_model_dir(k, anchor)
            report[k] = str(found) if found else "missing_no_hf_repo"
        return report

    with _DOWNLOAD_LOCK:
        # Re-check inside lock
        missing = [k for k in _MODEL_SPECS if _existing_local_model_dir(k, anchor) is None]
        if missing:
            from huggingface_hub import snapshot_download

            target_root = get_models_root()
            target_root.mkdir(parents=True, exist_ok=True)
            revision = (getattr(settings, "HF_MODEL_REVISION", "") or "main").strip()
            token = (getattr(settings, "HF_TOKEN", "") or "").strip() or None
            patterns = [f"{k}/*" for k in missing]

            logger.info(
                "Downloading %s from Hugging Face Hub repo '%s' (rev=%s) into %s...",
                missing,
                repo_id,
                revision,
                target_root,
            )
            snapshot_download(
                repo_id=repo_id,
                repo_type="model",
                revision=revision,
                token=token,
                local_dir=str(target_root),
                allow_patterns=patterns,
            )
            logger.info("HF Hub model download complete in %s", target_root)

    for k in _MODEL_SPECS:
        found = _existing_local_model_dir(k, anchor)
        report[k] = str(found) if found else "missing_after_download"
    return report


def resolve_model_dir(model_key: str, configured_dir: str, anchor_file: Path) -> Path:
    """
    Resolve model artifact directory cleanly across:
    1) Explicit *_MODEL_DIR setting
    2) Already-populated local repo (ml/...) or mounted /models/<key> or AI_MODELS_ROOT/<key>
    3) Lazy Hugging Face Hub download via HF_MODEL_REPO_ID
    """
    required_any, repo_rel = _MODEL_SPECS[model_key]
    if configured_dir:
        explicit = Path(configured_dir)
        if explicit.exists():
            return explicit
        raise FileNotFoundError(f"{model_key} configured directory not found: {explicit}")

    existing = _existing_local_model_dir(model_key, anchor_file)
    if existing is not None:
        return existing

    # Lazy download if running live with HF_MODEL_REPO_ID configured
    if (getattr(settings, "HF_MODEL_REPO_ID", "") or "").strip():
        ensure_models_downloaded(force=True)
        existing_after = _existing_local_model_dir(model_key, anchor_file)
        if existing_after is not None:
            return existing_after

    repo_root = find_repo_root(anchor_file)
    hint = str(repo_root.joinpath(*repo_rel)) if repo_root else str(get_models_root() / model_key)
    raise FileNotFoundError(
        f"{model_key} model weights not found at {hint} (required one of {required_any})"
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = ensure_models_downloaded(force=True)
    print("HF Bootstrap status:", result)
