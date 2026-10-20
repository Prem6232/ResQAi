# 🛡️ ResQAi / SENTINELGRID

<div align="center">

**Next-Generation Campus & Community Emergency Response, AI-Powered Multimodal Triage, and Real-Time Dispatch Platform**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-PostGIS_3.4-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgis.net)
[![React](https://img.shields.io/badge/React_18-Vite_PWA-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![React Native](https://img.shields.io/badge/React_Native_0.86-Expo_57-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev)
[![Redis](https://img.shields.io/badge/Redis_7-Pub%2FSub-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Tests](https://img.shields.io/badge/Tests-95%2F95_Passing-brightgreen?style=for-the-badge&logo=pytest&logoColor=white)](tests/)
[![Architecture](https://img.shields.io/badge/Architecture-Clean%20%2F%20Event--Driven-blueviolet?style=for-the-badge)]()

</div>

---

## 📖 Table of Contents
- [Executive Overview](#-executive-overview)
- [System Architecture](#-system-architecture)
- [Monorepo Structure](#-monorepo-structure)
- [Core Architectural Guarantees](#-core-architectural-guarantees)
- [Role-Based Workspaces](#-role-based-workspaces)
- [Multimodal AI Triage Engine](#-multimodal-ai-triage-engine)
- [Automated Test Suite (95/95 Passing)](#-automated-test-suite-9595-passing)
- [Quickstart Guide](#-quickstart-guide)
  - [1. Infrastructure (Docker)](#1-infrastructure-docker)
  - [2. Backend API Service](#2-backend-api-service)
  - [3. Web Application](#3-web-application)
  - [4. Mobile React Native App & APK](#4-mobile-react-native-app--apk)
- [Demo Credentials](#-demo-credentials-synthetic-fixtures)
- [API Reference Overview](#-api-reference-overview)
- [Security & Compliance](#-security--compliance)

---

## 🚨 Executive Overview

**ResQAi** is a high-availability, fault-tolerant emergency response and operational coordination system designed for university campuses, industrial complexes, and localized municipalities. 

It unifies **Citizen SOS Telemetry**, **Spatial Incident Auto-Clustering**, **Multimodal AI Risk Assessment**, and **Human-in-the-Loop (HITL) Dispatch Authority** into a single cohesive, production-grade ecosystem.

### Core Tenet
> **AI provides rapid decision support; human operators retain absolute dispatch authority.** Autonomous agents can never deploy physical responders without explicit human sign-off.

---

## 🏛️ System Architecture

```
                                  ┌──────────────────────────────┐
                                  │      Client Applications     │
                                  └──────────────┬───────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   │                                                           │
                   ▼                                                           ▼
       🖥️ Web App (`apps/web`)                                    📱 Mobile App (`apps/mobile`)
    React 18 + Vite + Tailwind + Leaflet                      React Native 0.86 + Expo 57 (Native Android)
    • Operator Command Center                                 • Citizen SOS & One-Tap Incident Wizard
    • Admin Security & Geofence Console                       • Field Responder Turn-by-Turn Console
                   │                                                           │
                   └─────────────────────────────┬─────────────────────────────┘
                                                 │ HTTPS / WSS
                                                 ▼
                                  ┌──────────────────────────────┐
                                  │  FastAPI Backend Gateway     │
                                  │       (`services/api`)       │
                                  └──────────────┬───────────────┘
                                                 │
          ┌──────────────────────────────────────┼──────────────────────────────────────┐
          │                                      │                                      │
          ▼                                      ▼                                      ▼
┌───────────────────┐                  ┌───────────────────┐                  ┌───────────────────┐
│   PostgreSQL 16   │                  │      Redis 7      │                  │     MinIO S3      │
│     + PostGIS     │                  │  Pub/Sub & Cache  │                  │   Asset Storage   │
├───────────────────┤                  ├───────────────────┤                  ├───────────────────┤
│ • Spatial Clusters│                  │ • WebSocket Bus   │                  │ • Incident Photos │
│ • Outbox Events   │                  │ • Token Denylist  │                  │ • Voice Notes     │
│ • Append-Only Logs│                  │ • Rate Limiting   │                  │ • Direct Presigned│
└───────────────────┘                  └───────────────────┘                  └───────────────────┘
          │                                      ▲
          ▼                                      │
┌───────────────────┐                            │
│   Celery Worker   │────────────────────────────┘
│  AI Triage Queue  │
└───────────────────┘
```

---

## 📦 Monorepo Structure

```text
ResQAi/
├── docker-compose.yml              # Production infrastructure (PostGIS, Redis, MinIO)
├── docs/                           # Architecture specs, verification sign-offs & contracts
│   ├── api-contract.md             # Complete OpenAPI / JSON schema specification
│   ├── backend-build-pack.md       # 9-phase system architectural build plan
│   ├── frontend-integration-guide.md # Web & Mobile connection guide
│   └── verification-report.md      # 95/95 automated test sign-off report
│
├── services/api/                   # FastAPI Production Backend Service
│   ├── alembic.ini                 # Spatial migration configuration
│   ├── Dockerfile                  # Production container definition
│   ├── requirements.txt            # Python dependencies
│   ├── app/
│   │   ├── main.py                 # ASGI entrypoint & router registry
│   │   ├── core/                   # Security, Outbox, Redis, Session & Middleware
│   │   ├── models/                 # SQLAlchemy 2.0 async PostGIS entities
│   │   ├── ai/                     # Multimodal AI pipeline & Celery tasks
│   │   └── modules/                # Domain routers (auth, citizen, operator, responder, admin, analytics)
│   ├── migrations/                 # PostGIS schema revisions
│   ├── scripts/seed.py             # Deterministic synthetic demo database seeder
│   └── tests/                      # Pytest suite (Unit, Integration, E2E T1–T25)
│
├── apps/web/                       # Web Application (React 18, Vite, Tailwind CSS)
│   ├── src/features/citizen/       # SOS beacon, report forms, nearby alert feeds
│   ├── src/features/operator/      # Triage queue, interactive Leaflet PostGIS map, incident workspace
│   ├── src/features/responder/     # Active dispatch offers, status transitions, GPS telemetry
│   └── src/features/admin/         # Responder vetting, polygon geofence editor, append-only audit log
│
└── apps/mobile/                    # Dedicated Native Mobile Application (React Native / Expo 57)
    ├── android/                    # Compiled Android native project (Hermes + Fabric C++)
    ├── src/config/api.ts           # Dynamic backend address resolution & demo auth
    ├── src/services/api.ts         # Native REST client for FastAPI endpoints
    ├── src/services/realtime.ts    # Native WebSocket gateway listener with auto-reconnect
    ├── src/screens/citizen/        # Native SOS radar, camera hazard reporting, trusted contacts
    └── src/screens/responder/      # Native turn-by-turn navigation & live dispatch actions
```

---

## 🔒 Core Architectural Guarantees

1. **Transactional Outbox & Zero-Drop Ingestion**:
   - Sub-second SOS beacons return `HTTP 201 Created` immediately.
   - Outbox events are transactionally committed with the report and relayed asynchronously. Celery worker outages never block citizen report ingestion.
2. **PostGIS 150m Spatial Auto-Clustering**:
   - High-performance spatial queries (`ST_DWithin`) automatically link incoming reports occurring within 150 meters and 10 minutes into a single tactical incident to prevent control room saturation.
3. **Pluggable Multimodal AI with Failure Isolation**:
   - Pluggable background adapters handle text classification, voice transcription, and fire/smoke vision detection.
   - Any AI model failure sets `processingState="ai_failed"` with `reviewRequired=True`—preserving the human triage workflow without crashing.
4. **Human-in-the-Loop (HITL) Dispatch Authority**:
   - Autonomous routines and unvetted accounts are strictly prohibited from dispatching units (`HTTP 403 Forbidden`).
   - Dispatches generate 90-second expiring offers. If unanswered, the system automatically rolls over to the next optimal responder.
5. **Real-Time Dual-Channel WebSocket Gateway**:
   - Starlette ASGI WebSocket server (`/ws?token=...`) enforces strict channel isolation: citizens receive only their personal alerts and coarsened safety warnings; tactical operator discussions and responder coordinates are never broadcast to public sockets.
   - Reconnection supports historical event replay via `?since=<iso8601>`.
6. **Append-Only Immutable Security Ledger**:
   - Zero mutation or deletion routes exist for audit logs (`HTTP 405 Method Not Allowed`). Every status change, dispatch, and vetting action is permanently recorded.

---

## 👥 Role-Based Workspaces

| Role | Workspace | Key Functionalities |
| :--- | :--- | :--- |
| **Citizen** | Mobile App / Web | One-touch concentric SOS radar, camera hazard reporting, live report status tracker, coarsened nearby incident feed, trusted contacts circle. |
| **Operator** | Web Command Center | Spatial Leaflet map, incoming report triage queue, duplicate incident merger, AI evidence breakdown, ranked responder dispatch recommendation. |
| **Responder** | Mobile Handheld / Web | Instant dispatch notifications with 90s countdown, one-tap accept/decline, turn-by-turn navigation, on-scene status transitions, live GPS pinging. |
| **Admin** | Web Admin Console | Responder credential vetting directory, campus operational geofence polygon manager, immutable security audit logs, real-time KPI metrics. |

---

## 🤖 Multimodal AI Triage Engine

The backend AI pipeline (`services/api/app/ai/`) processes incoming citizen media asynchronously:

- **Text Classifier**: Categorizes incident urgency and domain (fire, medical, accident, flood, hazard) with confidence scoring.
- **Voice Transcriber**: Pluggable integration with `faster-whisper` (CTranslate2) converting voice notes into structured text.
- **Vision Hazard Detector**: Transfer-learning vision classifier (PyTorch MobileNetV3 / ResNet-50) identifying active fire and smoke plumes.
- **Duplicate Incident Matcher**: Computes spatial distance + time decay + text cosine similarity to flag duplicate submissions for operator review.

---

## 🧪 Automated Test Suite (95/95 Passing)

Every tier of the system is guarded by automated regression and end-to-end tests:

```text
============================= test session starts =============================
platform win32 -- Python 3.13.3, pytest-8.3.4, pluggy-1.5.0
rootdir: F:\ResQAi\services\api
configfile: pytest.ini

tests/unit/test_foundation.py ....                                       [ 4%]
tests/integration/test_auth.py ...........                               [15%]
tests/integration/test_citizen_reports.py ..........                     [26%]
tests/integration/test_operator.py ..........                            [36%]
tests/integration/test_dispatch_responder.py ..........                  [47%]
tests/integration/test_admin_analytics.py ..........                     [57%]
tests/integration/test_ai_pipeline.py .........                          [67%]
tests/integration/test_realtime_websocket.py ......                      [73%]
tests/e2e/test_must_pass_t1_t25.py .........................             [100%]

============================= 95 passed in 11.56s =============================
```

### 25 Must-Pass Verification Scenarios (T1 – T25)
- **T1–T5**: Ingestion under Celery outage, idempotency key deduplication, RBAC token enforcement.
- **T6–T9**: Responder vetting gates, PostGIS 150m spatial auto-clustering, state transition matrix.
- **T10–T14**: AI model failure isolation, 90s dispatch auto-expiry, cross-responder authorization.
- **T15–T18**: Sub-2s WebSocket event latency, channel isolation, event replay via `?since=...`.
- **T19–T25**: Append-only audit security, media MIME validation, coarsened privacy geofencing, Shapely polygon validation.

---

## ⚡ Quickstart Guide

### 1. Infrastructure (Docker)
Start the PostgreSQL 16 + PostGIS, Redis 7, and MinIO S3 containers:
```powershell
docker compose up -d
```
Verify running containers:
```powershell
docker compose ps
```

### 2. Backend API Service
From the repository root:
```powershell
cd services/api

# 1. Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Apply PostGIS database migrations
alembic upgrade head

# 4. Seed demo users and campus geofences
python scripts/seed.py

# 5. Start the API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Docs will be live at:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
- **Health Check**: `http://localhost:8000/api/v1/health`

### 3. Web Application
In a separate terminal:
```powershell
cd apps/web

# Install packages
npm install

# Start Vite development server
npm run dev
```
Open **`http://localhost:5173`** in your browser.

### 4. Mobile React Native App & APK
The mobile app is a dedicated React Native 0.86 / Expo 57 native Android project:
```powershell
cd apps/mobile

# Start Metro bundler (for rapid live-reload testing with Expo Go)
npm run start

# Run directly on a connected USB device or Android Studio Emulator
npm run android

# Build a release/debug APK from the command line
npm run build:apk
```

#### Android Studio:
Open the native project directly in Android Studio at:
```
F:\ResQAi\apps\mobile\android
```
Select your phone/emulator and hit **▶ Run** (or **Build ➔ Build APK(s)**).

---

## 🔑 Demo Credentials (Synthetic Fixtures)

All accounts are pre-seeded with password **`demo1234`**:

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Citizen** | `citizen@campus.demo` | `demo1234` | Citizen Portal (SOS, Reports, Nearby Alerts) |
| **Field Responder** | `responder@campus.demo` | `demo1234` | Responder Console (Active Missions, Navigation) |
| **Dispatch Operator** | `operator@campus.demo` | `demo1234` | Command Center (Triage Queue, Dispatch Matrix) |
| **Campus Admin** | `admin@campus.demo` | `demo1234` | Admin Console (Vetting, Geofences, Audit Ledger) |

---

## 📡 API Reference Overview

| Module | Method | Endpoint | Description |
| :--- | :---: | :--- | :--- |
| **System** | `GET` | `/api/v1/health` | Health probe (API, PostgreSQL, PostGIS, Redis) |
| **Auth** | `POST` | `/api/v1/auth/login` | Authenticate and obtain JWT access + refresh tokens |
| **Auth** | `GET` | `/api/v1/auth/me` | Fetch active user profile and roles |
| **Citizen** | `POST` | `/api/v1/citizen/sos` | Rapid sub-second emergency SOS beacon submission |
| **Citizen** | `POST` | `/api/v1/citizen/reports` | Submit structured incident report with GPS coordinates |
| **Citizen** | `GET` | `/api/v1/citizen/reports` | List reports submitted by the authenticated citizen |
| **Citizen** | `GET` | `/api/v1/citizen/alerts` | Fetch nearby privacy-coarsened active campus advisories |
| **Operator**| `GET` | `/api/v1/operator/reports/queue` | Incoming unreviewed incident report triage queue |
| **Operator**| `GET` | `/api/v1/operator/incidents` | List active incidents sorted by priority urgency |
| **Operator**| `POST` | `/api/v1/operator/actions/dispatch` | Human-in-the-loop responder dispatch confirmation |
| **Responder**| `GET` | `/api/v1/responder/assignments` | Active assignment queue for authenticated responder |
| **Responder**| `POST` | `/api/v1/responder/offers/{id}/respond` | Accept or decline 90-second dispatch offer |
| **Responder**| `POST` | `/api/v1/responder/location-ping` | Live responder GPS coordinate telemetry ingestion |
| **Admin** | `GET` | `/api/v1/admin/audit-logs` | Immutable, append-only security and operational audit trail |
| **Realtime**| `WSS` | `/ws?token=<jwt>` | Real-time isolated WebSocket broadcast gateway |

---

## 🛡️ Security & Compliance

- **Zero Secret Commits**: All passwords, API secrets, and JWT private keys are strictly quarantined in `.env` files and excluded via `.gitignore`.
- **Zero Binary Bloat**: Large APK binaries (`dist_apk/`) and C++ build intermediates (`.cxx/`, `.gradle/`) are excluded from version control.
- **Privacy Coarsening**: Citizens only receive spatial coordinates coarsened to a 100m grid for nearby advisories to protect private reporter locations.
- **Vetting Gate**: Responders must be marked `is_approved = true` in the administrative directory before they can receive or accept tactical missions.

---

<div align="center">
<b>ResQAi / SENTINELGRID</b> • Built for resilient, reliable emergency coordination.
</div>
