# Indian Voice Transcriber (`voice_transcriber`)

Local, `$0`/lifetime open-weight ASR pipeline built for `VoiceTranscriberAdapter` (`en-IN`, Hindi, and Bhopal Hinglish emergency memos), chaining directly into [`text_classifier`](file:///f:/ResQAi/ml/text_classifier/README.md).

## Model & License
- **Model:** `Systran/faster-whisper-small` (`MIT`, CTranslate2 weights in `artifacts/whisper-small-ct2/`, `486.22 MB`).
- **Audio Decoding:** Uses bundled PyAV (`av`) 16 kHz mono PCM resampling without requiring system `ffmpeg.exe`.
- **Indian Conditioning:** Uses Bhopal/Indian emergency landmark & Hinglish lexicon `initial_prompt` plus Silero VAD filtering (`vad_filter=True`).

## Observed Benchmark Results (`indian_audio_benchmark.jsonl` — `51` Samples)

| Runtime Mode | Kathbath Real Hindi (`30` clips) WER / CER / p50 | Indian Emergency Voice Memos (`21` clips) WER / CER / p50 | End-to-End Voice → MuRIL Category Accuracy |
| :--- | :---: | :---: | :---: |
| **CPU `int8` (API Runtime Default)** | `50.41%` / `19.19%` / `2869.7 ms` | **`3.09%` / `0.75%` / `2383.7 ms`** | **`100.0%` (`21/21`)** |
| **RTX 4060 CUDA `float16`** | `51.24%` / `19.13%` / `592.6 ms` | **`3.09%` / `0.75%` / `307.4 ms`** | **`100.0%` (`21/21`)** |

> For heavier pure-Devanagari Hindi accuracy in production GPU deployments, drop in `dropbox-dash/faster-whisper-large-v3-turbo` (`MIT`) via `VOICE_TRANSCRIBER_MODEL_DIR` and `VOICE_TRANSCRIBER_DEVICE=cuda` / `VOICE_TRANSCRIBER_COMPUTE_TYPE=float16`.

## Commands
```powershell
# 1. Build Indian Hindi + emergency voice memo benchmark
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\voice_transcriber\datasets\build_indian_audio_benchmark.py --hindi-count 30

# 2. Download open-weight faster-whisper-small model locally
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\voice_transcriber\scripts\download_model.py

# 3. Evaluate ASR WER/CER and Voice -> TextClassifier end-to-end pipeline
f:\ResQAi\ml\.venv\Scripts\python.exe f:\ResQAi\ml\voice_transcriber\scripts\evaluate.py
```
