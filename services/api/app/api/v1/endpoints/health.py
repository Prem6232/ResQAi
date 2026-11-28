from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import redis.asyncio as aioredis
from app.core.database import get_db
from app.core.config import settings
from app.core.redis import redis_connect_kwargs

router = APIRouter(prefix="/health", tags=["System Health"])

@router.get("")
async def check_health(db: AsyncSession = Depends(get_db)):
    health_status = {
        "status": "healthy",
        "api": "online",
        "ai_mode": settings.AI_ADAPTER_MODE,
        "database": "unknown",
        "postgis_version": "unknown",
        "redis": "unknown"
    }

    # 1. Check PostgreSQL & PostGIS
    try:
        result = await db.execute(text("SELECT PostGIS_Version();"))
        version = result.scalar()
        health_status["database"] = "connected"
        health_status["postgis_version"] = version
    except Exception as e:
        health_status["database"] = f"error: {str(e)}"
        health_status["status"] = "degraded"

    # 2. Check Redis (optional in single-container inline mode)
    redis_url = (settings.REDIS_URL or "").strip()
    if not redis_url:
        health_status["redis"] = "not_configured"
    else:
        r = None
        try:
            r = aioredis.from_url(redis_url, **redis_connect_kwargs(redis_url))
            pong = await r.ping() if r is not None else False
            health_status["redis"] = "connected" if pong else "failed"
        except Exception as e:
            health_status["redis"] = f"error: {str(e)}"
            health_status["status"] = "degraded"
        finally:
            if r is not None:
                try:
                    await r.close()
                except Exception:
                    pass

    return health_status
