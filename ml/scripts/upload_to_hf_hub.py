"""
Stage and upload the 4 trained ResQAI serving models to Hugging Face Model Hub ($0 forever).

Uploads ONLY the lean runtime files needed for live inference (skipping raw datasets, checkpoints,
and redundant FP32/INT8 duplicates), organized cleanly into 4 subdirectories:
  - text_classifier/    (MuRIL FP32 ONNX + Rust tokenizer + metadata)
  - voice_transcriber/  (Faster-Whisper small CTranslate2 + Indian emergency prompt config)
  - duplicate_matcher/  (Multilingual-E5-small INT8 ONNX + tokenizer + matcher config)
  - vision_detector/    (FCOS-ResNet50-FPN FP32 ONNX + vision config + metadata)

Usage:
  hf auth login   # or set HF_TOKEN in environment
  python ml/scripts/upload_to_hf_hub.py --repo-id <your-username>/resqai-indian-emergency-models
"""

from __future__ import annotations

import argparse
import shutil
import tempfile
from pathlib import Path
from typing import Iterable, List, Tuple


def _copy_if_exists(src: Path, dst_dir: Path, copied: List[Tuple[str, int]]) -> None:
    if src.is_file():
        dst_dir.mkdir(parents=True, exist_ok=True)
        target = dst_dir / src.name
        shutil.copy2(src, target)
        copied.append((f"{dst_dir.name}/{src.name}", target.stat().st_size))


def _collect_serving_bundle(repo_root: Path, stage_dir: Path) -> List[Tuple[str, int]]:
    copied: List[Tuple[str, int]] = []

    text_src = repo_root / "ml" / "text_classifier" / "artifacts" / "onnx"
    for fname in (
        "model_fp32.onnx",
        "model_meta.json",
        "labels.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "vocab.txt",
    ):
        _copy_if_exists(text_src / fname, stage_dir / "text_classifier", copied)

    voice_src = repo_root / "ml" / "voice_transcriber" / "artifacts" / "whisper-small-ct2"
    for fname in ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt"):
        _copy_if_exists(voice_src / fname, stage_dir / "voice_transcriber", copied)
    _copy_if_exists(
        repo_root / "ml" / "voice_transcriber" / "configs" / "whisper_config.json",
        stage_dir / "voice_transcriber",
        copied,
    )

    dup_src = repo_root / "ml" / "duplicate_matcher" / "artifacts" / "onnx"
    for fname in (
        "model_int8.onnx",
        "matcher_config.json",
        "model_meta.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
    ):
        _copy_if_exists(dup_src / fname, stage_dir / "duplicate_matcher", copied)

    vis_src = repo_root / "ml" / "vision_detector" / "artifacts" / "onnx"
    for fname in ("model_fp32.onnx", "vision_config.json", "model_meta.json"):
        _copy_if_exists(vis_src / fname, stage_dir / "vision_detector", copied)

    return copied


def build_model_card(repo_id: str) -> str:
    return f"""---
license: apache-2.0
tags:
  - emergency-response
  - indian-english
  - hinglish
  - onnx
  - faster-whisper
---

# {repo_id}

Production CPU serving bundle for **ResQAI / SENTINELGRID** Indian Emergency Response Platform:

1. `text_classifier/` — Fine-tuned `google/muril-base-cased` (Apache-2.0) ONNX (`model_fp32.onnx`) for English, Devanagari Hindi, and Romanized Hinglish emergency classification & urgency calibration.
2. `voice_transcriber/` — `Systran/faster-whisper-small` (MIT) CTranslate2 INT8 (`model.bin`) with Indian/Bhopal emergency vocabulary prompt (`whisper_config.json`).
3. `duplicate_matcher/` — Fine-tuned `intfloat/multilingual-e5-small` (MIT) INT8 ONNX (`model_int8.onnx`) for bilingual incident deduplication.
4. `vision_detector/` — Fine-tuned `torchvision.models.detection.fcos_resnet50_fpn` (BSD-3-Clause) ONNX (`model_fp32.onnx`) for `smoke_plume` and `active_flame` detection.
"""


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Upload ResQAI serving models to Hugging Face Model Hub")
    parser.add_argument("--repo-id", required=True, help="Target HF repo, e.g. username/resqai-indian-emergency-models")
    parser.add_argument("--private", action="store_true", help="Create as private HF Model repository")
    parser.add_argument("--token", default=None, help="Optional HF token (defaults to cached login / HF_TOKEN env)")
    parser.add_argument("--dry-run", action="store_true", help="Stage and print bundle sizes without uploading")
    args = parser.parse_args(list(argv) if argv is not None else None)

    repo_root = Path(__file__).resolve().parents[2]

    with tempfile.TemporaryDirectory(prefix="resqai_hf_stage_") as tmp:
        stage_dir = Path(tmp)
        copied = _collect_serving_bundle(repo_root, stage_dir)
        (stage_dir / "README.md").write_text(build_model_card(args.repo_id), encoding="utf-8")

        required_weights = (
            "text_classifier/model_fp32.onnx",
            "voice_transcriber/model.bin",
            "duplicate_matcher/model_int8.onnx",
            "vision_detector/model_fp32.onnx",
        )
        present = {rel for rel, _ in copied}
        missing = [r for r in required_weights if r not in present]
        if missing:
            raise FileNotFoundError(f"Missing required trained weights before upload: {missing}")

        total_mib = sum(sz for _, sz in copied) / (1024 * 1024)
        print(f"Staged {len(copied)} files totaling {total_mib:.2f} MiB for '{args.repo_id}':")
        for rel, sz in copied:
            print(f"  - {rel:<45} {sz / (1024 * 1024):8.2f} MiB")

        if args.dry_run:
            print("Dry run complete; skipped remote upload.")
            return 0

        from huggingface_hub import HfApi

        api = HfApi(token=args.token)
        api.create_repo(repo_id=args.repo_id, repo_type="model", private=args.private, exist_ok=True)
        api.upload_folder(
            repo_id=args.repo_id,
            repo_type="model",
            folder_path=str(stage_dir),
            commit_message="Upload ResQAI 4-model ONNX/CTranslate2 serving bundle",
        )
        print(f"Uploaded cleanly to https://huggingface.co/{args.repo_id}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
