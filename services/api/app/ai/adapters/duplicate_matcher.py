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
from app.ai.schemas import DuplicateCandidateSchema
from app.common.spatial import extract_lat_lng, haversine_distance_meters

logger = logging.getLogger("sentinelgrid.ai.duplicate_matcher")

_RUNTIME_LOCK = threading.Lock()
_RUNTIME_CACHE: Dict[Tuple[str, str], "_OnnxDuplicateRuntime"] = {}


def _resolve_onnx_paths(configured_dir: str, preferred_filename: str) -> Tuple[Path, Path]:
    model_dir = resolve_model_dir("duplicate_matcher", configured_dir, Path(__file__))

    if not model_dir.exists():
        raise FileNotFoundError(f"Duplicate matcher ONNX directory not found: {model_dir}")

    for candidate in (
        model_dir / preferred_filename,
        model_dir / "model_int8.onnx",
        model_dir / "model_fp32.onnx",
    ):
        if candidate.is_file():
            return model_dir, candidate

    raise FileNotFoundError(f"No ONNX model artifact found in {model_dir}")


def _extract_incident_text(inc: Any) -> str:
    """Build descriptive text from an Incident ORM object or stub for semantic comparison."""
    parts: List[str] = []
    for attr in ("description", "raw_text", "title", "location_label"):
        val = getattr(inc, attr, None)
        if isinstance(val, str) and val.strip():
            text = val.strip()
            if text not in parts:
                parts.append(text)
    return " - ".join(parts)


class _OnnxDuplicateRuntime:
    """Self-contained CPU ONNX runtime for fine-tuned multilingual-e5-small embeddings."""

    def __init__(self, model_dir: Path, model_path: Path) -> None:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        cfg_path = model_dir / "matcher_config.json"
        tok_path = model_dir / "tokenizer.json"
        if not cfg_path.is_file() or not tok_path.is_file():
            raise FileNotFoundError(
                f"Missing matcher_config.json or tokenizer.json in {model_dir}"
            )

        with open(cfg_path, "r", encoding="utf-8") as f:
            self.cfg: Dict[str, Any] = json.load(f)

        self.max_length: int = int(self.cfg.get("max_length", 96))
        self.query_prefix: str = str(self.cfg.get("query_prefix", "query: "))
        self.review_sem_threshold: float = float(
            self.cfg.get("likely_related_semantic_threshold", 0.45)
        )
        self.strong_sem_threshold: float = float(
            self.cfg.get("strong_semantic_threshold", 0.62)
        )
        self.radius_m: float = float(self.cfg.get("spatial_radius_meters", 300.0))

        self.tokenizer = Tokenizer.from_file(str(tok_path))
        self.tokenizer.enable_truncation(max_length=self.max_length)
        # intfloat/multilingual-e5-small uses XLM-RoBERTa vocabulary (<pad> == id 1)
        self.tokenizer.enable_padding(
            length=self.max_length, pad_id=1, pad_token="<pad>"
        )

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        self.session = ort.InferenceSession(
            str(model_path), sess_options=opts, providers=["CPUExecutionProvider"]
        )
        self.model_version = "e5-small-indian-duplicate-v1-onnx"
        logger.info("Loaded DuplicateMatcher ONNX model from %s", model_path)

    def embed_batch(self, texts: List[str]) -> np.ndarray:
        prefixed = [f"{self.query_prefix}{t.strip()}" for t in texts]
        encs = self.tokenizer.encode_batch(prefixed)
        input_ids = np.array([e.ids for e in encs], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encs], dtype=np.int64)
        embeddings = self.session.run(
            None, {"input_ids": input_ids, "attention_mask": attention_mask}
        )[0]
        return np.asarray(embeddings, dtype=np.float32)

    def score_pair(self, text_a: str, text_b: str) -> float:
        embs = self.embed_batch([text_a, text_b])
        return float(np.sum(embs[0] * embs[1]))


def _get_runtime() -> _OnnxDuplicateRuntime:
    from app.core.config import settings

    configured_dir = getattr(settings, "DUPLICATE_MATCHER_MODEL_DIR", "")
    preferred_file = getattr(settings, "DUPLICATE_MATCHER_ONNX_FILE", "model_int8.onnx")
    key = (configured_dir, preferred_file)

    with _RUNTIME_LOCK:
        cached = _RUNTIME_CACHE.get(key)
        if cached is not None:
            return cached
        model_dir, model_path = _resolve_onnx_paths(configured_dir, preferred_file)
        runtime = _OnnxDuplicateRuntime(model_dir, model_path)
        _RUNTIME_CACHE[key] = runtime
        return runtime


def _heuristic_pair_score(
    dist_m: float,
    cat_a: str,
    cat_b: str,
) -> Tuple[float, List[str], str]:
    signals = [f"Spatial proximity ({int(dist_m)}m apart)"]
    if cat_a == cat_b:
        signals.append(f"Matching category: {cat_b}")
        score = round(max(0.65, 1.0 - (dist_m / 400.0)), 2)
        rec = "likely_related" if dist_m <= 150.0 else "review"
    else:
        signals.append(f"Cross-category ({cat_a} vs {cat_b})")
        score = 0.50
        rec = "weak"
    return score, signals, rec


