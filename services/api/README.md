# ResQAi / SENTINELGRID — Backend API Service

**High-performance, asynchronous emergency coordination, multimodal AI triage, and real-time dispatch gateway.**

Campus and community emergency response backend built with **FastAPI**, **PostgreSQL 16 + PostGIS**, **Redis 7**, **Celery**, and **MinIO S3**.

---

## 🚀 Current Status

| Component | Status | Description |
| :--- | :---: | :--- |
| **FastAPI Core** | 🟢 **Live** | REST API v1 (`/api/v1`) with dual `camelCase` & `snake_case` schema support |
| **WebSocket Gateway** | 🟢 **Live** | ASGI real-time gateway (`/ws?token=...`) with channel isolation & replay |
| **Spatial PostGIS** | 🟢 **Active** | 150m spatial auto-clustering (`ST_DWithin`) & Shapely geofence validation |
| **AI Triage Pipeline** | 🟢 **Active** | Celery background triage with failure isolation (text, voice, vision, duplicates) |
| **Audit Ledger** | 🟢 **Secured** | Append-only security and dispatch ledger (zero mutation endpoints) |
| **Automated Tests** | 🟢 **100% Pass** | **95/95 tests passing** (including all 25 T1–T25 Must-Pass verification scenarios) |
| **Frontend Connectivity**| 🟢 **Zero-Mock** | Fully connected to `apps/web` with `VITE_USE_MOCK_API=false` |

---

## 🏛️ Architecture & Core Guarantees

1. **Decoupled Ingestion & Transactional Outbox**:
   - SOS beacons and incident reports return `HTTP 201 Created` in under 1 second.
   - Outbox events are claimed via `SELECT ... FOR UPDATE SKIP LOCKED` so worker outages never drop citizen submissions.
2. **PostGIS Spatial Auto-Clustering**:
   - Incoming reports submitted within 150 meters and 10 minutes of an active incident are automatically linked into cohesive tactical incidents.
3. **Multimodal AI Pipeline with Failure Isolation**:
   - Async background workers run pluggable inference adapters for text classification, voice transcription, and fire/smoke vision detection.
   - Inference errors set `processingState="ai_failed"` with `reviewRequired=True` and preserve reports in the queue for human triage.
4. **Human-in-the-Loop (HITL) Dispatch Authority**:
   - Automated routines and non-operator users are strictly forbidden from dispatching responders (`HTTP 403`).
   - Only vetted operators can dispatch units; dispatch offers enforce a strict 90-second response window with auto-expiry.
5. **Real-time Dual-Channel Gateway**:
   - Citizens receive only their personal report progression and coarsened privacy alerts.
   - Tactical operator dispatches and unit locations are never broadcast to citizen sockets.
   - Supports historical event replay via `?since=<iso8601>`.

---

## 🛠️ Technology Stack

- **Framework**: Python 3.13, FastAPI, Starlette, Uvicorn
- **Database & Spatial**: PostgreSQL 16 + PostGIS 3.4, SQLAlchemy 2.0 (asyncio), GeoAlchemy2, Shapely, Alembic
- **Cache & Pub/Sub**: Redis 7 (Token blacklist, rate limiting, event broadcasting)
- **Background Tasks**: Celery 5.4 + Redis broker
- **Object Storage**: MinIO S3 (Presigned direct upload with MIME & 15MB size enforcement)
- **Authentication**: JWT (Access + Refresh tokens with rotation), Argon2 password hashing
- **Testing**: Pytest, pytest-asyncio, HTTPX, httpx-ws

---

## 📦 Directory Structure

```text
services/api/
├── alembic.ini                  # Alembic database migration configuration
├── Dockerfile                   # Production container definition
├── requirements.txt             # Python dependencies
├── pytest.ini                   # Pytest runner configuration
├── scripts/
│   └── seed_demo_data.py        # Provisions test users, campus geofences, and seed incidents
├── migrations/
│   ├── env.py                   # Alembic environment runner
│   └── versions/                # PostGIS spatial schema migrations
├── app/
│   ├── main.py                  # FastAPI application entrypoint & router registry
│   ├── core/                    # Security, JWT, Redis, DB session, Outbox & Middleware
│   ├── common/                  # Spatial geometry helpers (point_to_wkt, extract_lat_lng)
│   ├── models/                  # SQLAlchemy entities (User, Report, Incident, Assignment, AuditLog)
│   ├── ai/                      # Multimodal pipeline, Celery tasks, and model adapters
│   └── modules/                 # Domain feature modules:
│       ├── auth/                # Login, registration, token refresh, and logout
│       ├── citizen/             # SOS beacon, report submission, nearby alerts, trusted contacts
│       ├── operator/            # Ingestion queue, command center, dispatch, state matrix, merge/split
│       ├── responder/           # Active assignments, offer accept/decline, GPS telemetry ping
│       ├── admin/               # Responder vetting gate, geofence polygon CRUD, drill mode, audit logs
│       ├── analytics/           # Real-time KPI summaries, GeoJSON hotspots, category breakdowns
│       ├── media/               # MinIO S3 presigned PUT URL generation and upload confirmation
│       └── realtime/            # WebSocket gateway (/ws?token=...), room multiplexing, event replay
└── tests/
    ├── conftest.py              # Test database session, Redis mock, and client fixtures
    ├── unit/                    # Core foundation, spatial helpers, and health check tests
    ├── integration/             # Role-specific integration test suites (70 tests)
    └── e2e/                     # End-to-end must-pass scenarios T1 through T25 (25 tests)
```

