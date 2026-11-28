from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoConfig, AutoModel

DEFAULT_CFG_PATH = Path(__file__).resolve().parents[1] / "configs" / "matcher_config.json"


def load_matcher_config(path: Path = DEFAULT_CFG_PATH) -> Dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


class MultilingualDuplicateEncoder(nn.Module):
    """
    Mean-pooled + L2-normalized multilingual Transformer encoder (384-dim)
    for semantic duplicate incident matching across Hinglish, Hindi, and Indian English.
    """

    def __init__(self, base_model_name: str = "intfloat/multilingual-e5-small", from_config_only: bool = False) -> None:
        super().__init__()
        self.base_model_name = base_model_name
        self.config = AutoConfig.from_pretrained(base_model_name)
        if from_config_only:
            self.encoder = AutoModel.from_config(self.config)
        else:
            self.encoder = AutoModel.from_pretrained(base_model_name, config=self.config)

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        outputs = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        token_embeddings = outputs.last_hidden_state
        mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * mask_expanded, dim=1)
        sum_mask = torch.clamp(mask_expanded.sum(dim=1), min=1e-9)
        pooled = sum_embeddings / sum_mask
        return F.normalize(pooled, p=2, dim=-1)

    def save_checkpoint(self, output_dir: Path, extra_metadata: Optional[Dict] = None) -> None:
        output_dir.mkdir(parents=True, exist_ok=True)
        self.config.save_pretrained(output_dir)
        torch.save(self.state_dict(), output_dir / "pytorch_model.pt")
        meta = {
            "base_model_name": self.base_model_name,
            "embedding_dim": int(self.config.hidden_size),
            **(extra_metadata or {}),
        }
        with open(output_dir / "model_meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    @classmethod
    def load_checkpoint(
        cls, checkpoint_dir: Path, map_location: str | torch.device = "cpu"
    ) -> "MultilingualDuplicateEncoder":
        with open(checkpoint_dir / "model_meta.json", "r", encoding="utf-8") as f:
            meta = json.load(f)
        model = cls(base_model_name=str(checkpoint_dir), from_config_only=True)
        state = torch.load(checkpoint_dir / "pytorch_model.pt", map_location=map_location, weights_only=True)
        model.load_state_dict(state)
        model.base_model_name = str(meta.get("base_model_name", model.base_model_name))
        return model
