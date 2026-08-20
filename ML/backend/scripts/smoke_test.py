"""End-to-end smoke test for the ML server — no running server required.

    python backend/scripts/smoke_test.py            # everything available locally
    python backend/scripts/smoke_test.py --no-edf   # skip the (slow) EDF path

Exercises the app in-process with Starlette's TestClient, so it also proves the
routing and response schemas, not just the inference code.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app.catalog import get_catalog  # noqa: E402
from backend.app.config import get_settings  # noqa: E402
from backend.app.main import app  # noqa: E402

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
results: list[tuple[str, str, str]] = []


def record(name: str, status: str, detail: str = "") -> None:
    results.append((name, status, detail))
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-edf", action="store_true", help="Skip the EDF upload test.")
    parser.add_argument("--n-crops", type=int, default=2)
    args = parser.parse_args()

    settings = get_settings()
    catalog = get_catalog()
    print(f"Repo root : {settings.repo_root}")
    print(f"Checkpoint: {settings.checkpoint_path}")
    print(f"Dataset   : {settings.dataset_dir}\n")

    with TestClient(app) as client:
        # --- health / model ------------------------------------------------
        health = client.get("/health").json()
        record(
            "GET /health",
            PASS if health.get("model_loaded") else FAIL,
            f"device={health.get('device')} checkpoint={health.get('checkpoint')} "
            f"extractor_compatible={health.get('extractor_compatible')}",
        )
        if not health.get("model_loaded"):
            print(f"\nModel error: {health.get('model_error')}")
            return 1

        info = client.get("/model/info").json()
        record(
            "GET /model/info",
            PASS,
            f"{info['n_parameters']:,} params, dims={info['stream_dims']}",
        )

        checkpoints = client.get("/model/checkpoints").json()
        usable = [c["name"] for c in checkpoints if c.get("extractor_compatible")]
        record("GET /model/checkpoints", PASS, f"{len(checkpoints)} found, usable: {usable}")

        # --- random feature vectors ---------------------------------------
        dims = info["stream_dims"]
        payload = {k: np.random.randn(dims[k]).astype(np.float32).tolist() for k in dims}
        payload["include_per_crop"] = True
        response = client.post("/predict/features", json=payload)
        if response.status_code == 200:
            body = response.json()
            record(
                "POST /predict/features (random)",
                PASS,
                f"{body['prediction']['label']} p={body['prediction']['confidence']:.3f}",
            )
        else:
            record("POST /predict/features (random)", FAIL, response.text[:200])

        # --- dataset catalog ----------------------------------------------
        if not catalog.available:
            record("GET /dataset", SKIP, "annotation file not found")
            serial = None
        else:
            summary = client.get("/dataset").json()
            record("GET /dataset", PASS, json.dumps(summary["counts"]["by_split"]))

            listing = client.get("/dataset/records", params={"split": "test", "limit": 5}).json()
            record("GET /dataset/records", PASS, f"{listing['total']} test records")

            cached = [r for r in listing["items"] if r["cached_crops"] > 0]
            serial = (cached or listing["items"])[0]["serial"] if listing["items"] else None

        # --- cached-feature prediction for a known patient -----------------
        if serial is None:
            record("POST /predict/record/{serial}", SKIP, "no dataset records")
        else:
            response = client.post(
                f"/predict/record/{serial}",
                params={"n_crops": args.n_crops, "include_per_crop": True},
            )
            if response.status_code == 200:
                body = response.json()
                gt = body.get("ground_truth") or {}
                bio = (body.get("biomarkers") or {}).get("summary", {})
                record(
                    f"POST /predict/record/{serial}",
                    PASS,
                    f"pred={body['prediction']['label']} truth={gt.get('class_name')} "
                    f"correct={gt.get('correct')} source={body['source']['kind']} "
                    f"dominant={body['gates']['dominant_stream_name']} "
                    f"theta/alpha={bio.get('mean_theta_alpha_ratio', float('nan')):.3f}",
                )
            else:
                record(f"POST /predict/record/{serial}", FAIL, response.text[:300])

        # --- full EDF upload path ------------------------------------------
        if args.no_edf:
            record("POST /predict (EDF upload)", SKIP, "--no-edf")
        else:
            edf = next(iter(sorted(settings.edf_dir.glob("*.edf"))), None) if settings.edf_dir.exists() else None
            if edf is None:
                record("POST /predict (EDF upload)", SKIP, "no EDF files available")
            else:
                with edf.open("rb") as handle:
                    response = client.post(
                        "/predict",
                        files={"file": (edf.name, handle, "application/octet-stream")},
                        params={"n_crops": args.n_crops},
                    )
                if response.status_code == 200:
                    body = response.json()
                    record(
                        "POST /predict (EDF upload)",
                        PASS,
                        f"{edf.name} -> {body['prediction']['label']} "
                        f"p={body['prediction']['confidence']:.3f} "
                        f"{body['timing_ms']['total']:.0f} ms "
                        f"({body['recording']['duration_seconds']:.0f} s recording)",
                    )
                else:
                    record("POST /predict (EDF upload)", FAIL, response.text[:300])

        # --- error handling -------------------------------------------------
        bad = client.post(
            "/predict/features",
            json={"s1": [0.0] * 3, "s2": [0.0] * 3, "s3": [0.0] * 3, "s4": [0.0] * 3},
        )
        record(
            "POST /predict/features (bad dims -> 422)",
            PASS if bad.status_code == 422 else FAIL,
            f"status={bad.status_code}",
        )

        missing = client.post("/predict/record/99999")
        record(
            "POST /predict/record/99999 (-> 404)",
            PASS if missing.status_code in (404, 503) else FAIL,
            f"status={missing.status_code}",
        )

    failed = [r for r in results if r[1] == FAIL]
    print(
        f"\n{len(results) - len(failed)}/{len(results)} checks passed"
        + (f", {len(failed)} FAILED" if failed else "")
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
