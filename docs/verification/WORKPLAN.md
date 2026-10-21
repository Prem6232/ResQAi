# WORKPLAN: ResQAi / SENTINELGRID verification

Run in order. One WP per session. Record each item in PROGRESS.md as `WPn.m | result | evidence`.
Frontend contract files: `apps/web/src/types/`, `apps/web/src/features/*/api/`, `apps/web/src/config/permissions.config.ts`.

## WP0 Baseline
- 0.1 `git status -s | head`, `git log --oneline | head -5`. Record branch and commit.
- 0.2 `docker compose ps`. Postgres, Redis, MinIO running and healthy.
- 0.3 Python and Node versions. `alembic heads` shows exactly one head. `alembic current` equals head.
- 0.4 `pytest --collect-only -q | tail -3`. Collected count vs the claimed 95.
- 0.5 Tests use a separate test database (read only the DB URL lines of `tests/conftest.py`).

## WP1 Full test run
- 1.1 `pytest -q --tb=line -p no:cacheprovider | tail -25`. Record passed, failed, skipped.
- 1.2 List failing test IDs, and skipped or xfail tests with reasons.
- 1.3 Run the suite 2 more times. Note any difference (flaky tests).
- 1.4 `pytest --cov=app --cov-report=term | tail -15`. Overall coverage (target 80 percent).

## WP2 Database and migrations (use throwaway DB resqai_verify)
- 2.1 `alembic upgrade head` on an empty database succeeds.
- 2.2 `alembic downgrade -1` then `upgrade head` succeeds.
- 2.3 PostGIS extension present (`SELECT PostGIS_Version()`).
- 2.4 A GiST index exists on every geometry column.
- 2.5 Indexes exist on status, created_at and foreign keys for incident, report, assignment. List any missing.
- 2.6 `alembic check` shows no drift between models and migrations.
- 2.7 `scripts/seed.py` runs twice without error. Four demo users exist.

## WP3 Secrets and configuration
- 3.1 `git ls-files | grep -E "\.env$"` returns nothing. `.env` is in `.gitignore`.
- 3.2 grep tracked files for secret patterns (SECRET, BEGIN PRIVATE, AKIA, password=) excluding tests and seed. List hits.
- 3.3 Default or dev secrets (JWT, MinIO): does the app refuse to start with defaults in production mode?
- 3.4 CORS has no wildcard together with credentials. Origins come from settings.
- 3.5 grep log calls for token, password, phone. Confirm masking.
- 3.6 API docs and debug are disabled or protected in production settings.

## WP4 Authentication
- 4.1 Register creates citizen only. A `role` field in the body is ignored.
- 4.2 Login works for all four roles. Wrong password gives 401.
- 4.3 Missing, expired and tampered tokens give 401.
- 4.4 Refresh rotation: the old refresh token is rejected after use.
- 4.5 Logout adds the token to the Redis denylist. The next call gives 401.
- 4.6 Login rate limit (5 per minute) gives 429 and writes a FAILED_LOGIN audit row.
- 4.7 Passwords stored as Argon2id. No plaintext anywhere.
- 4.8 An unapproved responder cannot receive or accept offers.

## WP5 Role matrix
- 5.1 Save route list from `/openapi.json` to `docs/verification/routes.txt`.
- 5.2 Script calls every route as anonymous, citizen, responder, operator and admin. Compare with permissions expectations. List every unexpected 2xx.
- 5.3 Object level: citizen A reading citizen B report, and a responder updating another unit assignment, are both denied.
- 5.4 Anonymous reports hide reporter identity in responder views.

## WP6 Citizen reporting
- 6.1 SOS returns 201 under 1 second with the Celery worker stopped. 20 calls, record p50 and p95.
- 6.2 Same idempotency key twice gives one row.
- 6.3 Invalid coordinates, empty body and oversized text give 422.
- 6.4 Cancel works before dispatch and is rejected after.
- 6.5 Trusted contacts maximum of 3 enforced. A user can delete only their own.
- 6.6 Nearby alerts coordinates are coarsened (about 100 m). No reporter fields.
- 6.7 Force a failure after the report insert. No orphan report or outbox row remains (same transaction).

## WP7 Media
- 7.1 Presigned upload rejects disallowed MIME types and sizes over the limit at request time.
- 7.2 Confirm checks that the object exists and that size and type match.
- 7.3 Signed GET URL expires within 15 minutes and is limited to one object.
- 7.4 The bucket is private (anonymous GET denied).
- 7.5 A user cannot confirm or fetch another user's media.

