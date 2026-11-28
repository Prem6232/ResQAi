from __future__ import annotations

import argparse
import json
import os
import random
import sys
from pathlib import Path
from typing import Dict, List

DEFAULT_ML_DIR = Path(__file__).resolve().parents[2]
os.environ.setdefault("HF_HOME", str(DEFAULT_ML_DIR / ".hf_cache"))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
if "--offline" in sys.argv:
    os.environ["HF_HUB_OFFLINE"] = "1"

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import accuracy_score, classification_report, f1_score
from torch.utils.data import DataLoader, Dataset
from transformers import AutoTokenizer, get_cosine_schedule_with_warmup

from model import IndianEmergencyClassifier, load_label_config


class EmergencyTextDataset(Dataset):
    def __init__(
        self,
        records: List[Dict],
        tokenizer,
        category_to_id: Dict[str, int],
        urgency_to_id: Dict[str, int],
        max_length: int = 128,
    ) -> None:
        self.records = records
        self.tokenizer = tokenizer
        self.category_to_id = category_to_id
        self.urgency_to_id = urgency_to_id
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        rec = self.records[idx]
        enc = self.tokenizer(
            rec["text"],
            truncation=True,
            max_length=self.max_length,
            padding="max_length",
            return_tensors="pt",
        )
        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "category_id": torch.tensor(self.category_to_id[rec["category"]], dtype=torch.long),
            "urgency_id": torch.tensor(self.urgency_to_id[rec["urgency"]], dtype=torch.long),
        }


