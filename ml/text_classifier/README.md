# Indian Emergency Text Classifier (`text_classifier`)

Dual-head multilingual classifier mapping citizen emergency reports & transcribed voice memos directly to ResQAI's schema (`TextAssessmentSchema`):
- **Head 1 (`suggestedCategory`):** `fire_smoke`, `road_accident`, `medical`, `personal_safety`, `water_flood`, `hazard`, `other`
- **Head 2 (`suggestedUrgency`):** `critical`, `high`, `medium`, `low`

## Base Model & `$0` Lifetime Design
- **Base Model:** `google/muril-base-cased` (`Apache-2.0`, `$0` lifetime cost, pre-trained on 17 Indian languages + English + romanized/transliterated text).
- **Training Hardware:** Fine-tuned locally on `NVIDIA GeForce RTX 4060 Laptop GPU` (`7` epochs, `bfloat16`, temperature-calibrated heads) over `4,613` train / `733` validation samples blending open disaster corpora (`QCRI/HumAID-event-type`, `QCRI/CrisisBench-all-lang`, `venetis/disaster_tweets`) and disjoint Indian Hinglish / Devanagari Hindi / Indian English scenarios.
- **CPU Runtime Integration:** Runs in [`text_classifier.py`](file:///f:/ResQAi/services/api/app/ai/adapters/text_classifier.py) via `onnxruntime` + Rust `tokenizers` (`~35 MB` dependencies, zero PyTorch required in `services/api`) when `AI_ADAPTER_MODE=live`.

## Observed Benchmark Results (`test_indian_benchmark.jsonl` — `270` OOD Samples)

| ONNX Artifact | Overall Cat Acc / Macro-F1 | Overall Urg Acc | Hinglish (`35`) | Hindi (`21`) | Indian EN (`52`) | False-Alarm Reject (`21`) | Confident Cat Acc | CPU p50 Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`model_fp32.onnx` (Primary Default, `948.13 MB`)** | **`87.04%` / `0.8746`** | **`80.00%`** | **`97.14%`** | **`95.24%`** | **`94.23%`** | **`90.48%`** | **`92.34%`** (`77.41%` cov.) | `65.09 ms` |
| `model_int8.onnx` (`MatMul` per-channel `QInt8`, `693.81 MB`) | `80.00%` / `0.8097` | `74.44%` | `71.43%` | `100.0%` | `86.54%` | `95.24%` | `85.85%` (`75.93%` cov.) | `25.57 ms` |

## Commands
```powershell
# 1. Build leak-free datasets
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\text_classifier\datasets\build_indian_dataset.py

# 2. Train on RTX 4060 GPU
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\text_classifier\scripts\train.py --offline --epochs 7 --batch-size 32 --lr 4e-5

# 3. Export FP32 + INT8 ONNX
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\text_classifier\scripts\export_onnx.py

# 4. Evaluate on OOD Indian Benchmark
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\text_classifier\scripts\evaluate.py --onnx-filename model_fp32.onnx --output-report f:\ResQAi\ml\text_classifier\artifacts\eval_report_fp32.json
```

To enable the trained ONNX model in `services/api`, set `AI_ADAPTER_MODE=live` in `services/api/.env` (optional: `TEXT_CLASSIFIER_ONNX_FILE=model_fp32.onnx` or `model_int8.onnx`).
