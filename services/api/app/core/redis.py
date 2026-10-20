import time
import logging
from typing import Optional, Tuple
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger("sentinelgrid.redis")

_redis_client: Optional[aioredis.Redis] = None
# In-memory fallback if Redis is unavailable: { key: [timestamp1, timestamp2, ...] }
_in_memory_ratelimit: dict[str, list[float]] = {}

def get_redis_client() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2.0
        )
    return _redis_client

async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None

async def get_rate_limit_count(key: str, window_seconds: int = 60) -> int:
    """Return the current count for key without incrementing."""
    try:
        r = get_redis_client()
        val = await r.get(key)
        return int(val) if val is not None else 0
    except Exception as e:
        logger.warning(f"Redis get_rate_limit_count failed, using in-memory: {e}")
        now = time.time()
        timestamps = _in_memory_ratelimit.get(key, [])
        valid = [ts for ts in timestamps if now - ts < window_seconds]
        _in_memory_ratelimit[key] = valid
        return len(valid)

async def increment_rate_limit(key: str, window_seconds: int = 60) -> int:
    """Increment counter for key and set TTL on first hit."""
    try:
        r = get_redis_client()
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        res = await pipe.execute()
        current_count = res[0]
        ttl = res[1]

        if ttl == -1:
            await r.expire(key, window_seconds)

        return current_count
    except Exception as e:
        logger.warning(f"Redis increment_rate_limit failed, using in-memory: {e}")
        now = time.time()
        timestamps = _in_memory_ratelimit.get(key, [])
        valid = [ts for ts in timestamps if now - ts < window_seconds]
        valid.append(now)
        _in_memory_ratelimit[key] = valid
        return len(valid)

async def reset_rate_limit(key: str) -> None:
    """Clear rate limit counter for a specific key."""
    try:
        r = get_redis_client()
        await r.delete(key)
    except Exception:
        pass
    _in_memory_ratelimit.pop(key, None)

async def check_rate_limit(
    key: str,
    max_requests: int = 5,
    window_seconds: int = 60
) -> Tuple[bool, int]:
    """Compatibility wrapper checking and incrementing rate limit."""
    count = await increment_rate_limit(key, window_seconds)
    return count > max_requests, count
