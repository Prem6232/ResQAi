# ResQAi Frontend Integration Guide: Zero-Mock Real-Time Backend

This guide details the exact configuration, architecture mappings, and adapter bridges required to switch the **ResQAi / SENTINELGRID** Web App (`apps/web`) and Mobile App (`apps/mobile`) from mock mode to the production-grade FastAPI backend.

---

## 1. Architecture & Endpoint Overview

The backend runs as a high-performance, asynchronous FastAPI service in `services/api/` backed by:
- **PostgreSQL 16 + PostGIS** (`localhost:5432`): Geospatial spatial clustering, audit logs, and relational entities.
- **Redis 7** (`localhost:6379`): Ephemeral token revocation, rate limiting, and pub/sub bus.
- **MinIO S3** (`localhost:9000`): Presigned S3 evidence uploads for photo, audio, and video media.
- **Celery + Redis** (`localhost:6379`): Asynchronous multimodal AI triage pipeline and outbox dispatch.
- **ASGI WebSocket Gateway** (`/ws?token=<jwt>&since=<iso8601>`): Dual-channel (operator & citizen) real-time events.

---

## 2. Web Application Setup (`apps/web`)

### A. Environment Configuration
Update or create `apps/web/.env.local` (or `apps/web/.env`):

```bash
# Disable mock adapter - use real live FastAPI backend
VITE_USE_MOCK_API=false

# REST API base URL
VITE_API_BASE_URL=http://localhost:8000/api/v1

# Real-time WebSocket Gateway URL
VITE_WS_URL=ws://localhost:8000/ws
```

### B. Pre-Seeded Demo Accounts

The backend seed script (`services/api/scripts/seed_demo_data.py`) automatically provisions the following zero-friction demo accounts (all passwords: `demo1234`):

| Role | Email | Password | Permissions & Views |
| :--- | :--- | :--- | :--- |
| **Operator** | `operator@campus.demo` | `demo1234` | Full Command Center, Queue Triage, Dispatch, State Matrix, Merge/Split |
| **Admin** | `admin@campus.demo` | `demo1234` | Responder Vetting, Operating Area Geofence, Audit Log Explorer, System Settings |
| **Responder** | `responder@campus.demo` | `demo1234` | Approved Fire/Rescue Unit (F-2), Mission Offer Accept/Decline, Telemetry GPS |
| **Patrol Unit** | `patrol07@campus.demo` | `demo1234` | Approved Security Patrol (P-07), Mission Execution |
| **Citizen** | `citizen@campus.demo` | `demo1234` | SOS Beacon, Interactive Incident Report Submission, Live Personal Tracking |

---

## 3. Web API Bridge Mapping (`apps/web/src/services/apiBridge.ts`)

The backend was built strictly honoring the camelCase and snake_case dual-compatibility schemas. The following table provides direct endpoint mappings:

### 1. Authentication (`/api/v1/auth`)
| Frontend Action | HTTP Method & URL | Live Backend Schema Notes |
| :--- | :--- | :--- |
| Login | `POST /api/v1/auth/login` | Accepts `{"email", "password"}`. Returns `access_token`, `refresh_token`, and `user` payload. |
| Register | `POST /api/v1/auth/register` | Accepts `{"email", "password", "fullName", "role"}`. Returns JWT tokens. |
| Get Profile | `GET /api/v1/auth/me` | Requires `Bearer <token>`. Returns user details and responder profile (if unit). |
| Refresh Token | `POST /api/v1/auth/refresh` | Accepts `{"refreshToken": "..."}` or `{"refresh_token": "..."}`. Returns fresh JWT pair. |
| Logout | `POST /api/v1/auth/logout` | Denylists access and refresh tokens in Redis until natural expiration. |

### 2. Citizen SOS & Reports (`/api/v1/citizen`)
| Frontend Action | HTTP Method & URL | Live Backend Schema Notes |
| :--- | :--- | :--- |
| SOS Beacon | `POST /api/v1/citizen/sos` | Payload: `{"location": {"lat": number, "lng": number}, "locationLabel"?: string, "idempotencyKey"?: string}`. Generates critical report and starts auto-clustering. |
| Submit Report | `POST /api/v1/citizen/reports` | Payload: `{"category", "text", "location": {"lat", "lng"}, "locationLabel", "mediaAssetIds"?: string[], "idempotencyKey"?: string}`. |
| Get My Reports | `GET /api/v1/citizen/reports` | Returns citizen's past reports with live status (`submitted`, `in_review`, `linked`). |
| Get Report Receipt | `GET /api/v1/citizen/reports/{id}` | Enforces strict cross-user isolation. Citizens cannot view others' receipts. |
| Coarsened Nearby Alerts | `GET /api/v1/citizen/alerts/nearby` | Coordinates coarsened to ~100m grid to protect reporter privacy. |

