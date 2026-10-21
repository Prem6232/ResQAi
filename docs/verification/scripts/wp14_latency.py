import sys
sys.path.insert(0, "F:/ResQAi/services/api")

import asyncio
import time
import uuid
import json
import numpy as np
import httpx
from httpx_ws import aconnect_ws
from httpx_ws.transport import ASGIWebSocketTransport

from app.main import app
from app.ai.celery_tasks import async_relay_outbox_events

async def run_latency_trials():
    latencies = []
    async with ASGIWebSocketTransport(app=app) as transport:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            op_resp = await client.post("/api/v1/auth/login", json={"email": "operator@campus.demo", "password": "demo1234"})
            op_token = op_resp.json()["access_token"]
            cit_resp = await client.post("/api/v1/auth/login", json={"email": "citizen@campus.demo", "password": "demo1234"})
            cit_token = cit_resp.json()["access_token"]

            while await async_relay_outbox_events(batch_size=100) > 0:
                pass

            async with aconnect_ws(f"/ws?token={op_token}", client) as op_ws:
                while True:
                    try:
                        await asyncio.wait_for(op_ws.receive_text(), timeout=0.05)
                    except asyncio.TimeoutError:
                        break

                for i in range(20):
                    t0 = time.perf_counter()
                    sos_key = f"perf_sos_{uuid.uuid4().hex}"
                    resp = await client.post(
                        "/api/v1/citizen/sos",
                        json={"location": {"lat": 28.5450, "lng": 77.2730}, "locationLabel": "Test Spot", "idempotencyKey": sos_key},
                        headers={"Authorization": f"Bearer {cit_token}"}
                    )
                    assert resp.status_code == 201

                    await async_relay_outbox_events(batch_size=50)

                    received = False
                    while not received and (time.perf_counter() - t0) < 3.0:
                        try:
                            msg = await asyncio.wait_for(op_ws.receive_text(), timeout=0.5)
                            ev = json.loads(msg)
                            if ev.get("type") in ["report.received", "report.created", "OUTBOX_SOS_CREATED"]:
                                t1 = time.perf_counter()
                                latencies.append((t1 - t0) * 1000)
                                received = True
                                break
                        except asyncio.TimeoutError:
                            break

    p50 = np.percentile(latencies, 50)
    p95 = np.percentile(latencies, 95)
    print(f"TRIALS={len(latencies)} p50={p50:.1f}ms p95={p95:.1f}ms")

if __name__ == "__main__":
    asyncio.run(run_latency_trials())
