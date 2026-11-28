"""
Serverless 24/7 ResQAI 4-Model ML Hosting on Modal ($30/month free Starter tier, scales to zero).

Bakes all 4 models from Hugging Face Model Hub (`Yuv0801/resqai-indian-emergency-models`)
directly into the container image so cold starts stay fast without runtime Hub downloads.

Deploy once from repo root:
  pip install modal
  modal setup
  modal deploy deploy/modal/modal_app.py
"""

from __future__ import annotations

import os
import sys

import modal

HF_MODEL_REPO_ID = os.getenv("HF_MODEL_REPO_ID", "Yuv0801/resqai-indian-emergency-models")


def _bake_models_into_image() -> None:
    from huggingface_hub import snapshot_download

    snapshot_download(
        repo_id=HF_MODEL_REPO_ID,
        repo_type="model",
        local_dir="/app/models",
        allow_patterns=[
            "text_classifier/*",
            "voice_transcriber/*",
            "duplicate_matcher/*",
            "vision_detector/*",
        ],
    )


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgomp1")
    .pip_install(
        "fastapi==0.115.8",
        "pydantic==2.10.6",
        "pydantic-settings==2.8.0",
        "httpx==0.28.1",
        "boto3==1.36.21",
        "sqlalchemy==2.0.38",
        "geoalchemy2==0.17.1",
        "shapely==2.0.7",
        "onnxruntime>=1.20.0",
        "tokenizers>=0.21.0",
        "numpy>=1.26.0",
        "faster-whisper>=1.1.0",
        "av>=11,<16",
        "pillow>=10.0.0",
        "huggingface-hub>=0.25.0",
    )
    .env(
        {
            "AI_ADAPTER_MODE": "live",
            "AI_MODELS_ROOT": "/app/models",
            "HF_MODEL_REPO_ID": HF_MODEL_REPO_ID,
            "PYTHONPATH": "/app:/app/services/api",
        }
    )
    .run_function(_bake_models_into_image)
    .add_local_dir("services/api/app", remote_path="/app/services/api/app", ignore=["**/__pycache__", "*.pyc"])
    .add_local_file("ml/server.py", remote_path="/app/ml/server.py")
)

app = modal.App("resqai-ml-server")


@app.function(
    image=image,
    cpu=2.0,
    memory=4096,
    scaledown_window=120,
    secrets=[modal.Secret.from_name("resqai-ml-secrets")] if os.getenv("MODAL_USE_SECRET") else [],
)
@modal.asgi_app()
def fastapi_app():
    for path in ("/app", "/app/services/api"):
        if path not in sys.path:
            sys.path.insert(0, path)

    from ml.server import app as ml_fastapi_app

    return ml_fastapi_app
