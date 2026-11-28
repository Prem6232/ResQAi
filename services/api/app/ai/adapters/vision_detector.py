from __future__ import annotations

import asyncio
import io
import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.ai.adapters.base import BaseAIAdapter
from app.ai.schemas import VisionBoundingBox, VisionDetectionSchema

logger = logging.getLogger("sentinelgrid.ai.vision_detector")

_ID2LABEL = {0: "smoke_plume", 1: "active_flame"}
_RUNTIME_LOCK = threading.Lock()
_RUNTIME_CACHE: Dict[Tuple[str, str], "_OnnxVisionRuntime"] = {}


def _resolve_onnx_paths(configured_dir: str, preferred_filename: str) -> Tuple[Path, Path]:
    if configured_dir:
        model_dir = Path(configured_dir)
    else:
        repo_root = Path(__file__).resolve().parents[5]
        model_dir = repo_root / "ml" / "vision_detector" / "artifacts" / "onnx"

    if not model_dir.exists():
        raise FileNotFoundError(f"Vision ONNX model directory not found: {model_dir}")

    for candidate in (
        model_dir / preferred_filename,
        model_dir / "model_fp32.onnx",
        model_dir / "model_int8.onnx",
    ):
        if candidate.is_file():
            return model_dir, candidate

    raise FileNotFoundError(f"No ONNX vision model artifact found in {model_dir}")


def _build_fcos_anchors(img_size: int) -> np.ndarray:
    anchors: List[np.ndarray] = []
    for stride in (8, 16, 32, 64, 128):
        fh = (img_size + stride - 1) // stride
        fw = (img_size + stride - 1) // stride
        sx = np.arange(fw, dtype=np.float32) * stride
        sy = np.arange(fh, dtype=np.float32) * stride
        gx, gy = np.meshgrid(sx, sy)
        gx, gy = gx.reshape(-1), gy.reshape(-1)
        hs = 0.5 * stride
        anchors.append(np.stack([gx - hs, gy - hs, gx + hs, gy + hs], axis=-1))
    return np.concatenate(anchors, axis=0)


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30.0, 30.0)))


