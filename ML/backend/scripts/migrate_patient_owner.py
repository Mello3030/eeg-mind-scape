"""Rebuild the patient tables with the new ``patients.owner_id`` column.

``init_db()`` calls ``Base.metadata.create_all()``, which creates missing tables
but never alters an existing one — so a new NOT NULL column cannot appear that
way. This script drops and recreates the three affected tables.

**It deletes every patient, upload and prediction.** That is the intended
behaviour: existing rows predate ownership and have no owner to assign. User
accounts are untouched, so nobody has to register again.

    python backend/scripts/migrate_patient_owner.py            # show the plan
    python backend/scripts/migrate_patient_owner.py --apply    # do it

Run it against whichever database QSFE_DATABASE_URL points at; with the variable
unset it targets the local SQLite file.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import inspect, text  # noqa: E402

from backend.api.db import Base, engine, mask_url  # noqa: E402
from backend.api.models import Patient, Prediction, Upload  # noqa: E402

# Child-first, so foreign keys never block a drop.
DOOMED = (Prediction.__tablename__, Upload.__tablename__, Patient.__tablename__)


def counts() -> dict[str, int | None]:
    out: dict[str, int | None] = {}
    inspector = inspect(engine)
    existing = set(inspector.get_table_names(schema=Base.metadata.schema))
    with engine.connect() as conn:
        for table in DOOMED:
            if table not in existing:
                out[table] = None
                continue
            qualified = f'"{Base.metadata.schema}".{table}' if Base.metadata.schema else table
            out[table] = int(conn.execute(text(f"SELECT count(*) FROM {qualified}")).scalar() or 0)
    return out


def has_owner_column() -> bool:
    inspector = inspect(engine)
    if Patient.__tablename__ not in set(
        inspector.get_table_names(schema=Base.metadata.schema)
    ):
        return False
    cols = {c["name"] for c in inspector.get_columns(Patient.__tablename__, schema=Base.metadata.schema)}
    return "owner_id" in cols


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Actually drop and recreate.")
    args = parser.parse_args()

    print(f"Database: {mask_url(str(engine.url))}")
    if Base.metadata.schema:
        print(f"Schema:   {Base.metadata.schema}")

    if has_owner_column():
        print("\npatients.owner_id already exists — nothing to do.")
        return 0

    before = counts()
    print("\nRows that will be deleted:")
    for table, n in before.items():
        print(f"  {table:14} {'(absent)' if n is None else n}")
    print("\nUser accounts are NOT touched.")

    if not args.apply:
        print("\nDry run. Re-run with --apply to perform the migration.")
        return 0

    with engine.begin() as conn:
        for table in DOOMED:
            qualified = f'"{Base.metadata.schema}".{table}' if Base.metadata.schema else table
            conn.execute(text(f"DROP TABLE IF EXISTS {qualified} CASCADE"
                              if engine.url.get_backend_name() != "sqlite"
                              else f"DROP TABLE IF EXISTS {qualified}"))
            print(f"  dropped {table}")

    Base.metadata.create_all(bind=engine)
    print("\nRecreated with owner_id. Now:")
    for table, n in counts().items():
        print(f"  {table:14} {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
