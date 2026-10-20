# ResQAi / SENTINELGRID — Complete API Contract Specification
**API Version**: `v1`  
**Base URL**: `http://localhost:8000/api/v1`  
**Auth Scheme**: `Bearer <JWT_ACCESS_TOKEN>`  
**Tracing Header**: `X-Request-Id: <UUID>` (returned on every response)  
**Standard Error Envelope**:
```json
{
  "code": "STRING_ERROR_CODE",
  "message": "Human readable error detail"
}
```

---

## 1. Authentication & Identity (`/auth`)

### 1.1 Register User
- **Method & Path**: `POST /auth/register`
- **Allowed Roles**: `Public`
- **Description**: Registers a new user account. Defaults to `citizen`. Responders can self-register with `role="responder"` (`is_approved=False` until Admin approval).
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "strongPassword123",
    "full_name": "Full Name",
    "phone": "+919876543210",
    "role": "citizen" // or "responder"
  }
  ```
- **Response Body (`201 Created`)**:
  ```json
  {
    "access_token": "jwt.access.token",
    "refresh_token": "jwt.refresh.token",
    "token_type": "bearer",
    "expires_at": 1792500000000,
    "user": {
      "id": "usr_uuid",
      "email": "user@example.com",
      "full_name": "Full Name",
      "role": "citizen",
      "phone": "+919876543210",
      "is_active": true,
      "campus_name": "Northridge Campus (synthetic)"
    }
  }
  ```
- **Errors**: `400 Bad Request` (Email already registered, password < 8 chars), `422 Unprocessable Entity`.

---

### 1.2 User Login
- **Method & Path**: `POST /auth/login`
- **Allowed Roles**: `Public`
- **Rate Limit**: 5 attempts per minute per IP
- **Request Body**:
  ```json
  {
    "email": "operator@campus.demo",
    "password": "demo1234"
  }
  ```
- **Response Body (`200 OK`)**:
  ```json
  {
    "access_token": "jwt.access.token",
    "refresh_token": "jwt.refresh.token",
    "token_type": "bearer",
    "expires_at": 1792500000000,
    "user": {
      "id": "usr_operator",
      "email": "operator@campus.demo",
      "full_name": "Meera Kapoor",
      "role": "operator",
      "is_active": true,
      "campus_name": "Northridge Campus (synthetic)"
    }
  }
  ```
- **Errors**: `401 Unauthorized` (Invalid credentials), `429 Too Many Requests` (Rate limit exceeded; writes to `audit_logs`).

---

### 1.3 Refresh Token
- **Method & Path**: `POST /auth/refresh`
- **Allowed Roles**: `Public`
- **Description**: Revokes prior refresh token in Redis and issues a fresh token pair.
- **Request Body**:
  ```json
  {
    "refresh_token": "jwt.refresh.token"
  }
  ```
- **Response Body (`200 OK`)**: Same as login.
- **Errors**: `401 Unauthorized` (Revoked or expired refresh token).

---

### 1.4 Logout
- **Method & Path**: `POST /auth/logout`
- **Allowed Roles**: `Authenticated`
- **Description**: Blacklists the current JWT access token in Redis until expiry.
- **Response Body (`200 OK`)**:
  ```json
  { "ok": true }
  ```

---

### 1.5 Get Current User (`/auth/me`)
- **Method & Path**: `GET /auth/me`
- **Allowed Roles**: `Authenticated`
- **Response Body (`200 OK`)**:
  ```json
  {
    "id": "usr_uuid",
    "email": "citizen@campus.demo",
    "full_name": "Aisha Rahman",
    "role": "citizen",
    "phone": "+919876543210",
    "is_active": true,
    "campus_name": "Northridge Campus (synthetic)"
  }
  ```

---

## 2. Citizen Workspace (`/citizen`)

### 2.1 Submit SOS Emergency Beacon
- **Method & Path**: `POST /citizen/sos`
- **Allowed Roles**: `citizen`
- **Latency Requirement**: < 1,000 ms response time
- **Request Body**:
  ```json
  {
    "location": {
      "lat": 28.5452,
      "lng": 77.2731,
      "accuracyMeters": 12.5,
      "source": "gps"
    },
    "locationLabel": "Main Quadrangle · Coordinates Broadcasted",
    "note": "Optional voice transcript or note",
    "idempotencyKey": "sos_idemp_uuid"
  }
  ```
- **Response Body (`201 Created`)**:
  ```json
  {
    "id": "rep_uuid",
    "reporterId": "usr_citizen",
    "createdAt": "2026-10-20T09:30:00Z",
    "channel": "sos",
    "category": "personal_safety",
    "urgency": "critical",
    "text": "CRITICAL PERSONAL SOS",
    "location": { "lat": 28.5452, "lng": 77.2731, "source": "gps" },
    "locationLabel": "Main Quadrangle · Coordinates Broadcasted",
    "media": [],
    "processingState": "received",
    "deliveryState": "received_by_server",
    "incidentId": "inc_uuid",
    "synthetic": true
  }
  ```

---

### 2.2 Submit Detailed Incident Report
- **Method & Path**: `POST /citizen/reports`
- **Allowed Roles**: `citizen`
- **Request Body**:
  ```json
  {
    "category": "fire_smoke", // "fire_smoke" | "road_accident" | "medical" | "personal_safety" | "water_flood" | "hazard" | "other"
    "text": "Dense smoke billowing from chemistry wing 2nd floor",
    "location": { "lat": 28.5464, "lng": 77.2741, "source": "manual_map" },
    "locationLabel": "Chemistry Lab B Block",
    "channel": "form", // "sos" | "form" | "voice"
    "idempotencyKey": "draft_idemp_key_123",
    "mediaAssetIds": ["med_uuid_1"]
  }
  ```
- **Response Body (`201 Created` or `200 OK` for duplicate idempotency key)**: Same as Report object above.

---

### 2.3 List My Reports
- **Method & Path**: `GET /citizen/reports`
- **Allowed Roles**: `citizen`
- **Response Body (`200 OK`)**: `List[ReportResponse]`

---

### 2.4 Cancel Report
- **Method & Path**: `POST /citizen/reports/{id}/cancel`
- **Allowed Roles**: `citizen` (Must be the report creator)
- **Constraint**: Allowed only if incident is still `reported` or `under_review` (pre-dispatch).
- **Request Body**: `{ "reason": "Accidental report / situation resolved" }`
- **Errors**: `400 Bad Request` (Incident already dispatched/confirmed), `403 Forbidden` (Not report owner).

---

### 2.5 Trusted Contacts Management
- `GET /citizen/contacts`: Returns up to 3 trusted contacts.
- `POST /citizen/contacts`: Adds a contact (`{ name, phone, relationship_label }`). Fails if count >= 3.
- `DELETE /citizen/contacts/{id}`: Removes a trusted contact.

---

### 2.6 Nearby Alerts Feed
- **Method & Path**: `GET /citizen/alerts/nearby`
- **Allowed Roles**: `citizen`
- **Privacy Constraint**: Coordinates are coarsened using PostGIS grid rounding (~100m blur).
- **Response Body (`200 OK`)**:
  ```json
  [
    {
      "id": "alt_1",
      "category": "fire_smoke",
      "title": "Fire & Smoke · Main Market Road",
      "distanceLabel": "350m away",
      "statusLabel": "Responders En Route",
      "tone": "active",
      "coarsened": true
    }
  ]
  ```

---

## 3. Operator Command Center (`/operator`)

### 3.1 Report Triage Queue
- **Method & Path**: `GET /operator/reports/queue`
- **Allowed Roles**: `operator`, `admin`
- **Response Body (`200 OK`)**: List of unreviewed reports (`processingState in ['received', 'queued_for_ai']`).

---

### 3.2 Active Incidents Queue
- **Method & Path**: `GET /operator/incidents`
- **Allowed Roles**: `operator`, `admin`
- **Query Params**: `status`, `category`, `urgency`
- **Ordering**: Sorted by urgency priority (`critical` > `high` > `medium` > `low`), then `createdAt DESC`.

---

### 3.3 Incident Detailed Workspace
- **Method & Path**: `GET /operator/incidents/{id}`
- **Allowed Roles**: `operator`, `admin`
- **Response Body (`200 OK`)**:
  ```json
  {
    "incident": { ... },
    "linkedReports": [ ... ],
    "evidence": {
      "text": { ... },
      "vision": { ... },
      "duplicates": [ ... ]
    },
    "assignments": [ ... ],
    "timeline": [ ... ]
  }
  ```

---

### 3.4 Merge Reports
- **Method & Path**: `POST /operator/actions/merge`
- **Allowed Roles**: `operator`
- **Request Body**:
  ```json
  {
    "targetIncidentId": "inc_402",
    "reportIds": ["rep_5", "rep_6"],
    "reason": "Reports confirm same vehicular collision at Bypass Junction"
  }
  ```
- **Audit**: Writes `MERGE_REPORTS` event to `audit_logs`.

---

### 3.5 Split Report
- **Method & Path**: `POST /operator/actions/split`
- **Allowed Roles**: `operator`
- **Request Body**:
  ```json
  {
    "reportId": "rep_6",
    "reason": "Report actually describes a separate water pipe burst nearby"
  }
  ```
- **Audit**: Writes `SPLIT_REPORT` event to `audit_logs`.

---

### 3.6 Advance Incident State Machine
- **Method & Path**: `POST /operator/actions/state`
- **Allowed Roles**: `operator`
- **Request Body**:
  ```json
  {
    "incidentId": "inc_402",
    "toStatus": "confirmed",
    "reason": "Corroborated by eyewitness photos and security guard verification"
  }
  ```
- **Validation**: Enforces strict Section 2.2.B transition table. Returns `400 Bad Request` on illegal transition.

---

### 3.7 Override AI Assessment
- **Method & Path**: `POST /operator/actions/override`
- **Allowed Roles**: `operator`
- **Request Body**:
  ```json
  {
    "incidentId": "inc_402",
    "category": "fire_smoke",
    "urgency": "critical",
    "reason": "Visible flames spreading towards fuel storage"
  }
  ```
- **Audit**: Writes `OVERRIDE_AI` event to `audit_logs`.

---

### 3.8 Dispatch Offer
- **Method & Path**: `POST /operator/actions/dispatch`
- **Allowed Roles**: `operator`
- **Request Body**:
  ```json
  {
    "incidentId": "inc_402",
    "responderId": "resp_f2_uuid"
  }
  ```
- **Response Body (`201 Created`)**:
  ```json
  {
    "id": "asg_uuid",
    "incidentId": "inc_402",
    "responderId": "resp_f2_uuid",
    "status": "offered",
    "offeredAt": "2026-10-20T09:35:00Z",
    "offerDeadline": "2026-10-20T09:36:30Z",
    "etaMinutes": 5,
    "distanceKm": 1.2
  }
  ```

---

## 4. Field Responders (`/responder`)

### 4.1 Get Active Missions & Offers
- **Method & Path**: `GET /responder/assignments`
- **Allowed Roles**: `responder`
- **Object-Level Check**: Returns assignments strictly linked to the authenticated responder's profile.

---

### 4.2 Respond to Mission Offer
- **Method & Path**: `POST /responder/offers/{id}/respond`
- **Allowed Roles**: `responder`
- **Request Body**:
  ```json
  {
    "status": "accepted", // or "declined"
    "reason": "En route with crew of 4"
  }
  ```

---

### 4.3 Update Assignment Status
- **Method & Path**: `POST /responder/assignments/{id}/status`
- **Allowed Roles**: `responder`
- **Request Body**:
  ```json
  {
    "status": "en_route", // "en_route" | "arrived" | "completed" | "failed"
    "failureReason": "Vehicle tire puncture on ring road" // required if status === "failed"
  }
  ```

---

### 4.4 Ingest Location Telemetry Ping
- **Method & Path**: `POST /responder/location`
- **Allowed Roles**: `responder`
- **Request Body**:
  ```json
  {
    "lat": 28.5458,
    "lng": 77.2736,
    "accuracyMeters": 8.0
  }
  ```
- **Side Effect**: Updates `last_known_location` in `responder_profiles`.

---

### 4.5 Toggle Duty Status
- **Method & Path**: `PATCH /responder/duty`
- **Allowed Roles**: `responder`
- **Request Body**: `{ "availability": "available" }` // "available" | "busy" | "off_duty"

---

## 5. Media & Storage (`/media`)

### 5.1 Request Presigned Upload URL
- **Method & Path**: `POST /media/upload-url`
- **Allowed Roles**: `Authenticated`
- **Request Body**:
  ```json
  {
    "fileName": "evidence_photo.jpg",
    "mimeType": "image/jpeg",
    "fileSizeBytes": 4500000
  }
  ```
- **Validation**: Rejects files > 15MB or unsupported MIME types (`image/jpeg`, `image/png`, `audio/webm`, `audio/mp4`, `video/mp4`).
- **Response Body (`200 OK`)**:
  ```json
  {
    "mediaAssetId": "med_uuid",
    "uploadUrl": "http://minio:9000/sentinelgrid-evidence/...signed_put...",
    "expiresInSeconds": 900
  }
  ```

---

## 6. Campus Admin (`/admin`)

- `GET /admin/responders`: List all field responders.
- `POST /admin/responders/{id}/approve`: Approves responder vetting (`{ "approved": true }`).
- `GET, PUT /admin/operating-area`: Read and update campus geofence polygon (GeoJSON Polygon validation).
- `GET /admin/audit-logs`: Searchable audit trail (`?actor=&action=&since=`).
- `POST /admin/drill-mode`: Toggles simulated drill mode (`{ "enabled": true }`).

---

## 7. Realtime WebSocket Gateway (`/ws`)

- **URL**: `ws://localhost:8000/api/v1/ws?token=<ACCESS_TOKEN>&since=<ISO_TIMESTAMP>`
- **Channels**:
  - `operator:all`: Receives all incoming reports, incident updates, and dispatch events.
  - `responder:{unit_id}`: Receives mission offers and status directives for that unit.
  - `citizen:{user_id}`: Receives status updates on submitted reports only.
