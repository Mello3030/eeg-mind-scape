"""Database engine, session handling and schema creation.

SQLite by default (``backend/storage/qsfe.db``) so the whole backend runs with no
external services. Point ``QSFE_DATABASE_URL`` at Postgres and nothing else here
changes — the models use no SQLite-specific types.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import Engine, MetaData, create_engine, event, text
from sqlalchemy.engine import make_url
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


def mask_url(url: str) -> str:
    """Hide the password before a connection string is ever returned or logged."""
    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:
        return "<unparseable>"


def db_diagnostics() -> dict:
    """Live view of what the API is actually talking to.

    Runs a real round trip rather than reporting configuration, so a URL that is
    set but unreachable shows as disconnected instead of looking healthy.
    """
    settings = get_settings()
    backend = engine.url.get_backend_name()
    info: dict = {
        "backend": backend,
        "url": mask_url(settings.resolved_database_url),
        "schema": Base.metadata.schema,
        # SQLite lives on the container filesystem, which every PaaS free tier
        # wipes on restart. Anything server-side survives restarts.
        "persistent": backend != "sqlite",
        "connected": False,
        "error": None,
        "counts": {},
    }

    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
            info["connected"] = True
            for table in ("users", "patients", "predictions", "uploads"):
                try:
                    qualified = f'"{Base.metadata.schema}".{table}' if Base.metadata.schema else table
                    info["counts"][table] = int(
                        session.execute(text(f"SELECT count(*) FROM {qualified}")).scalar() or 0
                    )
                except Exception:
                    info["counts"][table] = None
    except Exception as exc:  # pragma: no cover - depends on the deployment
        info["error"] = f"{type(exc).__name__}: {exc}"[:300]

    if backend == "sqlite":
        info["warning"] = (
            "SQLite stores data on the container filesystem. On Render, Vercel and "
            "similar hosts this is wiped on every restart or redeploy. Set "
            "QSFE_DATABASE_URL to a Postgres URL for durable storage."
        )
    return info


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a transactional session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