### 3. Operator Command Center (`/api/v1/operator`)
| Frontend Action | HTTP Method & URL | Live Backend Schema Notes |
| :--- | :--- | :--- |
| Ingestion Queue | `GET /api/v1/operator/reports/queue` | Paginated queue with AI confidence flags, review-required badges, and urgency filters. |
| Active Incidents | `GET /api/v1/operator/incidents` | Incident list with clustered report tallies, assigned units, and live statuses. |
| Dispatch Unit | `POST /api/v1/operator/actions/dispatch` | Payload: `{"incidentId", "responderId", "slotId"}`. Enforces Human-in-the-Loop gate (operator only). |
| State Transition | `POST /api/v1/operator/actions/state` | Payload: `{"incidentId", "toStatus", "reason"}`. Validates Section 2.2.B state machine. |
| Merge Reports | `POST /api/v1/operator/actions/merge` | Payload: `{"targetIncidentId", "reportIds", "reason"}`. Reassigns reports with audit trail. |
| Split Report | `POST /api/v1/operator/actions/split` | Payload: `{"incidentId", "reportId", "reason"}`. Spawns new standalone incident. |

### 4. Responder Operations (`/api/v1/responder`)
| Frontend Action | HTTP Method & URL | Live Backend Schema Notes |
| :--- | :--- | :--- |
| Active Assignments | `GET /api/v1/responder/assignments` | Returns offers and active missions. Enforces 90-second timeout auto-expiry. |
| Respond to Offer | `POST /api/v1/responder/offers/{id}/respond` | Payload: `{"status": "accepted" \| "declined", "reason"?: string}`. Object-level security protected. |
| Update Status | `POST /api/v1/responder/assignments/{id}/status` | Payload: `{"status": "en_route" \| "arrived" \| "on_scene" \| "completed" \| "failed", "reason"?: string}`. |
| Telemetry Ping | `POST /api/v1/responder/location` | Payload: `{"lat", "lng", "accuracyMeters"}`. Updates Redis geo-index and logs trace. |

### 5. Admin Controls & Analytics (`/api/v1/admin` & `/api/v1/analytics`)
| Frontend Action | HTTP Method & URL | Live Backend Schema Notes |
| :--- | :--- | :--- |
| Responder Directory | `GET /api/v1/admin/responders` | Lists all responder units, vetting status, callsign, and capabilities. |
| Approve Responder | `POST /api/v1/admin/responders/{id}/approve` | Vetting gate. Generates mandatory audit log entry. |
| Operating Geofence | `GET` & `PUT /api/v1/admin/operating-area` | Validates polygon topology with Shapely. Self-intersecting polygons return HTTP 400. |
| Immutable Audit Logs | `GET /api/v1/admin/audit-logs` | Searchable, paginated audit records. Direct PUT/DELETE returns HTTP 405/404. |
| Drill Mode Toggle | `POST /api/v1/admin/drill-mode` | Toggles simulated campus exercise mode across all connected clients. |
| Real-Time KPI Summary | `GET /api/v1/analytics/summary` | Real-time calculations: active incidents, response times, false alarm rate. |
| Geospatial Hotspots | `GET /api/v1/analytics/hotspots` | GeoJSON FeatureCollection with incident frequency weights. |

---

## 4. Real-Time WebSocket Gateway Integration

Connect to `/ws?token=<access_token>` upon user authentication.

### Reconnection with Catch-Up Replay
To ensure zero dropped events during mobile handovers or network hiccups, pass the `since` query parameter:

```typescript
const wsUrl = `${import.meta.env.VITE_WS_URL}?token=${token}&since=${lastSeenIsoTimestamp}`;
const socket = new WebSocket(wsUrl);

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data = { id: string, type: string, aggregateType: string, aggregateId: string, payload: any, createdAt: string }
  handleRealtimeEvent(data);
};
```

### Channel Isolation Guarantee
- **Citizens**: Only receive events where `payload.user_id === citizen.id` or `payload.reporter_id === citizen.id` (e.g., report status progression, nearby alerts). Operator dispatches, SWAT deployment notes, and unit locations are never transmitted to citizen sockets.
- **Operators & Admins**: Receive full event streams (`incident.created`, `incident.updated`, `dispatch.offered`, `report.ingested`).

---

## 5. Mobile Application Integration (`apps/mobile`)

For React Native / Expo in `apps/mobile`:
1. In `apps/mobile/src/services/apiBridge.ts`:
   - Set `API_BASE_URL = "http://<YOUR_LAN_IP>:8000/api/v1"`. (Use your machine's Wi-Fi IP address instead of `localhost` when running on a physical Android or iOS device).
   - Set `WS_BASE_URL = "ws://<YOUR_LAN_IP>:8000/ws"`.
2. Hardware GPS Integration:
   - Responders running mobile can stream location updates every 5–15 seconds via `POST /api/v1/responder/location`.
   - Citizens in SOS mode stream breadcrumb pings to keep operators updated on real-time coordinates.

---

## 6. Verification Checklist

- [x] Celery worker queue is decoupled: Ingestions return HTTP 201 immediately even during worker outages.
- [x] S3 Presigned Uploads: Photos, voice memos, and videos upload directly to MinIO bucket with MIME and 15MB size enforcement.
- [x] Append-only Audit Trail: All security, vetting, dispatch, and state transition actions are immutably preserved.
- [x] Zero Mock Dependencies: System tested end-to-end against live PostgreSQL, Redis, MinIO, and Celery.
