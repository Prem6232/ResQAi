# ResQAI Duplicate Incident Matcher (`ml/duplicate_matcher`)

Cross-lingual semantic duplicate emergency matcher built on **`intfloat/multilingual-e5-small`** (`MIT`, `$0` lifetime cost), fine-tuned locally on RTX 4060 GPU for Hinglish, Devanagari Hindi, and Indian English incident reports and exported to CPU ONNX (`QInt8` and `FP32`).

## Why Fine-Tuning Was Required
Untuned `intfloat/multilingual-e5-small` conflates different emergencies that share the same landmark or street name (`AUC = 0.5425`, `PosMean = 0.867` vs `SamePlaceNegMean = 0.8832` on 40 unseen Indian OOD pairs). Contrastive + CoSENT fine-tuning on disjoint Indian landmark clusters with hard same-location negative pairs teaches the encoder to separate event semantics from shared place names while bridging Romanized Hinglish, Devanagari Hindi, and Indian English.

## Model & Pipeline
- **Base model:** `intfloat/multilingual-e5-small` (`117.65M` params, `384`-dim normalized mean-pooled embeddings, XLM-RoBERTa vocabulary `<pad> = 1`).
- **Dataset (`datasets/build_duplicate_dataset.py`):**
  - `train_pairs.jsonl`: `1,997` pairs (`1,200` cross-lingual duplicates / `797` hard negatives across `20` train clusters and `14` Bhopal/campus landmarks)
  - `val_pairs.jsonl`: `177` pairs (`90` positives / `87` hard negatives across `6` disjoint val clusters and `6` disjoint landmarks)
  - `test_indian_duplicate_benchmark.jsonl`: `40` hand-written unseen OOD pairs (`20` Hinglish↔English / Hindi↔Hinglish / Hindi↔English positives, `20` same-place / false-alarm / cross-event hard negatives)
- **Production default (`configs/matcher_config.json`):** `model_int8.onnx` (`406.86 MB`), `likely_related_semantic_threshold = 0.45` (calibrated from validation), combined with `300m` Haversine geospatial gating and category tie-breaking inside `services/api/app/ai/adapters/duplicate_matcher.py` and `services/api/app/modules/operator/service.py`.

## Observed Benchmarks (CPU `CPUExecutionProvider`)
Measured by `scripts/evaluate.py` on the `40` unseen OOD Indian emergency pairs:

| Model | OOD ROC-AUC | Acc @ 0.45 | Pos Mean | Same-Place Neg Mean | Separation Margin | CPU Pair p50 |
| --- | --- | --- | --- | --- | --- | --- |
| `base_e5_untuned` | `0.5425` | `0.5000` | `0.867` | `0.8832` | `0.012` | `38.76 ms` |
| `finetuned_fp32_onnx` (`470.25 MB`) | `0.9600` | `0.9250` | `0.757` | `0.2989` | `0.558` | `34.92 ms` |
| **`finetuned_int8_onnx` (`406.86 MB`)** | **`0.9675`** | **`0.9750`** | `0.745` | **`0.2879`** | `0.552` | **`18.51 ms`** |

## Reproduce
```powershell
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\duplicate_matcher\datasets\build_duplicate_dataset.py
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\duplicate_matcher\scripts\train.py --offline
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\duplicate_matcher\scripts\export_onnx.py
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\duplicate_matcher\scripts\evaluate.py
```
