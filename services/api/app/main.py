import asyncio
import contextlib
import logging
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.middleware import setup_middleware
from app.ai.warmup import preload_live_models
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    generic_exception_handler,
)
from app.api.v1.endpoints.health import router as health_router
from app.modules.auth import auth_router
from app.modules.citizen import citizen_router, contacts_router, alerts_router
from app.modules.media import media_router
from app.modules.operator import (
    operator_router,
    actions_router,
    settings_router,
    duplicates_router,
)
from app.modules.responder import responder_router
from app.modules.realtime import realtime_router
from app.modules.admin import admin_router
from app.modules.analytics import analytics_router
from app.modules.geospatial import geospatial_router

# 1. Initialize logging
setup_logging(level="DEBUG" if settings.ENVIRONMENT == "development" else "INFO")
_main_logger = logging.getLogger("sentinelgrid.main")


async def _inline_outbox_loop(interval_s: float) -> None:
    from app.ai.celery_tasks import async_relay_outbox_events

    while True:
        try:
            await async_relay_outbox_events(batch_size=25)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _main_logger.warning("Inline outbox poll error: %s", exc)
        await asyncio.sleep(interval_s)


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.AI_PRELOAD_ON_STARTUP and settings.AI_ADAPTER_MODE != "mock":
        await asyncio.to_thread(preload_live_models)

    poller_task = None
    if settings.AI_INLINE_OUTBOX_POLL_SECONDS > 0:
        poller_task = asyncio.create_task(
            _inline_outbox_loop(settings.AI_INLINE_OUTBOX_POLL_SECONDS)
        )
    try:
        yield
    finally:
        if poller_task is not None:
            poller_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await poller_task


# 2. Create FastAPI application
app = FastAPI(
    title=f"{settings.PROJECT_NAME} API",
    version=settings.VERSION,
    description="Emergency Response & Campus Coordination Backend",
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    docs_url=f"{settings.API_V1_PREFIX}/docs",
    redoc_url=f"{settings.API_V1_PREFIX}/redoc",
    lifespan=lifespan,
)

# 3. Setup middleware
setup_middleware(app)

# 4. Register standardized exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# 5. Include core routers
app.include_router(health_router, prefix=settings.API_V1_PREFIX)
app.include_router(health_router) # Also mount at /health for docker/k8s probes
app.include_router(auth_router, prefix=f"{settings.API_V1_PREFIX}/auth", tags=["Authentication"])
app.include_router(citizen_router, prefix=f"{settings.API_V1_PREFIX}/citizen", tags=["Citizen Workspace"])
app.include_router(contacts_router, prefix=f"{settings.API_V1_PREFIX}/citizen/contacts", tags=["Citizen Contacts"])
app.include_router(alerts_router, prefix=f"{settings.API_V1_PREFIX}/citizen/alerts", tags=["Citizen Alerts"])
app.include_router(media_router, prefix=f"{settings.API_V1_PREFIX}/media", tags=["Media Assets"])
app.include_router(operator_router, prefix=f"{settings.API_V1_PREFIX}/operator", tags=["Operator Command Center"])
app.include_router(actions_router, prefix=f"{settings.API_V1_PREFIX}/operator/actions", tags=["Operator Actions"])
app.include_router(settings_router, prefix=f"{settings.API_V1_PREFIX}/operator/settings", tags=["Operator Settings"])
app.include_router(duplicates_router, prefix=f"{settings.API_V1_PREFIX}/operator/duplicates", tags=["Operator Duplicates"])
app.include_router(responder_router, prefix=f"{settings.API_V1_PREFIX}/responder", tags=["Responder Workspace"])
app.include_router(admin_router, prefix=f"{settings.API_V1_PREFIX}/admin", tags=["Admin Controls"])
app.include_router(analytics_router, prefix=f"{settings.API_V1_PREFIX}/analytics", tags=["Operational Analytics"])
app.include_router(geospatial_router, prefix=settings.API_V1_PREFIX, tags=["Geospatial & Routing"])
app.include_router(realtime_router, prefix=settings.API_V1_PREFIX, tags=["Realtime Gateway"])
app.include_router(realtime_router, tags=["Realtime Gateway"]) # Direct /ws mounting




@app.get("/", tags=["System Root"])
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs": f"{settings.API_V1_PREFIX}/docs"
    }
