from __future__ import annotations

import asyncio
import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.ai.adapters.base import BaseAIAdapter
from app.ai.hf_bootstrap import resolve_model_dir
from app.ai.schemas import TextAssessmentSchema

logger = logging.getLogger("sentinelgrid.ai.text_classifier")

_HINGLISH_MARKERS = {
    "aag",
    "dhuwa",
    "dhuan",
    "paani",
    "pani",
    "behosh",
    "behoosh",
    "khoon",
    "khun",
    "takkar",
    "madad",
    "jaldi",
    "bijli",
    "bachaao",
    "gali",
    "mein",
    "hai",
    "hain",
    "raha",
    "rahi",
    "gaya",
    "gayi",
    "bhai",
}

_RUNTIME_LOCK = threading.Lock()
_RUNTIME_CACHE: Dict[Tuple[str, str], "_OnnxTextClassifierRuntime"] = {}


def _softmax(logits: np.ndarray, temperature: float) -> np.ndarray:
    scaled = logits / max(temperature, 1e-4)
    shifted = scaled - np.max(scaled, axis=-1, keepdims=True)
    exp = np.exp(shifted)
    return exp / np.sum(exp, axis=-1, keepdims=True)


def _detect_script_label(text: str) -> str:
    if any("\u0900" <= ch <= "\u097f" for ch in text):
        return "Hindi (Devanagari)"
    tokens = {w.strip(".,!?:;\"'()").lower() for w in text.split()}
    if len(tokens & _HINGLISH_MARKERS) >= 2:
        return "Hinglish / Code-Mixed"
    return "English / en-IN"


def _resolve_onnx_paths(configured_dir: str, preferred_filename: str) -> Tuple[Path, Path]:
    model_dir = resolve_model_dir("text_classifier", configured_dir, Path(__file__))

    if not model_dir.exists():
        raise FileNotFoundError(f"ONNX model directory not found: {model_dir}")

    candidates = [model_dir / preferred_filename, model_dir / "model_fp32.onnx", model_dir / "model_int8.onnx"]
    for candidate in candidates:
        if candidate.is_file():
            return model_dir, candidate

    raise FileNotFoundError(f"No ONNX model artifact found in {model_dir}")


class _OnnxTextClassifierRuntime:
    """Self-contained CPU ONNX runtime using Hugging Face's Rust tokenizer without PyTorch."""

    def __init__(self, model_dir: Path, model_path: Path) -> None:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        meta_path = model_dir / "model_meta.json"
        tok_path = model_dir / "tokenizer.json"
        if not meta_path.is_file() or not tok_path.is_file():
            raise FileNotFoundError(f"Missing model_meta.json or tokenizer.json in {model_dir}")

        with open(meta_path, "r", encoding="utf-8") as f:
            meta: Dict[str, Any] = json.load(f)

        self.categories: List[str] = list(meta["categories"])
        self.urgencies: List[str] = list(meta["urgencies"])
        self.cat_temp: float = float(meta.get("category_temperature", 1.0))
        self.urg_temp: float = float(meta.get("urgency_temperature", 1.0))
        self.max_length: int = int(meta.get("max_length", 128))
        self.threshold: float = float(meta.get("review_confidence_threshold", 0.72))
        self.model_filename: str = model_path.name

        self.tokenizer = Tokenizer.from_file(str(tok_path))
        self.tokenizer.enable_truncation(max_length=self.max_length)
        self.tokenizer.enable_padding(length=self.max_length, pad_id=0, pad_token="[PAD]")

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        self.session = ort.InferenceSession(str(model_path), sess_options=opts, providers=["CPUExecutionProvider"])

    def predict_sync(self, text: str) -> TextAssessmentSchema:
        enc = self.tokenizer.encode(text)
        input_ids = np.array([enc.ids], dtype=np.int64)
        attention_mask = np.array([enc.attention_mask], dtype=np.int64)

        cat_logits, urg_logits = self.session.run(
            None,
            {"input_ids": input_ids, "attention_mask": attention_mask},
        )
        cat_probs = _softmax(cat_logits, self.cat_temp)[0]
        urg_probs = _softmax(urg_logits, self.urg_temp)[0]

        cat_idx = int(np.argmax(cat_probs))
        urg_idx = int(np.argmax(urg_probs))
        category = self.categories[cat_idx]
        urgency = self.urgencies[urg_idx]
        cat_conf = float(cat_probs[cat_idx])
        urg_conf = float(urg_probs[urg_idx])

        review_required = bool(
            cat_conf < self.threshold
            or (category == "other" and cat_conf < 0.78)
            or (category == "hazard" and cat_conf < 0.72)
        )
        script_label = _detect_script_label(text)
        explanation = (
            f"MuRIL Indian-Emergency ONNX classified as '{category}' "
            f"({cat_conf * 100:.1f}% score), urgency '{urgency}' ({urg_conf * 100:.1f}%), "
            f"script={script_label}."
        )
        if review_required:
            explanation += " Operator verification advised due to score/class ambiguity."

        return TextAssessmentSchema(
            suggestedCategory=category,
            suggestedUrgency=urgency,
            modelScore=round(cat_conf, 4),
            scoreMeaning="Calibrated MuRIL Indian-Emergency ONNX classifier score; operator verification required when reviewRequired is True.",
            reviewRequired=review_required,
            explanation=explanation,
            modelVersion=f"muril-indian-emergency-v1-onnx ({self.model_filename})",
        )


