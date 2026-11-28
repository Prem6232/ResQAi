# ResQAI Vision Hazard Detector (`ml/vision_detector`)

Commercial-safe (`BSD-3-Clause`, `$0` lifetime cost) fire & smoke bounding-box detector built on TorchVision **`fcos_resnet50_fpn`** (`384x384`, `3,069` FPN anchors across strides `8..128`), fine-tuned on the RTX 4060 GPU using real open fire/smoke detections paired with real Indian street hard-negative scenes, and exported to pure-CPU ONNX (`128.57 MB`).

## Dataset Composition & Leak-Free Splits (`datasets/build_vision_dataset.py`)
- **Sources:**
  - `badsaarow/d-fire` (open D-Fire wildfire/urban fire & smoke YOLO boxes + empty outdoor distractors; `0 -> smoke_plume`, `1 -> active_flame`)
  - `chandrabhuma/Indian_Traffic_VQA_Dataset` (`MIT` license, `1,085` real Indian street/traffic scenes with auto-rickshaws, two-wheelers, streetlights, and intersections)
- **Splits (`datasets/processed/*.jsonl`):**
  - `train.jsonl`: `4,903` images (`3,310` positive / `1,593` negative including `750` Indian Traffic hard negatives; `3,545` `smoke_plume` + `5,801` `active_flame` boxes)
  - `val.jsonl`: `884` images (contiguous tail-15% sequence blocks from D-Fire train shards + `150` disjoint Indian Traffic hard negatives; `621` `smoke_plume` + `1,014` `active_flame` boxes)
  - `test_dfire_ood.jsonl`: `1,435` held-out official D-Fire test images (`test-00002-of-00003`: `1,378` positives, `57` negatives; `1,488` `smoke_plume` + `2,323` `active_flame` boxes)
  - `test_indian_neg_ood.jsonl`: `185` held-out real Indian Traffic negative scenes (strictly disjoint `img_0901..1085`)

## Observed Benchmarks (`artifacts/eval_report.json`)
Trained for `6` epochs in `1,158.5s` on RTX 4060 (`fp16` mixed precision); threshold calibrated strictly on `val` (`box_score_threshold = 0.50`, `nms_iou_threshold = 0.50`) and benchmarked on CPU (`CPUExecutionProvider`):

| Evaluation Split | Count | mAP@0.5 (`smoke_plume` / `active_flame`) | Image ROC-AUC | Triage Acc | Triage F1 | Indian Neg FPR | CPU p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `validation` | `884` | `0.5601` (`0.6443` / `0.4759`) | `0.9540` | `0.8982` | `0.9209` | `0.1733` (`150` imgs) | — |
| `ood_dfire` (`test-00002`) | `1,435` | **`0.6581`** (`0.7707` / `0.5454`) | `0.8839` | `0.9226` | `0.9586` | — | `162.89 ms` / `179.98 ms` |
| `ood_indian_negatives` | `185` | — | — | `0.8432` | — | **`0.1568`** (`185` imgs) | — |
| **`ood_combined_triage`** | **`1,620`** | `0.6545` (`0.7639` / `0.5451`) | **`0.9364`** | **`0.9136`** | **`0.9484`** | **`0.1568`** | **`162.89 ms`** |

## FastAPI Integration
- Configured via `VISION_DETECTOR_MODEL_DIR` and `VISION_DETECTOR_ONNX_FILE` (`model_fp32.onnx`) in `services/api/app/core/config.py`.
- Loaded lazily via `services/api/app/ai/adapters/vision_detector.py` (`_OnnxVisionRuntime`), decoding citizen JPEG/PNG/WebP bytes (`file_bytes` or MinIO `s3_key`) into normalized `VisionBoundingBox` detections (`smoke_plume`, `active_flame`) and `possible_fire_smoke_evidence` / `no_supported_visual_evidence` findings.

## Reproduce
```powershell
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\vision_detector\datasets\build_vision_dataset.py
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\vision_detector\scripts\train.py --offline
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\vision_detector\scripts\export_onnx.py
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\vision_detector\scripts\evaluate.py
```
