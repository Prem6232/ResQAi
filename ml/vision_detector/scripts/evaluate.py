from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import onnxruntime as ort
from PIL import Image

from metrics import evaluate_predictions
from model import build_fcos_anchors, load_vision_config


def load_jsonl(path: Path) -> List[Dict]:
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def load_rgb_chw(base_dir: Path, rel_path: str, img_size: int) -> np.ndarray:
    with Image.open(base_dir / rel_path) as im:
        im = im.convert("RGB")
        if im.size != (img_size, img_size):
            im = im.resize((img_size, img_size), Image.Resampling.BILINEAR)
        arr = np.asarray(im, dtype=np.float32) * (1.0 / 255.0)
    return np.transpose(arr, (2, 0, 1))[None, ...]


def infer_dataset(
    session: ort.InferenceSession,
    base_dir: Path,
    rows: List[Dict],
    img_size: int,
    measure_latency: bool = False,
) -> Tuple[List[Tuple[np.ndarray, np.ndarray, np.ndarray]], float | None, float | None]:
    outputs: List[Tuple[np.ndarray, np.ndarray, np.ndarray]] = []
    timings: List[float] = []

    if measure_latency and rows:
        warm = load_rgb_chw(base_dir, rows[0]["image_path"], img_size)
        for _ in range(3):
            session.run(None, {"pixel_values": warm})

    for idx, row in enumerate(rows):
        x = load_rgb_chw(base_dir, row["image_path"], img_size)
        t0 = time.perf_counter()
        cls_l, box_r, ctr_r = session.run(None, {"pixel_values": x})
        if measure_latency and idx < 60:
            timings.append((time.perf_counter() - t0) * 1000.0)
        outputs.append((cls_l[0], box_r[0], ctr_r[0]))

    p50 = round(float(np.percentile(timings, 50)), 2) if timings else None
    p95 = round(float(np.percentile(timings, 95)), 2) if timings else None
    return outputs, p50, p95


def calibrate_threshold_on_val(
    val_rows: List[Dict],
    raw_outputs: List[Tuple[np.ndarray, np.ndarray, np.ndarray]],
    anchors: np.ndarray,
    img_size: int,
    nms_iou_threshold: float,
    max_detections: int,
) -> Tuple[float, Dict]:
    """Select optimal detector score threshold strictly from validation split."""
    best_thr = 0.40
    best_score = -1.0
    best_metrics: Dict = {}
    for cand in (0.30, 0.35, 0.40, 0.45, 0.50, 0.55):
        m = evaluate_predictions(
            val_rows,
            raw_outputs,
            anchors=anchors,
            img_size=img_size,
            score_threshold=cand,
            nms_iou_threshold=nms_iou_threshold,
            max_detections=max_detections,
        )
        fpr_in = float(m.get("indian_neg_fpr") or 0.0)
        score = 0.55 * float(m["image_f1"] or 0.0) + 0.45 * float(m["image_accuracy"]) - 0.35 * fpr_in
        if score > best_score:
            best_score = score
            best_thr = cand
            best_metrics = m
    return best_thr, best_metrics


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    cfg_path = base_dir / "configs" / "vision_config.json"
    cfg = load_vision_config(cfg_path)
    img_size = int(cfg["image_size"])
    nms_thr = float(cfg["nms_iou_threshold"])
    max_det = int(cfg["max_detections"])
    anchors = build_fcos_anchors(img_size)

    parser = argparse.ArgumentParser(description="Evaluate FCOS-ResNet50-FPN ONNX on OOD D-Fire + Indian scenes")
    parser.add_argument("--onnx-dir", type=Path, default=base_dir / "artifacts" / "onnx")
    parser.add_argument("--val-file", type=Path, default=base_dir / "datasets" / "processed" / "val.jsonl")
    parser.add_argument("--test-dfire", type=Path, default=base_dir / "datasets" / "processed" / "test_dfire_ood.jsonl")
    parser.add_argument("--test-indian", type=Path, default=base_dir / "datasets" / "processed" / "test_indian_neg_ood.jsonl")
    parser.add_argument("--report-out", type=Path, default=base_dir / "artifacts" / "eval_report.json")
    args = parser.parse_args()

    val_rows = load_jsonl(args.val_file)
    dfire_rows = load_jsonl(args.test_dfire)
    indian_rows = load_jsonl(args.test_indian)
    combined_rows = dfire_rows + indian_rows

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4
    model_path = args.onnx_dir / "model_fp32.onnx"
    sess = ort.InferenceSession(str(model_path), sess_options=opts, providers=["CPUExecutionProvider"])

    val_raw, _, _ = infer_dataset(sess, base_dir, val_rows, img_size, measure_latency=False)
    cal_thr, val_cal = calibrate_threshold_on_val(val_rows, val_raw, anchors, img_size, nms_thr, max_det)

    # Persist validation-calibrated threshold into configs and standalone ONNX bundle
    cfg["box_score_threshold"] = cal_thr
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    shutil.copy2(cfg_path, args.onnx_dir / "vision_config.json")

    dfire_raw, p50_ms, p95_ms = infer_dataset(sess, base_dir, dfire_rows, img_size, measure_latency=True)
    indian_raw, _, _ = infer_dataset(sess, base_dir, indian_rows, img_size, measure_latency=False)

    dfire_metrics = evaluate_predictions(dfire_rows, dfire_raw, anchors, img_size, cal_thr, nms_thr, max_det)
    indian_metrics = evaluate_predictions(indian_rows, indian_raw, anchors, img_size, cal_thr, nms_thr, max_det)
    combined_metrics = evaluate_predictions(combined_rows, dfire_raw + indian_raw, anchors, img_size, cal_thr, nms_thr, max_det)

    report = {
        "model": "fcos_resnet50_fpn_fp32_onnx",
        "size_mb": round(model_path.stat().st_size / 1e6, 2),
        "val_calibrated_threshold": cal_thr,
        "cpu_p50_ms": p50_ms,
        "cpu_p95_ms": p95_ms,
        "validation": val_cal,
        "ood_dfire": dfire_metrics,
        "ood_indian_negatives": indian_metrics,
        "ood_combined_triage": combined_metrics,
    }
    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.report_out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(
        f"fcos_resnet50_fpn_fp32_onnx ({report['size_mb']} MB, cal_thr={cal_thr}) | "
        f"D-Fire mAP@0.5={dfire_metrics['mAP_50']:.4f} (smoke={dfire_metrics['ap_50']['smoke_plume']:.4f}, flame={dfire_metrics['ap_50']['active_flame']:.4f}) | "
        f"Combined Triage Acc={combined_metrics['image_accuracy']:.4f} F1={combined_metrics['image_f1']:.4f} AUC={combined_metrics['image_roc_auc']} | "
        f"Indian Neg FPR={indian_metrics['indian_neg_fpr']:.4f} ({indian_metrics['indian_neg_count']} imgs) | CPU p50={p50_ms}ms",
        flush=True,
    )


if __name__ == "__main__":
    main()
