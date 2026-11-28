from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from app.core.config import settings, normalize_asyncpg_url_and_connect_args
from typing import AsyncGenerator

_db_url, _db_connect_args = normalize_asyncpg_url_and_connect_args(settings.DATABASE_URL)

engine = create_async_engine(
    _db_url,
    echo=(settings.ENVIRONMENT == "development"),
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args=_db_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
