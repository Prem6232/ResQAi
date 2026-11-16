import httpx
import json
import uuid
import sys

BASE_URL = "https://resqai-6s8c.onrender.com/api/v1"
PASSWORD = "demo1234"

ROLES = {
    "citizen": "citizen@campus.demo",
    "responder": "responder@campus.demo",
    "operator": "operator@campus.demo",
    "admin": "admin@campus.demo",
}

results = {
    "citizen": [],
    "responder": [],
    "operator": [],
    "admin": [],
}

def log_test(role: str, name: str, passed: bool, details: str = ""):
    status_icon = "PASS" if passed else "FAIL"
    results[role].append({"name": name, "passed": passed, "details": details})
    print(f"[{status_icon}] ({role.upper()}) {name}: {details}")

def run_role_suite():
    with httpx.Client(base_url=BASE_URL, timeout=20.0) as client:
        # Pre-suite check & setup: Admin approves responder if not yet approved
        r_adm = client.post("/auth/login", json={"email": ROLES["admin"], "password": PASSWORD})
        if r_adm.status_code == 200:
            adm_tok = r_adm.json()["access_token"]
            adm_hdr = {"Authorization": f"Bearer {adm_tok}"}
            # Fetch responders list to get responder ID
            resp_list = client.get("/admin/responders", headers=adm_hdr).json()
            for r_unit in resp_list:
                if r_unit.get("unitCode") == "F-2" or r_unit.get("user", {}).get("email") == ROLES["responder"]:
                    if not r_unit.get("isApproved") and not r_unit.get("approved"):
                        print(f"[SETUP] Approving responder {r_unit.get('unitCode')} via Admin...")
                        client.post(f"/admin/responders/{r_unit['id']}/approve", json={"approved": True}, headers=adm_hdr)

        # ==========================================
        # 1. CITIZEN SUITE
        # ==========================================
        print("\n=== RUNNING CITIZEN ROLE TEST SUITE ===")
        cit_email = ROLES["citizen"]
        r = client.post("/auth/login", json={"email": cit_email, "password": PASSWORD})
        if r.status_code == 200:
            cit_token = r.json()["access_token"]
            cit_headers = {"Authorization": f"Bearer {cit_token}"}
            log_test("citizen", "Login (/auth/login)", True, f"HTTP {r.status_code}")
        else:
            log_test("citizen", "Login (/auth/login)", False, f"HTTP {r.status_code} - {r.text}")
            return

        # /auth/me
        r = client.get("/auth/me", headers=cit_headers)
        log_test("citizen", "Get Profile (/auth/me)", r.status_code == 200 and r.json().get("role") == "citizen", f"HTTP {r.status_code} (User: {r.json().get('full_name')})")

        # GET /citizen/reports
        r = client.get("/citizen/reports", headers=cit_headers)
        log_test("citizen", "Get My Reports (/citizen/reports)", r.status_code == 200, f"HTTP {r.status_code} (Count: {len(r.json()) if isinstance(r.json(), list) else 0})")

        # POST /citizen/sos
        sos_payload = {
            "location": {"lat": 28.5452, "lng": 77.2731, "source": "gps"},
            "locationLabel": "Central Quad Emergency Beacon",
            "idempotencyKey": f"test_sos_{uuid.uuid4().hex[:8]}",
        }
        r = client.post("/citizen/sos", json=sos_payload, headers=cit_headers)
        sos_report_id = r.json().get("id") if r.status_code in (200, 201) else None
        log_test("citizen", "Submit Emergency SOS (/citizen/sos)", r.status_code in (200, 201), f"HTTP {r.status_code} (ReportId: {sos_report_id})")

        # POST /citizen/reports (detailed hazard report)
        rep_payload = {
            "category": "hazard",
            "urgency": "medium",
            "text": "Live test hazard report near gate 3",
            "location": {"lat": 28.5460, "lng": 77.2740},
            "locationLabel": "Gate 3 Hazard",
            "idempotencyKey": f"test_rep_{uuid.uuid4().hex[:8]}",
        }
        r = client.post("/citizen/reports", json=rep_payload, headers=cit_headers)
        log_test("citizen", "Submit Detailed Report (/citizen/reports)", r.status_code in (200, 201), f"HTTP {r.status_code}")

        # GET /citizen/alerts/nearby
        r = client.get("/citizen/alerts/nearby?lat=28.5452&lng=77.2731", headers=cit_headers)
        log_test("citizen", "Fetch Nearby Coarsened Alerts (/citizen/alerts/nearby)", r.status_code == 200, f"HTTP {r.status_code}")

        # GET /citizen/contacts
        r = client.get("/citizen/contacts", headers=cit_headers)
        contacts = r.json() if isinstance(r.json(), list) else []
        log_test("citizen", "List Trusted Contacts (/citizen/contacts)", r.status_code == 200, f"HTTP {r.status_code} (Count: {len(contacts)})")

        # Trusted contacts lifecycle test:
        # If user has 3 contacts (the maximum limit), verify that adding a 4th returns 400 (safety enforcement)
        if len(contacts) >= 3:
            r = client.post("/citizen/contacts", json={"name": "Overflow Contact", "phone": "+919999888800"}, headers=cit_headers)
            log_test("citizen", "Safety Policy: Max 3 Trusted Contacts Enforced", r.status_code == 400, f"HTTP {r.status_code} (Properly blocked when limit reached)")
        else:
            c_payload = {"name": "Test Contact", "phone": "+919999888877", "relationshipLabel": "Friend"}
            r = client.post("/citizen/contacts", json=c_payload, headers=cit_headers)
            new_c_id = r.json().get("id") if r.status_code in (200, 201) else None
            log_test("citizen", "Create Trusted Contact (/citizen/contacts)", r.status_code in (200, 201), f"HTTP {r.status_code}")
            if new_c_id:
                r = client.delete(f"/citizen/contacts/{new_c_id}", headers=cit_headers)
                log_test("citizen", "Delete Trusted Contact (/citizen/contacts/{id})", r.status_code in (200, 204), f"HTTP {r.status_code}")

        # POST /citizen/privacy/deletion-request
        r = client.post("/citizen/privacy/deletion-request", json={"reason": "Live test GDPR deletion"}, headers=cit_headers)
        log_test("citizen", "Data Deletion Request (/citizen/privacy/deletion-request)", r.status_code in (200, 201), f"HTTP {r.status_code}")

        # Security/RBAC Check: Citizen attempting operator endpoint
        r = client.get("/operator/incidents", headers=cit_headers)
        log_test("citizen", "RBAC: Citizen blocked from /operator/incidents", r.status_code == 403, f"HTTP {r.status_code} (403 Forbidden)")

        # Security/RBAC Check: Citizen attempting admin endpoint
        r = client.get("/admin/responders", headers=cit_headers)
        log_test("citizen", "RBAC: Citizen blocked from /admin/responders", r.status_code == 403, f"HTTP {r.status_code} (403 Forbidden)")


        # ==========================================
        # 2. RESPONDER SUITE
        # ==========================================
        print("\n=== RUNNING RESPONDER ROLE TEST SUITE ===")
        resp_email = ROLES["responder"]
        r = client.post("/auth/login", json={"email": resp_email, "password": PASSWORD})
        if r.status_code == 200:
            resp_token = r.json()["access_token"]
            resp_headers = {"Authorization": f"Bearer {resp_token}"}
            log_test("responder", "Login (/auth/login)", True, f"HTTP {r.status_code}")
        else:
            log_test("responder", "Login (/auth/login)", False, f"HTTP {r.status_code} - {r.text}")
            return

        # /auth/me
        r = client.get("/auth/me", headers=resp_headers)
        log_test("responder", "Get Profile (/auth/me)", r.status_code == 200 and r.json().get("role") == "responder", f"HTTP {r.status_code} (User: {r.json().get('full_name')})")

        # GET /responder/profile
        r = client.get("/responder/profile", headers=resp_headers)
        is_approved = r.json().get("approved") if r.status_code == 200 else False
        log_test("responder", "Get Unit Self-Profile (/responder/profile)", r.status_code == 200, f"HTTP {r.status_code} (Unit: {r.json().get('unitCode')}, Approved: {is_approved})")

        # GET /responder/assignments
        r = client.get("/responder/assignments", headers=resp_headers)
        active_asg = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        log_test("responder", "Get Active Assignments (/responder/assignments)", r.status_code == 200, f"HTTP {r.status_code} (Active: {len(active_asg)})")

        # GET /responder/history
        r = client.get("/responder/history", headers=resp_headers)
        history_asg = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        log_test("responder", "Get Mission History (/responder/history)", r.status_code == 200, f"HTTP {r.status_code} (Past: {len(history_asg)})")

        # PATCH /responder/duty
        r = client.patch("/responder/duty", json={"isOnDuty": True, "availabilityStatus": "available"}, headers=resp_headers)
        log_test("responder", "Toggle Duty & Availability (/responder/duty)", r.status_code == 200, f"HTTP {r.status_code}")

        # POST /responder/location
        loc_ping = {"lat": 28.5458, "lng": 77.2735}
        r = client.post("/responder/location", json=loc_ping, headers=resp_headers)
        log_test("responder", "Telemetry GPS Ping (/responder/location)", r.status_code == 200, f"HTTP {r.status_code}")

        # Security/RBAC Check: Responder attempting admin audit log
        r = client.get("/admin/audit-logs", headers=resp_headers)
        log_test("responder", "RBAC: Responder blocked from /admin/audit-logs", r.status_code == 403, f"HTTP {r.status_code} (403 Forbidden)")


        # ==========================================
        # 3. OPERATOR SUITE
        # ==========================================
        print("\n=== RUNNING OPERATOR ROLE TEST SUITE ===")
        op_email = ROLES["operator"]
        r = client.post("/auth/login", json={"email": op_email, "password": PASSWORD})
        if r.status_code == 200:
            op_token = r.json()["access_token"]
            op_headers = {"Authorization": f"Bearer {op_token}"}
            log_test("operator", "Login (/auth/login)", True, f"HTTP {r.status_code}")
        else:
            log_test("operator", "Login (/auth/login)", False, f"HTTP {r.status_code} - {r.text}")
            return

        # /auth/me
        r = client.get("/auth/me", headers=op_headers)
        log_test("operator", "Get Profile (/auth/me)", r.status_code == 200 and r.json().get("role") == "operator", f"HTTP {r.status_code} (User: {r.json().get('full_name')})")

        # GET /operator/reports/queue
        r = client.get("/operator/reports/queue", headers=op_headers)
        raw_queue = r.json() if r.status_code == 200 else []
        queue_items = raw_queue if isinstance(raw_queue, list) else raw_queue.get("items", [])
        log_test("operator", "Triage Report Queue (/operator/reports/queue)", r.status_code == 200, f"HTTP {r.status_code} (In queue: {len(queue_items)})")

        # GET /operator/incidents
        r = client.get("/operator/incidents", headers=op_headers)
        incidents = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        log_test("operator", "Get Incidents List (/operator/incidents)", r.status_code == 200, f"HTTP {r.status_code} (Active: {len(incidents)})")

        first_inc_id = incidents[0].get("id") if incidents else None
        if first_inc_id:
            # GET /operator/incidents/{id}
            r = client.get(f"/operator/incidents/{first_inc_id}", headers=op_headers)
            log_test("operator", "Get Incident Detail Workspace (/operator/incidents/{id})", r.status_code == 200, f"HTTP {r.status_code}")

            # GET /operator/incidents/{id}/recommendations
            r = client.get(f"/operator/incidents/{first_inc_id}/recommendations", headers=op_headers)
            recs = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
            log_test("operator", "Dispatch Recommendations (/operator/incidents/{id}/recommendations)", r.status_code == 200, f"HTTP {r.status_code} (Ranked units: {len(recs)})")

        # GET /operator/responders
        r = client.get("/operator/responders", headers=op_headers)
        responders = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        log_test("operator", "List Responder Units (/operator/responders)", r.status_code == 200, f"HTTP {r.status_code} (Units: {len(responders)})")

        # GET /operator/settings
        r = client.get("/operator/settings", headers=op_headers)
        log_test("operator", "Operator Settings (/operator/settings)", r.status_code == 200, f"HTTP {r.status_code}")

        # GET /operator/duplicates
        r = client.get("/operator/duplicates", headers=op_headers)
        log_test("operator", "Duplicate Incident Pairings (/operator/duplicates)", r.status_code == 200, f"HTTP {r.status_code}")

        # GET /routing/route (OSRM Foot Walkway Route)
        r = client.get("/routing/route?from_lat=28.5452&from_lng=77.2731&to_lat=28.5460&to_lng=77.2740&profile=foot", headers=op_headers)
        dist = r.json().get('distanceKm') if r.status_code == 200 else 'N/A'
        log_test("operator", "OSRM Route Path Geometry (/routing/route)", r.status_code == 200, f"HTTP {r.status_code} (Distance: {dist} km)")

        # Security/RBAC Check: Operator blocked from admin-only routes
        r = client.put("/admin/operating-area", json={"polygon": []}, headers=op_headers)
        log_test("operator", "RBAC: Operator blocked from editing operating area", r.status_code == 403, f"HTTP {r.status_code} (403 Forbidden)")


        # ==========================================
        # 4. ADMIN SUITE
        # ==========================================
        print("\n=== RUNNING ADMIN ROLE TEST SUITE ===")
        admin_email = ROLES["admin"]
        r = client.post("/auth/login", json={"email": admin_email, "password": PASSWORD})
        if r.status_code == 200:
            admin_token = r.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}
            log_test("admin", "Login (/auth/login)", True, f"HTTP {r.status_code}")
        else:
            log_test("admin", "Login (/auth/login)", False, f"HTTP {r.status_code} - {r.text}")
            return

        # /auth/me
        r = client.get("/auth/me", headers=admin_headers)
        log_test("admin", "Get Profile (/auth/me)", r.status_code == 200 and r.json().get("role") == "admin", f"HTTP {r.status_code} (User: {r.json().get('full_name')})")

        # GET /admin/responders
        r = client.get("/admin/responders", headers=admin_headers)
        resp_roster = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        log_test("admin", "Responder Vetting Directory (/admin/responders)", r.status_code == 200, f"HTTP {r.status_code} (Total: {len(resp_roster)})")

        # GET /admin/operating-area
        r = client.get("/admin/operating-area", headers=admin_headers)
        log_test("admin", "Campus Geofence Boundary (/admin/operating-area)", r.status_code == 200, f"HTTP {r.status_code}")

        # GET /admin/audit-logs
        r = client.get("/admin/audit-logs?limit=10", headers=admin_headers)
        total_logs = r.json().get('total', 0) if isinstance(r.json(), dict) else (len(r.json()) if isinstance(r.json(), list) else 0)
        log_test("admin", "Search Immutable Audit Trail (/admin/audit-logs)", r.status_code == 200, f"HTTP {r.status_code} (Logged events: {total_logs})")

        # POST /admin/drill-mode
        r = client.post("/admin/drill-mode", json={"enabled": True}, headers=admin_headers)
        log_test("admin", "Toggle Simulated Drill Mode (/admin/drill-mode)", r.status_code == 200, f"HTTP {r.status_code}")

        # Restore drill mode to false
        client.post("/admin/drill-mode", json={"enabled": False}, headers=admin_headers)

        # GET /analytics/summary
        r = client.get("/analytics/summary", headers=admin_headers)
        log_test("admin", "Operational Analytics KPI Summary (/analytics/summary)", r.status_code == 200, f"HTTP {r.status_code}")

        # GET /analytics/hotspots
        r = client.get("/analytics/hotspots", headers=admin_headers)
        log_test("admin", "Geospatial Incident Hotspots (/analytics/hotspots)", r.status_code == 200, f"HTTP {r.status_code}")

        # Security/Audit immutability test: Attempt DELETE on audit log (Must fail with 405 Method Not Allowed)
        r = client.delete("/admin/audit-logs", headers=admin_headers)
        log_test("admin", "Audit Ledger Immutability: DELETE blocked", r.status_code in (404, 405), f"HTTP {r.status_code} (Immutable)")

    print("\n" + "="*50)
    print("TEST SUITE SUMMARY")
    print("="*50)
    grand_total = 0
    grand_passed = 0
    for role, tests in results.items():
        total = len(tests)
        passed = sum(1 for t in tests if t["passed"])
        grand_total += total
        grand_passed += passed
        pct = (passed / total) * 100 if total > 0 else 0
        print(f"Role: {role.upper():<10} | Passed: {passed}/{total} ({pct:.1f}%)")
    grand_pct = (grand_passed / grand_total) * 100 if grand_total > 0 else 0
    print(f"\nTOTAL ACROSS ALL ROLES: {grand_passed}/{grand_total} ({grand_pct:.1f}%) Passed")

if __name__ == "__main__":
    run_role_suite()
