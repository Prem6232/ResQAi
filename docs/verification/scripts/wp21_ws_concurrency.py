import sys
sys.path.insert(0, "F:/ResQAi/services/api")

import asyncio
import json
import httpx
from httpx_ws import aconnect_ws
from httpx_ws.transport import ASGIWebSocketTransport
from app.main import app

async def test_ws_concurrency():
    async with ASGIWebSocketTransport(app=app) as transport:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            login_resp = await client.post(
                "/api/v1/auth/login",
                json={"email": "citizen@campus.demo", "password": "demo1234"}
            )
            token = login_resp.json()["access_token"]

            connected = 0
            failed = 0

            async def client_worker(worker_id: int):
                nonlocal connected, failed
                try:
                    async with aconnect_ws(f"/ws?token={token}", client) as ws:
                        connected += 1
                        # Send ping
                        await ws.send_text("ping")
                        msg = await asyncio.wait_for(ws.receive_text(), timeout=3.0)
                        assert msg == "pong"
                        # Hold open briefly
                        await asyncio.sleep(0.5)
                except Exception as e:
                    failed += 1

            tasks = [client_worker(i) for i in range(100)]
            await asyncio.gather(*tasks)

            print(f"WS_CONCURRENCY: total=100 connected={connected} failed={failed}")

if __name__ == "__main__":
    asyncio.run(test_ws_concurrency())
