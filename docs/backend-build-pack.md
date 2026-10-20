# Backend Build Pack: ResQAi / SENTINELGRID
**Version 2.1 — Production Specification & AI Agent Playbook**  
*Fully Aligned with Live Frontend Contract, Complete State Machine, and Strict Governance*

---

## 1. How to Use This Document

1. **Shared Foundation**: Read **Sections 2, 3, and 4** first. These define the verified data contracts, architecture rules, state machines, and modular folder structure.
2. **Master Agent Prompt**: Copy the **Master Prompt (Section 5.1)** into the AI coding agent's session at the start of every session.
3. **Phased Execution**: Execute **Phases 0 through 9 (Section 5.2)** sequentially. Execute only one phase per git branch.
4. **Mandatory Exit Checks**: Before merging any phase, execute that phase's automated test suite and exit criteria. Never start the next phase until all exit checks pass.
5. **State Tracking**: Update [`docs/PROGRESS.md`](file:///f:/ResQAi/docs/PROGRESS.md) at the start and completion of each phase so the agent and team never lose context across sessions.
6. **System Validation**: When all phases are done, execute the **Comprehensive Test Plan (Section 7)** and verify the **Handoff Checklist (Section 8)**.

> **Role Separation**: The AI coding agent writes the code, migrations, and tests in `services/api/`. A human engineer reviews each phase PR, runs tests independently, and approves merges. Frontend changes are proposed for human approval and never modified without explicit consent.

---

## 2. Current State & Frontend Contract Alignment

### 2.1 Ecosystem Inventory
| Component | What Already Exists | What We Are Building |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite PWA (`apps/web`), Expo React Native (`apps/mobile`) running on typed synthetic mock stores (`mock-api.ts`, `mock-store.ts`). | Production API integration (flip `VITE_USE_MOCK_API=false`). |
| **Backend Core** | FastAPI skeleton in `services/api`, BaseSettings, async SQLAlchemy engine, Argon2 hasher, JWT decoder, health check. | Modular feature architecture, Alembic migrations, Redis rate limiters, token blacklist, structured logging, error envelopes. |
| **Data Layer** | ORM entities in `services/api/app/models/entities.py`, Docker Compose with PostgreSQL 16 + PostGIS 3.4, Redis 7, MinIO. | GiST spatial indexes, B-tree foreign key/status indexes, Alembic migration history, seed script for demo accounts. |
| **Endpoints** | `/health` only. | Full RESTful `/api/v1` suite matching frontend feature APIs. |
| **Async & AI** | Mock client-side ML bridge (`mlBridge.ts`), Celery in `requirements.txt`. | Celery workers, outbox relay with `SKIP LOCKED`, AI adapter interfaces (Text, Whisper, Vision, Duplicates). |
| **Realtime** | WebSocket client hook in frontend (`useWebSocket.ts`, `WebSocketContext.tsx`). | FastAPI WebSocket gateway with Redis Pub/Sub outbox broadcaster and replay. |

---

### 2.2 Verified Frontend Contract Mappings

#### A. Category Harmonization Decision
- **Web App Enum** (`apps/web/src/types/incident.ts`): `"fire_smoke" | "road_accident" | "medical" | "personal_safety" | "other"`
- **Mobile App Enum** (`apps/mobile/src/types/index.ts`): `"fire_smoke" | "road_accident" | "water_flood" | "medical" | "personal_sos" | "hazard"`
- **Team Resolution**: The backend database and API validate the comprehensive union enum:
  `"fire_smoke" | "road_accident" | "medical" | "personal_safety" | "water_flood" | "hazard" | "other"`.
  `personal_sos` maps to `personal_safety`. `water_flood` is natively supported across the backend and PostGIS spatial clustering, ensuring full compatibility with both Web and Mobile apps.

#### B. Comprehensive Incident State Machine
The incident lifecycle guarantees human oversight and auditability across all branches:

```
                  ┌───────────────┐
                  │   reported    │
                  └───────┬───────┘
          ┌───────────────┼───────────────┬────────────────┐
          ▼               ▼               ▼                ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  ┌─────────────┐
   │under_review │ │  cancelled  │ │  duplicate  │  │ unverified  │
   └──────┬──────┘ └─────────────┘ └─────────────┘  └──────┬──────┘
          │ (verified by operator)                         │ (new evidence)
          ▼                                                ▼
   ┌─────────────┐                                  ┌─────────────┐
   │  confirmed  │ ◄────────────────────────────────┤under_review │
   └──────┬──────┘                                  └─────────────┘
          │ (dispatch offer accepted)
          ▼
   ┌─────────────┐
   │  assigned   │ ◄──── (responder abort / reassign)
   └──────┬──────┘
          │ (responder status: en_route)
          ▼
   ┌─────────────┐
   │  en_route   │
   └──────┬──────┘
          │ (responder status: arrived)
          ▼
   ┌─────────────┐
   │  on_scene   │
   └──────┬──────┘
          │ (incident mitigated)
          ▼
   ┌─────────────┐
   │  resolved   │ ────► ┌─────────────┐
   └─────────────┘       │   closed    │ (archived)
                         └─────────────┘
```

**Full Transition Matrix**:
| Current State | Allowed Next States | Trigger / Authority |
| :--- | :--- | :--- |
| `reported` | `under_review`, `cancelled`, `duplicate`, `unverified` | System ingestion / Operator triage |
| `under_review` | `confirmed`, `unverified`, `cancelled`, `duplicate` | Operator verification only |
| `confirmed` | `assigned`, `under_review`, `cancelled` | Operator dispatch offer / review reopen |
| `assigned` | `en_route`, `confirmed` (unassigned), `cancelled` | Responder en route / Operator reassignment |
| `en_route` | `on_scene`, `assigned` (route aborted) | Responder location telemetry & status |
| `on_scene` | `resolved`, `en_route` (relocating) | Responder on-scene report |
| `resolved` | `closed`, `under_review` (reopened by operator) | Operator sign-off |
| `unverified` | `under_review`, `closed` | Corroborating evidence arrival / Operator closure |
| `cancelled` | *Terminal* (Read-only) | Operator or Citizen pre-dispatch cancel |
| `duplicate` | *Terminal* (Linked to Master Incident) | Operator merge action |
| `closed` | *Terminal* (Archived) | Operator administrative closure |

*Any transition not explicitly listed in the matrix above must be rejected with HTTP 400 Bad Request.*

#### C. Comprehensive Assignment State Machine
```
   ┌─────────────┐
   │   offered   │ ────► [expired]   (90s deadline exceeded -> escalates)
   └──────┬──────┘ ────► [declined]  (responder declined with reason)
          │        ────► [cancelled] (operator revoked offer)
          ▼ (responder accepts)
   ┌─────────────┐
   │  accepted   │ ────► [cancelled] (operator reassigned)
   └──────┬──────┘ ────► [failed]    (vehicle failure / unreachable)
          │
          ▼
   ┌─────────────┐
   │  en_route   │ ────► [failed]    (route blocked / unit incapacitated)
   └──────┬──────┘ ────► [cancelled] (stand-down ordered by operator)
          │
          ▼
   ┌─────────────┐
   │   arrived   │ ────► [failed]    (equipment failure on scene)
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │  completed  │ (Terminal)
   └─────────────┘
```

**Assignment `failed` Definition**: A unit in `accepted`, `en_route`, or `arrived` experiences a mechanical failure, medical emergency, or severe impediment preventing mission completion. Transitioning to `failed` triggers an immediate outbox notification alerting the operator and prompting automatic or manual candidate re-escalation.

#### D. Citizen Report States (`types/report.ts` & `types/common.ts`)
- **Processing States**: `received`, `queued_for_ai`, `ai_complete`, `ai_failed`, `cancelled`
- **Delivery States**: `local_saved`, `queued`, `received_by_server`
- **Report Channels**: `sos`, `form`, `voice`

#### E. AI Evidence Labels (`types/common.ts`)
`unverified`, `insufficient_evidence`, `possible_duplicate`, `conflicting_evidence`, `confirmed_by_operator`, `false_or_malicious_after_review`.

#### F. WebSocket Event Envelope (`types/websocket.ts`)
```json
{
  "id": "evt_uuid",
  "type": "report.received" | "incident.updated" | "assignment.offered" | "assignment.updated" | "ai.assessment.ready",
  "occurredAt": "2026-10-20T09:30:00.000Z",
  "incidentId": "inc_402",
  "payload": {}
}
```

#### G. User Roles, Onboarding & Demo Credentials
- **Roles**: `citizen`, `responder`, `operator`, `admin`
- **Onboarding Route Decision**:
  - `citizen`: Self-registers publicly via `POST /api/v1/auth/register`. Immediate active access.
  - `responder`: Self-registers with `role="responder"` via `POST /api/v1/auth/register`. Account created with `is_approved=False`. Can log in to view profile, but **cannot view, receive, or accept mission assignments** until vetted and approved by an Admin via `POST /api/v1/admin/responders/{id}/approve`.
  - `operator` & `admin`: Cannot self-register. Created exclusively via database seed or Admin user provisioning.
- **Demo Accounts** (Password: `demo1234`):
  - Citizen: `citizen@campus.demo`
  - Responder: `responder@campus.demo`
  - Operator: `operator@campus.demo`
  - Admin: `admin@campus.demo`

---

## 3. Non-Negotiable Ground Rules

1. **Human-in-the-Loop Authority**: AI models only advise. Only an authenticated operator can verify an incident, dispatch responders, or document a false report. Any automated dispatch attempt by background code must be rejected with HTTP 403.
2. **SOS Never Waits for AI**: `POST /api/v1/citizen/sos` must persist the report, queue the outbox event, and return HTTP 201 in under 1 second. AI pipelines execute asynchronously in Celery workers.
3. **AI Failure Is Not System Failure**: If an AI model times out or errors, the report remains visible in the operator queue flagged with `reviewRequired=true` and `ai_failed`.
4. **Append-Only Deduplication**: Suspected duplicate reports are linked into an incident grouping. Original reports, notes, and raw media are never deleted.
5. **Immutable Audit Trail**: All sensitive operator actions (`VERIFY_INCIDENT`, `DISPATCH_OFFER`, `MERGE_REPORTS`, `OVERRIDE_AI`, `APPROVE_RESPONDER`, `FAILED_LOGIN`) write to `audit_logs`. The table has no update or delete endpoints.
6. **Strict Server-Side RBAC**: Client requests cannot be trusted. Every endpoint enforces role decorators (`require_roles`) and object-level permission checks (citizens access only their reports; responders access only assigned tasks).
7. **Privacy by Default**: Public citizen alert feeds must return coarsened coordinates (`st_snaptogrid` / rounded lat/lng). Anonymous reports strip reporter identity from responder views.
8. **Transactional Outbox with Safe Concurrency**: All cross-service events must be committed to `outbox_events` in the same transaction as entity changes. The relay claims rows using `SELECT ... FOR UPDATE SKIP LOCKED` to prevent duplicate concurrent publishing across multiple instances.
9. **No Pretend Integrations**: External SMS (Twilio), CAD, or 112 emergency services must sit behind typed adapter interfaces with explicit `[SIMULATED]` labels until certified.
10. **Zero Plaintext Credentials**: Passwords must use Argon2id. Tokens must use HMAC-SHA256 with rotation. No secrets in logs.

---

## 4. Modular Backend Folder Structure

The backend structure directly reflects the frontend feature modules (`apps/web/src/features/*`), with clean separation of domain concerns, test suites, and token stores:

```
services/api/
├── Dockerfile                           # Python 3.11-slim (compatible with Python 3.11 - 3.13)
├── requirements.txt
├── alembic.ini
├── migrations/
│   ├── env.py
│   └── versions/
│       └── 0001_initial_postgis_schema.py
├── scripts/
│   ├── seed.py                          # Demo accounts, geofence polygon, synthetic incidents
│   └── test_local.py                    # Smoke testing utility
├── tests/                               # Comprehensive Automated Test Suite
│   ├── conftest.py                      # Async fixtures, isolated PostGIS test db, auth headers
│   ├── unit/                            # State machine, Haversine, permissions, adapter tests
│   ├── integration/                     # Endpoint tests per role, outbox tests, rate limiting
│   └── e2e/                             # Full mission cycles, clustering, and recovery scenarios
│
└── app/
    ├── main.py                          # FastAPI app entry point, middleware & router mounts
    │
    ├── core/                            # Cross-cutting infrastructure
    │   ├── config.py                    # Settings & env loading (BaseSettings)
    │   ├── database.py                  # Async SQLAlchemy session factory & engine
    │   ├── security.py                  # JWT creation, Argon2 hashing, password verification
    │   ├── token_store.py               # Redis-backed token blacklist & refresh token rotation store
    │   ├── outbox.py                    # Transactional outbox writer & SKIP LOCKED claim runner
    │   ├── logging.py                   # Structured JSON logging with request tracing
    │   ├── middleware.py                # Request ID (X-Request-Id), timing, CORS
    │   ├── exceptions.py                # Standard error envelope: { "code": "...", "message": "..." }
    │   └── redis.py                     # Redis connection pool & rate limiters
    │
    ├── common/                          # Reusable models & spatial helpers
    │   ├── enums.py                     # Role, IncidentCategory, Urgency, DeliveryState, etc.
    │   ├── schemas.py                   # GeoPointSchema, PaginatedResponse, ApiErrorResponse
    │   └── spatial.py                   # GeoJSON & PostGIS WKB serializers, distance calculations
    │
    ├── models/                          # Database ORM entities (SQLAlchemy + GeoAlchemy2)
    │   ├── user.py                      # User & TrustedContact
    │   ├── operating_area.py            # OperatingArea (Campus/Service geofence polygon)
    │   ├── responder.py                 # ResponderProfile
    │   ├── report.py                    # Report & MediaAsset
    │   ├── incident.py                  # Incident, IncidentReport, IncidentStatusEvent
    │   ├── assignment.py                # Assignment & AssignmentEvent
    │   ├── ai_assessment.py             # AIAssessment
    │   ├── outbox.py                    # OutboxEvent (Transactional outbox)
    │   └── audit.py                     # AuditLog (Immutable audit trail)
    │
    ├── modules/                         # Feature Slices (Mirroring frontend feature slices)
    │   ├── auth/                        # [Frontend: features/auth]
    │   │   ├── router.py                # /auth: register, login, refresh, logout, me
    │   │   ├── schemas.py               # LoginPayload, RegisterPayload, TokenResponse, UserProfileResponse
    │   │   ├── service.py               # Auth logic, password checks, token minting, token revocation
    │   │   └── dependencies.py          # get_current_user, require_roles
    │   │
    │   ├── citizen/                     # [Frontend: features/citizen]
    │   │   ├── router.py                # /citizen: SOS, reports, list mine, get, cancel
    │   │   ├── contacts_router.py       # /citizen/contacts: CRUD (Max 3 trusted contacts)
    │   │   ├── alerts_router.py         # /citizen/alerts: nearby alerts with coarsened locations
    │   │   ├── schemas.py               # ReportCreateRequest, SOSRequest, ReportResponse, ContactSchema
    │   │   └── service.py               # Ingestion, idempotency validation, outbox publishing
    │   │
    │   ├── operator/                    # [Frontend: features/operator]
    │   │   ├── router.py                # /operator: incidents queue, active incidents, detail, responders roster
    │   │   ├── actions_router.py        # /operator/actions: merge, split, state update, AI override, dispatch
    │   │   ├── settings_router.py       # /operator/settings: GET, PUT operator preferences & thresholds
    │   │   ├── duplicates_router.py     # /operator/duplicates: suspect duplicate candidate pairings
    │   │   ├── schemas.py               # IncidentResponse, IncidentDetailResponse, MergeRequest, DispatchOfferRequest
    │   │   └── service.py               # Queue sorting, spatial clustering, state machine transitions
    │   │
    │   ├── responder/                   # [Frontend: features/responder]
    │   │   ├── router.py                # /responder: assignments, history, offer response, status, pings, notes, duty
    │   │   ├── schemas.py               # AssignmentResponse, OfferRespondRequest, StatusUpdateRequest, PingRequest
    │   │   └── service.py               # Mission lifecycle, acceptance countdowns, telemetry tracking
    │   │
    │   ├── admin/                       # [Frontend: features/admin]
    │   │   ├── router.py                # /admin: responder approval, geofence polygon, audit logs, drill mode
    │   │   ├── schemas.py               # ResponderApprovalRequest, OperatingAreaSchema, AuditLogQuery, DrillModeRequest
    │   │   └── service.py               # Responder vetting, polygon updates, audit search, drill mode switches
    │   │
    │   ├── media/                       # [Frontend: evidence / media components]
    │   │   ├── router.py                # /media: upload-url, confirm, access-url
    │   │   ├── schemas.py               # PresignedUrlRequest, PresignedUrlResponse, MediaAssetResponse
    │   │   └── service.py               # MinIO S3 presigned URL generator, MIME & size validator
    │   │
    │   ├── analytics/                   # [Frontend: operator & admin analytics pages]
    │   │   ├── router.py                # /analytics: summary KPIs, hotspots, by-category, response times
    │   │   ├── schemas.py               # AnalyticsSummaryResponse, HotspotFeatureCollection, CategoryBreakdown
    │   │   └── service.py               # SQL aggregations (average response time, volume by category)
    │   │
    │   └── realtime/                    # [Frontend: context/WebSocketContext]
    │       ├── router.py                # WebSocket /ws?token=...
    │       ├── connection_manager.py    # Channel subscriptions (operator, responder:{id}, citizen:{id})
    │       ├── publisher.py             # Outbox poller & Redis pub/sub dispatcher (SKIP LOCKED)
    │       └── schemas.py               # WsEvent matching types/websocket.ts
    │
    ├── ai/                              # AI Subsystem [Frontend: types/ai-evidence.ts & mlBridge.ts]
    │   ├── adapters/                    # Model inference abstraction layer
    │   │   ├── base.py                  # Abstract base classes
    │   │   ├── text_classifier.py       # TF-IDF / Embedding classifier (mock + live model switch)
    │   │   ├── voice_transcriber.py     # Faster-Whisper audio transcription
    │   │   ├── vision_detector.py       # Fire & Smoke PyTorch vision model
    │   │   └── duplicate_matcher.py     # PostGIS ST_DWithin + cosine similarity duplicate detector
    │   └── celery_tasks.py              # Celery task definitions triggered from outbox
    │
    └── routing/                         # Routing Engine [Frontend: responder navigation]
        ├── base.py                      # RoutingProvider interface
        ├── straight_line.py             # Haversine straight-line fallback
        └── osrm.py                      # Open Source Routing Machine integration
```

---

## 5. Agent Prompts

### 5.1 Master Prompt (Provide at the start of every session)

```markdown
You are a senior backend engineer building the production backend for ResQAi / SENTINELGRID, an emergency coordination platform. The frontend (React 18 PWA in apps/web and Expo app in apps/mobile) is running. Your task is to build the FastAPI backend inside services/api so the frontend functions seamlessly with VITE_USE_MOCK_API=false.

Environment:
- Python 3.11+ (tested on Python 3.11 Docker container and Python 3.13 local environment)
- FastAPI (Async), SQLAlchemy 2 (Asyncio), GeoAlchemy2 on PostgreSQL 16 + PostGIS 3.4
- Alembic, Redis 7 (Cache, Broker, Rate Limiting, Token Revocation), Celery 5.4, MinIO (S3), Pydantic v2, Pytest

Strict Ground Rules:
1. Human-in-the-Loop Authority: AI only recommends. Only operators can verify incidents, dispatch units, or flag false alarms. Automated dispatch code is forbidden and rejected with 403.
2. SOS Never Waits for AI: Ingestion stores the report, writes an outbox event, and returns 201 in < 1s. AI tasks run asynchronously via Celery.
3. AI failure must never hide a report: On model failure, set reviewRequired=true and leave the report in the operator triage queue.
4. Duplicate reports are grouped, never deleted: All evidence and reporter linkages are preserved.
5. Append-only audit log: verify, dispatch, merge, override, false alarm, approvals, and failed logins must write to audit_logs. Never provide update or delete paths.
6. Enforce server-side RBAC: Validate roles on every endpoint. Citizens see only their own reports; responders see only their assigned missions.
7. Outbox Pattern with SKIP LOCKED: Outbox events are written in the same transaction as entity changes. The relay worker claims rows using 'SELECT ... FOR UPDATE SKIP LOCKED'.
8. Token Revocation: Blacklisted access tokens and refresh tokens are tracked in Redis.
9. Private media only: Access via short-lived MinIO presigned URLs. Coarsen coordinates in public citizen feeds.
10. Simulated external integrations: 112, SMS, and traffic integrations are simulated behind typed interfaces and labelled [SIMULATED].
11. Never log secrets, passwords, tokens, or raw phone numbers.

Architecture Pattern:
Implement the modular structure specified in docs/backend-build-pack.md:
- Cross-cutting concerns in app/core/ (including token_store.py and outbox.py)
- ORM entities in app/models/
- Domain feature modules in app/modules/{auth,citizen,operator,responder,admin,media,analytics,realtime}
- Tests in tests/conftest.py, tests/unit/, tests/integration/, tests/e2e/

Working Protocol:
Check docs/PROGRESS.md to verify the active phase. Work strictly on the single phase assigned. First restate the phase goals and list all files you will create or edit. Implement cleanly with full type annotations, docstrings, and tests alongside code. Never modify frontend files; propose frontend changes for human approval. Run tests, report results honestly, and update docs/PROGRESS.md upon completing exit criteria.
```

---

### 5.2 Phase-by-Phase Execution Prompts

#### Phase 0: Contract Verification & Baseline Recon
```markdown
Execute Phase 0: Contract Verification & Baseline Recon. Write no application code in this phase.
Tasks:
1. Read apps/web/src/types/ and apps/web/src/features/*/api/ to verify exact schemas, state strings, and payloads.
2. Read apps/web/src/lib/mock-api.ts and lib/mock-store.ts to verify response shapes, pagination, and synthetic data expectations.
3. Verify apps/web/src/config/permissions.config.ts for exact role permissions.
4. Produce docs/api-contract.md listing all proposed endpoints under /api/v1 (Method, Path, Allowed Roles, Request Body, Response Body, Error Responses).
5. Verify category harmonization ('water_flood' union) and state machine rules against existing database entities.
Exit Check: docs/api-contract.md generated and approved; docs/PROGRESS.md updated.
```

#### Phase 1: Foundation (Alembic, Configuration, Error Handling, Seed Data)
```markdown
Execute Phase 1: Foundation.
Tasks:
1. Reorganize ORM models into app/models/ (user.py, operating_area.py, responder.py, report.py, incident.py, assignment.py, ai_assessment.py, outbox.py, audit.py).
2. Initialize Alembic in services/api. Generate the initial migration including PostGIS extension activation ('CREATE EXTENSION IF NOT EXISTS postgis;'). Add GiST indexes on all geometry columns, and B-tree indexes on foreign keys, status, role, and created_at.
3. Implement app/core/middleware.py with request ID tracking (X-Request-Id), performance timing, and CORS configuration from settings.
4. Implement app/core/exceptions.py with standard JSON error envelope: { "code": "ERROR_CODE", "message": "Human readable detail" }.
5. Write scripts/seed.py populating the database with demo users (citizen, responder, operator, admin with password 'demo1234'), a campus boundary polygon, sample responder profiles (F-2, A-12, P-07), and initial incidents.
6. Configure pytest with pytest-asyncio and test database fixtures in tests/conftest.py.
Exit Check: Database boots, alembic upgrade head succeeds on an empty database, seed.py loads without errors, GET /api/v1/health returns healthy status with PostGIS version, and sample test in tests/conftest.py passes.
```

#### Phase 2: Authentication, Token Revocation & Role-Based Access Control
```markdown
Execute Phase 2: Authentication & Access Control.
Tasks:
1. Implement app/core/token_store.py using Redis for token blacklisting (logout) and refresh token rotation tracking.
2. Implement app/modules/auth/ (router.py, schemas.py, service.py, dependencies.py):
   - POST /api/v1/auth/register: Citizen self-registration by default; supports optional role="responder" (created with is_approved=False).
   - POST /api/v1/auth/login: Issues access token (24h dev / 15m prod) + refresh token (7d), returns UserProfileResponse.
   - POST /api/v1/auth/refresh: Validates refresh token in Redis, revokes prior refresh token, issues new pair.
   - POST /api/v1/auth/logout: Blacklists access token in Redis until expiration.
   - GET /api/v1/auth/me: Returns authenticated user profile.
3. Implement server-side role security dependencies in app/modules/auth/dependencies.py reflecting permissions.config.ts.
4. Enforce responder vetting requirement: Responders cannot receive or accept assignments unless is_approved == True.
5. Implement Redis rate limiting on login attempts (5 attempts/min) and write failed login attempts to audit_logs.
Exit Check: Tests pass for registration, login for all 4 roles, token refresh, token logout blacklisting, 401 on tampered/expired tokens, 403 on role mismatch, and rate limiting lockout.
```

#### Phase 3: Citizen Reporting, SOS, Trusted Contacts, Media & Outbox Relay
```markdown
Execute Phase 3: Citizen Reporting, SOS & Outbox Relay.
Tasks:
1. Implement app/core/outbox.py: Function to claim pending outbox events using 'SELECT * FROM outbox_events WHERE status = 'pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 50;' and mark as published or failed.
2. Implement app/modules/citizen/:
   - POST /api/v1/citizen/sos: Ingests critical SOS report with coordinates, saves report, writes OUTBOX_SOS_CREATED event, returns 201 in < 1 second.
   - POST /api/v1/citizen/reports: Ingests structured report with category ('fire_smoke', 'road_accident', 'medical', 'personal_safety', 'water_flood', 'other'), text, location, and idempotencyKey. Deduplicates retried offline submissions.
   - GET /api/v1/citizen/reports: Lists authenticated user's reports.
   - GET /api/v1/citizen/reports/{id}: Returns detailed report receipt.
   - POST /api/v1/citizen/reports/{id}/cancel: Cancels report if not yet dispatched.
   - CRUD /api/v1/citizen/contacts: Trusted contacts management (max 3).
   - GET /api/v1/citizen/alerts/nearby: Campus safety alerts with coarsened locations (ST_SnapToGrid).
3. Implement app/modules/media/:
   - POST /api/v1/media/upload-url: Generates short-lived MinIO presigned PUT URL with MIME & size restrictions (Max 15MB).
   - POST /api/v1/media/{id}/confirm: Validates uploaded file and links MediaAsset to report.
   - GET /api/v1/media/{id}/url: Returns temporary presigned GET URL.
Exit Check: POST /sos returns in < 1s; identical idempotencyKey returns existing record without duplication; cancel after dispatch returns 400; outbox relay claims rows safely with SKIP LOCKED; citizens cannot read other citizens' reports.
```

#### Phase 4: Incident Clustering, State Machine & Operator Queue
```markdown
Execute Phase 4: Incident Clustering & Operator Command Center.
Tasks:
1. Implement report-to-incident spatial clustering in app/modules/operator/service.py:
   - On new report, search active incidents within radius (default 150m) and time window from settings (30 mins).
   - Attach report to existing incident or create a new Incident with publicCode.
2. Implement app/modules/operator/router.py, actions_router.py, settings_router.py, duplicates_router.py:
   - GET /api/v1/operator/reports/queue: Unreviewed incoming report queue.
   - GET /api/v1/operator/incidents: Active incidents list sorted by urgency (critical > high > medium > low).
   - GET /api/v1/operator/incidents/{id}: Comprehensive workspace view (reports, evidence, assignments, timeline).
   - GET /api/v1/operator/responders: Roster of available/active responders.
   - GET /api/v1/operator/duplicates: Suspected duplicate candidate pairings.
   - GET & PUT /api/v1/operator/settings: Operator command thresholds and audio alert preferences.
   - POST /api/v1/operator/actions/merge: Merges multiple reports into one incident with mandatory reason. Retains all evidence and writes audit log.
   - POST /api/v1/operator/actions/split: Detaches an incorrectly grouped report into a separate incident with audit log.
   - POST /api/v1/operator/actions/state: Advances incident state machine. Strictly enforce the transition matrix from Section 2.2.B. Reject illegal jumps (e.g. resolved -> en_route, closed -> under_review) with HTTP 400.
Exit Check: Reports within 150m auto-cluster; merge preserves all linked reports; split writes audit log; illegal state transitions fail with descriptive error; audit log created for merges and state changes.
```

#### Phase 5: Asynchronous AI Pipeline & Celery Workers
```markdown
Execute Phase 5: AI Pipeline & Celery Worker Integration.
Tasks:
1. Configure Celery worker and Celery beat in services/api using Redis broker/backend. Update docker-compose.yml to launch celery worker and celery beat containers.
2. Implement Celery Beat periodic task running app/core/outbox.py relay every 2 seconds to consume pending outbox events using SKIP LOCKED and trigger Celery tasks.
3. Implement AI model adapters in app/ai/adapters/:
   - text_classifier.py: Categorizes incident and urgency. Emits explanation and model score.
   - voice_transcriber.py: Faster-Whisper transcription for uploaded voice memos.
   - vision_detector.py: Fire/Smoke detection on images with bounding boxes.
   - duplicate_matcher.py: Candidate matching based on distance and text similarity.
   - Each adapter supports a mock mode (matching frontend mlBridge.ts) and a live model switch.
4. Implement Celery tasks in app/ai/celery_tasks.py triggered by outbox events. Store results as AIAssessment.
5. Implement operator override endpoint: POST /api/v1/operator/actions/override to correct AI suggestions with mandatory audit record.
6. Implement failure recovery: If an adapter fails, mark processingState='ai_failed' and flag reviewRequired=true without failing the report.
Exit Check: Celery processes outbox events asynchronously; mock AI outputs match frontend expectations; model crashes do not block report flow; operator overrides write to audit_logs.
```

#### Phase 6: Dispatch Engine, Assignments & Responder Telemetry
```markdown
Execute Phase 6: Dispatch Engine & Responder Operations.
Tasks:
1. Implement operator dispatch recommendation in app/modules/operator/service.py:
   - Rank available approved responders by PostGIS distance (ST_Distance) and matching capabilities.
   - POST /api/v1/operator/actions/dispatch: Operator issues an offer to a responder unit with a 90-second acceptance deadline.
2. Implement app/modules/responder/:
   - GET /api/v1/responder/assignments: Active assignments for the authenticated responder.
   - GET /api/v1/responder/history: Past completed and resolved assignment missions.
   - POST /api/v1/responder/offers/{id}/respond: Accept or decline offer with optional reason.
   - POST /api/v1/responder/assignments/{id}/status: Transition assignment status enforcing Section 2.2.C matrix (including 'failed' with explanation).
   - POST /api/v1/responder/location: Ingests GPS telemetry ping and updates ResponderProfile last_known_location.
   - POST /api/v1/responder/assignments/{id}/notes: Append operational notes.
   - PATCH /api/v1/responder/duty: Toggles responder duty status (available, busy, off_duty).
3. Implement routing engine in app/routing/: StraightLineProvider fallback and OSRM integration returning ETA minutes and distance km.
4. Celery Beat task: Monitor expired assignment offers and auto-escalate to the next ranked responder.
Exit Check: Full assignment lifecycle functions (including failed transition); offer timeout auto-expires; responders cannot modify other units' assignments; automated system code cannot dispatch without operator sign-off.
```

#### Phase 7: Realtime WebSocket Gateway & Outbox Broadcaster
```markdown
Execute Phase 7: Realtime WebSocket Gateway.
Tasks:
1. Implement app/modules/realtime/router.py:
   - WebSocket endpoint at /api/v1/ws?token=... with JWT authentication.
   - Route clients into authorized channels: 'operator:all', 'responder:{unit_id}', 'citizen:{user_id}'.
2. Implement app/modules/realtime/publisher.py:
   - Integrates with outbox relay to publish events to Redis Pub/Sub channels.
   - Fans out messages to connected WebSocket clients using the envelope:
     { "id": "...", "type": "report.received"|"incident.updated"|"assignment.offered"|"assignment.updated"|"ai.assessment.ready", "occurredAt": "...", "incidentId": "...", "payload": {...} }
3. Reconnection support: Allow clients to reconnect with a 'since' timestamp to replay missed events from outbox_events.
Exit Check: Operator socket receives new SOS notification within 2 seconds; unauthenticated sockets rejected with 4001; citizens never receive operator events; replay delivers missed events in order.
```

#### Phase 8: Admin Controls, Operational Analytics & Audit Explorer
```markdown
Execute Phase 8: Admin Management, Analytics & Audit Explorer.
Tasks:
1. Implement app/modules/admin/:
   - GET /api/v1/admin/responders: List all responders with approval status.
   - POST /api/v1/admin/responders/{id}/approve: Approve or revoke responder credentials.
   - GET & PUT /api/v1/admin/operating-area: Read and update campus geofence polygon (validates valid GeoJSON Polygon).
   - GET /api/v1/admin/audit-logs: Searchable audit trail with filters (actor, action, target, date range) and pagination.
   - POST /api/v1/admin/drill-mode: Toggle simulated drill mode banner and synthetic data generation.
2. Implement app/modules/analytics/:
   - GET /api/v1/analytics/summary: Computes average arrival time, false alarm rate, active responder count, and open report queue.
   - GET /api/v1/analytics/hotspots: Returns incident cluster density as GeoJSON FeatureCollection.
   - GET /api/v1/analytics/by-category: Breakdown of incident counts by category.
   - GET /api/v1/analytics/response-times: Time-series breakdown of response milestones.
Exit Check: Only admin can approve responders or modify campus geofence; invalid polygon geometry rejected with 400; analytics outputs match calculated values from seed data.
```

#### Phase 9: Hardening, Integration & Verification
```markdown
Execute Phase 9: System Hardening & Integration.
Tasks:
1. Propose frontend configuration changes for human approval: Flip VITE_USE_MOCK_API=false in apps/web/.env and provide Axios HTTP bridge mappings for features/*/api/ to route live calls to FastAPI.
2. Mobile Integration Documentation: Provide apps/mobile integration guide and apiBridge.ts specification for connecting Expo app to the backend endpoints.
3. Perform complete UI walkthrough for all 4 roles:
   - Citizen: Login, trigger SOS, submit detailed report with photo and voice memo, view live receipt, manage contacts.
   - Operator: Review triage queue, view map markers, review AI evidence cards, resolve duplicates, verify and dispatch responder.
   - Responder: Receive mission offer, accept, step through navigation and arrival, resolve task.
   - Admin: Approve new responder, inspect audit log, update campus polygon.
4. Security pass: Parameterized queries check, CORS lockdown, rate limiting validation, OWASP API Top 10 compliance audit.
5. Run full test suite covering T1 through T25. Document results in test report.
Exit Check: All 25 must-pass test cases pass; frontend runs against live backend; no blocker or major defects.
```

---

## 6. Complete API Specification

All endpoints are prefixed by `/api/v1`.

### 6.1 Authentication (`/auth`)
| Method | Path | Allowed Roles | Description | Request Body | Response Body |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public | Citizen/Responder registration | `UserRegisterRequest` | `TokenResponse` |
| `POST` | `/auth/login` | Public | User authentication | `UserLoginRequest` | `TokenResponse` |
| `POST` | `/auth/refresh` | Public | Refresh token rotation | `RefreshTokenRequest` | `TokenResponse` |
| `POST` | `/auth/logout` | Authenticated | Revoke tokens / clear session | Empty | `{ "ok": true }` |
| `GET` | `/auth/me` | Authenticated | Get current user profile | None | `UserProfileResponse` |

### 6.2 Citizen Workspace (`/citizen`)
| Method | Path | Allowed Roles | Description | Request Body | Response Body |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/citizen/sos` | `citizen` | Instant SOS emergency beacon | `SOSRequest` | `ReportResponse` |
| `POST` | `/citizen/reports` | `citizen` | Detailed incident report | `ReportCreateRequest` | `ReportResponse` |
| `GET` | `/citizen/reports` | `citizen` | List my submitted reports | None | `List[ReportResponse]` |
| `GET` | `/citizen/reports/{id}` | `citizen` | Get individual report receipt | None | `ReportResponse` |
| `POST` | `/citizen/reports/{id}/cancel` | `citizen` | Cancel report (pre-dispatch) | `{ "reason": str }` | `ReportResponse` |
| `GET` | `/citizen/contacts` | `citizen` | List trusted contacts (max 3) | None | `List[ContactResponse]` |
| `POST` | `/citizen/contacts` | `citizen` | Add trusted contact | `ContactCreateRequest`| `ContactResponse` |
| `DELETE`| `/citizen/contacts/{id}` | `citizen` | Delete trusted contact | None | `{ "ok": true }` |
| `GET` | `/citizen/alerts/nearby` | `citizen` | Campus alerts (coarsened) | None | `List[NearbyAlert]` |

### 6.3 Operator Command Center (`/operator`)
| Method | Path | Allowed Roles | Description | Request Body | Response Body |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/operator/reports/queue` | `operator`, `admin` | Unreviewed triage queue | None | `List[ReportResponse]` |
| `GET` | `/operator/incidents` | `operator`, `admin` | Active incidents sorted by urgency | Query filters | `List[IncidentResponse]` |
| `GET` | `/operator/incidents/{id}` | `operator`, `admin` | Detailed workspace view | None | `IncidentDetailResponse` |
| `GET` | `/operator/responders` | `operator`, `admin` | Responder roster & availability | None | `List[ResponderProfile]` |
| `GET` | `/operator/duplicates` | `operator`, `admin` | Suspected duplicate candidate pairs| None | `List[DuplicatePairResponse]`|
| `GET` | `/operator/settings` | `operator`, `admin` | Command thresholds & audio settings| None | `OperatorSettingsResponse` |
| `PUT` | `/operator/settings` | `operator`, `admin` | Update settings & alert radii | `OperatorSettingsUpdate`| `OperatorSettingsResponse` |
| `POST` | `/operator/actions/merge` | `operator` | Merge duplicate reports | `MergeReportsRequest` | `IncidentResponse` |
| `POST` | `/operator/actions/split` | `operator` | Split incorrectly linked report | `SplitReportRequest` | `IncidentResponse` |
| `POST` | `/operator/actions/state` | `operator` | Advance incident state | `StateTransitionRequest`| `IncidentResponse` |
| `POST` | `/operator/actions/override` | `operator` | Override AI category/urgency | `AIOverrideRequest` | `IncidentResponse` |
| `POST` | `/operator/actions/dispatch` | `operator` | Dispatch offer to responder | `DispatchOfferRequest` | `AssignmentResponse` |

### 6.4 Field Responders (`/responder`)
| Method | Path | Allowed Roles | Description | Request Body | Response Body |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/responder/assignments` | `responder` | Active missions and pending offers | None | `List[AssignmentResponse]` |
| `GET` | `/responder/history` | `responder` | Past resolved & completed missions| None | `List[AssignmentResponse]` |
| `POST` | `/responder/offers/{id}/respond` | `responder` | Accept or decline mission offer | `OfferRespondRequest` | `AssignmentResponse` |
| `POST` | `/responder/assignments/{id}/status` | `responder` | Transition status (incl. failed)| `StatusUpdateRequest` | `AssignmentResponse` |
| `POST` | `/responder/location` | `responder` | Send GPS telemetry ping | `LocationPingRequest` | `{ "ok": true }` |
| `POST` | `/responder/assignments/{id}/notes` | `responder` | Add on-scene operational note | `OperationalNoteRequest`| `{ "ok": true }` |
| `PATCH`| `/responder/duty` | `responder` | Toggle duty status | `DutyUpdateRequest` | `ResponderProfile` |

### 6.5 Media & Evidence (`/media`)
| Method | Path | Allowed Roles | Description | Request Body | Response Body |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/media/upload-url` | Authenticated | Request presigned PUT URL | `PresignedUrlRequest` | `PresignedUrlResponse` |
| `POST` | `/media/{id}/confirm` | Authenticated | Confirm upload & attach asset | `MediaConfirmRequest` | `MediaAssetResponse` |
| `GET` | `/media/{id}/url` | Authenticated | Get temporary signed GET URL | None | `MediaUrlResponse` |

### 6.6 Campus Admin (`/admin`)
| Method | Path | Allowed Roles | Description | Request Body | Response Body |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/admin/responders` | `admin` | List all responders & status | None | `List[ResponderProfile]` |
| `POST` | `/admin/responders/{id}/approve` | `admin` | Approve/revoke responder | `{ "approved": bool }`| `ResponderProfile` |
| `GET` | `/admin/operating-area` | `admin`, `operator` | Get campus geofence polygon | None | `OperatingAreaResponse` |
| `PUT` | `/admin/operating-area` | `admin` | Update campus polygon | `PolygonUpdateRequest` | `OperatingAreaResponse` |
| `GET` | `/admin/audit-logs` | `admin`, `operator` | Search audit trail | Query filters | `Paginated[AuditLog]` |
| `POST` | `/admin/drill-mode` | `admin` | Toggle simulated drill mode | `{ "enabled": bool }` | `{ "drillMode": bool }` |

### 6.7 Analytics & Realtime (`/analytics`, `/ws`)
| Method | Path | Allowed Roles | Description | Request Body | Response Body |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/analytics/summary` | `operator`, `admin` | High-level drill KPI metrics | None | `AnalyticsSummary` |
| `GET` | `/analytics/hotspots` | `operator`, `admin` | Incident spatial cluster heatmap | None | `GeoJSON FeatureCollection` |
| `GET` | `/analytics/by-category` | `operator`, `admin` | Incidents breakdown by category | None | `CategoryBreakdown` |
| `GET` | `/analytics/response-times`| `operator`, `admin` | Average response milestones | None | `ResponseTimeStats` |
| `WS` | `/ws?token=...` | Authenticated | Real-time event WebSocket | N/A | Stream of `WsEvent` |
| `GET` | `/health` | Public | System and database health | None | `HealthStatusResponse` |

---

## 7. Comprehensive Verification & Testing Plan

### 7.1 Testing Layers
1. **Unit Tests (`pytest`)**: State machine transition rules, distance calculations, permission matrix logic, AI adapter contracts.
2. **Integration Tests (`pytest-asyncio` + `httpx`)**: Complete endpoint testing with isolated PostGIS test database.
3. **Worker and Outbox Tests**: Celery worker execution, retry logic with backoff, outbox delivery reliability with `SKIP LOCKED`.
4. **Realtime Tests**: WebSocket connection authentication, channel isolation, replay with timestamp.
5. **Security Verification**: Automated role testing against all endpoints (expecting 403 on violations), SQL injection resistance, JWT tamper rejection.
6. **Performance Tests (`Locust` / `k6`)**: SOS speed, 100-report burst load, and dashboard query latency.
7. **End-to-End Scenarios**: Verification against real user journeys with mock disabled.

---

### 7.2 Must-Pass Test Cases (T1 – T25)

| ID | Test Scenario | Expected Outcome |
| :--- | :--- | :--- |
| **T1** | SOS submitted while Celery workers are offline | Report saved with `processingState=received`; response returned in < 1s; visible on operator queue. |
| **T2** | Resend identical offline report draft (same `idempotencyKey`) | HTTP 200/201 returning original report ID; exactly one record stored. |
| **T3** | Citizen attempts to fetch another citizen's report receipt | HTTP 403 Forbidden or 404 Not Found. |
| **T4** | Matrix testing: Every endpoint invoked by each role | Access granted strictly according to permissions matrix; unexpected 200s treated as blockers. |
| **T5** | Requests with missing, expired, or tampered JWT | HTTP 401 Unauthorized. |
| **T6** | Unapproved responder attempts to accept a dispatch offer | HTTP 403 Forbidden; assignment remains offered. |
| **T7** | 3 separate citizen reports submitted within 150m in 10 minutes (within 30m window) | Auto-clustered into 1 incident; all 3 reports linked; all media preserved. |
| **T8** | Operator executes manual report merge with reason | All reports linked to master incident; audit log created; no data deleted. |
| **T9** | Comprehensive illegal incident transitions (e.g., `resolved` -> `en_route`, `closed` -> `under_review`, `reported` -> `on_scene`) | HTTP 400 Bad Request; every illegal pair rejected. |
| **T10** | Vision model raises runtime exception | Report marked `ai_failed`, flagged `reviewRequired=true`; remains in operator queue. |
| **T11** | Celery worker retries execution of an existing task | Existing `AIAssessment` updated or deduplicated; no duplicate rows. |
| **T12** | Unauthenticated caller calls dispatch (401) vs authenticated non-operator calls dispatch (403) | Unauthenticated gets 401 Unauthorized; worker/citizen/responder gets 403 Forbidden. Only operator allowed. |
| **T13** | Responder does not answer dispatch offer within 90 seconds | Offer marked `expired`; Celery Beat triggers escalation to next unit. |
| **T14** | Responder attempts to update status on another unit's assignment | HTTP 403 Forbidden. |
| **T15** | Critical SOS triggered while operator WebSocket is open | Operator client receives `report.received` event in < 2 seconds. |
| **T16** | Citizen WebSocket connected to live gateway | Receives only personal events; zero operator or responder dispatches leaked. |
| **T17** | WebSocket client disconnects for 30s and reconnects with `since` | Replays missed outbox events in strict chronological order. |
| **T18** | Redis temporarily stops during SOS submission | Report saved in PostgreSQL; outbox poller publishes event once Redis recovers. |
| **T19** | Direct API attempt to UPDATE or DELETE an `audit_logs` record | HTTP 405 Method Not Allowed; no endpoint exists. |
| **T20** | Attempt to upload non-whitelisted MIME type or file > 15MB | Upload presigned URL rejected with HTTP 400/422. |
| **T21** | Inspect `GET /citizen/alerts/nearby` payload | Coordinates are coarsened (rounded to ~100m grid); zero personal details. |
| **T22** | Responder views assignment linked to an anonymous report | Reporter name and contact number masked (`[ANONYMOUS]`). |
| **T23** | 20 failed login attempts within 60 seconds from one IP | Rate limiter activates (HTTP 429); security audit log written. |
| **T24** | Admin submits self-intersecting or invalid geofence polygon | GeoAlchemy/Shapely validation fails; HTTP 400 returned. |
| **T25** | Calculate analytics summary on seed database | Generated KPI numbers match expected hand-calculated values. |

---

### 7.3 Performance Targets
- **SOS Ingestion**: Request received to HTTP 201 response < 1,000 ms.
- **SOS to Operator UI**: Ingestion to operator WebSocket delivery < 2,000 ms.
- **Burst Capacity**: 100 reports submitted in 60 seconds; 0 failed requests; queue drains in < 2 minutes.
- **Queue Query**: Active incidents query with 5,000 records < 300 ms.
- **Proximity Search**: Find nearby responders query using PostGIS GiST index < 100 ms.

---

### 7.4 End-to-End Scenarios (Live Integration with Mock Off)
1. **Multi-Report Fire Incident**: Citizen A submits fire SOS with photo. Citizen B submits report 80m away. Operator sees single grouped incident, reviews AI smoke confidence, overrides urgency to Critical, and dispatches Fire Unit F-2.
2. **Responder Mission Lifecycle**: Responder F-2 receives real-time offer notification, reviews navigation route, accepts, updates status to `en_route`, arrives on scene, adds operational notes, and marks resolved.
3. **Documented False Alarm**: Operator inspects malicious/false report, flags as false alarm with mandatory justification note, verifies citizen status update, and confirms audit trail entry.
4. **Offline Sync & Reconciliation**: Citizen records report with device offline. Network restores. Client sends queued report with idempotency key. Backend records report exactly once.
5. **AI Worker Outage Resilience**: Kill Celery workers. Submit SOS and incident reports. Verify reports appear immediately in operator triage queue for manual assessment. Restart workers and confirm inference completes.
6. **Responder Vetting Gate**: New user registers with `role="responder"`. User cannot view or accept dispatch offers. Admin inspects credentials and approves account. Unit immediately becomes eligible for dispatch.
7. **Dispatch Escalation**: Operator dispatches offer to Responder 1. Responder ignores offer. After 90 seconds, offer expires and automatically escalates to Responder 2.
8. **Admin Geofence & Audit Inspection**: Admin updates campus perimeter polygon, inspects security audit logs for operator actions, and reviews drill metrics.

---

### 7.5 Security Checklist
- Passwords hashed with Argon2id; zero plaintext credentials anywhere; zero secrets in logs.
- Short-lived access tokens with Redis-backed revocation blacklist for immediate logout.
- Refresh token rotation: Prior refresh token invalidated upon issuance of a new pair.
- Object-level authorization enforced on every ID in path parameters.
- Strict input validation on all bodies, query parameters, and media uploads. Parameterized queries only.
- CORS restricted to known origins; security headers set (CSP, HSTS, X-Content-Type-Options).
- Presigned media URLs expire within 15 minutes and are strictly scoped to a single object key.
- Dependency vulnerability scans (`pip-audit`) report zero critical or high vulnerabilities.
- Rate limiting active on login (5/min), SOS (10/min), and report submissions (20/min).

---

### 7.6 Defect Handling Protocol
Log each test defect in the following format:
- **Defect ID**: `DEF-XXX`
- **Severity**: `Blocker` (halts workflow), `Major` (functional breakdown with workaround), `Minor` (cosmetic/edge case)
- **Steps to Reproduce**: Exact HTTP request or UI action sequence
- **Expected Result**: Expected response per contract
- **Actual Result**: Observed response / stack trace
- **Resolution**: Code fix and regression test reference

*All Blocker and Major defects must be resolved and pass regression tests prior to Phase completion.*

---

### 7.7 Exit Criteria
- All 25 must-pass test cases (`T1` through `T25`) pass without skips.
- All 8 End-to-End scenarios pass against the running application.
- Zero open Blocker or Major defects.
- Performance targets met (or gap documented with an agreed scaling plan).
- Backend automated test coverage >= 80% on services and API modules.

---

## 8. Handoff & Completion Checklist

- [ ] Repository builds and boots from a clean checkout using Docker Compose.
- [ ] Database migrations execute cleanly via `alembic upgrade head`.
- [ ] Seed script (`python -m scripts.seed`) populates all 4 demo roles, geofence, and synthetic data.
- [ ] `docs/api-contract.md` matches implemented FastAPI router routes.
- [ ] All 25 must-pass test cases (`T1` – `T25`) pass in the CI test suite.
- [ ] All 8 End-to-End scenarios verified on `apps/web` with live backend.
- [ ] Zero unhandled 500 errors across all endpoints; standardized error JSON returned.
- [ ] No secrets, keys, or tokens committed to git or printed in logs.
- [ ] Interactive Swagger UI loads cleanly at `http://localhost:8000/docs`.

---

## 9. Risk Management

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Agent invents API shapes that break frontend** | High | Phase 0 contract document (`docs/api-contract.md`) locked before coding; TypeScript types in `apps/web/src/types/` are ground truth. |
| **Large, unreviewable pull requests** | High | Strict one-phase-per-branch rule; agent must list modified files before editing. |
| **AI models not ready on time** | Medium | Clean adapter interfaces (`app/ai/adapters/`) with labeled mock implementations matching frontend behavior; live models swapped via configuration. |
| **Hidden authorization bypasses** | Critical | Automated role matrix tests (`T4`) run on every PR; object-level security dependencies enforced in service layer. |
| **Concurrent duplicate outbox publishing** | High | Outbox relay uses `SELECT ... FOR UPDATE SKIP LOCKED` to guarantee horizontal safety across multiple worker replicas. |
| **Scope mismatch between campus terminology and public use** | Low | Retain current domain names (`OperatingArea`, `campusCode`) to keep frontend intact; geofence queries written generically with PostGIS `ST_Contains`. |
| **False progress reports without evidence** | High | Agent must execute pytest commands and provide raw terminal output for all test cases before declaring any phase complete. |
