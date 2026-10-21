# FINDINGS (append only)

Format: `F-nnn | blocker/major/minor | WPn.m | what is wrong | file:line | expected vs actual (2 lines max)`
F-001 | major | WP0.5 | Tests share the app DB (settings.DATABASE_URL); no isolated test DB
  file: services/api/tests/conftest.py:12
  expected: separate test DB URL (e.g. TEST_DATABASE_URL or resqai_test); actual: same DATABASE_URL as production
F-002 | minor | WP1.4 | pytest-cov not installed; coverage cannot be measured
  file: services/api/requirements.txt (missing pytest-cov)
  expected: pytest-cov in dev deps and --cov works; actual: unrecognized argument error
F-003 | major | WP2.6 | alembic check fails: model/migration drift detected
  file: services/api/alembic/versions/ vs app/models/
  expected: no drift; actual: spatial_ref_sys table mismatch, nullable diffs on ai_assessments/audit_logs/responder_profiles, missing indexes, removed unique constraints
F-004 | blocker | WP3.2 | Plaintext dev secrets committed to git in docker-compose.yml and config.py defaults
  file: docker-compose.yml:71,73; services/api/app/core/config.py:19,23
  expected: no secrets in tracked files; actual: JWT_SECRET and S3_SECRET_KEY hardcoded

F-005 | blocker | WP3.3 | No production start guard — app launches with default JWT_SECRET in any ENVIRONMENT
  file: services/api/app/core/config.py:8,23
  expected: ValueError/startup error if ENVIRONMENT=production and secrets are defaults; actual: no such check

F-006 | blocker | WP3.4 | CORS wildcard origin ('*') combined with allow_credentials=True — browsers block and it is a security misconfiguration
  file: services/api/app/core/middleware.py:27-29; services/api/app/core/config.py:29
  expected: explicit origin list when credentials=True; actual: ['*'] which browsers reject and exposes CSRF risk

F-007 | major | WP3.6 | API docs (Swagger/Redoc) always publicly accessible; no production disable
  file: services/api/app/main.py:36-38
  expected: docs_url=None in production ENVIRONMENT; actual: always enabled
F-008 | major | WP5.2 | Frontend routes.config.ts uses '/citizen/alerts' but backend route is '/citizen/alerts/nearby'
  file: apps/web/src/config/routes.config.ts:8
  expected: /citizen/alerts/nearby; actual: /citizen/alerts (causes 404 in production)

F-009 | major | WP5.4 | reporter_id exposed in ReportResponse returned in IncidentDetailResponse.linkedReports to operators/responders
  file: services/api/app/modules/citizen/schemas.py:103-104
  expected: reporter identity hidden from responders; actual: reporter_id always serialized in ReportResponse
F-010 | minor | WP7.3 | Signed GET URL expires in 3600s (1hr) not 15min as required
  file: services/api/app/modules/media/service.py:181
  expected: ExpiresIn=900; actual: ExpiresIn=3600

F-011 | minor | WP8.1 | Clustering time window is 30min in code but README states 10min
  file: services/api/app/modules/operator/service.py:208
  expected: 10min per README; actual: 30min in code

F-012 | minor | WP8.3 | Cross-category clustering: different category reports within 150m cluster to same incident without category check
  file: services/api/app/modules/operator/service.py:204-250
  expected: separate incidents for different categories; actual: merged by location only
F-013 | minor | WP10.3 | No dead-letter queue (DLQ) configured in Celery worker
  file: services/api/app/core/celery_app.py:12-30
  expected: DLQ queue and exchange routing configured for failing tasks; actual: only max_retries with no dead-letter routing

F-014 | major | WP10.5 | Duplicate task delivery creates duplicate AIAssessment rows without idempotency
  file: services/api/app/ai/pipeline.py:60-120; services/api/app/models/ai_assessment.py:12-13
  expected: idempotency check or unique constraint preventing duplicate AIAssessment records; actual: unconditionally inserts duplicate rows on redelivery

