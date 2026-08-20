"""Create the demo accounts, and optionally a starter cohort from the dataset.

    python backend/scripts/seed.py                 # accounts only
    python backend/scripts/seed.py --cohort 8      # + score 8 CAUEEG patients

Re-running is safe: accounts are matched by email and dataset patients by
serial, so nothing is duplicated. Passwords are only set when an account is
created — an existing account keeps the password it has.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.api import auth, crud, service  # noqa: E402
from backend.api.db import SessionLocal, init_db  # noqa: E402
from backend.api.models import User  # noqa: E402
from backend.app.catalog import CatalogUnavailable, get_catalog  # noqa: E402
from backend.app.model import ModelError  # noqa: E402

DEMO_ACCOUNTS = [
    {"email": "researcher@qsfe.lab", "name": "Demo Researcher", "role": "researcher"},
    {"email": "admin@qsfe.lab", "name": "Demo Administrator", "role": "administrator"},
]
DEMO_PASSWORD = "research123"


def seed_accounts(db) -> int:
    created = 0
    for spec in DEMO_ACCOUNTS:
        if db.query(User).filter(User.email == spec["email"]).first():
            print(f"  = {spec['email']} already exists")
            continue
        db.add(User(password_hash=auth.hash_password(DEMO_PASSWORD), **spec))
        db.commit()
        created += 1
        print(f"  + {spec['email']}  ({spec['role']})")
    return created


def seed_cohort(db, count: int) -> int:
    """Score a spread of test-split patients so the dashboard has real content."""
    try:
        catalog = get_catalog()
        records = [r for r in catalog.all_records() if r["split"] == "test"]
    except CatalogUnavailable as exc:
        print(f"  ! dataset unavailable, skipping cohort: {exc}")
        return 0

    # Take an even spread across the classes rather than the first N serials.
    by_class: dict[int, list[dict]] = {}
    for record in records:
        by_class.setdefault(record["class_label"], []).append(record)

    chosen: list[dict] = []
    while len(chosen) < count and any(by_class.values()):
        for label in sorted(by_class):
            if by_class[label] and len(chosen) < count:
                chosen.append(by_class[label].pop(0))

    created = 0
    for record in chosen:
        serial = record["serial"]
        if crud.get_patient_by_serial(db, serial):
            print(f"  = CAUEEG-{serial} already analysed")
            continue
        try:
            prediction = service.analyse_dataset_record(db, serial, create_patient=True)
        except (ModelError, ValueError, KeyError) as exc:
            print(f"  ! {serial}: {exc}")
            continue
        created += 1
        truth = (prediction.ground_truth or {}).get("class_name")
        mark = "OK " if truth == prediction.predicted_label else "MISS"
        print(
            f"  + CAUEEG-{serial}  predicted {prediction.predicted_label:9}"
            f" truth {truth:9} {mark}  conf {prediction.confidence:.3f}"
        )
    return created


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the QSFE-Net workspace.")
    parser.add_argument(
        "--cohort",
        type=int,
        default=0,
        metavar="N",
        help="Also score N CAUEEG test patients so the UI has real data.",
    )
    args = parser.parse_args()

    init_db()
    db = SessionLocal()
    try:
        print("Accounts:")
        accounts = seed_accounts(db)
        cohort = 0
        if args.cohort:
            print(f"\nCohort ({args.cohort} patients):")
            cohort = seed_cohort(db, args.cohort)
    finally:
        db.close()

    print(f"\nDone. {accounts} account(s), {cohort} analysis/analyses created.")
    if accounts:
        print(f"Sign in with any demo address above, password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
