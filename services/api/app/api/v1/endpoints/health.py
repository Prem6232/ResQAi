from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_db
import redis.asyncio as aioredis
from app.core.config import settings

router = APIRouter(prefix="/health", tags=["System Health"])

@router.get("")
async def check_health(db: AsyncSession = Depends(get_db)):
    health_status = {
        "status": "healthy",
        "api": "online",
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

    # 2. Check Redis
    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pong = await r.ping()
        health_status["redis"] = "connected" if pong else "failed"
        await r.close()
    except Exception as e:
        health_status["redis"] = f"error: {str(e)}"
        health_status["status"] = "degraded"

    return health_status
