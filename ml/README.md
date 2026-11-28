# ResQAI Machine Learning Workspace

Zero-runtime-cost (`$0` lifetime) open-weight ML pipelines designed for **Indian urban & campus emergency coordination** (English, Romanized Hinglish, and Devanagari Hindi).

## Model Directory Structure

Each model has an isolated folder for datasets, training/export scripts, configs, and artifacts:

| Folder | Target Adapter | Status | Recommended Free Open-Weight Base |
| :--- | :--- | :--- | :--- |
| [`text_classifier/`](file:///f:/ResQAi/ml/text_classifier/README.md) | `TextClassifierAdapter` | **Active (Phase 1)** | `google/muril-base-cased` (Apache-2.0) -> Dual-head ONNX INT8 |
| [`voice_transcriber/`](file:///f:/ResQAi/ml/voice_transcriber/README.md) | `VoiceTranscriberAdapter` | **Prepared (Phase 2)** | `faster-whisper` (`small`/`base`, MIT) / AI4Bharat `IndicWhisper` |
| [`vision_detector/`](file:///f:/ResQAi/ml/vision_detector/README.md) | `VisionDetectorAdapter` | **Prepared (Phase 3)** | `RT-DETR` / `D-FINE` / `YOLOX` (Apache-2.0) on Indian fire/road/flood scenes |
| [`duplicate_matcher/`](file:///f:/ResQAi/ml/duplicate_matcher/README.md) | `DuplicateMatcherAdapter` | **Prepared (Phase 4)** | `intfloat/multilingual-e5-small` / `paraphrase-multilingual-MiniLM-L12-v2` (MIT/Apache-2.0) + PostGIS |

## Environment Setup

```powershell
C:\Python313\python.exe -m venv --system-site-packages f:\ResQAi\ml\.venv
f:\ResQAi\ml\.venv\Scripts\python.exe -m pip install -r f:\ResQAi\ml\requirements.txt
```
