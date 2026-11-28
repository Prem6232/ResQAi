from __future__ import annotations

import argparse
import json
import math
import os
import re
import time
from pathlib import Path
from typing import Dict, List

DEFAULT_ML_DIR = Path(__file__).resolve().parents[2]
os.environ.setdefault("HF_HOME", str(DEFAULT_ML_DIR / ".hf_cache"))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

import numpy as np  # noqa: E402
import onnxruntime as ort  # noqa: E402
import av  # noqa: E402
import torch  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402
from jiwer import cer, wer  # noqa: E402
from tokenizers import Tokenizer  # noqa: E402

PUNCT_RE = re.compile(r"[^\w\s\u0900-\u097f]")
WS_RE = re.compile(r"\s+")


def decode_audio_16k(path: str) -> np.ndarray:
    """Decode any WAV/MP3/M4A/WEBM/OGG via PyAV without version-fragile metadata_errors kwargs."""
    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks: List[np.ndarray] = []
    with av.open(path, mode="r") as container:
        for frame in container.decode(audio=0):
            for out_frame in resampler.resample(frame):
                chunks.append(out_frame.to_ndarray().reshape(-1))
        for out_frame in resampler.resample(None):
            chunks.append(out_frame.to_ndarray().reshape(-1))
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    pcm = np.concatenate(chunks).astype(np.float32) / 32768.0
    return pcm


def normalize_for_wer(text: str) -> str:
    text = text.lower().replace("।", " ")
    text = PUNCT_RE.sub(" ", text)
    return WS_RE.sub(" ", text).strip()


def load_text_classifier():
    onnx_dir = DEFAULT_ML_DIR / "text_classifier" / "artifacts" / "onnx"
    meta = json.loads((onnx_dir / "model_meta.json").read_text(encoding="utf-8"))
    tok = Tokenizer.from_file(str(onnx_dir / "tokenizer.json"))
    max_len = int(meta.get("max_length", 128))
    tok.enable_truncation(max_length=max_len)
    tok.enable_padding(length=max_len, pad_id=0, pad_token="[PAD]")
    sess = ort.InferenceSession(str(onnx_dir / "model_fp32.onnx"), providers=["CPUExecutionProvider"])
    return tok, sess, meta


def classify_text(tok, sess, meta, text: str) -> str:
    enc = tok.encode(text)
    cat_logits, _ = sess.run(
        None,
        {
            "input_ids": np.array([enc.ids], dtype=np.int64),
            "attention_mask": np.array([enc.attention_mask], dtype=np.int64),
        },
    )
    return meta["categories"][int(np.argmax(cat_logits[0]))]


