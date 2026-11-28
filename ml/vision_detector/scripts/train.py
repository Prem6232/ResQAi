from __future__ import annotations

import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ML_ROOT = os.path.dirname(BASE_DIR)
os.environ.setdefault("TORCH_HOME", os.path.join(ML_ROOT, ".hf_cache", "torch"))
os.environ.setdefault("HF_HOME", os.path.join(ML_ROOT, ".hf_cache"))
if "--offline" in sys.argv:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"

import argparse
import json
import random
import time
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import get_cosine_schedule_with_warmup

from metrics import evaluate_predictions
from model import (
    FCOSOnnxWrapper,
    build_fcos_anchors,
    build_fcos_model,
    load_vision_config,
    save_fcos_checkpoint,
)


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.benchmark = True


def load_jsonl(path: Path) -> List[Dict]:
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


class FCOSFireSmokeDataset(Dataset):
    """Detection dataset returning `(3, H, W)` float32 RGB `[0, 1]` and TorchVision FCOS targets."""

    def __init__(self, base_dir: Path, rows: List[Dict], img_size: int = 384, augment: bool = False) -> None:
        self.base_dir = base_dir
        self.rows = rows
        self.img_size = img_size
        self.augment = augment

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        row = self.rows[idx]
        with Image.open(self.base_dir / row["image_path"]) as im:
            im = im.convert("RGB")
            if im.size != (self.img_size, self.img_size):
                im = im.resize((self.img_size, self.img_size), Image.Resampling.BILINEAR)
            arr = np.asarray(im, dtype=np.float32) * (1.0 / 255.0)

        boxes_xyxy: List[List[float]] = []
        labels: List[int] = []
        for b in row["boxes"]:
            x1 = max(0.0, (float(b["cx"]) - 0.5 * float(b["w"])) * self.img_size)
            y1 = max(0.0, (float(b["cy"]) - 0.5 * float(b["h"])) * self.img_size)
            x2 = min(float(self.img_size), (float(b["cx"]) + 0.5 * float(b["w"])) * self.img_size)
            y2 = min(float(self.img_size), (float(b["cy"]) + 0.5 * float(b["h"])) * self.img_size)
            if (x2 - x1) >= 2.0 and (y2 - y1) >= 2.0:
                boxes_xyxy.append([x1, y1, x2, y2])
                labels.append(int(b["class_id"]) + 1)  # 1=smoke_plume, 2=active_flame

        if self.augment:
            if random.random() < 0.5:
                arr = np.ascontiguousarray(arr[:, ::-1, :])
                boxes_xyxy = [[self.img_size - bx2, by1, self.img_size - bx1, by2] for bx1, by1, bx2, by2 in boxes_xyxy]
            if random.random() < 0.45:
                gain = random.uniform(0.85, 1.15)
                bias = random.uniform(-0.04, 0.04)
                arr = np.clip(arr * gain + bias, 0.0, 1.0)

        img_tensor = torch.from_numpy(np.transpose(arr, (2, 0, 1)).copy()).float()
        if boxes_xyxy:
            target = {
                "boxes": torch.tensor(boxes_xyxy, dtype=torch.float32),
                "labels": torch.tensor(labels, dtype=torch.int64),
            }
        else:
            target = {
                "boxes": torch.zeros((0, 4), dtype=torch.float32),
                "labels": torch.zeros((0,), dtype=torch.int64),
            }
        return img_tensor, target


def detection_collate_fn(batch: List[Tuple[torch.Tensor, Dict[str, torch.Tensor]]]):
    return [b[0] for b in batch], [b[1] for b in batch]


