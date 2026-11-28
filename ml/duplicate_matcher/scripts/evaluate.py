from __future__ import annotations

import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ML_ROOT = os.path.dirname(BASE_DIR)
os.environ.setdefault("HF_HOME", os.path.join(ML_ROOT, ".hf_cache"))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import argparse
import json
import time
from pathlib import Path
from typing import Callable, Dict, List, Tuple

import numpy as np
import onnxruntime as ort
import torch
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from tokenizers import Tokenizer
from transformers import AutoTokenizer

from model import MultilingualDuplicateEncoder, load_matcher_config


def load_jsonl(path: Path) -> List[Dict]:
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def make_torch_embedder(model_name_or_dir: str, max_length: int, query_prefix: str) -> Callable[[List[str]], np.ndarray]:
    tok = AutoTokenizer.from_pretrained(model_name_or_dir, local_files_only=True)
    mdl = MultilingualDuplicateEncoder(model_name_or_dir)
    mdl.eval()

    @torch.no_grad()
    def embed(texts: List[str]) -> np.ndarray:
        prefixed = [f"{query_prefix}{t}" for t in texts]
        enc = tok(prefixed, padding="max_length", truncation=True, max_length=max_length, return_tensors="pt")
        return mdl(enc["input_ids"], enc["attention_mask"]).cpu().numpy()

    return embed


def make_onnx_embedder(onnx_dir: Path, onnx_file: str, max_length: int, query_prefix: str) -> Callable[[List[str]], np.ndarray]:
    tok = Tokenizer.from_file(str(onnx_dir / "tokenizer.json"))
    tok.enable_truncation(max_length=max_length)
    tok.enable_padding(length=max_length, pad_id=1, pad_token="<pad>")
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4
    sess = ort.InferenceSession(str(onnx_dir / onnx_file), sess_options=opts, providers=["CPUExecutionProvider"])

    def embed(texts: List[str]) -> np.ndarray:
        prefixed = [f"{query_prefix}{t}" for t in texts]
        encs = tok.encode_batch(prefixed)
        ids = np.array([e.ids for e in encs], dtype=np.int64)
        mask = np.array([e.attention_mask for e in encs], dtype=np.int64)
        return sess.run(None, {"input_ids": ids, "attention_mask": mask})[0]

    return embed


