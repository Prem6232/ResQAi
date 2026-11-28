from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

from model import (
    compute_iou_matrix,
    max_image_fire_score,
    postprocess_fcos_outputs,
)


def _cxcywh_to_xyxy(boxes: np.ndarray) -> np.ndarray:
    cx, cy, w, h = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    return np.stack(
        [
            np.clip(cx - 0.5 * w, 0.0, 1.0),
            np.clip(cy - 0.5 * h, 0.0, 1.0),
            np.clip(cx + 0.5 * w, 0.0, 1.0),
            np.clip(cy + 0.5 * h, 0.0, 1.0),
        ],
        axis=-1,
    )


def _compute_ap(recalls: np.ndarray, precisions: np.ndarray) -> float:
    mrec = np.concatenate(([0.0], recalls, [1.0]))
    mpre = np.concatenate(([0.0], precisions, [0.0]))
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])
    idx = np.where(mrec[1:] != mrec[:-1])[0]
    return float(np.sum((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]))


def evaluate_predictions(
    gt_rows: List[Dict],
    raw_outputs: List[Tuple[np.ndarray, np.ndarray, np.ndarray]],
    anchors: np.ndarray,
    img_size: int = 384,
    score_threshold: float = 0.40,
    nms_iou_threshold: float = 0.50,
    max_detections: int = 8,
    eval_iou_threshold: float = 0.50,
) -> Dict:
    preds_by_cls: Dict[int, List[Tuple[float, int, np.ndarray]]] = {0: [], 1: []}
    gt_by_img_cls: Dict[Tuple[int, int], np.ndarray] = {}
    gt_counts = {0: 0, 1: 0}

    y_true_img: List[int] = []
    y_score_img: List[float] = []
    y_pred_img: List[int] = []
    indian_preds: List[int] = []

    for img_idx, (row, (cls_logits, bbox_reg, bbox_ctrness)) in enumerate(zip(gt_rows, raw_outputs)):
        gt_boxes = row["boxes"]
        y_true_img.append(1 if gt_boxes else 0)

        for cid in (0, 1):
            cls_boxes = [[b["cx"], b["cy"], b["w"], b["h"]] for b in gt_boxes if int(b["class_id"]) == cid]
            if cls_boxes:
                gt_by_img_cls[(img_idx, cid)] = _cxcywh_to_xyxy(np.array(cls_boxes, dtype=np.float32))
                gt_counts[cid] += len(cls_boxes)
            else:
                gt_by_img_cls[(img_idx, cid)] = np.zeros((0, 4), dtype=np.float32)

        y_score_img.append(max_image_fire_score(cls_logits, bbox_ctrness))

        ap_dets = postprocess_fcos_outputs(
            cls_logits,
            bbox_reg,
            bbox_ctrness,
            anchors,
            img_size=img_size,
            score_threshold=0.08,
            nms_iou_threshold=nms_iou_threshold,
            max_detections=30,
        )
        for d in ap_dets:
            x1, y1 = d["x"], d["y"]
            xyxy = np.array([x1, y1, x1 + d["width"], y1 + d["height"]], dtype=np.float32)
            preds_by_cls[int(d["class_id"])].append((float(d["score"]), img_idx, xyxy))

        thresh_dets = postprocess_fcos_outputs(
            cls_logits,
            bbox_reg,
            bbox_ctrness,
            anchors,
            img_size=img_size,
            score_threshold=score_threshold,
            nms_iou_threshold=nms_iou_threshold,
            max_detections=max_detections,
        )
        pred_flag = 1 if thresh_dets else 0
        y_pred_img.append(pred_flag)
        if row.get("is_indian_scene") and not gt_boxes:
            indian_preds.append(pred_flag)

    ap_per_class: Dict[str, float] = {}
    for cid, cname in ((0, "smoke_plume"), (1, "active_flame")):
        n_gt = gt_counts[cid]
        if n_gt == 0:
            ap_per_class[cname] = 0.0
            continue
        dets = sorted(preds_by_cls[cid], key=lambda item: -item[0])
        matched: Dict[int, np.ndarray] = {}
        tp = np.zeros(len(dets), dtype=np.float32)
        fp = np.zeros(len(dets), dtype=np.float32)

        for i, (_score, img_idx, box) in enumerate(dets):
            gts = gt_by_img_cls[(img_idx, cid)]
            if gts.shape[0] == 0:
                fp[i] = 1.0
                continue
            used = matched.setdefault(img_idx, np.zeros(gts.shape[0], dtype=bool))
            ious = compute_iou_matrix(box[None, :], gts)[0]
            best_j = int(np.argmax(ious))
            if ious[best_j] >= eval_iou_threshold and not used[best_j]:
                tp[i] = 1.0
                used[best_j] = True
            else:
                fp[i] = 1.0

        tp_cum = np.cumsum(tp)
        fp_cum = np.cumsum(fp)
        recalls = tp_cum / max(1, n_gt)
        precisions = tp_cum / np.maximum(1e-9, tp_cum + fp_cum)
        ap_per_class[cname] = round(_compute_ap(recalls, precisions), 4)

    active_aps = [v for k, v in ap_per_class.items() if gt_counts[0 if k == "smoke_plume" else 1] > 0]
    map50 = round(float(np.mean(active_aps)) if active_aps else 0.0, 4)

    y_t = np.array(y_true_img, dtype=np.int32)
    y_p = np.array(y_pred_img, dtype=np.int32)
    y_s = np.array(y_score_img, dtype=np.float32)
    neg_mask = y_t == 0
    pos_mask = y_t == 1

    return {
        "count": len(gt_rows),
        "score_threshold": score_threshold,
        "mAP_50": map50,
        "ap_50": ap_per_class,
        "image_roc_auc": round(float(roc_auc_score(y_t, y_s)), 4) if len(np.unique(y_t)) > 1 else None,
        "image_accuracy": round(float(accuracy_score(y_t, y_p)), 4),
        "image_f1": round(float(f1_score(y_t, y_p, zero_division=0)), 4) if np.any(pos_mask) else None,
        "image_recall_pos": round(float(np.mean(y_p[pos_mask])), 4) if np.any(pos_mask) else None,
        "false_positive_rate": round(float(np.mean(y_p[neg_mask])), 4) if np.any(neg_mask) else None,
        "indian_neg_fpr": round(float(np.mean(indian_preds)), 4) if indian_preds else None,
        "indian_neg_count": len(indian_preds),
    }
