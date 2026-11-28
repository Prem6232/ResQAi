from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional, Tuple

import torch
import torch.nn as nn
from transformers import AutoConfig, AutoModel


DEFAULT_LABELS_PATH = Path(__file__).resolve().parents[1] / "configs" / "labels.json"


def load_label_config(path: Path = DEFAULT_LABELS_PATH) -> Dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


class IndianEmergencyClassifier(nn.Module):
    """
    Dual-head multilingual Transformer for ResQAI Indian emergency triage.
    Takes (input_ids, attention_mask) and produces:
      - category_logits: [batch, 7] -> IncidentCategory enum
      - urgency_logits:  [batch, 4] -> Urgency enum
    """

    def __init__(
        self,
        base_model_name: str = "google/muril-base-cased",
        num_categories: int = 7,
        num_urgencies: int = 4,
        dropout_prob: float = 0.2,
        from_config_only: bool = False,
    ) -> None:
        super().__init__()
        self.base_model_name = base_model_name
        self.num_categories = num_categories
        self.num_urgencies = num_urgencies

        self.config = AutoConfig.from_pretrained(base_model_name)
        if from_config_only:
            self.encoder = AutoModel.from_config(self.config)
        else:
            self.encoder = AutoModel.from_pretrained(base_model_name, config=self.config)

        hidden_size = self.config.hidden_size
        self.dropout = nn.Dropout(dropout_prob)
        self.category_head = nn.Linear(hidden_size, num_categories)
        self.urgency_head = nn.Linear(hidden_size, num_urgencies)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        outputs = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        token_embeddings = outputs.last_hidden_state

        mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * mask_expanded, dim=1)
        sum_mask = torch.clamp(mask_expanded.sum(dim=1), min=1e-9)
        pooled = self.dropout(sum_embeddings / sum_mask)

        category_logits = self.category_head(pooled)
        urgency_logits = self.urgency_head(pooled)
        return category_logits, urgency_logits

    def save_checkpoint(self, output_dir: Path, extra_metadata: Optional[Dict] = None) -> None:
        output_dir.mkdir(parents=True, exist_ok=True)
        self.config.save_pretrained(output_dir)
        torch.save(self.state_dict(), output_dir / "pytorch_model.pt")
        meta = {
            "base_model_name": self.base_model_name,
            "num_categories": self.num_categories,
            "num_urgencies": self.num_urgencies,
            **(extra_metadata or {}),
        }
        with open(output_dir / "model_meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    @classmethod
    def load_checkpoint(cls, checkpoint_dir: Path, map_location: str | torch.device = "cpu") -> "IndianEmergencyClassifier":
        with open(checkpoint_dir / "model_meta.json", "r", encoding="utf-8") as f:
            meta = json.load(f)
        model = cls(
            base_model_name=str(checkpoint_dir),
            num_categories=int(meta["num_categories"]),
            num_urgencies=int(meta["num_urgencies"]),
            from_config_only=True,
        )
        state = torch.load(checkpoint_dir / "pytorch_model.pt", map_location=map_location, weights_only=True)
        model.load_state_dict(state)
        return model