def get_onnx_runtime(configured_dir: str, preferred_filename: str) -> _OnnxTextClassifierRuntime:
    model_dir, model_path = _resolve_onnx_paths(configured_dir, preferred_filename)
    key = (str(model_dir.resolve()), str(model_path.resolve()))
    with _RUNTIME_LOCK:
        runtime = _RUNTIME_CACHE.get(key)
        if runtime is None:
            runtime = _OnnxTextClassifierRuntime(model_dir, model_path)
            _RUNTIME_CACHE[key] = runtime
        return runtime


class TextClassifierAdapter(BaseAIAdapter):
    """
    Text classification adapter for categorizing emergency text and determining urgency.
    Supports deterministic keyword/mock mode and local $0/lifetime MuRIL ONNX inference.
    """

    async def predict(self, text: Optional[str]) -> TextAssessmentSchema:
        if not text or not text.strip():
            return TextAssessmentSchema(
                suggestedCategory="other",
                suggestedUrgency="medium",
                modelScore=0.50,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=True,
                explanation="No text description provided. Human operator review strongly advised.",
                modelVersion="distilbert-emergency-v1-mock" if self.is_mock else "muril-indian-emergency-v1-onnx",
            )

        if not self.is_mock:
            try:
                return await self._live_inference(text)
            except Exception as e:
                logger.warning(f"Live ONNX text classifier failed: {e}. Falling back to rule-based mock engine.")

        return self._mock_inference(text)

    def _mock_inference(self, text: str) -> TextAssessmentSchema:
        lower = text.lower()

        if any(kw in lower for kw in ["fire", "smoke", "flame", "aag", "dhuwa", "burning", "blaze"]):
            return TextAssessmentSchema(
                suggestedCategory="fire_smoke",
                suggestedUrgency="critical",
                modelScore=0.94,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Detected high-frequency thermal keywords ('fire/smoke'). Confidence: 94%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        if any(kw in lower for kw in ["accident", "bike", "car", "collision", "crash", "truck", "scooter"]):
            return TextAssessmentSchema(
                suggestedCategory="road_accident",
                suggestedUrgency="high",
                modelScore=0.89,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Vehicle impact terminology detected. Confidence: 89%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        if any(kw in lower for kw in ["blood", "unconscious", "heart", "chot", "doctor", "ambulance", "injury", "injured", "pain"]):
            return TextAssessmentSchema(
                suggestedCategory="medical",
                suggestedUrgency="critical",
                modelScore=0.96,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Urgent trauma / medical indicator present. Confidence: 96%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        if any(kw in lower for kw in ["water", "flood", "leak", "pipe", "overflow", "drowning", "paani"]):
            return TextAssessmentSchema(
                suggestedCategory="water_flood",
                suggestedUrgency="medium",
                modelScore=0.85,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Water accumulation or infrastructure failure terminology detected. Confidence: 85%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        if any(kw in lower for kw in ["stalk", "harass", "threat", "attack", "robbery", "danger", "help me"]):
            return TextAssessmentSchema(
                suggestedCategory="personal_safety",
                suggestedUrgency="critical",
                modelScore=0.91,
                scoreMeaning="Relative classifier score, not probability the incident is real.",
                reviewRequired=False,
                explanation="Threat to personal safety terminology identified. Confidence: 91%.",
                modelVersion="distilbert-emergency-v1-mock",
            )

        return TextAssessmentSchema(
            suggestedCategory="hazard",
            suggestedUrgency="medium",
            modelScore=0.72,
            scoreMeaning="Relative classifier score, not probability the incident is real.",
            reviewRequired=True,
            explanation="General environmental hazard indicators detected. Confidence: 72%.",
            modelVersion="distilbert-emergency-v1-mock",
        )

    async def _live_inference(self, text: str) -> TextAssessmentSchema:
        from app.ai.remote_client import post_remote_inference, resolve_remote_endpoint
        from app.core.config import settings

        remote_url = resolve_remote_endpoint(settings.TEXT_INFERENCE_URL, "/classify-text")
        if remote_url:
            data = await post_remote_inference(remote_url, {"text": text})
            return TextAssessmentSchema(**data)

        runtime = get_onnx_runtime(
            configured_dir=settings.TEXT_CLASSIFIER_MODEL_DIR,
            preferred_filename=settings.TEXT_CLASSIFIER_ONNX_FILE,
        )
        return await asyncio.to_thread(runtime.predict_sync, text)
