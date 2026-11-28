# ResQAI 24/7 Free Cloud Architecture (Option A: Render + Supabase + HF Hub + Modal / GPU PC)

Hosts ResQAI end-to-end across free cloud tiers without hitting Render's 512 MB RAM ceiling or Hugging Face Spaces' PRO restriction (`HTTP 402` on free `cpu-basic` Docker Spaces):

1. **Models Storage ($0 Forever):** Hugging Face Model Hub (`Yuv0801/resqai-indian-emergency-models` — `1903.94 MiB`, 21 lean serving files uploaded via `ml/scripts/upload_to_hf_hub.py`).
2. **PostgreSQL + PostGIS & Media Storage ($0 Forever):** Supabase Session Pooler (`?sslmode=require`) + Supabase S3-compatible bucket (`sentinelgrid-evidence`).
3. **API, WebSockets & Inline Outbox Relay:** Render Free (`resqai-api`) configured with:
   - `DATABASE_URL` (Supabase Session Pooler URL, `%40` if password contains `@`)
   - `S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_NAME=sentinelgrid-evidence`, `S3_ADDRESSING_STYLE=path`
   - `REDIS_URL=""` (single-container inline mode)
   - `AI_ADAPTER_MODE=live`, `AI_PRELOAD_ON_STARTUP=false`, `AI_INLINE_OUTBOX_POLL_SECONDS=2.0`
   - `ML_INFERENCE_BASE_URL=https://<your-modal-or-ngrok-url>`
   - `ML_INFERENCE_API_KEY=<shared-secret>`
4. **Live 4-Model Inference Server (`ml/server.py`):**
   - **24/7 Cloud (no laptop uptime):** Deploy `deploy/modal/modal_app.py` to **Modal** (`$30/mo` free Starter credit, scale-to-zero, 4 GB RAM container baking models from `Yuv0801/resqai-indian-emergency-models`):
     ```powershell
     pip install modal
     modal setup
     modal deploy deploy/modal/modal_app.py
     ```
   - **Or Local GPU PC Demo (`ngrok`):** Run `python ml/server.py` (`PORT=8080`) + `ngrok http 8080`, then paste the `https://...` URL into Render's `ML_INFERENCE_BASE_URL`.
5. **Web (`apps/web` on Vercel) & Mobile (`apps/mobile`):** Both already point to `https://resqai-6s8c.onrender.com`; `apps/web/vercel.json` handles React Router SPA rewrites.