F-015 | major | WP11.1 | AI adapters are all mocks/heuristics; PyTorch and faster-whisper claimed in README are absent
  file: services/api/app/ai/adapters/
  expected: real model weights and inference dependencies; actual: heuristic/mock stubs without torch or faster-whisper

F-016 | minor | WP11.4 | No per-task timeout (time_limit/soft_time_limit or asyncio.wait_for) enforced on AI tasks
  file: services/api/app/core/celery_app.py:12-30; services/api/app/ai/celery_tasks.py:24
  expected: task timeout configured; actual: neither Celery time limits nor asyncio timeouts set

F-017 | minor | WP11.6 | Duplicate matcher ignores text similarity and incident timestamps
  file: services/api/app/ai/adapters/duplicate_matcher.py:15-50
  expected: duplicate matching using distance, time, and text similarity; actual: only checks haversine distance and category match

F-018 | major | WP12.3 | Offer expiry marks status 'expired' but does not auto-escalate or notify operator when candidates run out
  file: services/api/app/modules/responder/service.py:547-575
  expected: auto-escalate to next recommendation or notify operator on candidate exhaustion; actual: marks expired only

F-019 | minor | WP13.3 | Assignment notes have no max length limit (missing max_length in schema and service)
  file: services/api/app/modules/responder/schemas.py:88-90; services/api/app/modules/responder/service.py:483
  expected: max length constraint on notes; actual: only min_length=1 enforced with unbounded string concatenation

F-020 | major | WP13.5 | ResponderHistoryPage uses hardcoded mock-store data; backend lacks responder stats endpoint
  file: apps/web/src/pages/responder/ResponderHistoryPage.tsx:1-25; services/api/app/modules/responder/router.py
  expected: dynamic KPI stats and history loaded via backend API; actual: hardcoded mock-store array and static KPI strings

F-021 | minor | WP14.6 | WebSocket does not revalidate token expiry or revoke long-lived sockets when access token expires
  file: services/api/app/modules/realtime/connection_manager.py:28-89; services/api/app/modules/realtime/router.py:130-143
  expected: periodic token expiration verification or scheduled disconnect; actual: socket remains alive indefinitely once authenticated

F-022 | minor | WP15.2 | Polygon update does not validate spherical coordinate bounds or swapped lat/lng pairs
  file: services/api/app/modules/admin/service.py:199-225; services/api/app/common/spatial.py:86-93
  expected: validation rejecting swapped lat/lng or out-of-range coordinates; actual: only checks shapely.is_valid in Euclidean plane

