import asyncio
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import async_engine_from_config, create_async_engine
from sqlalchemy import pool
from alembic import context

# Import settings and models for autogenerate support
from app.core.config import settings, normalize_asyncpg_url_and_connect_args
from app.core.database import Base
import app.models # Ensures all models are registered on Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

_clean_db_url, _db_connect_args = normalize_asyncpg_url_and_connect_args(settings.DATABASE_URL)

# Set database URL dynamically from app settings (normalized for asyncpg, escaping % for ConfigParser)
config.set_main_option("sqlalchemy.url", _clean_db_url.replace("%", "%%"))

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    """Run migrations in 'online' mode using AsyncEngine."""
    connectable = create_async_engine(
        _clean_db_url,
        poolclass=pool.NullPool,
        connect_args=_db_connect_args,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