## WP8 Clustering
- 8.1 Find the radius and time window in code. README says 150 m and 10 minutes, the build pack said 30 minutes. Record the truth.
- 8.2 Boundary test: 149 m vs 151 m, just inside vs just outside the time window.
- 8.3 Different category within the radius: attached or separate? Record behaviour.
- 8.4 Resolved or closed incidents never receive new reports.
- 8.5 Ten simultaneous reports at one spot produce one incident (no race duplicates).

## WP9 Incident state machine
- 9.1 Extract allowed transitions from code. Compare with statuses in `types/incident.ts`: reported, under_review, confirmed, assigned, en_route, on_scene, resolved, closed, cancelled, duplicate, unverified.
- 9.2 Script all pairs. Record allowed vs rejected. Report any pair allowed that should not be.
- 9.3 Every transition writes a status event and an audit log row.
- 9.4 Only operators can transition manually. Responder status changes map correctly to incident status.
- 9.5 Merge keeps all reports and media, requires a reason, writes audit.

## WP10 Outbox and Celery
- 10.1 Find the outbox relay. What publishes rows, how often, and does it use `FOR UPDATE SKIP LOCKED` or an equivalent?
- 10.2 Stop the worker, submit reports, start the worker. Assessments appear exactly once.
- 10.3 Retry with backoff and a dead-letter path exist. A failing task does not loop forever.
- 10.4 Redis down for 30 seconds: SOS is still stored, events delivered after recovery.
- 10.5 Duplicate task delivery produces one AIAssessment.

## WP11 AI adapters
- 11.1 For each adapter (text, voice, vision, duplicate): mock or real? Are model weights and dependencies actually present? README claims faster-whisper and PyTorch. Record the truth.
- 11.2 Force each adapter to raise. Report stays visible with `ai_failed` and `reviewRequired=true`.
- 11.3 Outputs include confidence, model version and explanation. Labels match `types/ai-evidence.ts`.
- 11.4 A per-task timeout is enforced.
- 11.5 If real models exist: run 3 sample inputs each and record outputs. Note which have no accuracy evaluation.
- 11.6 Duplicate matcher uses distance, time and text. Known duplicates flagged, distant reports not.

## WP12 Dispatch
- 12.1 Only an authenticated operator can dispatch. A system or worker call gives 401 or 403. No code path dispatches without an operator id.
- 12.2 Recommendations rank by distance and capability. Unapproved and off-duty units are excluded.
- 12.3 Offer deadline is 90 seconds. Expiry sets `expired`, escalates to the next candidate, and notifies the operator when candidates run out.
- 12.4 Accept and decline work. A double accept race is safe. Accept after expiry is rejected.
- 12.5 Assignment transitions match `types/assignment.ts` (offered, accepted, en_route, arrived, completed, declined, expired, cancelled, failed). Illegal pairs rejected.

## WP13 Responder
- 13.1 Location ping updates the profile. Input is validated. Path matches the frontend (`location` vs `location-ping`).
- 13.2 Duty toggle works. An off-duty unit gets no offers.
- 13.3 Notes are append only with a length limit.
- 13.4 A responder sees only their own assignments.
- 13.5 Data exists for the responder history and stats screens.

## WP14 Realtime
- 14.1 WebSocket rejects a missing or invalid token.
- 14.2 Channel isolation: a citizen never gets operator or responder events. A responder gets only their own unit.
- 14.3 SOS to operator event latency over 20 trials. p95 under 2 seconds.
- 14.4 `?since=` replay returns missed events in order with no duplicates.
- 14.5 Event envelope matches `types/websocket.ts` (id, type, occurredAt, incidentId, payload).
- 14.6 100 connect and disconnect cycles leave no leaked connections. An expired token on a long-lived socket is handled.

## WP15 Admin and analytics
- 15.1 Approve and revoke are admin only. A revoked responder immediately loses offers.
- 15.2 Polygon validation rejects self-intersection, fewer than 3 points, wrong SRID and swapped coordinates.
- 15.3 Audit log has no PUT, PATCH or DELETE route (405). Note any database-level protection.
- 15.4 Audit search filters and pagination work. Entries exist for verify, dispatch, merge, override, approve and failed login.
- 15.5 Analytics numbers match hand-computed SQL on seed data. No divide-by-zero.
- 15.6 Drill mode toggle is admin only.

