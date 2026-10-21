import sys
sys.path.insert(0, "F:/ResQAi/services/api")

import asyncio
import time
import uuid
import httpx
from app.main import app
from app.ai.celery_tasks import async_relay_outbox_events

async def burst_sos():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Login citizen
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "citizen@campus.demo", "password": "demo1234"}
        )
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        t0 = time.perf_counter()
        failures = 0
        successes = 0

        # Send 100 SOS requests
        for i in range(100):
            try:
                resp = await client.post(
                    "/api/v1/citizen/sos",
                    json={
                        "location": {"lat": 28.5450 + (i * 0.0001), "lng": 77.2730 + (i * 0.0001)},
                        "locationLabel": f"Burst Spot {i}",
                        "idempotencyKey": f"burst_sos_{uuid.uuid4().hex}"
                    },
                    headers=headers
                )
                if resp.status_code == 201:
                    successes += 1
                else:
                    failures += 1
            except Exception:
                failures += 1

        t_ingest = time.perf_counter() - t0

        # Drain outbox
        t_drain_start = time.perf_counter()
        total_drained = 0
        while True:
            drained = await async_relay_outbox_events(batch_size=100)
            total_drained += drained
            if drained == 0:
                break
        t_drain = time.perf_counter() - t_drain_start

        print(f"BURST: successes={successes} failures={failures} ingest_time={t_ingest:.2f}s drain_time={t_drain:.2f}s total_drained={total_drained}")

if __name__ == "__main__":
    asyncio.run(burst_sos())
