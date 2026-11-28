from __future__ import annotations

import json
import os
import random
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Tuple

import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download
from PIL import Image, ImageOps

SEED = 42
RNG = random.Random(SEED)
MATERIALIZE_SIZE = 480

ML_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ML_ROOT / ".hf_cache"
BASE_DIR = Path(__file__).resolve().parents[1]
IMG_ROOT = BASE_DIR / "datasets" / "raw" / "images"
OUT_DIR = BASE_DIR / "datasets" / "processed"

os.environ.setdefault("HF_HOME", str(CACHE_DIR))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")


def parse_yolo_boxes(label_text: str) -> List[Dict]:
    """Parse and sanitize YOLO `(class_id, cx, cy, w, h)` labels into `[0, 1]` boxes."""
    boxes: List[Dict] = []
    if not label_text:
        return boxes
    for line in label_text.splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue
        cid = int(float(parts[0]))
        if cid not in (0, 1):
            continue
        cx, cy, bw, bh = map(float, parts[1:5])
        x1 = max(0.0, min(1.0, cx - 0.5 * bw))
        y1 = max(0.0, min(1.0, cy - 0.5 * bh))
        x2 = max(0.0, min(1.0, cx + 0.5 * bw))
        y2 = max(0.0, min(1.0, cy + 0.5 * bh))
        clean_w = x2 - x1
        clean_h = y2 - y1
        if clean_w < 0.008 or clean_h < 0.008:
            continue
        boxes.append(
            {
                "class_id": cid,
                "cx": round(0.5 * (x1 + x2), 6),
                "cy": round(0.5 * (y1 + y2), 6),
                "w": round(clean_w, 6),
                "h": round(clean_h, 6),
            }
        )
    return boxes


def save_resized_rgb(raw_bytes: bytes, dest_path: Path) -> None:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if dest_path.is_file():
        return
    with Image.open(BytesIO(raw_bytes)) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if im.size != (MATERIALIZE_SIZE, MATERIALIZE_SIZE):
            im = im.resize((MATERIALIZE_SIZE, MATERIALIZE_SIZE), Image.Resampling.BILINEAR)
        im.save(dest_path, format="JPEG", quality=92)


def export_dfire_shard(
    shard_rel: str,
    split_tag: str,
    max_empty: int | None = None,
    positives_only: bool = False,
) -> List[Dict]:
    p = hf_hub_download(
        "badsaarow/d-fire",
        shard_rel,
        repo_type="dataset",
        cache_dir=str(CACHE_DIR),
        local_files_only=True,
    )
    tbl = pq.read_table(p, columns=["filename", "label", "image"])
    rows_out: List[Dict] = []
    empty_kept = 0
    shard_stem = Path(shard_rel).stem

    for idx in range(tbl.num_rows):
        fname = str(tbl["filename"][idx].as_py() or f"row_{idx:05d}.jpg")
        lbl = str(tbl["label"][idx].as_py() or "")
        boxes = parse_yolo_boxes(lbl)
        if not boxes:
            if positives_only:
                continue
            if max_empty is not None and empty_kept >= max_empty:
                continue
            empty_kept += 1

        safe_name = f"{shard_stem}_{idx:05d}_{Path(fname).stem}.jpg"
        out_img = IMG_ROOT / split_tag / safe_name
        if not out_img.is_file():
            img_obj = tbl["image"][idx].as_py()
            save_resized_rgb(img_obj["bytes"], out_img)
        rows_out.append(
            {
                "image_path": str(out_img.relative_to(BASE_DIR)).replace("\\", "/"),
                "source": f"dfire:{shard_stem}",
                "is_indian_scene": False,
                "boxes": boxes,
            }
        )
    return rows_out


def split_contiguous(rows: List[Dict], val_frac: float = 0.15) -> Tuple[List[Dict], List[Dict]]:
    """Use contiguous tail slice for validation to prevent adjacent video-frame leakage."""
    cut = max(1, int(len(rows) * (1.0 - val_frac)))
    return rows[:cut], rows[cut:]