---

## ⚡ Quickstart: Running the Backend

### 1. Prerequisites
- Python 3.12 or 3.13
- Docker & Docker Compose

### 2. Start Core Infrastructure
From the repository root, start PostgreSQL (with PostGIS), Redis, and MinIO:

```bash
docker compose up -d
```

### 3. Setup Python Virtual Environment
Navigate to `services/api/`:

```powershell
cd services/api

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### 4. Run Database Migrations
Apply PostGIS spatial migrations:

```powershell
alembic upgrade head
```

### 5. Seed Demo Accounts & Fixtures
Load pre-configured demo users, campus incidents, and responder profiles:

```powershell
python scripts/seed_demo_data.py
```

### 6. Start the Background Celery Worker
In a separate terminal:

```powershell
cd services/api
.\.venv\Scripts\Activate.ps1
celery -A app.ai.celery_tasks worker --loglevel=info -P solo
```

### 7. Launch the FastAPI Server
In your primary terminal:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🔑 Pre-Seeded Demo Accounts (Password: `demo1234`)

All accounts are pre-seeded and ready for live authentication:

| Role | Email | Password | Primary Permissions & Views |
| :--- | :--- | :--- | :--- |
| **Operator** | `operator@campus.demo` | `demo1234` | Command Center, Ingestion Queue, Dispatch Workspace, Merge/Split |
| **Admin** | `admin@campus.demo` | `demo1234` | Responder Vetting, Audit Log Explorer, Geofence Config, Drill Mode |
| **Responder** | `responder@campus.demo` | `demo1234` | Approved Fire/Rescue Unit (F-2), Mission Accept/Decline, Telemetry |
| **Patrol Unit**| `patrol07@campus.demo` | `demo1234` | Approved Security Patrol (P-07), Mission Execution |
| **Citizen** | `citizen@campus.demo` | `demo1234` | SOS Beacon, Incident Reporting, Status Receipts, Coarsened Alerts |

---

## 📖 Interactive API Documentation

Once the server is running, explore and test endpoints in your browser:

- **Swagger UI**: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)
- **ReDoc Interactive**: [http://localhost:8000/api/v1/redoc](http://localhost:8000/api/v1/redoc)
- **OpenAPI Schema**: [http://localhost:8000/api/v1/openapi.json](http://localhost:8000/api/v1/openapi.json)
- **System Health Probe**: [http://localhost:8000/health](http://localhost:8000/health)

---

## 🧪 Running Automated Tests

Run the complete 95-test regression suite:

```powershell
cd services/api
.\.venv\Scripts\pytest.exe -v
```

Run only the 25 Must-Pass Verification Scenarios (T1–T25):

```powershell
.\.venv\Scripts\pytest.exe -v tests/e2e/test_must_pass_t1_t25.py
```

Run module-specific test suites:

```powershell
# Auth & RBAC
.\.venv\Scripts\pytest.exe -v tests/integration/test_auth.py

# Citizen & SOS
.\.venv\Scripts\pytest.exe -v tests/integration/test_citizen_reports.py

# Operator Command Center
.\.venv\Scripts\pytest.exe -v tests/integration/test_operator.py

# Real-time WebSockets
.\.venv\Scripts\pytest.exe -v tests/integration/test_realtime_websocket.py
```

---

## 🔗 Related Documentation

- **[Master Build Pack](file:///f:/ResQAi/docs/backend-build-pack.md)**: Architectural specifications and contract requirements.
- **[API Contract Specification](file:///f:/ResQAi/docs/api-contract.md)**: Detailed endpoint schemas and state transition matrices.
- **[Frontend Integration Guide](file:///f:/ResQAi/docs/frontend-integration-guide.md)**: Connecting `apps/web` and `apps/mobile` with zero mocks.
- **[Verification Report](file:///f:/ResQAi/docs/verification-report.md)**: Full verification report and T1–T25 scenario matrix outcomes.
- **[Progress Tracker](file:///f:/ResQAi/docs/PROGRESS.md)**: Chronological phase completion records and Architectural Decision Log (ADL).
