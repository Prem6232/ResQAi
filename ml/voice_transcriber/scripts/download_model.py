from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

DEFAULT_ML_DIR = Path(__file__).resolve().parents[2]
os.environ.setdefault("HF_HOME", str(DEFAULT_ML_DIR / ".hf_cache"))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

from huggingface_hub import snapshot_download  # noqa: E402


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    cfg_path = base_dir / "configs" / "whisper_config.json"
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    parser = argparse.ArgumentParser(description="Download open-weight faster-whisper model locally")
    parser.add_argument("--model-id", type=str, default=cfg["model_id"])
    parser.add_argument("--dest-dir", type=Path, default=base_dir / cfg["local_dir"])
    args = parser.parse_args()

    args.dest_dir.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {args.model_id} -> {args.dest_dir} ...")
    snapshot_download(
        repo_id=args.model_id,
        local_dir=str(args.dest_dir),
    )
    total_mb = sum(p.stat().st_size for p in args.dest_dir.rglob("*") if p.is_file()) / 1e6
    print(f"Model ready in {args.dest_dir} ({total_mb:.1f} MB)")


if __name__ == "__main__":
    main()