def _compute_iou_matrix(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
    if boxes_a.shape[0] == 0 or boxes_b.shape[0] == 0:
        return np.zeros((boxes_a.shape[0], boxes_b.shape[0]), dtype=np.float32)
    xa1 = np.maximum(boxes_a[:, None, 0], boxes_b[None, :, 0])
    ya1 = np.maximum(boxes_a[:, None, 1], boxes_b[None, :, 1])
    xa2 = np.minimum(boxes_a[:, None, 2], boxes_b[None, :, 2])
    ya2 = np.minimum(boxes_a[:, None, 3], boxes_b[None, :, 3])
    inter = np.maximum(0.0, xa2 - xa1) * np.maximum(0.0, ya2 - ya1)
    area_a = np.maximum(0.0, boxes_a[:, 2] - boxes_a[:, 0]) * np.maximum(0.0, boxes_a[:, 3] - boxes_a[:, 1])
    area_b = np.maximum(0.0, boxes_b[:, 2] - boxes_b[:, 0]) * np.maximum(0.0, boxes_b[:, 3] - boxes_b[:, 1])
    union = np.maximum(1e-9, area_a[:, None] + area_b[None, :] - inter)
    return inter / union


def _fetch_s3_image_bytes(s3_key: str) -> bytes:
    from app.core.config import settings
    from app.modules.media.service import get_s3_client

    client = get_s3_client(for_public_presign=False)
    obj = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
    return obj["Body"].read()


class _OnnxVisionRuntime:
    """Self-contained CPU ONNX runtime for BSD-3 FCOS-ResNet50-FPN fire/smoke detection."""

    def __init__(self, model_dir: Path, model_path: Path) -> None:
        import onnxruntime as ort

        cfg_path = model_dir / "vision_config.json"
        if not cfg_path.is_file():
            raise FileNotFoundError(f"Missing vision_config.json in {model_dir}")

        with open(cfg_path, "r", encoding="utf-8") as f:
            self.cfg: Dict[str, Any] = json.load(f)

        self.img_size: int = int(self.cfg.get("image_size", 384))
        self.score_threshold: float = float(self.cfg.get("box_score_threshold", 0.40))
        self.nms_iou_threshold: float = float(self.cfg.get("nms_iou_threshold", 0.50))
        self.max_detections: int = int(self.cfg.get("max_detections", 8))
        self.anchors = _build_fcos_anchors(self.img_size)

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        self.session = ort.InferenceSession(
            str(model_path), sess_options=opts, providers=["CPUExecutionProvider"]
        )
        self.model_version = "fcos-r50-fpn-indian-fire-smoke-v1-onnx"
        logger.info("Loaded VisionDetector ONNX model from %s", model_path)

    def _preprocess(self, raw_bytes: bytes) -> np.ndarray:
        from PIL import Image, ImageOps

        with Image.open(io.BytesIO(raw_bytes)) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            if im.size != (self.img_size, self.img_size):
                im = im.resize((self.img_size, self.img_size), Image.Resampling.BILINEAR)
            arr = np.asarray(im, dtype=np.float32) * (1.0 / 255.0)
        return np.transpose(arr, (2, 0, 1))[None, ...]

    def detect_sync(self, raw_bytes: bytes) -> VisionDetectionSchema:
        pixel_values = self._preprocess(raw_bytes)
        cls_l, box_r, ctr_r = self.session.run(None, {"pixel_values": pixel_values})
        cls_logits = cls_l[0]
        bbox_reg = box_r[0]
        bbox_ctrness = ctr_r[0]

        cls_probs = _sigmoid(cls_logits[:, 1:])
        ctr_probs = _sigmoid(bbox_ctrness)
        scores_mat = np.sqrt(np.clip(cls_probs * ctr_probs, 0.0, 1.0))
        scores = np.max(scores_mat, axis=-1)
        cls_ids = np.argmax(scores_mat, axis=-1)
        max_img_score = round(float(np.max(scores)) if scores.size else 0.0, 2)

        keep = scores >= self.score_threshold
        boxes_out: List[VisionBoundingBox] = []
        top_score = max_img_score

        if np.any(keep):
            k_scores = scores[keep]
            k_cls = cls_ids[keep]
            k_reg = bbox_reg[keep]
            k_anc = self.anchors[keep]

            ctr_x = 0.5 * (k_anc[:, 0] + k_anc[:, 2])
            ctr_y = 0.5 * (k_anc[:, 1] + k_anc[:, 3])
            anc_w = k_anc[:, 2] - k_anc[:, 0]
            anc_h = k_anc[:, 3] - k_anc[:, 1]

            x1 = np.clip((ctr_x - k_reg[:, 0] * anc_w) / self.img_size, 0.0, 1.0)
            y1 = np.clip((ctr_y - k_reg[:, 1] * anc_h) / self.img_size, 0.0, 1.0)
            x2 = np.clip((ctr_x + k_reg[:, 2] * anc_w) / self.img_size, 0.0, 1.0)
            y2 = np.clip((ctr_y + k_reg[:, 3] * anc_h) / self.img_size, 0.0, 1.0)

            valid = ((x2 - x1) >= 0.012) & ((y2 - y1) >= 0.012)
            if np.any(valid):
                k_scores = k_scores[valid]
                k_cls = k_cls[valid]
                xyxy = np.stack([x1[valid], y1[valid], x2[valid], y2[valid]], axis=-1)

                order = np.argsort(-k_scores)
                selected: List[int] = []
                for idx in order:
                    cid = int(k_cls[idx])
                    suppress = False
                    for prev in selected:
                        if int(k_cls[prev]) == cid:
                            iou = float(_compute_iou_matrix(xyxy[idx : idx + 1], xyxy[prev : prev + 1])[0, 0])
                            if iou >= self.nms_iou_threshold:
                                suppress = True
                                break
                    if not suppress:
                        selected.append(int(idx))
                        if len(selected) >= self.max_detections:
                            break

                for idx in selected:
                    bx1, by1, bx2, by2 = [float(v) for v in xyxy[idx]]
                    boxes_out.append(
                        VisionBoundingBox(
                            x=round(bx1, 4),
                            y=round(by1, 4),
                            width=round(max(0.01, bx2 - bx1), 4),
                            height=round(max(0.01, by2 - by1), 4),
                            label=_ID2LABEL.get(int(k_cls[idx]), "active_flame"),
                        )
                    )
                if selected:
                    top_score = round(float(k_scores[selected[0]]), 2)

        if boxes_out:
            labels_str = ", ".join(sorted({b.label for b in boxes_out}))
            return VisionDetectionSchema(
                pipeline="fire_smoke",
                finding="possible_fire_smoke_evidence",
                modelScore=top_score,
                modelVersion=self.model_version,
                adapter="live_model",
                explanation=f"Detected {labels_str} across {len(boxes_out)} region(s). Top confidence: {int(top_score * 100)}%. Operator verification required.",
                boundingBoxes=boxes_out,
            )

        return VisionDetectionSchema(
            pipeline="fire_smoke",
            finding="no_supported_visual_evidence",
            modelScore=max_img_score,
            modelVersion=self.model_version,
            adapter="live_model",
            explanation=f"No visual fire or smoke evidence detected above {self.score_threshold:.2f} confidence threshold.",
            boundingBoxes=[],
        )


def _get_runtime() -> _OnnxVisionRuntime:
    from app.core.config import settings

    configured_dir = getattr(settings, "VISION_DETECTOR_MODEL_DIR", "")
    preferred_file = getattr(settings, "VISION_DETECTOR_ONNX_FILE", "model_fp32.onnx")
    key = (configured_dir, preferred_file)

    with _RUNTIME_LOCK:
        cached = _RUNTIME_CACHE.get(key)
        if cached is not None:
            return cached
        model_dir, model_path = _resolve_onnx_paths(configured_dir, preferred_file)
        runtime = _OnnxVisionRuntime(model_dir, model_path)
        _RUNTIME_CACHE[key] = runtime
        return runtime


class VisionDetectorAdapter(BaseAIAdapter):
    """
    Vision analysis adapter for fire and smoke pattern recognition.
    Supports deterministic mock mode and local CPU FCOS-ResNet50-FPN ONNX inference.
    """

    async def predict(self, s3_key: Optional[str] = None, file_bytes: Optional[bytes] = None) -> VisionDetectionSchema:
        if not self.is_mock:
            try:
                return await self._live_detection(s3_key, file_bytes)
            except Exception as e:
                logger.warning(f"Live vision detection failed: {e}. Falling back to mock detection.")

        return self._mock_detection()

    def _mock_detection(self) -> VisionDetectionSchema:
        return VisionDetectionSchema(
            pipeline="fire_smoke",
            finding="possible_fire_smoke_evidence",
            modelScore=0.95,
            modelVersion="yolov8-fire-smoke-v2-mock",
            adapter="labelled_demo_adapter",
            explanation="Visual fire and dense smoke patterns identified. 95% model confidence. Operator verification required.",
            boundingBoxes=[
                VisionBoundingBox(x=0.25, y=0.3, width=0.45, height=0.35, label="smoke_plume"),
                VisionBoundingBox(x=0.40, y=0.5, width=0.20, height=0.20, label="active_flame"),
            ],
        )

    async def _live_detection(self, s3_key: Optional[str], file_bytes: Optional[bytes]) -> VisionDetectionSchema:
        from app.core.config import settings

        if settings.VISION_INFERENCE_URL:
            import httpx

            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    settings.VISION_INFERENCE_URL.rstrip("/") + "/detect",
                    json={"s3_key": s3_key},
                )
                if resp.status_code == 200:
                    return VisionDetectionSchema(**resp.json())
                raise ValueError(f"Vision service responded with HTTP {resp.status_code}")

        raw_bytes = file_bytes
        if raw_bytes is None:
            if not s3_key:
                raise ValueError("Either file_bytes or s3_key must be provided for live vision detection")
            raw_bytes = await asyncio.to_thread(_fetch_s3_image_bytes, s3_key)

        runtime = _get_runtime()
        return await asyncio.to_thread(runtime.detect_sync, raw_bytes)
