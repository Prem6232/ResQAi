# ResQAI 24/7 Free-Forever Live ML Cloud Deployment Guide

Run the complete multimodal ResQAI platform (`MuRIL` Hinglish classifier, `Faster-Whisper-small` speech-to-text, `Multilingual-E5` duplicate matcher, `FCOS-ResNet50-FPN` fire/smoke detector) with zero monthly server cost using:

1. **Database (Free PostGIS):** **Neon** (`neon.tech`) or **Supabase** (`supabase.com`) PostgreSQL + PostGIS
2. **Object Storage (Free 10 GB S3):** **Cloudflare R2** (`dash.cloudflare.com`)
3. **Backend + 4 Live Models (Free 16 GB RAM Docker):** **Hugging Face Spaces** (`cpu-basic`) + **Hugging Face Model Hub**
4. **Frontend (Free Hosting):** **Vercel** (`apps/web`)
5. **Redis (Optional Free Tier):** **Upstash Redis** (`rediss://...`), or leave `REDIS_URL=""` (single-container inline WebSocket + outbox polling works without Redis)

---

## Step 1: Upload Your 4 Trained Models to Hugging Face Hub ($0)

Log in once on this machine and run the lean bundle uploader (~1.83 GiB across the 4 serving models):

```powershell
f:\ResQAi\services\api\.venv\Scripts\python.exe -c "from huggingface_hub import login; login()"
f:\ResQAi\services\api\.venv\Scripts\python.exe f:\ResQAi\ml\scripts\upload_to_hf_hub.py --repo-id <your-hf-username>/resqai-indian-emergency-models
```

*(Dry run first with `--dry-run` to inspect staged files and sizes without uploading.)*

---

## Step 2: Provision Neon / Supabase PostGIS ($0)

- **Neon:** Create a project, run `CREATE EXTENSION IF NOT EXISTS postgis;` once in the Neon SQL Editor (optional — Alembic migration `0001_initial` also creates it), and copy the connection string (`postgresql://...?sslmode=require`).
- **Supabase:** Copy the Session/Transaction connection string (`?sslmode=require`) and run `CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;` in the Supabase SQL Editor.

`services/api` automatically strips `sslmode` / `channel_binding` query args into `asyncpg` SSL `connect_args` and disables prepared statement cache on pooler ports (`6543` / `pooler.`).

---

## Step 3: Provision Cloudflare R2 Bucket for Photos & Audio ($0 / 10 GB)

1. Create an R2 bucket named `sentinelgrid-evidence`.
2. Create an R2 API Token (Object Read & Write) and record:
   - `S3_ENDPOINT_URL`: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - `S3_REGION`: `auto`
   - `S3_BUCKET_NAME`: `sentinelgrid-evidence`
   - `S3_ACCESS_KEY` / `S3_SECRET_KEY`
3. Under **R2 Bucket → Settings → CORS Policy**, allow `PUT`, `GET`, `HEAD` from your Vercel origin:

```json
[
  {
    "AllowedOrigins": [
      "https://res-q-ai-coral.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Step 4: Create Hugging Face Docker Space (16 GB RAM Free)

1. Create a **Docker Space** on Hugging Face (`cpu-basic` — 2 vCPU, **16 GB RAM**, free forever).
2. Either point the Space at the root repo files `deploy/hf_space/README.md` + `deploy/hf_space/Dockerfile` (copy both as `README.md` and `Dockerfile` in the Space root) OR set `app_port: 8000` using `services/api` as root with `Dockerfile` there.
3. Add **Space Variables / Secrets**:
   - `ENVIRONMENT=production`
   - `AI_ADAPTER_MODE=live`
   - `AI_PRELOAD_ON_STARTUP=true`
   - `AI_INLINE_OUTBOX_POLL_SECONDS=2.0`
   - `HF_MODEL_REPO_ID=<your-hf-username>/resqai-indian-emergency-models`
   - `HF_TOKEN=<hf_read_token_if_private>`
   - `DATABASE_URL=<neon-or-supabase-url>`
   - `REDIS_URL=` *(blank for inline single-container mode, or Upstash `rediss://...`)*
   - `JWT_SECRET=<random-64-char-secret>`
   - `S3_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - `S3_REGION=auto`
   - `S3_ACCESS_KEY=<r2-key>`
   - `S3_SECRET_KEY=<r2-secret>`
   - `S3_BUCKET_NAME=sentinelgrid-evidence`
   - `CORS_ORIGINS=["https://res-q-ai-coral.vercel.app"]`

Verify once Space reaches **Running**:
```bash
curl https://<your-hf-username>-<your-space-name>.hf.space/health
```
Confirm `"ai_mode": "live"` and `"database": "connected"`.

---

## Step 5: Connect Vercel & Expo Mobile App

- **Vercel (`apps/web`):** Set Project Environment Variables:
  - `VITE_API_BASE_URL=https://<your-hf-username>-<your-space-name>.hf.space/api/v1`
  - `VITE_WS_URL=wss://<your-hf-username>-<your-space-name>.hf.space/ws`
  - Trigger a Vercel redeploy (`apps/web/vercel.json` handles SPA route rewrites automatically).
- **Mobile (`apps/mobile`):** Build or run with:
  - `EXPO_PUBLIC_API_URL=https://<your-hf-username>-<your-space-name>.hf.space/api/v1`
  - `EXPO_PUBLIC_WS_URL=wss://<your-hf-username>-<your-space-name>.hf.space/ws`
