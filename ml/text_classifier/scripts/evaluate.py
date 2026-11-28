from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

import numpy as np
import onnxruntime as ort
from sklearn.metrics import accuracy_score, classification_report, f1_score
from transformers import AutoTokenizer


def softmax(x: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    scaled = x / max(temperature, 1e-4)
    shifted = scaled - np.max(scaled, axis=-1, keepdims=True)
    exp = np.exp(shifted)
    return exp / np.sum(exp, axis=-1, keepdims=True)


def load_jsonl(path: Path) -> List[Dict]:
    rows: List[Dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Evaluate INT8 ONNX classifier on Indian benchmark")
    parser.add_argument("--onnx-dir", type=Path, default=base_dir / "artifacts" / "onnx")
    parser.add_argument("--onnx-filename", type=str, default="model_int8.onnx")
    parser.add_argument(
        "--test-file",
        type=Path,
        default=base_dir / "datasets" / "processed" / "test_indian_benchmark.jsonl",
    )
    parser.add_argument("--output-report", type=Path, default=base_dir / "artifacts" / "eval_report.json")
    args = parser.parse_args()

    model_path = args.onnx_dir / args.onnx_filename
    with open(args.onnx_dir / "model_meta.json", "r", encoding="utf-8") as f:
        meta = json.load(f)

    categories: List[str] = meta["categories"]
    urgencies: List[str] = meta["urgencies"]
    cat_to_id = {c: i for i, c in enumerate(categories)}
    urg_to_id = {u: i for i, u in enumerate(urgencies)}
    cat_temp = float(meta.get("category_temperature", 1.0))
    urg_temp = float(meta.get("urgency_temperature", 1.0))
    max_length = int(meta.get("max_length", 128))
    threshold = float(meta.get("review_confidence_threshold", 0.72))

    tokenizer = AutoTokenizer.from_pretrained(args.onnx_dir)
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])

    records = load_jsonl(args.test_file)
    cat_true, cat_pred, cat_conf = [], [], []
    urg_true, urg_pred = [], []
    latencies_ms: List[float] = []
    slices = defaultdict(lambda: {"cat_true": [], "cat_pred": [], "urg_true": [], "urg_pred": []})

    # Warmup inference
    w = tokenizer("warmup test", return_tensors="np", truncation=True, padding=True, max_length=max_length)
    session.run(None, {"input_ids": w["input_ids"], "attention_mask": w["attention_mask"]})

    errors: List[Dict] = []
    for rec in records:
        enc = tokenizer(
            rec["text"],
            return_tensors="np",
            truncation=True,
            padding="max_length",
            max_length=max_length,
        )
        t0 = time.perf_counter()
        c_logits, u_logits = session.run(
            None,
            {
                "input_ids": enc["input_ids"].astype(np.int64),
                "attention_mask": enc["attention_mask"].astype(np.int64),
            },
        )
        latencies_ms.append((time.perf_counter() - t0) * 1000.0)

        c_probs = softmax(c_logits, cat_temp)[0]
        u_probs = softmax(u_logits, urg_temp)[0]
        c_idx = int(np.argmax(c_probs))
        u_idx = int(np.argmax(u_probs))
        conf = float(c_probs[c_idx])

        c_gt = cat_to_id[rec["category"]]
        u_gt = urg_to_id[rec["urgency"]]
        cat_true.append(c_gt)
        cat_pred.append(c_idx)
        cat_conf.append(conf)
        urg_true.append(u_gt)
        urg_pred.append(u_idx)

        slice_name = rec.get("slice", "general")
        slices[slice_name]["cat_true"].append(c_gt)
        slices[slice_name]["cat_pred"].append(c_idx)
        slices[slice_name]["urg_true"].append(u_gt)
        slices[slice_name]["urg_pred"].append(u_idx)

        if c_idx != c_gt or u_idx != u_gt:
            errors.append(
                {
                    "text": rec["text"],
                    "slice": slice_name,
                    "true_category": rec["category"],
                    "pred_category": categories[c_idx],
                    "true_urgency": rec["urgency"],
                    "pred_urgency": urgencies[u_idx],
                    "confidence": round(conf, 4),
                }
            )

    cat_acc = float(accuracy_score(cat_true, cat_pred))
    cat_f1 = float(f1_score(cat_true, cat_pred, average="macro", zero_division=0))
    urg_acc = float(accuracy_score(urg_true, urg_pred))
    urg_f1 = float(f1_score(urg_true, urg_pred, average="macro", zero_division=0))

    confident_mask = [i for i, cf in enumerate(cat_conf) if cf >= threshold]
    confident_cat_acc = (
        float(accuracy_score([cat_true[i] for i in confident_mask], [cat_pred[i] for i in confident_mask]))
        if confident_mask
        else 0.0
    )

    slice_summary = {}
    for name, d in sorted(slices.items()):
        slice_summary[name] = {
            "count": len(d["cat_true"]),
            "cat_acc": round(float(accuracy_score(d["cat_true"], d["cat_pred"])), 4),
            "cat_macro_f1": round(float(f1_score(d["cat_true"], d["cat_pred"], average="macro", zero_division=0)), 4),
            "urg_acc": round(float(accuracy_score(d["urg_true"], d["urg_pred"])), 4),
        }

    report = {
        "onnx_model_path": str(model_path),
        "onnx_size_mb": round(model_path.stat().st_size / 1e6, 2),
        "test_samples": len(records),
        "overall": {
            "category_accuracy": round(cat_acc, 4),
            "category_macro_f1": round(cat_f1, 4),
            "urgency_accuracy": round(urg_acc, 4),
            "urgency_macro_f1": round(urg_f1, 4),
            "confident_coverage": round(len(confident_mask) / max(1, len(records)), 4),
            "confident_category_accuracy": round(confident_cat_acc, 4),
        },
        "cpu_latency_ms": {
            "mean": round(float(np.mean(latencies_ms)), 2),
            "p50": round(float(np.percentile(latencies_ms, 50)), 2),
            "p95": round(float(np.percentile(latencies_ms, 95)), 2),
        },
        "slices": slice_summary,
        "category_report": classification_report(
            cat_true, cat_pred, target_names=categories, output_dict=True, zero_division=0
        ),
        "urgency_report": classification_report(
            urg_true, urg_pred, target_names=urgencies, output_dict=True, zero_division=0
        ),
        "sample_errors": errors[:25],
    }

    with open(args.output_report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(json.dumps({k: v for k, v in report.items() if k not in ("category_report", "urgency_report", "sample_errors")}, indent=2))
    print(f"Misclassifications logged: {len(errors)} / {len(records)} -> {args.output_report}")


if __name__ == "__main__":
    main()