@torch.no_grad()
def evaluate_validation(
    model: torch.nn.Module,
    val_loader: DataLoader,
    val_rows: List[Dict],
    anchors: np.ndarray,
    device: torch.device,
    img_size: int,
    score_threshold: float,
    nms_iou_threshold: float,
    max_detections: int,
) -> Dict:
    model.eval()
    wrapper = FCOSOnnxWrapper(model).to(device).eval()
    raw_outputs: List[Tuple[np.ndarray, np.ndarray, np.ndarray]] = []

    for imgs, _targets in val_loader:
        px = torch.stack(imgs, dim=0).to(device, non_blocking=True)
        cls_l, box_r, ctr_r = wrapper(px)
        cls_np = cls_l.cpu().numpy()
        box_np = box_r.cpu().numpy()
        ctr_np = ctr_r.cpu().numpy()
        for i in range(cls_np.shape[0]):
            raw_outputs.append((cls_np[i], box_np[i], ctr_np[i]))

    return evaluate_predictions(
        val_rows,
        raw_outputs,
        anchors=anchors,
        img_size=img_size,
        score_threshold=score_threshold,
        nms_iou_threshold=nms_iou_threshold,
        max_detections=max_detections,
    )


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    cfg = load_vision_config(base_dir / "configs" / "vision_config.json")

    parser = argparse.ArgumentParser(description="Fine-tune FCOS-ResNet50-FPN (BSD-3) on D-Fire + Indian hard negatives")
    parser.add_argument("--train-file", type=Path, default=base_dir / "datasets" / "processed" / "train.jsonl")
    parser.add_argument("--val-file", type=Path, default=base_dir / "datasets" / "processed" / "val.jsonl")
    parser.add_argument("--output-dir", type=Path, default=base_dir / "artifacts" / "best_checkpoint")
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--batch-size", type=int, default=12)
    parser.add_argument("--lr", type=float, default=1.2e-4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    img_size = int(cfg["image_size"])
    score_thr = float(cfg["box_score_threshold"])
    nms_thr = float(cfg["nms_iou_threshold"])
    max_det = int(cfg["max_detections"])
    anchors = build_fcos_anchors(img_size)

    print(f"Device: {device} | base={cfg['base_model']} | img_size={img_size}", flush=True)
    train_rows = load_jsonl(args.train_file)
    val_rows = load_jsonl(args.val_file)
    print(f"Loaded train={len(train_rows)} images | val={len(val_rows)} images", flush=True)

    train_loader = DataLoader(
        FCOSFireSmokeDataset(base_dir, train_rows, img_size=img_size, augment=True),
        batch_size=args.batch_size,
        shuffle=True,
        collate_fn=detection_collate_fn,
        pin_memory=(device.type == "cuda"),
    )
    val_loader = DataLoader(
        FCOSFireSmokeDataset(base_dir, val_rows, img_size=img_size, augment=False),
        batch_size=args.batch_size,
        shuffle=False,
        collate_fn=detection_collate_fn,
        pin_memory=(device.type == "cuda"),
    )

    model = build_fcos_model(img_size=img_size, trainable_backbone_layers=3, pretrained=True).to(device)
    backbone_params = [p for n, p in model.named_parameters() if "backbone" in n and p.requires_grad]
    head_params = [p for n, p in model.named_parameters() if "backbone" not in n and p.requires_grad]
    optimizer = torch.optim.AdamW(
        [
            {"params": backbone_params, "lr": args.lr * 0.4},
            {"params": head_params, "lr": args.lr},
        ],
        weight_decay=1e-4,
    )
    total_steps = len(train_loader) * args.epochs
    scheduler = get_cosine_schedule_with_warmup(
        optimizer,
        num_warmup_steps=max(20, int(0.08 * total_steps)),
        num_training_steps=total_steps,
    )
    scaler = torch.amp.GradScaler("cuda", enabled=(device.type == "cuda"))

    best_score = -1.0
    history: List[Dict] = []
    t0 = time.perf_counter()

    for epoch in range(1, args.epochs + 1):
        model.train()
        ep_loss = 0.0
        ep_start = time.perf_counter()

        for imgs, tgts in train_loader:
            optimizer.zero_grad(set_to_none=True)
            imgs_d = [im.to(device, non_blocking=True) for im in imgs]
            tgts_d = [{k: v.to(device, non_blocking=True) for k, v in t.items()} for t in tgts]

            with torch.amp.autocast(device_type="cuda", dtype=torch.float16, enabled=(device.type == "cuda")):
                loss_dict = model(imgs_d, tgts_d)
                loss = sum(loss_dict.values())

            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=2.0)
            scaler.step(optimizer)
            scaler.update()
            scheduler.step()
            ep_loss += float(loss.item())

        avg_train_loss = ep_loss / max(1, len(train_loader))
        val_metrics = evaluate_validation(
            model, val_loader, val_rows, anchors, device, img_size, score_thr, nms_thr, max_det
        )
        ep_sec = time.perf_counter() - ep_start
        rec = {"epoch": epoch, "train_loss": round(avg_train_loss, 4), "sec": round(ep_sec, 1), **val_metrics}
        history.append(rec)
        print(
            f"[Epoch {epoch}/{args.epochs} {ep_sec:.1f}s] train_loss={avg_train_loss:.3f} | "
            f"mAP@0.5={val_metrics['mAP_50']:.4f} (smoke={val_metrics['ap_50']['smoke_plume']:.4f}, flame={val_metrics['ap_50']['active_flame']:.4f}) | "
            f"AUC={val_metrics['image_roc_auc']} | Acc@{score_thr}={val_metrics['image_accuracy']:.4f} | "
            f"F1={val_metrics['image_f1']} | indian_neg_fpr={val_metrics['indian_neg_fpr']}",
            flush=True,
        )

        fpr_pen = float(val_metrics["indian_neg_fpr"] or 0.0)
        rank_score = (
            0.55 * float(val_metrics["mAP_50"])
            + 0.25 * float(val_metrics["image_roc_auc"] or 0.0)
            + 0.20 * float(val_metrics["image_accuracy"])
            - 0.30 * fpr_pen
        )
        if rank_score > best_score:
            best_score = rank_score
            save_fcos_checkpoint(
                model,
                args.output_dir,
                cfg,
                extra_metadata={"epoch": epoch, "val_metrics": val_metrics},
            )

    elapsed_s = time.perf_counter() - t0
    summary = {
        "base_model": cfg["base_model"],
        "device": str(device),
        "train_images": len(train_rows),
        "val_images": len(val_rows),
        "elapsed_seconds": round(elapsed_s, 1),
        "history": history,
    }
    metrics_path = base_dir / "artifacts" / "training_metrics.json"
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"Training completed in {elapsed_s:.1f}s. Best checkpoint saved to {args.output_dir}", flush=True)


if __name__ == "__main__":
    main()