def export_indian_traffic_negatives() -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """
    Split `chandrabhuma/Indian_Traffic_VQA_Dataset` (MIT, 1,085 real Indian road scenes)
    strictly by sequential image index with zero train/val/test overlap.
    """
    zip_path = hf_hub_download(
        "chandrabhuma/Indian_Traffic_VQA_Dataset",
        "traffic512final.zip",
        repo_type="dataset",
        cache_dir=str(CACHE_DIR),
        local_files_only=True,
    )
    train_neg: List[Dict] = []
    val_neg: List[Dict] = []
    test_neg: List[Dict] = []

    with zipfile.ZipFile(zip_path) as zf:
        names = sorted(
            n for n in zf.namelist() if n.lower().endswith((".jpg", ".jpeg", ".png"))
        )
        for idx, member in enumerate(names):
            if idx < 750:
                tag, bucket = "train_indian_neg", train_neg
            elif idx < 900:
                tag, bucket = "val_indian_neg", val_neg
            else:
                tag, bucket = "test_indian_neg", test_neg

            out_img = IMG_ROOT / tag / f"{Path(member).stem}.jpg"
            if not out_img.is_file():
                save_resized_rgb(zf.read(member), out_img)
            bucket.append(
                {
                    "image_path": str(out_img.relative_to(BASE_DIR)).replace("\\", "/"),
                    "source": "indian_traffic_vqa",
                    "is_indian_scene": True,
                    "boxes": [],
                }
            )
    return train_neg, val_neg, test_neg


def write_jsonl(path: Path, rows: List[Dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def summarize(rows: List[Dict]) -> Dict:
    n_pos = sum(1 for r in rows if r["boxes"])
    n_neg = len(rows) - n_pos
    n_smoke = sum(1 for r in rows for b in r["boxes"] if b["class_id"] == 0)
    n_flame = sum(1 for r in rows for b in r["boxes"] if b["class_id"] == 1)
    n_indian = sum(1 for r in rows if r.get("is_indian_scene"))
    return {
        "total": len(rows),
        "positive_images": n_pos,
        "negative_images": n_neg,
        "indian_scenes": n_indian,
        "smoke_boxes": n_smoke,
        "flame_boxes": n_flame,
    }


def main() -> None:
    IMG_ROOT.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Building D-Fire train/val blocks (contiguous sequence split)...")
    s6 = export_dfire_shard("data/train-00006-of-00009.parquet", "train_dfire", positives_only=True)
    s8 = export_dfire_shard("data/train-00008-of-00009.parquet", "train_dfire", positives_only=True)
    s4 = export_dfire_shard("data/train-00004-of-00009.parquet", "train_dfire", max_empty=500)
    s0 = export_dfire_shard("data/train-00000-of-00009.parquet", "train_dfire", max_empty=500)

    tr6, va6 = split_contiguous(s6, 0.15)
    tr8, va8 = split_contiguous(s8, 0.15)
    tr4, va4 = split_contiguous(s4, 0.15)
    tr0, va0 = split_contiguous(s0, 0.15)

    print("Loading held-out official D-Fire test shard (test-00002)...")
    test_dfire_ood = export_dfire_shard("data/test-00002-of-00003.parquet", "test_dfire_ood")

    print("Loading Indian Traffic hard-negative splits (MIT)...")
    tr_in, val_in, test_in_ood = export_indian_traffic_negatives()

    train_rows = tr6 + tr8 + tr4 + tr0 + tr_in
    val_rows = va6 + va8 + va4 + va0 + val_in
    RNG.shuffle(train_rows)

    write_jsonl(OUT_DIR / "train.jsonl", train_rows)
    write_jsonl(OUT_DIR / "val.jsonl", val_rows)
    write_jsonl(OUT_DIR / "test_dfire_ood.jsonl", test_dfire_ood)
    write_jsonl(OUT_DIR / "test_indian_neg_ood.jsonl", test_in_ood)

    stats = {
        "train": summarize(train_rows),
        "val": summarize(val_rows),
        "test_dfire_ood": summarize(test_dfire_ood),
        "test_indian_neg_ood": summarize(test_in_ood),
    }
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
