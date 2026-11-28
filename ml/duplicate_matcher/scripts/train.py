from __future__ import annotations

import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ML_ROOT = os.path.dirname(BASE_DIR)
os.environ.setdefault("HF_HOME", os.path.join(ML_ROOT, ".hf_cache"))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
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
from sklearn.metrics import f1_score, roc_auc_score
from torch.utils.data import DataLoader, Dataset
from transformers import AutoTokenizer, get_cosine_schedule_with_warmup

from model import MultilingualDuplicateEncoder, load_matcher_config


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def load_pairs(path: Path) -> List[Dict]:
    rows: List[Dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


class PairDataset(Dataset):
    """Dataset of (text_a, text_b, label) incident pairs with E5 query prefix."""

    def __init__(self, rows: List[Dict], query_prefix: str = "query: ") -> None:
        self.rows = rows
        self.prefix = query_prefix

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> Tuple[str, str, float]:
        r = self.rows[idx]
        return (
            f"{self.prefix}{r['text_a']}",
            f"{self.prefix}{r['text_b']}",
            float(r["label"]),
        )


def make_collate_fn(tokenizer: AutoTokenizer, max_length: int):
    def collate(batch: List[Tuple[str, str, float]]) -> Dict[str, torch.Tensor]:
        texts_a = [b[0] for b in batch]
        texts_b = [b[1] for b in batch]
        labels = torch.tensor([b[2] for b in batch], dtype=torch.float32)
        enc_a = tokenizer(
            texts_a,
            padding="max_length",
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )
        enc_b = tokenizer(
            texts_b,
            padding="max_length",
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )
        return {
            "a_input_ids": enc_a["input_ids"],
            "a_attention_mask": enc_a["attention_mask"],
            "b_input_ids": enc_b["input_ids"],
            "b_attention_mask": enc_b["attention_mask"],
            "labels": labels,
        }

    return collate


def contrastive_pair_loss(
    cos_sim: torch.Tensor,
    labels: torch.Tensor,
    pos_target: float = 0.90,
    neg_target: float = 0.28,
    cosent_scale: float = 10.0,
) -> torch.Tensor:
    """
    Combines calibrated MSE/margin targets (keeping positive duplicates >= 0.85
    and hard negatives <= 0.35) with CoSENT pairwise ordering loss across batch.
    """
    pos_mask = labels > 0.5
    neg_mask = ~pos_mask

    mse_terms: List[torch.Tensor] = []
    if pos_mask.any():
        pos_sim = cos_sim[pos_mask]
        mse_terms.append(torch.mean((pos_sim - pos_target) ** 2))
        mse_terms.append(torch.mean(torch.relu(0.84 - pos_sim) ** 2))
    if neg_mask.any():
        neg_sim = cos_sim[neg_mask]
        mse_terms.append(torch.mean((neg_sim - neg_target) ** 2))
        mse_terms.append(torch.mean(torch.relu(neg_sim - 0.38) ** 2))

    calibrated_loss = sum(mse_terms) / max(1, len(mse_terms))

    if pos_mask.any() and neg_mask.any():
        pos_s = cos_sim[pos_mask].unsqueeze(1)  # (P, 1)
        neg_s = cos_sim[neg_mask].unsqueeze(0)  # (1, N)
        diff = cosent_scale * (neg_s - pos_s)
        # Stable log(1 + sum exp(diff))
        zero = torch.zeros((1,), device=cos_sim.device, dtype=diff.dtype)
        ranking_loss = torch.logsumexp(torch.cat([zero, diff.reshape(-1)]), dim=0)
        return 0.65 * calibrated_loss + 0.35 * (ranking_loss / max(1.0, float(diff.numel()) ** 0.5))

    return calibrated_loss


@torch.no_grad()
def evaluate_loader(
    model: MultilingualDuplicateEncoder,
    loader: DataLoader,
    device: torch.device,
    use_bf16: bool,
    threshold: float,
) -> Dict[str, float]:
    model.eval()
    all_sims: List[float] = []
    all_labels: List[int] = []

    for batch in loader:
        a_ids = batch["a_input_ids"].to(device)
        a_mask = batch["a_attention_mask"].to(device)
        b_ids = batch["b_input_ids"].to(device)
        b_mask = batch["b_attention_mask"].to(device)

        with torch.amp.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=use_bf16):
            emb_a = model(a_ids, a_mask)
            emb_b = model(b_ids, b_mask)
            sims = torch.sum(emb_a * emb_b, dim=-1)

        all_sims.extend(sims.float().cpu().tolist())
        all_labels.extend([int(round(v)) for v in batch["labels"].tolist()])

    y_true = np.array(all_labels, dtype=np.int32)
    y_score = np.array(all_sims, dtype=np.float32)
    preds = (y_score >= threshold).astype(np.int32)

    pos_scores = y_score[y_true == 1]
    neg_scores = y_score[y_true == 0]
    pos_mean = float(np.mean(pos_scores)) if len(pos_scores) else 0.0
    neg_mean = float(np.mean(neg_scores)) if len(neg_scores) else 0.0

    return {
        "roc_auc": float(roc_auc_score(y_true, y_score)),
        "f1_at_threshold": float(f1_score(y_true, preds, zero_division=0)),
        "accuracy_at_threshold": float(np.mean(preds == y_true)),
        "pos_mean": pos_mean,
        "neg_mean": neg_mean,
        "separation_margin": pos_mean - neg_mean,
    }


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    cfg = load_matcher_config(base_dir / "configs" / "matcher_config.json")

    parser = argparse.ArgumentParser(description="Fine-tune multilingual-e5-small for Indian duplicate emergency matching")
    parser.add_argument("--train-file", type=Path, default=base_dir / "datasets" / "processed" / "train_pairs.jsonl")
    parser.add_argument("--val-file", type=Path, default=base_dir / "datasets" / "processed" / "val_pairs.jsonl")
    parser.add_argument("--output-dir", type=Path, default=base_dir / "artifacts" / "best_checkpoint")
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1.5e-5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_bf16 = device.type == "cuda" and torch.cuda.is_bf16_supported()
    max_length = int(cfg["max_length"])
    query_prefix = str(cfg["query_prefix"])
    threshold = float(cfg["likely_related_semantic_threshold"])

    print(f"Device: {device} | bf16={use_bf16} | base_model={cfg['base_model']} | max_len={max_length}")

    train_rows = load_pairs(args.train_file)
    val_rows = load_pairs(args.val_file)
    print(f"Loaded train={len(train_rows)} pairs | val={len(val_rows)} pairs")

    tokenizer = AutoTokenizer.from_pretrained(cfg["base_model"])
    collate = make_collate_fn(tokenizer, max_length=max_length)
    train_loader = DataLoader(PairDataset(train_rows, query_prefix), batch_size=args.batch_size, shuffle=True, collate_fn=collate)
    val_loader = DataLoader(PairDataset(val_rows, query_prefix), batch_size=args.batch_size, shuffle=False, collate_fn=collate)

    model = MultilingualDuplicateEncoder(cfg["base_model"]).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    total_steps = len(train_loader) * args.epochs
    scheduler = get_cosine_schedule_with_warmup(
        optimizer,
        num_warmup_steps=max(10, int(0.1 * total_steps)),
        num_training_steps=total_steps,
    )

    pre_val = evaluate_loader(model, val_loader, device, use_bf16, threshold)
    print(f"[Epoch 0 Untuned] val_auc={pre_val['roc_auc']:.4f} | f1@{threshold}={pre_val['f1_at_threshold']:.4f} | pos={pre_val['pos_mean']:.3f} vs neg={pre_val['neg_mean']:.3f} (margin={pre_val['separation_margin']:.3f})")

    best_score = -1.0
    history: List[Dict] = []
    t0 = time.perf_counter()

    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss = 0.0
        for batch in train_loader:
            optimizer.zero_grad(set_to_none=True)
            a_ids = batch["a_input_ids"].to(device)
            a_mask = batch["a_attention_mask"].to(device)
            b_ids = batch["b_input_ids"].to(device)
            b_mask = batch["b_attention_mask"].to(device)
            labels = batch["labels"].to(device)

            with torch.amp.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=use_bf16):
                emb_a = model(a_ids, a_mask)
                emb_b = model(b_ids, b_mask)
                cos_sim = torch.sum(emb_a * emb_b, dim=-1)
                loss = contrastive_pair_loss(cos_sim.float(), labels)

            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()
            running_loss += float(loss.item())

        avg_loss = running_loss / max(1, len(train_loader))
        val_metrics = evaluate_loader(model, val_loader, device, use_bf16, threshold)
        epoch_rec = {"epoch": epoch, "train_loss": avg_loss, **val_metrics}
        history.append(epoch_rec)
        print(
            f"[Epoch {epoch}/{args.epochs}] loss={avg_loss:.4f} | val_auc={val_metrics['roc_auc']:.4f} | "
            f"f1@{threshold}={val_metrics['f1_at_threshold']:.4f} | acc={val_metrics['accuracy_at_threshold']:.4f} | "
            f"pos={val_metrics['pos_mean']:.3f} vs neg={val_metrics['neg_mean']:.3f} (margin={val_metrics['separation_margin']:.3f})"
        )

        # Rank primarily by F1/AUC and separation margin while preserving pos calibration >= 0.80
        calib_penalty = 0.0 if val_metrics["pos_mean"] >= 0.80 else 0.5
        rank_score = val_metrics["roc_auc"] + 0.35 * val_metrics["f1_at_threshold"] + 0.15 * val_metrics["separation_margin"] - calib_penalty
        if rank_score > best_score:
            best_score = rank_score
            model.save_checkpoint(
                args.output_dir,
                extra_metadata={
                    "epoch": epoch,
                    "val_metrics": val_metrics,
                    "max_length": max_length,
                    "query_prefix": query_prefix,
                },
            )
            tokenizer.save_pretrained(args.output_dir)

    elapsed_s = time.perf_counter() - t0
    summary = {
        "base_model": cfg["base_model"],
        "device": str(device),
        "bf16": use_bf16,
        "train_pairs": len(train_rows),
        "val_pairs": len(val_rows),
        "elapsed_seconds": round(elapsed_s, 2),
        "untuned_val": pre_val,
        "history": history,
    }
    metrics_path = base_dir / "artifacts" / "training_metrics.json"
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"Training completed in {elapsed_s:.1f}s. Best checkpoint saved to {args.output_dir}")


if __name__ == "__main__":
    main()