def benchmark_model(
    model_dir: Path,
    cfg: Dict,
    rows: List[Dict],
    device: str,
    compute_type: str,
    use_text_classifier: bool = True,
) -> Dict:
    model = WhisperModel(str(model_dir), device=device, compute_type=compute_type)
    prompt = cfg["indian_emergency_initial_prompt"]
    beam_size = int(cfg.get("beam_size", 5))
    vad_filter = bool(cfg.get("vad_filter", True))

    tok = sess = meta = None
    if use_text_classifier:
        tok, sess, meta = load_text_classifier()

    hi_refs, hi_hyps, hi_lat = [], [], []
    memo_refs, memo_hyps, memo_lat = [], [], []
    e2e_cat_correct = 0
    e2e_cat_total = 0
    samples_preview = []

    for r in rows:
        t0 = time.perf_counter()
        audio_arr = decode_audio_16k(r["audio_path"])
        segments, info = model.transcribe(
            audio_arr,
            beam_size=beam_size,
            vad_filter=vad_filter,
            initial_prompt=prompt if r["slice"] == "emergency_voice_memo" else None,
            language=r["language"] if r["language"] in ("hi", "en") else None,
        )
        segs = list(segments)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        hyp = " ".join(s.text.strip() for s in segs).strip()
        avg_lp = float(np.mean([s.avg_logprob for s in segs])) if segs else -1.5
        conf = round(max(0.05, min(0.99, math.exp(avg_lp))), 4)

        ref_norm = normalize_for_wer(r["reference_text"])
        hyp_norm = normalize_for_wer(hyp)

        if r["slice"] == "indian_hindi_kathbath":
            hi_refs.append(ref_norm)
            hi_hyps.append(hyp_norm)
            hi_lat.append(elapsed_ms)
        else:
            memo_refs.append(ref_norm)
            memo_hyps.append(hyp_norm)
            memo_lat.append(elapsed_ms)
            if tok is not None and r.get("category"):
                pred_cat = classify_text(tok, sess, meta, hyp)
                e2e_cat_total += 1
                if pred_cat == r["category"]:
                    e2e_cat_correct += 1

        if len(samples_preview) < 8 or (r["slice"] == "emergency_voice_memo" and len(samples_preview) < 14):
            samples_preview.append(
                {
                    "id": r["id"],
                    "slice": r["slice"],
                    "ref": r["reference_text"],
                    "hyp": hyp,
                    "confidence": conf,
                    "latency_ms": round(elapsed_ms, 1),
                }
            )

    return {
        "device": device,
        "compute_type": compute_type,
        "hindi_kathbath": {
            "count": len(hi_refs),
            "wer": round(float(wer(hi_refs, hi_hyps)), 4) if hi_refs else None,
            "cer": round(float(cer(hi_refs, hi_hyps)), 4) if hi_refs else None,
            "p50_ms": round(float(np.percentile(hi_lat, 50)), 1) if hi_lat else None,
        },
        "emergency_voice_memos": {
            "count": len(memo_refs),
            "wer": round(float(wer(memo_refs, memo_hyps)), 4) if memo_refs else None,
            "cer": round(float(cer(memo_refs, memo_hyps)), 4) if memo_refs else None,
            "p50_ms": round(float(np.percentile(memo_lat, 50)), 1) if memo_lat else None,
            "e2e_voice_to_category_acc": (
                round(e2e_cat_correct / max(1, e2e_cat_total), 4) if e2e_cat_total else None
            ),
            "e2e_correct": f"{e2e_cat_correct}/{e2e_cat_total}",
        },
        "samples_preview": samples_preview,
    }


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    cfg = json.loads((base_dir / "configs" / "whisper_config.json").read_text(encoding="utf-8"))
    model_dir = base_dir / cfg["local_dir"]
    manifest_path = base_dir / "datasets" / "indian_audio_benchmark.jsonl"

    rows = [json.loads(line) for line in manifest_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    cpu_report = benchmark_model(model_dir, cfg, rows, device="cpu", compute_type="int8")

    reports = {
        "model_id": cfg["model_id"],
        "model_size_mb": round(sum(p.stat().st_size for p in model_dir.rglob("*") if p.is_file()) / 1e6, 2),
        "cpu_int8": cpu_report,
    }
    try:
        import torch
        if torch.cuda.is_available():
            reports["cuda_fp16"] = benchmark_model(model_dir, cfg, rows, device="cuda", compute_type="float16")
    except Exception as exc:
        reports["cuda_error"] = str(exc)

    out_path = base_dir / "artifacts" / "eval_report.json"
    out_path.write_text(json.dumps(reports, indent=2, ensure_ascii=False), encoding="utf-8")
    summary_print = {
        "model_id": reports["model_id"],
        "model_size_mb": reports["model_size_mb"],
        "cpu_int8": {k: v for k, v in cpu_report.items() if k != "samples_preview"},
    }
    if "cuda_fp16" in reports:
        summary_print["cuda_fp16"] = {k: v for k, v in reports["cuda_fp16"].items() if k != "samples_preview"}
    print(json.dumps(summary_print, indent=2))


if __name__ == "__main__":
    main()
