# ResQAI Complete 4-Tier Testing & Bug-Fix Report

**Date:** 2026-11-27  
**Workspace:** `f:\ResQAi`  
**Scope Executed & Verified:** Web Frontend (`apps/web`), Mobile (`apps/mobile` Jest + strict TypeScript), and Full Backend API + Live PostgreSQL/PostGIS & Redis Suites (`services/api`)

---

## 1. Executive Summary

All four software testing tiers — **Unit Testing**, **Integration Testing**, **System Testing**, and **User Acceptance Testing (UAT)** — were implemented and verified across the Web frontend, React Native / Expo mobile app, and FastAPI backend connected to live Docker PostgreSQL/PostGIS (`localhost:5432`), Redis (`localhost:6379`), and MinIO (`localhost:9000-9001`) services.

During System Testing (`SYS-4b`), Mobile/Web real-world audits, and live PostgreSQL/Redis integration execution, critical bugs were uncovered and resolved: an infinite auto-ping/render loop in [`LiveResponderMap.tsx`](file:///f:/ResQAi/apps/web/src/components/maps/LiveResponderMap.tsx), superseded-socket reconnect leaks in [`useWebSocket.ts`](file:///f:/ResQAi/apps/web/src/hooks/useWebSocket.ts), silent demo-account hijacking and zombie WebSocket/GPS loops in [`apps/mobile/src/services/api.ts`](file:///f:/ResQAi/apps/mobile/src/services/api.ts), [`apps/mobile/src/services/realtime.ts`](file:///f:/ResQAi/apps/mobile/src/services/realtime.ts), and [`apps/mobile/App.tsx`](file:///f:/ResQAi/apps/mobile/App.tsx), an Admin `/api/v1/admin/operating-area` RBAC leak in [`services/api/app/modules/admin/router.py`](file:///f:/ResQAi/services/api/app/modules/admin/router.py), plus modal accessibility gaps and TypeScript strictness errors. Additionally, a Jest + React Native Testing Library (`jest-expo`) runtime test harness was installed and verified for `apps/mobile`.

| Target | Command / Scope | Result After Final Edit |
| :--- | :--- | :--- |
| **Web Frontend Tests (`apps/web`)** | `npm --prefix apps\web test` (Vitest) | **16 files passed, 70 tests passed** (12.33s) |
| **Web Frontend Lint (`apps/web`)** | `npm --prefix apps\web run lint` (`eslint . --ext ts,tsx --max-warnings 0`) | **0 errors, 0 warnings** |
| **Web Production Build (`apps/web`)** | `npm --prefix apps\web run build` (`tsc -b && vite build`) | **Passed** (`2548` modules transformed, built in 14.66s) |
| **Mobile Runtime Tests (`apps/mobile`)** | `npm --prefix apps\mobile test` (`jest` with `jest-expo`) | **2 suites passed, 10 tests passed** (7.966s) |
| **Mobile TypeScript Check (`apps/mobile`)** | `apps\mobile\node_modules\.bin\tsc.cmd -p apps\mobile\tsconfig.json --noEmit` | **0 errors** (exit code 0) |
| **Backend Full Live DB/Redis Suite (`services/api`)** | `services\api\.venv\Scripts\python.exe -m pytest services\api\tests -v` | **131 passed, 0 failed, 0 skipped** (18.35s) |

---

## 2. Critical Production & Test Bugs Found and Resolved

### 2.1 Infinite Responder Auto-Ping & Re-Render Loop in `LiveResponderMap`
- **Root Cause:** In [`ResponderDashboard.tsx`](file:///f:/ResQAi/apps/web/src/pages/responder/ResponderDashboard.tsx), `<LiveResponderMap>` received an inline `onLocationSynced={() => void refresh()}` prop while `enableAutoPing={Boolean(activeMission)}`. Inside [`LiveResponderMap.tsx`](file:///f:/ResQAi/apps/web/src/components/maps/LiveResponderMap.tsx), `sendManualPing` listed `liveSelfPoint` and `onLocationSynced` in its `useCallback` dependencies, and the `autoPing` `useEffect` depended on `sendManualPing`. Accepting a dispatch offer caused an unbounded async Promise/render loop that stalled `SYS-4b`.
- **Secondary Polling Bug:** In `control_room` mode inside [`LiveResponderMap.tsx`](file:///f:/ResQAi/apps/web/src/components/maps/LiveResponderMap.tsx#L179-L202), `lastUpdatedAt` and the `externalResponders` array reference were included in the polling `useEffect` dependency array alongside `onRespondersUpdated` inside `fetchControlRoomRoster`, tearing down and resetting the polling interval on state updates.
- **Fix Applied:**
  1. Added `mountedRef`, `liveSelfPointRef`, `onLocationSyncedRef`, and `onRespondersUpdatedRef` inside [`LiveResponderMap.tsx`](file:///f:/ResQAi/apps/web/src/components/maps/LiveResponderMap.tsx#L130-L270) so `sendManualPing` and `fetchControlRoomRoster` depend only on `[mode]`.
  2. Replaced `[mode, externalResponders, fetchControlRoomRoster, pollIntervalMs, lastUpdatedAt]` with `[mode, hasExternalResponders, fetchControlRoomRoster, pollIntervalMs]`.
  3. Passed memoized `onLocationSynced={refresh}` in [`ResponderDashboard.tsx`](file:///f:/ResQAi/apps/web/src/pages/responder/ResponderDashboard.tsx#L108-L117).
  4. Added a regression test in [`responderRoleComplete.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/responder/responderRoleComplete.test.tsx#L361-L384).

### 2.2 Modal Accessibility Gaps (`DialogDescription`)
- **Finding:** Radix UI logged `Warning: Missing Description or aria-describedby={undefined} for {DialogContent}` across operator and responder modals.
- **Fix Applied:** Exported `DialogDescription` in [`dialog.tsx`](file:///f:/ResQAi/apps/web/src/components/ui/dialog.tsx#L38-L49) and wired `<DialogDescription>` into [`HumanOversightReviewModal.tsx`](file:///f:/ResQAi/apps/web/src/features/operator/components/HumanOversightReviewModal.tsx), [`OfferNotificationModal.tsx`](file:///f:/ResQAi/apps/web/src/features/responder/components/OfferNotificationModal.tsx), [`ReportMergeModal.tsx`](file:///f:/ResQAi/apps/web/src/components/coordination/ReportMergeModal.tsx), and [`GetApkModal.tsx`](file:///f:/ResQAi/apps/web/src/components/common/GetApkModal.tsx).

### 2.3 Safe Session Deserialization in `AuthContext`
- **Finding:** `readStored()` in [`AuthContext.tsx`](file:///f:/ResQAi/apps/web/src/context/AuthContext.tsx#L6-L15) called `JSON.parse(raw)` without exception handling, risking startup crashes on malformed `localStorage["sg.session"]`.
- **Fix Applied:** Wrapped `JSON.parse` in `try/catch` and cleared corrupt `sg.session` entries safely (covered by `INT-1`).

### 2.4 Web WebSocket Handler Leak on Auth Refresh
- **Root Cause:** In [`useWebSocket.ts`](file:///f:/ResQAi/apps/web/src/hooks/useWebSocket.ts#L90-L188), `handleAuthChanged` closed the previous WebSocket instance (`ws.close()`) before detaching its `onclose` listener, allowing an asynchronous `onclose` callback from the superseded socket to trigger duplicate backoff timers or mutate `connected` state.
- **Fix Applied:** Added `detachSocket()` and current-socket identity guards (`ws !== currentWs`) (verified by `INT-6` in [`frontendApiIntegration.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/integration/frontendApiIntegration.test.tsx)).

### 2.5 Mobile Auth Security, GPS Loop, Zombie WebSocket & Role-Switch Fixes
- **Silent Demo Hijack Fix ([`apps/mobile/src/services/api.ts`](file:///f:/ResQAi/apps/mobile/src/services/api.ts)):** Removed automatic `loginAs(currentRole)` fallback on missing tokens or `401` responses. Added locked `refreshSession()` token rotation via `/auth/refresh`, role enforcement on login (restricting mobile login to `citizen`/`responder`), and `onAuthExpired` invalidation returning the user to `AuthScreen`.
- **GPS Movement Refetch & Zombie WebSocket Fix ([`apps/mobile/App.tsx`](file:///f:/ResQAi/apps/mobile/App.tsx), [`apps/mobile/src/services/realtime.ts`](file:///f:/ResQAi/apps/mobile/src/services/realtime.ts)):** Replaced `deviceLocation` effect dependencies with `deviceLocationRef` so GPS movement no longer re-fetches all REST endpoints or reconnects WebSockets on every coordinate tick. Added `shouldReconnect` gating, handler detaching in `disconnect()`, auth-close (`4001`/`4401`/`1008`) refresh retry, and full state cleanup + `mobileRealtime.disconnect()` on logout.
- **Safe Role Switcher ([`apps/mobile/App.tsx`](file:///f:/ResQAi/apps/mobile/App.tsx)):** `handleSelectRole` re-authenticates `@campus.demo` sessions via `loginAs(newRole)` when switching demo modes, and prompts real single-role accounts to sign out before switching roles.

### 2.6 TypeScript Strictness & System Test State Cleanliness
- **Fixes Applied:**
  - Fixed `NearbyAlert.location` object literal and updated `evidenceLabel` to `"confirmed_by_operator"` in [`uatRealWorldScenarios.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/uat/uatRealWorldScenarios.test.tsx) so `tsc -b` passes cleanly.
  - Updated `evidenceLabel` to `"confirmed_by_operator"` and cleaned up `SYS-3`/`SYS-4a`/`SYS-4b`/`SYS-4c` in [`systemFullFlow.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/system/systemFullFlow.test.tsx) (`within(dialog)` scoping, `fireEvent(window, new Event("online"))`, removed debug trace logs and synthetic audit injection).

### 2.7 Admin Operating-Area RBAC Isolation Fix & Mobile Jest Runtime Harness
- **Admin RBAC Regression Fix ([`services/api/app/modules/admin/router.py`](file:///f:/ResQAi/services/api/app/modules/admin/router.py)):** Live DB integration testing (`test_admin_analytics.py::test_admin_rbac_isolation`) caught `GET /api/v1/admin/operating-area` returning HTTP `200` to Citizens instead of `403`. Restricted `GET /api/v1/admin/operating-area` back to `require_roles(["admin", "operator"])` while all authenticated roles continue reading boundaries via `/api/v1/operating-area` in [`geospatial/router.py`](file:///f:/ResQAi/services/api/app/modules/geospatial/router.py). Full live pytest re-run passed all `131` tests.
- **Mobile Jest + RNTL Harness ([`apps/mobile/package.json`](file:///f:/ResQAi/apps/mobile/package.json)):** Installed `jest` (`~29.7.0`), `jest-expo` (`~57.0.6`), and `@testing-library/react-native` (`^14.1.0`), configured `"test": "jest"` with `"preset": "jest-expo"`, and added runtime unit/service and UI integration test suites ([`mobileApiAndRealtime.test.ts`](file:///f:/ResQAi/apps/mobile/__tests__/mobileApiAndRealtime.test.ts) and [`mobileScreensAndApp.test.tsx`](file:///f:/ResQAi/apps/mobile/__tests__/mobileScreensAndApp.test.tsx)).

---

## 3. Tier-by-Tier Coverage Breakdown

### Tier 1 — Unit Testing (Isolated Functions, Models, Adapters & Utils)

#### Web Frontend Unit Suites (10 files, 37 tests passed)
| Suite File | Tests | Verified Scope |
| :--- | :---: | :--- |
| [`coreAuthAndApiUnit.test.ts`](file:///f:/ResQAi/apps/web/src/tests/unit/coreAuthAndApiUnit.test.ts) | 5 | Category/urgency normalizers, RBAC `permissionMatrix`, route builders, `sanitizeToBhopal`, Haversine distance, Axios JWT + `X-Request-Id` interceptors, relative timestamps |
| [`liveResponderMapUtils.test.ts`](file:///f:/ResQAi/apps/web/src/components/maps/liveResponderMapUtils.test.ts) | 5 | Responder marker themes, trackability guards, straight-line routes, WS telemetry coordinate patching |
| [`mapConstants.test.ts`](file:///f:/ResQAi/apps/web/src/components/maps/mapConstants.test.ts) | 1 | Leaflet `[lat, lng]` ↔ GeoJSON `[lng, lat]` coordinate conversions |
| [`backendCapabilities.test.ts`](file:///f:/ResQAi/apps/web/src/lib/backendCapabilities.test.ts) | 2 | Backend capability resolution & defaults |
| [`health.test.ts`](file:///f:/ResQAi/apps/web/src/lib/health.test.ts) | 3 | Health probe helpers & degraded status parsing |
| [`operatorBhopalGeofence.test.ts`](file:///f:/ResQAi/apps/web/src/tests/operator/operatorBhopalGeofence.test.ts) | 6 | Bhopal Metro geofence coordinate clamping & validation |
| [`operatorDispatchWorkflow.test.ts`](file:///f:/ResQAi/apps/web/src/tests/operator/operatorDispatchWorkflow.test.ts) | 5 | Operator dispatch state guards & recommendation sorting |
| [`operatorQueueTriage.test.ts`](file:///f:/ResQAi/apps/web/src/tests/operator/operatorQueueTriage.test.ts) | 4 | Incident queue priority & triage filtering |
| [`adminResponderVetting.test.ts`](file:///f:/ResQAi/apps/web/src/tests/admin/adminResponderVetting.test.ts) | 3 | `/admin/responders` roster fetching, fail-closed `approved=false` default, approval/revocation payloads |
| [`adminGeofenceAndAudit.test.ts`](file:///f:/ResQAi/apps/web/src/tests/admin/adminGeofenceAndAudit.test.ts) | 3 | Audit DTO mapping, Bhopal Metro polygon round-trip, `/admin/drill-mode` persistence |

#### Mobile Unit & Service Suite (`jest-expo`)
| Suite File | Tests | Verified Scope |
| :--- | :---: | :--- |
| [`mobileApiAndRealtime.test.ts`](file:///f:/ResQAi/apps/mobile/__tests__/mobileApiAndRealtime.test.ts) | 6 | Fail-closed auth without token, `401` refresh rotation via `/auth/refresh`, expired-refresh `onAuthExpired` callback + logout cleanup, blocking `operator`/`admin` mobile login, WS `disconnect()` `shouldReconnect` & handler detachment, auth-close (`4401`) refresh-and-reconnect |

#### Backend Unit & Foundation Suites (6 files, 32 tests passed against live DB/Redis env)
| Suite File | Tests | Verified Scope |
| :--- | :---: | :--- |
| [`test_foundation.py`](file:///f:/ResQAi/services/api/tests/unit/test_foundation.py) | 4 | Live PostgreSQL/PostGIS & Redis foundation connectivity and baseline checks |
| [`test_tier1_unit_core_ai_routing.py`](file:///f:/ResQAi/services/api/tests/unit/test_tier1_unit_core_ai_routing.py) | 7 | Argon2id password hashing, JWT access/refresh/expiry/tamper rejection, WKT/WKB extraction & privacy coarsening, Shapely bowtie rejection, `StraightLineProvider` & `OSRMProvider` fallback, AI text/voice/vision/duplicate adapters |
| [`test_admin_bugfixes.py`](file:///f:/ResQAi/services/api/tests/unit/test_admin_bugfixes.py) | 4 | P95/avg latency calculation, drill-mode PostgreSQL fallback when Redis unavailable, default Bhopal operating area initialization, active incident status counting |
| [`test_citizen_role_complete.py`](file:///f:/ResQAi/services/api/tests/unit/test_citizen_role_complete.py) | 5 | SOS idempotency + outbox broadcast, media ownership checks, citizen cancel RBAC & post-dispatch lock, nearby alerts privacy masking, 3-contact cap & GDPR deletion audit |
| [`test_operator_and_responder_fixes.py`](file:///f:/ResQAi/services/api/tests/unit/test_operator_and_responder_fixes.py) | 8 | Legacy Delhi→Bhopal coordinate normalization (preventing 588 km ETA bug), operator state transitions & audits, AI override, report merge + outbox, unapproved unit rejection, responder IDOR & offer expiry |
| [`test_responder_role_complete.py`](file:///f:/ResQAi/services/api/tests/unit/test_responder_role_complete.py) | 4 | Duty & `share_location` persistence, overdue offer auto-expiry + outbox, decline/failure reopening incident & illegal transition blocks, profile/history/cross-unit guard |

---

### Tier 2 — Integration Testing (Module, Service, API Client, Storage & Middleware Communication)

#### Web Frontend Integration Suites (4 files, 24 tests passed)
| Suite File | Tests | Verified Integration Boundary |
| :--- | :---: | :--- |
| [`frontendApiIntegration.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/integration/frontendApiIntegration.test.tsx) | 6 | Real `api.ts` + `axios.ts` interceptors + `AuthProvider` + `OfflineSyncProvider` + `WebSocketProvider` + `ResponderApprovalTable` + `ResponderTaskView` + `LiveResponderMap` over `http.defaults.adapter` (INT-1 through INT-6) |
| [`citizenRoleComplete.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/citizen/citizenRoleComplete.test.tsx) | 7 | All Citizen pages (`CitizenDashboard`, `SOSSubmitPage`, `DetailedReportPage`, `CitizenAlertsPage`, `MyReportsHistoryPage`, `ReportReceiptPage`, `CitizenContactsPage`, `SettingsPrivacyPage`) + `OfflineSyncProvider` |
| [`responderRoleComplete.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/responder/responderRoleComplete.test.tsx) | 7 | `ResponderDashboard`, `ResponderTaskView`, `RouteNavigationPage`, `ResponderHistoryPage`, `ResponderStatusPage`, `OfferNotificationModal`, `LiveResponderMap` (+ unbounded auto-ping loop regression test) |
| [`operatorRoleComplete.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/operator/operatorRoleComplete.test.tsx) | 4 | `OperatorCommandCenter`, `LiveMapExplorerPage`, `OperatorRespondersPage`, `OperatorAnalyticsPage`, `OperatorSettingsPage`, `OperatorAuditPage`, `IncidentWorkspacePage`, `DuplicateMergeReviewPage`, HITL modals |

#### Mobile Screen & App Integration Suite (`jest-expo` + RNTL v14)
| Suite File | Tests | Verified Integration Boundary |
| :--- | :---: | :--- |
| [`mobileScreensAndApp.test.tsx`](file:///f:/ResQAi/apps/mobile/__tests__/mobileScreensAndApp.test.tsx) | 4 | `AuthScreen` validation & 1-tap demo login; `CitizenHomeScreen` 3-second hold SOS beacon; `ResponderFeedScreen` accept + `ResponderActiveNavScreen` `en_route` → `arrived` + field notes; full `<App />` GPS stability (no refetch/WS storms), single-role switch guard, and WS disconnect + state reset on logout |

#### Backend ASGI & Live PostgreSQL/PostGIS + Redis Integration Suites (8 files, 69 tests passed)
| Suite File | Tests | Verified Integration Boundary |
| :--- | :---: | :--- |
| [`test_tier2_asgi_integration.py`](file:///f:/ResQAi/services/api/tests/unit/test_tier2_asgi_integration.py) | 3 | Full FastAPI ASGI HTTP request lifecycle, `X-Request-Id`/`X-Process-Time` middleware, `401`/`403`/`422` error envelopes, JWT rotation/blacklist, unapproved responder gate, Operator→Responder→Analytics→WebSocket flow |
| [`test_auth.py`](file:///f:/ResQAi/services/api/tests/integration/test_auth.py) | 11 | Auth registration, login, token refresh, logout, and role enforcement against live DB/Redis |
| [`test_citizen_reports.py`](file:///f:/ResQAi/services/api/tests/integration/test_citizen_reports.py) | 10 | Citizen SOS/report creation, media upload/ownership, cancellation, nearby alerts, emergency contacts, GDPR deletion against live PostgreSQL/PostGIS |
| [`test_ai_pipeline.py`](file:///f:/ResQAi/services/api/tests/integration/test_ai_pipeline.py) | 9 | AI classification, confidence gating, triage queue, and fallback behavior against live DB/Redis |
| [`test_operator.py`](file:///f:/ResQAi/services/api/tests/integration/test_operator.py) | 10 | Operator triage, AI overrides, incident merging, HITL dispatch workflows against live DB/Redis |
| [`test_dispatch_responder.py`](file:///f:/ResQAi/services/api/tests/integration/test_dispatch_responder.py) | 10 | Responder offer acceptance, status transitions, GPS telemetry pings, and mission completion against live DB/Redis |
| [`test_admin_analytics.py`](file:///f:/ResQAi/services/api/tests/integration/test_admin_analytics.py) | 10 | Admin analytics KPIs, responder vetting, Bhopal operating-area boundary RBAC (`test_admin_rbac_isolation`), drill mode, and audit ledger against live DB/Redis |
| [`test_realtime_websocket.py`](file:///f:/ResQAi/services/api/tests/integration/test_realtime_websocket.py) | 6 | Authenticated WebSocket connection rooms and Redis-backed realtime broadcasts |

---

### Tier 3 — System Testing (Complete Integrated Application End-to-End Flow)

#### Full-App Web Frontend System Suite ([`systemFullFlow.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/system/systemFullFlow.test.tsx) — 5 tests passed)
Mounts the full `<App />` tree (`ErrorBoundary` → `QueryClientProvider` → `ToastProvider` → `AuthProvider` → `OfflineSyncProvider` → `WebSocketProvider` → `AppRouter` → `ProtectedRoute` → `RoleBasedRoute`) against a stateful multi-role backend simulation:
- **SYS-1 & SYS-2:** Unauthenticated access to `/operator` redirects to login; operator login navigates to Bhopal Grid dashboard; `/admin` navigation by operator enforces RBAC `"You do not have access"`.
- **SYS-3:** Offline citizen session queues saved drafts; `online` network restoration flushes queued report via `OfflineSyncProvider` into backend incident state and clears local draft store.
- **SYS-4a:** Operator opens `MP Nagar Market Smoke` with degraded vision pipeline (`Manual review continues`), confirms HITL dispatch modal with mandatory reason, creating `asg-1` and an immutable audit entry.
- **SYS-4b:** Responder logs in on `/responder`, receives `OfferNotificationModal` dialog for `asg-1`, clicks `Accept`, updates `sharedState.assignments[0].status` to `"accepted"`, closes modal, and activates bounded `LiveResponderMap` telemetry without infinite re-render looping.
- **SYS-4c:** Admin navigates to `/admin` and observes propagated `Audit Records` and `"1 events"` count from shared dispatch state.

#### Full-Stack Backend Live PostgreSQL/PostGIS & Redis E2E Suite ([`test_must_pass_t1_t25.py`](file:///f:/ResQAi/services/api/tests/e2e/test_must_pass_t1_t25.py) — 25 tests passed)
- **T1–T25:** All 25 must-pass end-to-end backend tests passed against live Docker `sentinelgrid_postgres` (`postgis/postgis:16-3.4`, `localhost:5432`), `sentinelgrid_redis` (`redis:7-alpine`, `localhost:6379`), and `sentinelgrid_minio` (`localhost:9000-9001`).

---

### Tier 4 — User Acceptance Testing (UAT — Real-World Bhopal Metro Scenarios)

#### Web Frontend UAT Suite ([`uatRealWorldScenarios.test.tsx`](file:///f:/ResQAi/apps/web/src/tests/uat/uatRealWorldScenarios.test.tsx) — 4 tests passed)
- **UAT-1:** Citizen nearby alerts feed displays coarsened ~100m public location indicators without exposing reporter PII.
- **UAT-2:** Operator overrides Habibganj Underpass flood category (`water_flood`) and urgency (`critical`), sees `<10km` ETA recommendation, and confirms HITL dialog above Leaflet overlay (`z-[2001]`).
- **UAT-3:** Responder accepts offer and escalates blocked-road mission failure (`Road flooded 1.2m deep; need boat team`) via mandatory failure confirmation workflow.
- **UAT-4:** Admin approves pending unit `Volunteer V-09` (`V-09`), saves updated Bhopal corridor operating boundary, and persists drill-mode toggle.

#### Backend UAT Suite ([`test_tier4_uat_scenarios.py`](file:///f:/ResQAi/services/api/tests/unit/test_tier4_uat_scenarios.py) — 5 tests passed)
- **UAT-1:** Student SOS `idempotencyKey` deduplication + ~100m Arera Colony privacy coarsening.
- **UAT-2:** Monsoon flood AI classification + operator override + legacy coordinate normalization yielding `<10km` ETA.
- **UAT-3:** 90-second overdue offer auto-expiration (`status='expired'`) + accepted→`en_route`→notes→`failed` escalation reopening incident to `confirmed` and freeing responder unit.
- **UAT-4:** Unapproved responder RBAC gate (`ForbiddenError`) → admin approval → bowtie polygon rejection vs valid Bhopal corridor persistence → drill-mode audit persistence.
- **UAT-5:** Citizen pre-dispatch cancellation success vs post-dispatch lock (`AppException`), 3-contact policy enforcement (4th contact blocked with HTTP 400), and GDPR deletion request audit trail.

---

## 4. Non-Blocking Observations
1. **React Router v6 Future Flag Warnings:** Console output during Vitest runs notes upcoming React Router v7 transition flags (`v7_startTransition`, `v7_relativeSplatPath`).
2. **Test `act(...)` Warnings on Unawaited `OfflineSyncProvider` Effects:** Isolated tests (`citizenRoleComplete.test.tsx`, `frontendApiIntegration.test.tsx` `INT-5`) emit non-failing React `act(...)` warnings from initial async `listDrafts()` hydration inside `OfflineSyncProvider`; `systemFullFlow.test.tsx` `SYS-3` runs cleanly without `OfflineNoticeBanner` warnings.
3. **Vite Bundle Chunk Size Info:** `vite build` notes `dist/assets/index-CnOEUm8O.js` (`1,159.19 kB` / `337.72 kB` gzip) exceeds Vite's default 500 kB chunk advisory; optional manual chunk splitting can optimize initial load later without affecting correctness.
4. **React Native `SafeAreaView` Deprecation Warning in `LeafletMapView.tsx`:** Mobile Jest runs emit React Native's deprecation `console.warn` for `<SafeAreaView>` imported from `react-native` at [`LeafletMapView.tsx`](file:///f:/ResQAi/apps/mobile/src/components/map/LeafletMapView.tsx#L680) (line 680); migrating that import to `react-native-safe-area-context` can silence the warning cleanly in a future cleanup.
