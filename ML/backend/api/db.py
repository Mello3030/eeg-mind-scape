"""Database engine, session handling and schema creation.

SQLite by default (``backend/storage/qsfe.db``) so the whole backend runs with no
external services. Point ``QSFE_DATABASE_URL`` at Postgres and nothing else here
changes — the models use no SQLite-specific types.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import Engine, MetaData, create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from ..app.config import get_settings


def _metadata() -> MetaData:
    """Confine every table to QSFE_DB_SCHEMA when one is configured.

    Postgres only — SQLite has no schemas, and a non-empty schema there would
    make SQLAlchemy emit "schema.table" against a database that has no such
    attachment.
    """
    schema = get_settings().db_schema.strip()
    if schema and not get_settings().resolved_database_url.startswith("sqlite"):
        return MetaData(schema=schema)
    return MetaData()


class Base(DeclarativeBase):
    """Declarative base for every table."""

    metadata = _metadata()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _make_engine() -> Engine:
    settings = get_settings()
    url = settings.resolved_database_url
    kwargs: dict = {"echo": settings.db_echo, "future": True}
    if url.startswith("sqlite"):
        # SQLite connections are bound to the creating thread by default, and
        # FastAPI runs sync endpoints in a threadpool.
        kwargs["connect_args"] = {"check_same_thread": False}
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
    else:
        # Serverless Postgres (Neon) drops idle connections and can cold-start,
        # so validate a connection before handing it out and recycle well
        # inside the idle timeout.
        kwargs["pool_pre_ping"] = True
        kwargs["pool_recycle"] = 280
        schema = settings.db_schema.strip()
        if schema:
            kwargs["connect_args"] = {"options": f"-csearch_path={schema}"}
    return create_engine(url, **kwargs)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_connection, connection_record) -> None:
    """Enforce foreign keys and use WAL so reads don't block writes."""
    if engine.url.get_backend_name() != "sqlite":
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def init_db() -> None:
    """Create the schema and any missing tables. Safe to call on every startup."""
    from . import models  # noqa: F401  (registers the mappers)

    schema = Base.metadata.schema
    if schema:
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))

    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a transactional session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
