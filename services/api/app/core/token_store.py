import logging
from typing import Optional
import redis.asyncio as aioredis
from app.core.config import settings
from app.core.redis import get_redis_client

logger = logging.getLogger("sentinelgrid.token_store")

_in_memory_blacklist = set()
_in_memory_refresh_tokens = {}

async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Store revoked token JTI with expiration TTL."""
    try:
        r = get_redis_client()
        await r.setex(f"blacklist:{jti}", ttl_seconds, "revoked")
    except Exception as e:
        logger.warning(f"Redis unavailable for token blacklisting, using fallback: {e}")
        _in_memory_blacklist.add(jti)

async def is_token_blacklisted(jti: str) -> bool:
    """Check if token JTI has been revoked."""
    try:
        r = get_redis_client()
        val = await r.get(f"blacklist:{jti}")
        return val is not None
    except Exception as e:
        logger.warning(f"Redis unavailable for blacklist check, checking fallback: {e}")
        return jti in _in_memory_blacklist

async def store_refresh_token(user_id: str, jti: str, ttl_days: int = 7) -> None:
    """Store active refresh token JTI for a user."""
    ttl_seconds = ttl_days * 86400
    try:
        r = get_redis_client()
        await r.setex(f"refresh:{user_id}:{jti}", ttl_seconds, "active")
    except Exception as e:
        logger.warning(f"Redis unavailable for refresh token storage, using fallback: {e}")
        _in_memory_refresh_tokens[f"{user_id}:{jti}"] = True

async def verify_and_revoke_refresh_token(user_id: str, jti: str) -> bool:
    """Verify refresh token JTI exists, and revoke it for rotation."""
    key = f"refresh:{user_id}:{jti}"
    try:
        r = get_redis_client()
        val = await r.get(key)
        if val is not None:
            await r.delete(key)
            return True
        return False
    except Exception as e:
        logger.warning(f"Redis unavailable for refresh token rotation, using fallback: {e}")
        in_mem_key = f"{user_id}:{jti}"
        if in_mem_key in _in_memory_refresh_tokens:
            del _in_memory_refresh_tokens[in_mem_key]
            return True
        return False