F-023 | major | WP16.1 | 8 of 18 frontend api files (login, register, submitReport, etc.) call mockApi directly instead of http backend
  file: apps/web/src/features/*/api/ (login.ts, register.ts, submitReport.ts, getMyReports.ts, getActiveIncidents.ts, etc.)
  expected: all feature api files dispatch requests via axios http client; actual: hardcoded imports and delegation to mockApi

F-024 | minor | WP16.2 | 'water_flood' category handled by backend is missing from frontend IncidentCategory in types/incident.ts
  file: apps/web/src/types/incident.ts:3-8
  expected: water_flood included in IncidentCategory union type; actual: only fire_smoke, road_accident, medical, personal_safety, other

F-025 | minor | WP17.2 | npm run lint fails with 8 errors (@typescript-eslint/no-explicit-any, prefer-const, no-require-imports)
  file: apps/web/src/features/admin/api/getAuditLogs.ts, getReportQueue.ts, mock-api.ts, tailwind.config.ts
  expected: clean eslint run with 0 errors; actual: 8 errors and 6 warnings across web source files

F-026 | major | WP17.4 | Direct production imports of mock-store and mock-api exist across pages and feature api modules
  file: apps/web/src/pages/responder/ResponderHistoryPage.tsx:1; apps/web/src/features/*/api/*.ts
  expected: mock-store and mock-api decoupled from production bundles; actual: static top-level imports force mock code into production bundle

F-027 | major | WP17.6 | No automatic offline retry drain pump for drafts saved in IndexedDB
  file: apps/web/src/hooks/useOfflineQueue.ts; apps/web/src/context/OfflineSyncContext.tsx
  expected: queue auto-drains and retries pending submissions upon reconnection; actual: drafts are only enqueued and displayed statically

F-028 | major | WP18.2 | Hard-coded developer IP 192.168.1.5:8000 in mobile src/config/api.ts without dynamic env/emulator resolution
  file: apps/mobile/src/config/api.ts:8
  expected: dynamic resolution supporting Android emulator 10.0.2.2 and release config; actual: hardcoded local Wi-Fi IP 192.168.1.5:8000

F-029 | major | WP18.3 | Mobile api calls non-existent backend endpoints /citizen/alerts and /responder/location-ping; token stored plain in-memory
  file: apps/mobile/src/services/api.ts:193, 290
  expected: matching backend routes (/citizen/alerts/nearby and /responder/location) and SecureStore token persistence; actual: 404 path mismatches and in-memory variable

F-030 | minor | WP18.4 | Mobile realtime.ts does not use exponential backoff (fixed 5s) and lacks ?since= replay on reconnect
  file: apps/mobile/src/services/realtime.ts:46-51
  expected: exponential reconnect backoff and historical replay using ?since= query; actual: fixed 5000ms timer without since parameter

F-031 | minor | WP18.6 | Camera, microphone, and background location permissions and rationales missing from AndroidManifest and app.json
  file: apps/mobile/android/app/src/main/AndroidManifest.xml; apps/mobile/app.json
  expected: CAMERA, RECORD_AUDIO, and ACCESS_BACKGROUND_LOCATION permissions with user-facing rationale strings; actual: only foreground location and storage declared

F-032 | minor | WP19.2 | README API table documents /citizen/alerts and /responder/location-ping instead of actual backend paths (/citizen/alerts/nearby and /responder/location)
  file: README.md:309, 315
  expected: matching backend routes /citizen/alerts/nearby and /responder/location; actual: mismatched paths that 404

F-033 | minor | WP19.3 | docs/api-contract.md omits Admin, Analytics, and Contact endpoints present in OpenAPI (23 documented vs 50 actual)
  file: docs/api-contract.md
  expected: complete OpenAPI endpoint coverage; actual: /admin/*, /analytics/*, and /citizen/contacts omitted

F-034 | major | WP19.5 | High-availability and production-grade claims overstated: single-node infra, mock ML adapters, plain dev secrets
  file: README.md:41-44; docker-compose.yml:1-85; services/api/app/ai/adapters/
  expected: HA failover clusters, real PyTorch/Whisper inference, robust secrets; actual: standalone containers, mock rules, committed dev credentials

F-035 | minor | WP19.6 | Python version mismatch: Dockerfile uses python:3.11-slim while README claims Python 3.13
  file: services/api/Dockerfile:1; README.md:8
  expected: unified Python version (e.g. 3.13 across Docker, docs, and venv); actual: Dockerfile pinned to 3.11-slim, README claims 3.13

F-036 | major | WP20.1 | npm audit reports high severity vulnerabilities in web (axios, react-router) and mobile (metro, node-forge)
  file: apps/web/package.json; apps/mobile/package.json
  expected: 0 high-severity dependencies in production bundle; actual: 10 high vulnerabilities in web, 15 high vulnerabilities in mobile

F-037 | minor | WP20.3 | Missing HTTP security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) and global request size limit
  file: services/api/app/core/middleware.py:21-34
  expected: security header middleware attached; actual: only CORS and X-Request-Id headers present

F-038 | major | WP20.5 | Rate limits missing on citizen SOS submission, report creation, and media presign endpoints
  file: services/api/app/modules/citizen/router.py; services/api/app/modules/media/router.py
  expected: IP and user rate limits on critical submission endpoints; actual: rate limits only enforced on /auth/login

F-039 | major | WP20.6 | Dockerfile runs as root without a non-root USER and lacks HEALTHCHECK instruction
  file: services/api/Dockerfile
  expected: non-root USER directive and container HEALTHCHECK; actual: runs as default root with no HEALTHCHECK

