# SENTINELGRID

**Report clearly. Assess intelligently. Coordinate responsibly.**

Campus and community emergency coordination prototype for consented drills and authorized pilots.

This is **not** a certified dispatch system, a replacement for 112 / police / ambulance, or a truth-verification engine. AI is decision support. Operators keep authority.

## Current status

| Area | State |
| --- | --- |
| Frontend (this repo) | Implemented as a working UI prototype with **synthetic demo data** |
| Backend / PostGIS / Celery | Planned — app uses a typed mock API until the API is connected |
| ML inference | Adapters on the backend; UI shows assessment fields only when present |
| Official emergency integrations | Unsupported |

## Apps

- `apps/web` — React + Vite PWA
  - Citizen and Responder: mobile-first
  - Operator and Admin: desktop command centre

## Run the frontend

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:5173

### Demo accounts (synthetic)

| Role | Email | Password |
| --- | --- | --- |
| Citizen | citizen@campus.demo | demo1234 |
| Responder | responder@campus.demo | demo1234 |
| Operator | operator@campus.demo | demo1234 |
| Admin | admin@campus.demo | demo1234 |

All incidents, responders, maps, and metrics in the UI are **labelled synthetic**.

## Where ML belongs (backend workers — not the browser)

Provide model artifacts when ready. Do **not** run heavy inference in the client.

1. **Text category / urgency** — TF-IDF + logistic regression, then multilingual embeddings  
2. **Voice transcription** — faster-whisper on uploaded audio  
3. **Fire/smoke vision** — narrow PyTorch classifier on images / sampled video frames  
4. **Duplicate candidates** — PostGIS distance + time window + embedding similarity  
5. **Optional LLM summary** — structured operator notes only, never dispatch authority

The UI already has evidence panels for these outputs. Until models are wired, assessments are either absent (`unavailable`) or produced by a **labelled demo adapter**.
