# SENTINELGRID

**Report clearly. Assess intelligently. Coordinate responsibly.**

Campus and community emergency coordination prototype for consented drills and authorized pilots.

This is **not** a certified dispatch system, a replacement for 112 / police / ambulance, or a truth-verification engine. AI is decision support. Operators keep authority.

## Current status

| Area | State |
| --- | --- |
| Frontend (`apps/web`) | Implemented as a React + Vite PWA, **fully connected to live backend** |
| Backend (`services/api`) | **Implemented & Live** — FastAPI, PostgreSQL 16 + PostGIS, Redis 7, Celery, 95/95 tests passing |
| ML inference | Pluggable backend adapters (faster-whisper, text classifier, vision fire/smoke) |
| Official emergency integrations | Unsupported |

## Architecture

- `apps/web` — React + Vite PWA (Citizen, Responder, Operator, Admin)
- `apps/mobile` — React Native / Expo field client
- `services/api` — FastAPI production backend (see [`services/api/README.md`](services/api/README.md))

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