class DuplicateMatcherAdapter(BaseAIAdapter):
    """
    Duplicate incident detection adapter combining geospatial proximity,
    incident categorization, and local multilingual-e5-small ONNX semantic similarity.
    """

    def get_model_version(self) -> str:
        """Return active ONNX model identifier in live mode or heuristic fallback identifier."""
        if not self.is_mock:
            try:
                return _get_runtime().model_version
            except Exception:
                pass
        return "heuristic-v1"

    async def score_incident_pair(
        self,
        *,
        dist_m: float,
        cat_a: str,
        cat_b: str,
        text_a: Optional[str],
        text_b: Optional[str],
    ) -> Tuple[float, List[str], str]:
        """Score a nearby (<=300m) pair synchronously via heuristic or live ONNX E5."""
        if (
            not self.is_mock
            and text_a
            and text_a.strip()
            and text_b
            and text_b.strip()
        ):
            try:
                return await asyncio.to_thread(
                    self._live_score_pair_sync,
                    dist_m,
                    cat_a,
                    cat_b,
                    text_a.strip(),
                    text_b.strip(),
                )
            except Exception as e:
                logger.warning(
                    "Live ONNX duplicate matcher failed: %s. Falling back to spatial heuristic.",
                    e,
                )

        return _heuristic_pair_score(dist_m, cat_a, cat_b)

    def _live_score_pair_sync(
        self,
        dist_m: float,
        cat_a: str,
        cat_b: str,
        text_a: str,
        text_b: str,
    ) -> Tuple[float, List[str], str]:
        runtime = _get_runtime()
        sem_sim = runtime.score_pair(text_a, text_b)
        return self._combine_signals(runtime, dist_m, cat_a, cat_b, sem_sim)

    def _combine_signals(
        self,
        runtime: _OnnxDuplicateRuntime,
        dist_m: float,
        cat_a: str,
        cat_b: str,
        sem_sim: float,
    ) -> Tuple[float, List[str], str]:
        same_cat = cat_a == cat_b
        sem_clamped = max(0.0, min(1.0, sem_sim))
        spatial_factor = max(0.0, min(1.0, 1.0 - (dist_m / 400.0)))
        cat_factor = 1.0 if same_cat else 0.0

        score = round(
            min(
                0.99,
                max(
                    0.05,
                    0.70 * sem_clamped + 0.20 * spatial_factor + 0.10 * cat_factor,
                ),
            ),
            2,
        )

        signals = [
            f"Spatial proximity ({int(dist_m)}m apart)",
            f"Matching category: {cat_b}" if same_cat else f"Cross-category ({cat_a} vs {cat_b})",
            f"Semantic similarity: {sem_sim:.2f} ({runtime.model_version})",
        ]

        if sem_sim >= runtime.strong_sem_threshold or (
            sem_sim >= runtime.review_sem_threshold and dist_m <= 150.0 and same_cat
        ):
            rec = "likely_related"
        elif sem_sim >= runtime.review_sem_threshold:
            rec = "review"
        else:
            rec = "weak"

        return score, signals, rec

    def _live_score_candidates_sync(
        self,
        category: str,
        text: str,
        nearby: List[Tuple[Any, float]],
    ) -> List[DuplicateCandidateSchema]:
        runtime = _get_runtime()
        cand_pairs: List[Tuple[Any, float, str]] = []
        fallback_items: List[Tuple[Any, float]] = []

        for inc, dist_m in nearby:
            cand_text = _extract_incident_text(inc)
            if cand_text:
                cand_pairs.append((inc, dist_m, cand_text))
            else:
                fallback_items.append((inc, dist_m))

        results: List[DuplicateCandidateSchema] = []
        if cand_pairs:
            embs = runtime.embed_batch([text] + [c[2] for c in cand_pairs])
            query_emb = embs[0]
            for idx, (inc, dist_m, _cand_text) in enumerate(cand_pairs):
                sem_sim = float(np.sum(query_emb * embs[idx + 1]))
                score, signals, rec = self._combine_signals(
                    runtime, dist_m, category, inc.category, sem_sim
                )
                results.append(
                    DuplicateCandidateSchema(
                        incidentId=inc.public_code,
                        score=score,
                        signals=signals,
                        recommendation=rec,
                    )
                )

        for inc, dist_m in fallback_items:
            score, signals, rec = _heuristic_pair_score(dist_m, category, inc.category)
            results.append(
                DuplicateCandidateSchema(
                    incidentId=inc.public_code,
                    score=score,
                    signals=signals,
                    recommendation=rec,
                )
            )

        results.sort(key=lambda item: item.score, reverse=True)
        return results

    async def predict(
        self,
        category: str,
        text: Optional[str] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        candidates: Optional[List[Any]] = None,
    ) -> List[DuplicateCandidateSchema]:
        results: List[DuplicateCandidateSchema] = []

        if candidates and lat is not None and lng is not None:
            nearby: List[Tuple[Any, float]] = []
            for inc in candidates:
                inc_lat, inc_lng = extract_lat_lng(inc.location)
                dist_m = haversine_distance_meters(lat, lng, inc_lat, inc_lng)
                if dist_m <= 300.0:
                    nearby.append((inc, dist_m))

            if nearby and not self.is_mock and text and text.strip():
                try:
                    return await asyncio.to_thread(
                        self._live_score_candidates_sync,
                        category,
                        text.strip(),
                        nearby,
                    )
                except Exception as e:
                    logger.warning(
                        "Live ONNX duplicate matcher failed: %s. Falling back to spatial heuristic.",
                        e,
                    )

            for inc, dist_m in nearby:
                score, signals, rec = _heuristic_pair_score(dist_m, category, inc.category)
                results.append(
                    DuplicateCandidateSchema(
                        incidentId=inc.public_code,
                        score=score,
                        signals=signals,
                        recommendation=rec,
                    )
                )

        # Baseline mock compatibility (preserved strictly in mock mode when no DB candidates matched)
        if not results and self.is_mock and category == "fire_smoke":
            results.append(
                DuplicateCandidateSchema(
                    incidentId="402",
                    score=0.91,
                    signals=["Spatial proximity (<150m)", "Matching category: fire_smoke"],
                    recommendation="likely_related",
                )
            )

        return results
