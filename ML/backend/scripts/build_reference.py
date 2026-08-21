"""Precompute the class-conditional biomarker reference used by /analysis.

    python backend/scripts/build_reference.py             # full training split
    python backend/scripts/build_reference.py --max-crops 2   # faster, coarser
    python backend/scripts/build_reference.py --split val     # sanity check only

Writes `outputs/reference/biomarker_reference.json`. The backend serves that file
from `/model/reference`; without it the first request computes the sweep inline
and takes minutes, so run this once after cloning or after re-extracting features.

Nothing here loads a checkpoint — the reference describes the features, not the
model, so it stays valid across checkpoint switches.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app.catalog import CatalogUnavailable  # noqa: E402
from backend.app.reference import (  # noqa: E402
    REFERENCE_SPLIT,
    compute_reference,
    reference_path,
    save_reference,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--split",
        default=REFERENCE_SPLIT,
        choices=("train", "val", "test"),
        help="Split to measure (default: train — val and test back other reported numbers).",
    )
    parser.add_argument(
        "--max-crops",
        type=int,
        default=None,
        metavar="N",
        help="Average at most N cached crops per patient instead of all of them.",
    )
    args = parser.parse_args()

    if args.split != REFERENCE_SPLIT:
        print(
            f"! Measuring the '{args.split}' split. The served reference should be "
            f"'{REFERENCE_SPLIT}' — val backs the ablation and test backs /model/performance."
        )

    print(f"Decoding the '{args.split}' split (this takes a few minutes)…")
    try:
        payload = compute_reference(args.split, args.max_crops)
    except CatalogUnavailable as exc:
        print(f"! dataset unavailable: {exc}")
        return 1
    except RuntimeError as exc:
        print(f"! {exc}")
        return 1

    path = save_reference(payload)
    counts = ", ".join(f"{k} {v}" for k, v in payload["n_by_class"].items())
    print(
        f"\n{payload['n_patients']} patients decoded in {payload['elapsed_seconds']:.1f}s"
        f"  ({counts})"
    )
    skipped = payload["skipped"]
    if skipped["no_cached_features"] or skipped["undecodable"]:
        print(
            f"  skipped: {skipped['no_cached_features']} without cached features, "
            f"{skipped['undecodable']} undecodable"
        )

    print(f"\n{'Marker':<26} {'dir':>4}  " + "  ".join(f"{c:>18}" for c in payload["class_names"]))
    for marker in payload["markers"].values():
        cells = []
        for name in payload["class_names"]:
            stats = marker["by_class"][name]
            cells.append(f"{stats['mean']:>9.4f} ±{stats['sd']:<7.4f}")
        arrow = "up" if marker["direction"] > 0 else "down" if marker["direction"] < 0 else "flat"
        print(f"{marker['key']:<26} {arrow:>4}  " + "  ".join(cells))

    print(f"\nWrote {reference_path()}")
    print("'dir' is the direction of the Dementia-minus-Normal mean difference in this split.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