def evaluate_model(
    name: str,
    embed_fn: Callable[[List[str]], np.ndarray],
    rows: List[Dict],
    configured_threshold: float,
    measure_latency: bool = True,
) -> Dict:
    texts_a = [r["text_a"] for r in rows]
    texts_b = [r["text_b"] for r in rows]
    y_true = np.array([int(r["label"]) for r in rows], dtype=np.int32)
    pair_types = [r.get("pair_type", "unknown") for r in rows]

    emb_a = embed_fn(texts_a)
    emb_b = embed_fn(texts_b)
    sims = np.sum(emb_a * emb_b, axis=-1)

    pos_mask = y_true == 1
    neg_mask = y_true == 0
    same_place_mask = np.array(["same_place" in pt for pt in pair_types], dtype=bool)

    best_f1, best_thresh = 0.0, configured_threshold
    for cand in np.linspace(0.45, 0.90, 46):
        f1 = float(f1_score(y_true, (sims >= cand).astype(np.int32), zero_division=0))
        if f1 > best_f1:
            best_f1 = f1
            best_thresh = float(round(cand, 3))

    preds_cfg = (sims >= configured_threshold).astype(np.int32)
    preds_best = (sims >= best_thresh).astype(np.int32)

    lat_p50_ms = None
    lat_p95_ms = None
    if measure_latency:
        # Warmup
        for _ in range(5):
            embed_fn([texts_a[0], texts_b[0]])
        timings: List[float] = []
        for idx in range(min(30, len(rows))):
            t0 = time.perf_counter()
            embed_fn([texts_a[idx], texts_b[idx]])
            timings.append((time.perf_counter() - t0) * 1000.0)
        lat_p50_ms = float(round(np.percentile(timings, 50), 2))
        lat_p95_ms = float(round(np.percentile(timings, 95), 2))

    # Identify worst false positives or false negatives if any
    errors = []
    for idx, row in enumerate(rows):
        pred = int(preds_cfg[idx])
        if pred != int(y_true[idx]):
            errors.append(
                {
                    "pair_type": pair_types[idx],
                    "label": int(y_true[idx]),
                    "pred": pred,
                    "sim": round(float(sims[idx]), 4),
                    "text_a": row["text_a"],
                    "text_b": row["text_b"],
                }
            )

    return {
        "model": name,
        "count": len(rows),
        "roc_auc": round(float(roc_auc_score(y_true, sims)), 4),
        "configured_threshold": configured_threshold,
        "accuracy_at_cfg_thresh": round(float(accuracy_score(y_true, preds_cfg)), 4),
        "f1_at_cfg_thresh": round(float(f1_score(y_true, preds_cfg, zero_division=0)), 4),
        "best_threshold": best_thresh,
        "accuracy_at_best_thresh": round(float(accuracy_score(y_true, preds_best)), 4),
        "f1_at_best_thresh": round(best_f1, 4),
        "pos_mean": round(float(np.mean(sims[pos_mask])), 4),
        "pos_min": round(float(np.min(sims[pos_mask])), 4),
        "neg_mean": round(float(np.mean(sims[neg_mask])), 4),
        "neg_max": round(float(np.max(sims[neg_mask])), 4),
        "same_place_neg_mean": round(float(np.mean(sims[same_place_mask])), 4) if same_place_mask.any() else None,
        "same_place_neg_max": round(float(np.max(sims[same_place_mask])), 4) if same_place_mask.any() else None,
        "separation_margin": round(float(np.mean(sims[pos_mask]) - np.mean(sims[neg_mask])), 4),
        "cpu_pair_p50_ms": lat_p50_ms,
        "cpu_pair_p95_ms": lat_p95_ms,
        "errors_at_cfg_thresh": errors,
    }


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    cfg = load_matcher_config(base_dir / "configs" / "matcher_config.json")
    parser = argparse.ArgumentParser(description="Evaluate untuned E5 vs fine-tuned FP32/INT8 ONNX on OOD Indian benchmark")
    parser.add_argument("--test-file", type=Path, default=base_dir / "datasets" / "processed" / "test_indian_duplicate_benchmark.jsonl")
    parser.add_argument("--val-file", type=Path, default=base_dir / "datasets" / "processed" / "val_pairs.jsonl")
    parser.add_argument("--onnx-dir", type=Path, default=base_dir / "artifacts" / "onnx")
    parser.add_argument("--report-out", type=Path, default=base_dir / "artifacts" / "eval_report.json")
    args = parser.parse_args()

    max_length = int(cfg["max_length"])
    query_prefix = str(cfg["query_prefix"])
    threshold = float(cfg["likely_related_semantic_threshold"])

    test_rows = load_jsonl(args.test_file)
    val_rows = load_jsonl(args.val_file)

    embedders = [
        ("base_e5_untuned", make_torch_embedder(cfg["base_model"], max_length, query_prefix), None),
        (
            "finetuned_fp32_onnx",
            make_onnx_embedder(args.onnx_dir, "model_fp32.onnx", max_length, query_prefix),
            round((args.onnx_dir / "model_fp32.onnx").stat().st_size / 1e6, 2),
        ),
        (
            "finetuned_int8_onnx",
            make_onnx_embedder(args.onnx_dir, "model_int8.onnx", max_length, query_prefix),
            round((args.onnx_dir / "model_int8.onnx").stat().st_size / 1e6, 2),
        ),
    ]

    report: Dict = {"configured_threshold": threshold, "ood_test": {}, "validation": {}}
    for name, fn, size_mb in embedders:
        test_res = evaluate_model(name, fn, test_rows, threshold, measure_latency=True)
        val_res = evaluate_model(name, fn, val_rows, threshold, measure_latency=False)
        if size_mb is not None:
            test_res["size_mb"] = size_mb
        report["ood_test"][name] = test_res
        report["validation"][name] = {k: v for k, v in val_res.items() if k != "errors_at_cfg_thresh"}

    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.report_out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print("=== OOD Indian Duplicate Benchmark (40 unseen pairs) ===")
    for name, res in report["ood_test"].items():
        print(
            f"{name:22s} | AUC={res['roc_auc']:.4f} | Acc@{threshold}={res['accuracy_at_cfg_thresh']:.4f} "
            f"(BestAcc={res['accuracy_at_best_thresh']:.4f}@{res['best_threshold']}) | "
            f"PosMean={res['pos_mean']:.3f} vs SamePlaceNegMean={res['same_place_neg_mean']} "
            f"(Margin={res['separation_margin']:.3f}) | p50={res['cpu_pair_p50_ms']}ms"
        )


if __name__ == "__main__":
    main()
