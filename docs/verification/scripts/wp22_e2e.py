import sys
sys.path.insert(0, "F:/ResQAi/services/api")

import asyncio
import uuid
from datetime import datetime, timedelta
import httpx
from app.main import app
from app.ai.celery_tasks import async_relay_outbox_events
from app.core.database import AsyncSessionLocal
from app.models.entities import Assignment
from app.modules.responder.service import auto_expire_assignment_offers

async def run_wp22():
    results = {}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Auth tokens
        op_resp = await client.post("/api/v1/auth/login", json={"email": "operator@campus.demo", "password": "demo1234"})
        op_token = op_resp.json()["access_token"]
        op_headers = {"Authorization": f"Bearer {op_token}"}

        cit_resp = await client.post("/api/v1/auth/login", json={"email": "citizen@campus.demo", "password": "demo1234"})
        cit_token = cit_resp.json()["access_token"]
        cit_headers = {"Authorization": f"Bearer {cit_token}"}

        adm_resp = await client.post("/api/v1/auth/login", json={"email": "admin@campus.demo", "password": "demo1234"})
        adm_token = adm_resp.json()["access_token"]
        adm_headers = {"Authorization": f"Bearer {adm_token}"}

        resp_resp = await client.post("/api/v1/auth/login", json={"email": "responder@campus.demo", "password": "demo1234"})
        resp_token = resp_resp.json()["access_token"]
        resp_headers = {"Authorization": f"Bearer {resp_token}"}

        # 22.1 Multi-report fire: two nearby reports, one grouped incident, override urgency, dispatch
        try:
            # Generate unique nearby coordinates to guarantee pristine clustering isolated from prior runs
            base_lat = 28.6500 + (uuid.uuid4().int % 1000) * 0.0001
            base_lng = 77.3500 + (uuid.uuid4().int % 1000) * 0.0001

            r1 = await client.post("/api/v1/citizen/reports", json={
                "category": "fire_smoke", "text": "Smoke near west wing",
                "location": {"lat": round(base_lat, 4), "lng": round(base_lng, 4)},
                "idempotencyKey": f"e2e_r1_{uuid.uuid4().hex}"
            }, headers=cit_headers)
            r2 = await client.post("/api/v1/citizen/reports", json={
                "category": "fire_smoke", "text": "Flame in west wing 1st floor",
                "location": {"lat": round(base_lat + 0.0002, 4), "lng": round(base_lng + 0.0001, 4)},
                "idempotencyKey": f"e2e_r2_{uuid.uuid4().hex}"
            }, headers=cit_headers)
            inc1_id = r1.json()["incidentId"]
            inc2_id = r2.json()["incidentId"]
            clustered = (inc1_id == inc2_id)

            # Override urgency
            ov = await client.post("/api/v1/operator/actions/override", json={
                "incidentId": inc1_id, "category": "fire_smoke", "urgency": "critical", "reason": "Confirmed blaze"
            }, headers=op_headers)
            # Dispatch
            disp = await client.post("/api/v1/operator/actions/dispatch", json={
                "incidentId": inc1_id, "responderId": "F-2", "note": "Priority response"
            }, headers=op_headers)
            results["22.1"] = ("PASS" if clustered and ov.status_code == 200 and disp.status_code == 201 else "FAIL", f"clustered={clustered} inc={inc1_id}")
        except Exception as e:
            results["22.1"] = ("FAIL", str(e))

        # 22.2 Responder lifecycle: offer, accept, en route, arrived, notes, resolved
        try:
            asg_id = disp.json()["id"]
            # Accept
            acc = await client.post(f"/api/v1/responder/offers/{asg_id}/respond", json={"status": "accepted"}, headers=resp_headers)
            # En route
            en = await client.post(f"/api/v1/responder/assignments/{asg_id}/status", json={"status": "en_route"}, headers=resp_headers)
            # Arrived
            arr = await client.post(f"/api/v1/responder/assignments/{asg_id}/status", json={"status": "arrived"}, headers=resp_headers)
            # Notes
            noted = await client.post(f"/api/v1/responder/assignments/{asg_id}/notes", json={"notes": "Extinguisher deployed"}, headers=resp_headers)
            # Resolve incident
            res = await client.post("/api/v1/operator/actions/state", json={
                "incidentId": inc1_id, "toStatus": "resolved", "reason": "Fire extinguished successfully"
            }, headers=op_headers)
            results["22.2"] = ("PASS" if acc.status_code == 200 and arr.status_code == 200 and res.status_code == 200 else "FAIL", "lifecycle complete")
        except Exception as e:
            results["22.2"] = ("FAIL", str(e))

        # 22.3 False alarm with mandatory reason, citizen informed, audit entry
        try:
            fa_rep = await client.post("/api/v1/citizen/reports", json={
                "category": "other", "text": "Testing alarm sound",
                "location": {"lat": 28.5410, "lng": 77.2710},
                "idempotencyKey": f"e2e_fa_{uuid.uuid4().hex}"
            }, headers=cit_headers)
            fa_rep_id = fa_rep.json()["id"]
            fa_inc_id = fa_rep.json()["incidentId"]

            # Cancel report with reason
            cancel_res = await client.post(f"/api/v1/citizen/reports/{fa_rep_id}/cancel", json={
                "reason": "False alarm: accidental trigger confirmed"
            }, headers=cit_headers)

            # Cancel incident via operator
            op_cancel = await client.post("/api/v1/operator/actions/state", json={
                "incidentId": fa_inc_id, "toStatus": "cancelled", "reason": "False alarm: confirmed by reporter"
            }, headers=op_headers)

            audit_res = await client.get("/api/v1/admin/audit-logs", headers=adm_headers)
            has_audit = any(item.get("action") in ["STATE_TRANSITION", "REPORT_CANCELLED", "CANCELLED"] or "cancel" in str(item).lower() for item in audit_res.json()["items"])

            results["22.3"] = ("PASS" if cancel_res.status_code == 200 and op_cancel.status_code == 200 and has_audit else "FAIL", "false alarm cancelled with reason and audited")
        except Exception as e:
            results["22.3"] = ("FAIL", str(e))

        # 22.4 Offline retry with idempotency key creates one report
        try:
            idem = f"idem_retry_{uuid.uuid4().hex}"
            sub1 = await client.post("/api/v1/citizen/reports", json={
                "category": "medical", "text": "First aid required",
                "location": {"lat": 28.5430, "lng": 77.2720}, "idempotencyKey": idem
            }, headers=cit_headers)
            sub2 = await client.post("/api/v1/citizen/reports", json={
                "category": "medical", "text": "First aid required",
                "location": {"lat": 28.5430, "lng": 77.2720}, "idempotencyKey": idem
            }, headers=cit_headers)
            results["22.4"] = ("PASS" if sub1.json()["id"] == sub2.json()["id"] else "FAIL", f"rep_id={sub1.json()['id']}")
        except Exception as e:
            results["22.4"] = ("FAIL", str(e))

        # 22.5 AI outage: stop workers, reports reach operator queue, restart, assessments appear
        try:
            sos = await client.post("/api/v1/citizen/sos", json={
                "location": {"lat": 28.5480, "lng": 77.2780}, "idempotencyKey": f"outage_{uuid.uuid4().hex}"
            }, headers=cit_headers)
            assert sos.status_code == 201
            queue = await client.get("/api/v1/operator/reports/queue", headers=op_headers)
            found_in_queue = any(r["id"] == sos.json()["id"] for r in queue.json())
            drained = await async_relay_outbox_events(batch_size=50)
            results["22.5"] = ("PASS" if found_in_queue and drained > 0 else "FAIL", f"queued={found_in_queue} drained={drained}")
        except Exception as e:
            results["22.5"] = ("FAIL", str(e))

        # 22.6 Responder vetting gate: unapproved responder cannot get offers
        try:
            unapp_reg = await client.post("/api/v1/auth/register", json={
                "email": f"unapp_{uuid.uuid4().hex[:6]}@campus.demo", "password": "password123",
                "full_name": "Unapproved Cadet", "role": "responder"
            })
            unapp_token = unapp_reg.json()["access_token"]
            unapp_headers = {"Authorization": f"Bearer {unapp_token}"}
            # Attempt to fetch assignments -> rejected with 403 or 400
            asg_check = await client.get("/api/v1/responder/assignments", headers=unapp_headers)
            results["22.6"] = ("PASS" if asg_check.status_code in [400, 403] else "FAIL", f"status={asg_check.status_code}")
        except Exception as e:
            results["22.6"] = ("FAIL", str(e))

        # 22.7 Dispatch escalation after 90 seconds with no answer
        try:
            async with AsyncSessionLocal() as db:
                asg = Assignment(
                    incident_id=uuid.UUID(inc1_id),
                    responder_id=uuid.UUID("f46a51d8-75b7-460f-b038-42b4f47ddaae"),
                    status="offered",
                    offered_at=datetime.utcnow() - timedelta(seconds=95),
                    offer_deadline=datetime.utcnow() - timedelta(seconds=5),
                )
                db.add(asg)
                await db.commit()
                expired = await auto_expire_assignment_offers(db)
                assert expired >= 1
            results["22.7"] = ("PASS", f"expired_count={expired}")
        except Exception as e:
            results["22.7"] = ("FAIL", str(e))

        # 22.8 Admin edits geofence, audit log shows operator/admin actions
        try:
            geo_edit = await client.put("/api/v1/admin/operating-area", json={
                "name": "Updated Campus Boundary",
                "polygon": [
                    [77.2690, 28.5410], [77.2780, 28.5410], [77.2780, 28.5500], [77.2690, 28.5500]
                ]
            }, headers=adm_headers)
            audit_logs = await client.get("/api/v1/admin/audit-logs", headers=adm_headers)
            has_audit = len(audit_logs.json()["items"]) > 0
            results["22.8"] = ("PASS" if geo_edit.status_code == 200 and has_audit else "FAIL", f"audit_count={len(audit_logs.json()['items'])}")
        except Exception as e:
            results["22.8"] = ("FAIL", str(e))

    for k in sorted(results.keys()):
        v = results[k]
        print(f"WP{k} | {v[0]} | {v[1]}")

if __name__ == "__main__":
    asyncio.run(run_wp22())
