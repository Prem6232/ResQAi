# Self-contained Hugging Face Spaces Docker image built from GitHub repo root or synced Space repo.
# Sets PORT=7860 matching deploy/hf_space/README.md app_port: 7860.
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PORT=7860
ENV HF_HOME=/tmp/hf_cache
ENV AI_MODELS_ROOT=/app/models

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/models /tmp/hf_cache \
    && chmod -R 777 /app/models /tmp/hf_cache

COPY services/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/api/ .

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-7860}/health || exit 1

CMD ["sh", "-c", "python -m app.ai.hf_bootstrap && alembic upgrade head && python scripts/seed.py && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