def load_jsonl(path: Path) -> List[Dict]:
    rows: List[Dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def compute_class_weights(labels: List[int], num_classes: int) -> torch.Tensor:
    counts = np.bincount(labels, minlength=num_classes).astype(np.float64)
    counts = np.maximum(counts, 1.0)
    total = counts.sum()
    weights = np.sqrt(total / (num_classes * counts))
    weights = np.clip(weights, 0.6, 3.0)
    return torch.tensor(weights, dtype=torch.float32)


def fit_temperature(logits: np.ndarray, targets: np.ndarray) -> float:
    """Grid-search scalar softmax temperature minimizing validation NLL."""
    logits_t = torch.tensor(logits, dtype=torch.float32)
    targets_t = torch.tensor(targets, dtype=torch.long)
    best_temp = 1.0
    best_nll = float("inf")
    criterion = nn.CrossEntropyLoss()
    for temp in np.linspace(0.4, 2.0, 33):
        with torch.no_grad():
            nll = criterion(logits_t / float(temp), targets_t).item()
        if nll < best_nll:
            best_nll = nll
            best_temp = float(round(float(temp), 3))
    return best_temp


@torch.no_grad()
def evaluate_model(
    model: IndianEmergencyClassifier,
    loader: DataLoader,
    device: torch.device,
) -> Dict:
    model.eval()
    all_cat_preds, all_cat_true, all_cat_logits = [], [], []
    all_urg_preds, all_urg_true, all_urg_logits = [], [], []

    amp_dtype = torch.bfloat16 if (device.type == "cuda" and torch.cuda.is_bf16_supported()) else torch.float16
    use_amp = device.type == "cuda"

    for batch in loader:
        input_ids = batch["input_ids"].to(device, non_blocking=True)
        attention_mask = batch["attention_mask"].to(device, non_blocking=True)
        with torch.amp.autocast("cuda", enabled=use_amp, dtype=amp_dtype):
            cat_logits, urg_logits = model(input_ids=input_ids, attention_mask=attention_mask)

        cat_np = cat_logits.float().cpu().numpy()
        urg_np = urg_logits.float().cpu().numpy()
        all_cat_logits.append(cat_np)
        all_urg_logits.append(urg_np)
        all_cat_preds.extend(np.argmax(cat_np, axis=-1).tolist())
        all_urg_preds.extend(np.argmax(urg_np, axis=-1).tolist())
        all_cat_true.extend(batch["category_id"].numpy().tolist())
        all_urg_true.extend(batch["urgency_id"].numpy().tolist())

    cat_logits_arr = np.concatenate(all_cat_logits, axis=0)
    urg_logits_arr = np.concatenate(all_urg_logits, axis=0)

    return {
        "cat_acc": float(accuracy_score(all_cat_true, all_cat_preds)),
        "cat_macro_f1": float(f1_score(all_cat_true, all_cat_preds, average="macro", zero_division=0)),
        "urg_acc": float(accuracy_score(all_urg_true, all_urg_preds)),
        "urg_macro_f1": float(f1_score(all_urg_true, all_urg_preds, average="macro", zero_division=0)),
        "cat_logits": cat_logits_arr,
        "urg_logits": urg_logits_arr,
        "cat_true": np.array(all_cat_true),
        "urg_true": np.array(all_urg_true),
        "cat_preds": all_cat_preds,
        "urg_preds": all_urg_preds,
    }


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Train Indian Emergency Text Classifier on GPU")
    parser.add_argument("--data-dir", type=Path, default=base_dir / "datasets" / "processed")
    parser.add_argument("--output-dir", type=Path, default=base_dir / "artifacts")
    parser.add_argument("--base-model", type=str, default=None)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=3e-5)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--max-length", type=int, default=128)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--offline", action="store_true", help="Load base model from local HF cache only")
    args = parser.parse_args()

    if args.offline:
        os.environ["HF_HUB_OFFLINE"] = "1"

    set_seed(args.seed)
    cfg = load_label_config()
    categories: List[str] = cfg["categories"]
    urgencies: List[str] = cfg["urgencies"]
    base_model_name = args.base_model or cfg["base_model"]
    max_length = args.max_length or int(cfg.get("max_length", 128))

    cat_to_id = {c: i for i, c in enumerate(categories)}
    urg_to_id = {u: i for i, u in enumerate(urgencies)}

    train_records = load_jsonl(args.data_dir / "train.jsonl")
    val_records = load_jsonl(args.data_dir / "val.jsonl")
    print(f"Loaded {len(train_records)} train rows, {len(val_records)} val rows | Base: {base_model_name}")

    tokenizer = AutoTokenizer.from_pretrained(base_model_name)
    train_ds = EmergencyTextDataset(train_records, tokenizer, cat_to_id, urg_to_id, max_length=max_length)
    val_ds = EmergencyTextDataset(val_records, tokenizer, cat_to_id, urg_to_id, max_length=max_length)

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size * 2, shuffle=False, pin_memory=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training device: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device.type == "cuda" else ""))

    model = IndianEmergencyClassifier(
        base_model_name=base_model_name,
        num_categories=len(categories),
        num_urgencies=len(urgencies),
    ).to(device)

    cat_weights = compute_class_weights([cat_to_id[r["category"]] for r in train_records], len(categories)).to(device)
    urg_weights = compute_class_weights([urg_to_id[r["urgency"]] for r in train_records], len(urgencies)).to(device)
    cat_criterion = nn.CrossEntropyLoss(weight=cat_weights, label_smoothing=0.05)
    urg_criterion = nn.CrossEntropyLoss(weight=urg_weights, label_smoothing=0.05)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    total_steps = max(1, len(train_loader) * args.epochs)
    scheduler = get_cosine_schedule_with_warmup(
        optimizer,
        num_warmup_steps=max(1, int(total_steps * 0.10)),
        num_training_steps=total_steps,
    )

    use_cuda = device.type == "cuda"
    use_bf16 = use_cuda and torch.cuda.is_bf16_supported()
    amp_dtype = torch.bfloat16 if use_bf16 else torch.float16
    scaler = torch.amp.GradScaler("cuda", enabled=(use_cuda and not use_bf16))

    best_score = -1.0
    best_checkpoint_dir = args.output_dir / "best_checkpoint"
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss = 0.0
        for step, batch in enumerate(train_loader, start=1):
            optimizer.zero_grad(set_to_none=True)
            input_ids = batch["input_ids"].to(device, non_blocking=True)
            attention_mask = batch["attention_mask"].to(device, non_blocking=True)
            cat_y = batch["category_id"].to(device, non_blocking=True)
            urg_y = batch["urgency_id"].to(device, non_blocking=True)

            with torch.amp.autocast("cuda", enabled=use_cuda, dtype=amp_dtype):
                cat_logits, urg_logits = model(input_ids=input_ids, attention_mask=attention_mask)
                loss_cat = cat_criterion(cat_logits, cat_y)
                loss_urg = urg_criterion(urg_logits, urg_y)
                loss = loss_cat + 0.75 * loss_urg

            if scaler.is_enabled():
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
            else:
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()

            scheduler.step()
            running_loss += float(loss.item())

        avg_train_loss = running_loss / max(1, len(train_loader))
        val_metrics = evaluate_model(model, val_loader, device)
        combined = 0.65 * val_metrics["cat_macro_f1"] + 0.35 * val_metrics["urg_macro_f1"]

        epoch_summary = {
            "epoch": epoch,
            "train_loss": round(avg_train_loss, 4),
            "val_cat_acc": round(val_metrics["cat_acc"], 4),
            "val_cat_macro_f1": round(val_metrics["cat_macro_f1"], 4),
            "val_urg_acc": round(val_metrics["urg_acc"], 4),
            "val_urg_macro_f1": round(val_metrics["urg_macro_f1"], 4),
            "combined_score": round(combined, 4),
        }
        history.append(epoch_summary)
        print(
            f"Epoch {epoch}/{args.epochs} | loss={avg_train_loss:.4f} | "
            f"val_cat_acc={val_metrics['cat_acc']:.4f} f1={val_metrics['cat_macro_f1']:.4f} | "
            f"val_urg_acc={val_metrics['urg_acc']:.4f} f1={val_metrics['urg_macro_f1']:.4f}"
        )

        if combined > best_score:
            best_score = combined
            cat_temp = fit_temperature(val_metrics["cat_logits"], val_metrics["cat_true"])
            urg_temp = fit_temperature(val_metrics["urg_logits"], val_metrics["urg_true"])

            model.save_checkpoint(
                best_checkpoint_dir,
                extra_metadata={
                    "categories": categories,
                    "urgencies": urgencies,
                    "max_length": max_length,
                    "best_val_metrics": {k: v for k, v in epoch_summary.items()},
                    "category_temperature": cat_temp,
                    "urgency_temperature": urg_temp,
                    "review_confidence_threshold": cfg["review_confidence_threshold"],
                },
            )
            tokenizer.save_pretrained(best_checkpoint_dir)
            with open(best_checkpoint_dir / "labels.json", "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2)

            cat_report = classification_report(
                val_metrics["cat_true"],
                val_metrics["cat_preds"],
                target_names=categories,
                zero_division=0,
            )
            urg_report = classification_report(
                val_metrics["urg_true"],
                val_metrics["urg_preds"],
                target_names=urgencies,
                zero_division=0,
            )
            with open(args.output_dir / "val_classification_report.txt", "w", encoding="utf-8") as f:
                f.write("=== CATEGORY REPORT ===\n" + cat_report + "\n=== URGENCY REPORT ===\n" + urg_report)

    with open(args.output_dir / "training_metrics.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "base_model": base_model_name,
                "train_samples": len(train_records),
                "val_samples": len(val_records),
                "device": str(device),
                "best_combined_score": round(best_score, 4),
                "history": history,
            },
            f,
            indent=2,
        )
    print(f"Best checkpoint saved to: {best_checkpoint_dir} (combined={best_score:.4f})")


if __name__ == "__main__":
    main()
