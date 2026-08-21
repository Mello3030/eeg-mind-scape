"""End-to-end test of the application layer (patients, analyses, history, reports).

    python backend/scripts/api_smoke_test.py
    python backend/scripts/api_smoke_test.py --keep-db     # inspect the test database

Runs against a throwaway SQLite file and storage folder, so it never touches the
real ``backend/storage``. Exercises the API through TestClient, then verifies the
rows that were actually written.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

# Point the whole backend at a temporary storage folder BEFORE anything imports
# the settings (they are cached and the DB engine is built at import time).
_TMP = Path(tempfile.mkdtemp(prefix="qsfe_api_test_"))
os.environ["QSFE_STORAGE_SUBDIR"] = str(_TMP)
os.environ["QSFE_DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.config import get_settings  # noqa: E402
from backend.app.main import app  # noqa: E402

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    results.append((name, PASS if ok else FAIL, detail))
    print(f"[{PASS if ok else FAIL}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def skip(name: str, detail: str) -> None:
    results.append((name, SKIP, detail))
    print(f"[{SKIP}] {name} — {detail}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-db", action="store_true")
    parser.add_argument("--n-crops", type=int, default=2)
    args = parser.parse_args()

    settings = get_settings()
    print(f"Temp storage : {settings.storage_dir}")
    print(f"Temp database: {settings.resolved_database_url}\n")

    try:
        with TestClient(app) as client:
            # Patients are owned, so the whole application layer now needs a
            # session. Register one and pin it to the client for every request.
            reg = client.post(
                "/api/auth/register",
                json={
                    "name": "Smoke Test",
                    "email": "smoke@qsfe.lab",
                    "password": "Sm0keTestPass",
                    "role": "researcher",
                    # Read from settings rather than hardcoded, so changing
                    # QSFE_REGISTRATION_CODE does not break this test.
                    "registration_code": get_settings().registration_code,
                },
            )
            check("POST /api/auth/register", reg.status_code == 201, f"status={reg.status_code}")

            # The invite gate must hold against a direct POST, not just the form.
            if get_settings().registration_code:
                blocked = client.post(
                    "/api/auth/register",
                    json={
                        "name": "Uninvited",
                        "email": "uninvited@qsfe.lab",
                        "password": "Un1nvitedPass",
                        "role": "researcher",
                        "registration_code": "definitely-wrong",
                    },
                )
                check(
                    "POST /api/auth/register (wrong code -> 403)",
                    blocked.status_code == 403,
                    f"status={blocked.status_code}",
                )
            client.headers["Authorization"] = f"Bearer {reg.json()['token']}"
            check("GET /api/auth/me", client.get("/api/auth/me").status_code == 200)

            run(client, args)
    finally:
        if args.keep_db:
            print(f"\nTest data kept at {_TMP}")
        else:
            shutil.rmtree(_TMP, ignore_errors=True)

    failed = [r for r in results if r[1] == FAIL]
    passed = [r for r in results if r[1] == PASS]
    print(f"\n{len(passed)}/{len(passed) + len(failed)} checks passed"
          + (f", {len(failed)} FAILED" if failed else ""))
    return 1 if failed else 0


def run(client: TestClient, args) -> None:
    # --- patients ----------------------------------------------------------
    created = client.post(
        "/api/patients",
        json={"code": "MRN-001", "name": "Test Patient", "age": 71, "sex": "F",
              "notes": "smoke test"},
    )
    check("POST /api/patients", created.status_code == 201, f"status={created.status_code}")
    patient = created.json()
    patient_id = patient["id"]

    dupe = client.post("/api/patients", json={"code": "MRN-001"})
    check("POST /api/patients (duplicate code -> 409)", dupe.status_code == 409,
          f"status={dupe.status_code}")

    # --- ownership ---------------------------------------------------------
    other = client.post(
        "/api/auth/register",
        json={"name": "Other", "email": "other@qsfe.lab", "password": "0therTestPass",
              "role": "researcher",
              "registration_code": get_settings().registration_code},
    ).json()["token"]
    other_headers = {"Authorization": f"Bearer {other}"}

    seen = client.get("/api/patients", headers=other_headers).json()
    check("another researcher sees no patients", seen["total"] == 0, f"{seen['total']} visible")
    check(
        "another researcher gets 404 on this patient",
        client.get(f"/api/patients/{patient_id}", headers=other_headers).status_code == 404,
    )
    check(
        "another researcher cannot delete this patient",
        client.delete(f"/api/patients/{patient_id}", headers=other_headers).status_code == 404,
    )
    check(
        "unauthenticated request is rejected",
        client.get("/api/patients", headers={"Authorization": "Bearer nope"}).status_code == 401,
    )

    # --- hardening ---------------------------------------------------------
    check("weak password is rejected", client.post(
        "/api/auth/register",
        json={"name": "W", "email": "weak@qsfe.lab", "password": "password",
              "role": "researcher"}).status_code == 422)
    check("non-EDF upload is rejected before decode", client.post(
        "/api/analyses",
        files={"file": ("fake.edf", b"definitely not edf" * 8, "application/octet-stream")},
        data={"patient_id": patient_id}).status_code == 415)

    listing = client.get("/api/patients", params={"search": "test"}).json()
    check("GET /api/patients?search", listing["total"] >= 1, f"{listing['total']} match")

    patched = client.patch(f"/api/patients/{patient_id}", json={"age": 72})
    check("PATCH /api/patients/{id}", patched.json().get("age") == 72,
          f"age={patched.json().get('age')}")

    # A stored analysis must belong to a patient; without one it would be written
    # and then be invisible to its own creator.
    orphan = client.post(
        "/api/analyses",
        files={"file": ("x.edf", b"0       " + b" " * 248, "application/octet-stream")},
    )
    check("POST /api/analyses (no patient -> 422)", orphan.status_code == 422,
          f"status={orphan.status_code}")

    # --- analysis from an uploaded EDF -------------------------------------
    settings = get_settings()
    edf = next(iter(sorted(settings.edf_dir.glob("*.edf"))), None) if settings.edf_dir.exists() else None
    upload_analysis_id = None
    if edf is None:
        skip("POST /api/analyses (upload)", "no EDF files available")
    else:
        with edf.open("rb") as handle:
            response = client.post(
                "/api/analyses",
                files={"file": (edf.name, handle, "application/octet-stream")},
                data={"patient_id": patient_id, "n_crops": str(args.n_crops),
                      "notes": "first visit"},
            )
        ok = check("POST /api/analyses (upload)", response.status_code == 201,
                   f"status={response.status_code} {response.text[:160] if response.status_code != 201 else ''}")
        if ok:
            body = response.json()
            upload_analysis_id = body["id"]
            check(
                "  stored with upload + biomarkers",
                body["upload_id"] is not None and body["biomarkers"] is not None,
                f"{body['predicted_label']} p={body['confidence']:.3f} "
                f"dominant={body['dominant_stream']} upload={body['upload_id'][:8]}",
            )
            # Same file again -> the stored copy is reused, not duplicated.
            with edf.open("rb") as handle:
                again = client.post(
                    "/api/analyses",
                    files={"file": (edf.name, handle, "application/octet-stream")},
                    data={"patient_id": patient_id, "n_crops": "1"},
                )
            check("POST /api/analyses (same file reuses upload row)",
                  again.status_code == 201 and again.json()["upload_id"] == body["upload_id"],
                  f"upload_id={again.json().get('upload_id', '')[:8]}")

            download = client.get(f"/api/analyses/{upload_analysis_id}/recording")
            check("GET /api/analyses/{id}/recording", download.status_code == 200,
                  f"{len(download.content):,} bytes")

    # --- analysis from a dataset record ------------------------------------
    record_analysis_id = None
    records = client.get("/dataset/records", params={"split": "test", "limit": 3})
    if records.status_code != 200 or not records.json()["items"]:
        skip("POST /api/analyses/from-record/{serial}", "dataset unavailable")
    else:
        serial = records.json()["items"][0]["serial"]
        response = client.post(
            f"/api/analyses/from-record/{serial}",
            json={"n_crops": args.n_crops, "create_patient": True},
        )
        ok = check(f"POST /api/analyses/from-record/{serial}", response.status_code == 201,
                   f"status={response.status_code} {response.text[:160] if response.status_code != 201 else ''}")
        if ok:
            body = response.json()
            record_analysis_id = body["id"]
            gt = body.get("ground_truth") or {}
            check("  ground truth stored + patient auto-created",
                  gt.get("class_name") is not None and body["patient_id"] is not None,
                  f"pred={body['predicted_label']} truth={gt.get('class_name')} "
                  f"correct={gt.get('correct')}")

            missing = client.post("/api/analyses/from-record/99999", json={})
            check("POST /api/analyses/from-record/99999 (-> 404)", missing.status_code == 404,
                  f"status={missing.status_code}")

    # --- history -----------------------------------------------------------
    history = client.get("/api/history", params={"limit": 10}).json()
    check("GET /api/history", history["total"] >= 1, f"{history['total']} stored")

    if upload_analysis_id:
        filtered = client.get("/api/history", params={"patient_id": patient_id}).json()
        check("GET /api/history?patient_id", filtered["total"] >= 1,
              f"{filtered['total']} for this patient")

    stats = client.get("/api/history/stats").json()
    check("GET /api/history/stats", stats["total_predictions"] >= 1,
          f"{stats['total_predictions']} predictions, {stats['total_patients']} patients, "
          f"labelled acc={stats['accuracy_on_labelled']}")

    timeline = client.get(f"/api/history/patients/{patient_id}/timeline").json()
    check("GET /api/history/patients/{id}/timeline", "points" in timeline,
          f"{len(timeline.get('points', []))} point(s), trend_available="
          f"{timeline.get('trend', {}).get('available')}")

    ids = [i for i in (upload_analysis_id, record_analysis_id) if i]
    if len(ids) < 2:
        skip("GET /api/history/compare", "needs two analyses")
    else:
        compare = client.get("/api/history/compare", params={"ids": ",".join(ids)})
        ok = compare.status_code == 200
        check("GET /api/history/compare", ok,
              f"{len(compare.json()['entries'])} entries" if ok else compare.text[:160])

    # --- reports -----------------------------------------------------------
    target = upload_analysis_id or record_analysis_id
    if target is None:
        skip("GET /api/reports/{id}", "no analysis to report on")
    else:
        report = client.get(f"/api/reports/{target}", params={"format": "json"})
        check("GET /api/reports/{id}?format=json", report.status_code == 200,
              f"label={report.json()['prediction']['label']}")

        html = client.get(f"/api/reports/{target}", params={"format": "html"})
        check("GET /api/reports/{id}?format=html",
              html.status_code == 200 and "QSFE-Net EEG Analysis Report" in html.text,
              f"{len(html.text):,} chars")

        # A bare jinja2.Template does not autoescape, which made the patient name
        # a stored-XSS vector in a shared report. Rename, re-render, restore.
        payload = "<script>alert(1)</script>"
        client.patch(f"/api/patients/{patient_id}", json={"name": payload})
        tainted = client.get(f"/api/reports/{target}", params={"format": "html"}).text
        check("HTML report escapes operator text (XSS)",
              payload not in tainted and "&lt;script&gt;" in tainted)
        client.patch(f"/api/patients/{patient_id}", json={"name": "Test Patient"})

        pdf = client.get(f"/api/reports/{target}", params={"format": "pdf"})
        check("GET /api/reports/{id}?format=pdf",
              pdf.status_code == 200 and pdf.content[:5] == b"%PDF-",
              f"{len(pdf.content):,} bytes")

    # --- cleanup semantics --------------------------------------------------
    if target:
        deleted = client.delete(f"/api/analyses/{target}")
        check("DELETE /api/analyses/{id}", deleted.status_code == 200,
              f"status={deleted.status_code}")
        gone = client.get(f"/api/analyses/{target}")
        check("  deleted analysis is gone (404)", gone.status_code == 404,
              f"status={gone.status_code}")

    removed = client.delete(f"/api/patients/{patient_id}")
    check("DELETE /api/patients/{id} (cascades)", removed.status_code == 200,
          str(removed.json()))
    check("  patient is gone (404)",
          client.get(f"/api/patients/{patient_id}").status_code == 404)


if __name__ == "__main__":
    raise SystemExit(main())