## WP16 Frontend contract match
- 16.1 For each file in `apps/web/src/features/*/api/*.ts` extract method and path. Confirm a backend route exists. List mismatches (known suspects: `/citizen/alerts` vs `/alerts/nearby`, `/responder/location-ping` vs `/location`).
- 16.2 Compare enum values with `apps/web/src/types/`: categories (is flood present?), urgency, statuses.
- 16.3 Compare field names and casing (camelCase vs snake_case) for report, incident, assignment, user and websocket event.
- 16.4 Pagination and error envelope shapes match what the axios setup expects.
- 16.5 Demo credentials are identical in seed and frontend.

## WP17 Web app
- 17.1 `npx tsc --noEmit | tail -20`.
- 17.2 `npm run lint | tail -20` and `npm run build | tail -15`. Note bundle size.
- 17.3 `npm test -- --run | tail -15`.
- 17.4 `VITE_USE_MOCK_API=false` is honoured. No production imports of `mock-store` or `mock-api`.
- 17.5 Each role's routes map to existing backend endpoints. Unauthorized redirect works (static check).
- 17.6 The offline queue sends the idempotency key on retry.
- 17.7 Map tile and environment variables are documented in `.env.example`.

## WP18 Mobile app
- 18.1 `npx tsc --noEmit | tail -20`.
- 18.2 `src/config/api.ts` resolves the base URL for emulator (10.0.2.2), device and env. No hard-coded dev IP in release.
- 18.3 Endpoints in `src/services/api.ts` exist in the backend. How are tokens stored (secure store or plain)?
- 18.4 `realtime.ts` reconnects with backoff and uses `?since=` replay.
- 18.5 Any `mlBridge` mock path still used in a production flow. It must be clearly labelled.
- 18.6 Location, camera and microphone permissions declared with rationale. Background location use?
- 18.7 Optional, only if budget allows: `npm run build:apk` succeeds. BLOCKED is acceptable.

## WP19 Docs vs reality
- 19.1 Every file and folder in the README structure exists.
- 19.2 README endpoint table matches the OpenAPI paths. List differences.
- 19.3 `docs/api-contract.md` vs OpenAPI differences.
- 19.4 Spot check all 25 tests T1 to T25: each has a named test that really asserts the stated outcome (use grep for names and asserts).
- 19.5 Claims such as high-availability, fault-tolerant, production-grade: list the supporting evidence. Mark unsupported ones.
- 19.6 Python version consistent across Dockerfile, README and requirements.

## WP20 Security pass
- 20.1 `pip-audit -r requirements.txt | tail -20` and `npm audit --omit=dev | tail -15` for web and mobile.
- 20.2 grep for raw SQL (`text(`, f-string SQL). Confirm parameterised.
- 20.3 Security headers, request size limits, upload limits.
- 20.4 IDOR sweep on every `{id}` route from `routes.txt`.
- 20.5 Rate limits exist on SOS, report creation and uploads.
- 20.6 Container runs non-root, no secrets in layers, healthchecks present.
- 20.7 Logs and responses never expose phone numbers or emails to the wrong role.

## WP21 Performance (throwaway DB)
- 21.1 Seed 5,000 incidents. `EXPLAIN ANALYZE` the active incidents query (target under 300 ms) and nearby responders (under 100 ms). Confirm index use.
- 21.2 Burst of 100 SOS requests in 60 seconds: zero failures. Record queue drain time.
- 21.3 100 concurrent WebSocket clients stay stable.

## WP22 End-to-end scenarios (script with httpx, one item each)
- 22.1 Multi-report fire: two nearby reports, one grouped incident, override urgency, dispatch.
- 22.2 Responder lifecycle: offer, accept, en route, arrived, notes, resolved.
- 22.3 False alarm with mandatory reason, citizen informed, audit entry.
- 22.4 Offline retry with idempotency key creates one report.
- 22.5 AI outage: stop workers, reports reach the operator queue, restart, assessments appear.
- 22.6 Responder vetting gate: new responder cannot get offers until admin approves.
- 22.7 Dispatch escalation after 90 seconds with no answer.
- 22.8 Admin edits geofence, audit log shows operator actions.

## WP23 Final report
- 23.1 Write `docs/verification/FINAL_REPORT.md` (one page maximum): PASS, FAIL and BLOCKED counts per WP, verdict per area, open blockers and majors, unverified README claims, and a recommended fix order. Use only PROGRESS.md and FINDINGS.md as input.
