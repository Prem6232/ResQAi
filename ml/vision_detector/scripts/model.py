from __future__ import annotations

import json
import os
from functools import partial
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import torch
import torch.nn as nn
import torchvision.models.detection as tvd
from torchvision.models.detection.fcos import FCOS, FCOSClassificationHead

DEFAULT_CFG_PATH = Path(__file__).resolve().parents[1] / "configs" / "vision_config.json"
ML_ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("TORCH_HOME", str(ML_ROOT / ".hf_cache" / "torch"))

ID2LABEL = {0: "smoke_plume", 1: "active_flame"}
LABEL2ID = {"smoke_plume": 0, "active_flame": 1}


def load_vision_config(path: Path = DEFAULT_CFG_PATH) -> Dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_fcos_model(
    img_size: int = 384,
    trainable_backbone_layers: int = 3,
    pretrained: bool = True,
) -> FCOS:
    """
    Build TorchVision `fcos_resnet50_fpn` (BSD-3-Clause) with 3 classes:
    index 0 = background (implicit in FCOS focal loss), 1 = smoke_plume, 2 = active_flame.
    """
    weights = tvd.FCOS_ResNet50_FPN_Weights.DEFAULT if pretrained else None
    kwargs = {"weights": weights, "trainable_backbone_layers": trainable_backbone_layers}
    if not pretrained:
        kwargs["weights_backbone"] = None
    model = tvd.fcos_resnet50_fpn(**kwargs)
    num_anchors = model.head.classification_head.num_anchors
    in_channels = model.backbone.out_channels
    model.head.classification_head = FCOSClassificationHead(
        in_channels,
        num_anchors,
        3,
        norm_layer=partial(nn.GroupNorm, 32),
    )
    prior_prob = 0.01
    bias_val = -float(np.log((1.0 - prior_prob) / prior_prob))
    nn.init.constant_(model.head.classification_head.cls_logits.bias, bias_val)

    model.transform.min_size = (img_size,)
    model.transform.max_size = img_size
    return model


class FCOSOnnxWrapper(nn.Module):
    """Pure Conv/GroupNorm wrapper exporting raw FPN `(cls_logits, bbox_regression, bbox_ctrness)`."""

    def __init__(self, fcos: FCOS) -> None:
        super().__init__()
        self.backbone = fcos.backbone
        self.head = fcos.head
        self.register_buffer("mean", torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32).view(1, 3, 1, 1))

    def forward(self, pixel_values: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        normed = (pixel_values - self.mean) / self.std
        feats = list(self.backbone(normed).values())
        cls_logits = self.head.classification_head(feats)
        bbox_reg, bbox_ctrness = self.head.regression_head(feats)
        return cls_logits, bbox_reg, bbox_ctrness


def build_fcos_anchors(img_size: int = 384) -> np.ndarray:
    """Build exact multi-scale FPN anchor boxes `(N, 4)` matching TorchVision `AnchorGenerator`."""
    all_anchors: List[np.ndarray] = []
    for stride in (8, 16, 32, 64, 128):
        fh = (img_size + stride - 1) // stride
        fw = (img_size + stride - 1) // stride
        sx = np.arange(fw, dtype=np.float32) * stride
        sy = np.arange(fh, dtype=np.float32) * stride
        gx, gy = np.meshgrid(sx, sy)
        gx, gy = gx.reshape(-1), gy.reshape(-1)
        hs = 0.5 * stride
        all_anchors.append(np.stack([gx - hs, gy - hs, gx + hs, gy + hs], axis=-1))
    return np.concatenate(all_anchors, axis=0)


def compute_iou_matrix(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
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


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30.0, 30.0)))


def max_image_fire_score(cls_logits: np.ndarray, bbox_ctrness: np.ndarray) -> float:
    """Continuous image-level confidence across foreground classes (`1=smoke_plume`, `2=active_flame`)."""
    cls_probs = _sigmoid(cls_logits[:, 1:])
    ctr_probs = _sigmoid(bbox_ctrness)
    scores = np.sqrt(np.clip(cls_probs * ctr_probs, 0.0, 1.0))
    return float(np.max(scores)) if scores.size else 0.0


def postprocess_fcos_outputs(
    cls_logits: np.ndarray,
    bbox_reg: np.ndarray,
    bbox_ctrness: np.ndarray,
    anchors: np.ndarray,
    img_size: int = 384,
    score_threshold: float = 0.40,
    nms_iou_threshold: float = 0.50,
    max_detections: int = 8,
) -> List[Dict]:
    """
    Decode raw FCOS `(N, 3)` logits, `(N, 4)` LTRB offsets, and `(N, 1)` centerness
    into normalized `[0, 1]` NMS-filtered bounding boxes matching ResQAI schema.
    """
    cls_probs = _sigmoid(cls_logits[:, 1:])  # cols 1, 2 -> smoke_plume (0), active_flame (1)
    ctr_probs = _sigmoid(bbox_ctrness)
    scores_mat = np.sqrt(np.clip(cls_probs * ctr_probs, 0.0, 1.0))

    scores = np.max(scores_mat, axis=-1)
    cls_ids = np.argmax(scores_mat, axis=-1)  # 0=smoke_plume, 1=active_flame

    keep = scores >= score_threshold
    if not np.any(keep):
        return []

    k_scores = scores[keep]
    k_cls = cls_ids[keep]
    k_reg = bbox_reg[keep]
    k_anc = anchors[keep]

    ctr_x = 0.5 * (k_anc[:, 0] + k_anc[:, 2])
    ctr_y = 0.5 * (k_anc[:, 1] + k_anc[:, 3])
    anc_w = k_anc[:, 2] - k_anc[:, 0]
    anc_h = k_anc[:, 3] - k_anc[:, 1]

    x1 = np.clip((ctr_x - k_reg[:, 0] * anc_w) / img_size, 0.0, 1.0)
    y1 = np.clip((ctr_y - k_reg[:, 1] * anc_h) / img_size, 0.0, 1.0)
    x2 = np.clip((ctr_x + k_reg[:, 2] * anc_w) / img_size, 0.0, 1.0)
    y2 = np.clip((ctr_y + k_reg[:, 3] * anc_h) / img_size, 0.0, 1.0)

    valid = ((x2 - x1) >= 0.012) & ((y2 - y1) >= 0.012)
    if not np.any(valid):
        return []

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
                if float(compute_iou_matrix(xyxy[idx : idx + 1], xyxy[prev : prev + 1])[0, 0]) >= nms_iou_threshold:
                    suppress = True
                    break
        if not suppress:
            selected.append(int(idx))
            if len(selected) >= max_detections:
                break

    results: List[Dict] = []
    for idx in selected:
        bx1, by1, bx2, by2 = [float(v) for v in xyxy[idx]]
        cid = int(k_cls[idx])
        results.append(
            {
                "label": ID2LABEL[cid],
                "class_id": cid,
                "score": round(float(k_scores[idx]), 4),
                "x": round(bx1, 4),
                "y": round(by1, 4),
                "width": round(max(0.01, bx2 - bx1), 4),
                "height": round(max(0.01, by2 - by1), 4),
            }
        )
    return results


def save_fcos_checkpoint(
    model: FCOS,
    output_dir: Path,
    cfg: Dict,
    extra_metadata: Dict | None = None,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), output_dir / "fcos_weights.pt")
    meta = {
        "base_model": cfg["base_model"],
        "image_size": int(cfg["image_size"]),
        "id2label": {str(k): v for k, v in ID2LABEL.items()},
        **(extra_metadata or {}),
    }
    with open(output_dir / "model_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
