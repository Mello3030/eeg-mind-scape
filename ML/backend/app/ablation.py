"""The ablation study, read from the file the training run actually wrote.

These are **validation** accuracies. ``src/train/ablation.py`` builds only a
train and a validation loader, and ``train_eval`` returns ``best_val_acc`` — the
test split is never touched. They are labelled as such here so they are not read
as comparable to the measured test accuracy from ``/model/performance``.

`outputs/ablation/ablation_results.txt` is the only record of this experiment in
the repository, so it is parsed rather than transcribed — the frontend used to
carry a differently-numbered copy of this table with no traceable source.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from .config import get_settings

_LINE = re.compile(r"^\s*([A-Za-z0-9_]+)\s*:\s*([0-9.]+)\s*$")

# Human-readable names for the configurations the ablation script emits.
_LABELS: dict[str, dict[str, str]] = {
    "A_S1_only": {"config": "S1 only", "streams": "Frequency slowing"},
    "B_S1_S2": {"config": "S1 + S2", "streams": "Slowing + coherence"},
    "C_S1_S2_S3": {"config": "S1 + S2 + S3", "streams": "Three streams"},
    "D_full_QSFE": {"config": "Full (S1-S4)", "streams": "All four streams, gated"},
    "E_no_gating": {"config": "Full, no gating", "streams": "All four streams, concatenated"},
}


@lru_cache
def load_ablation() -> dict[str, Any]:
    """Parse the ablation results file. Returns an empty study if it is absent."""
    path = get_settings().repo_root / "outputs" / "ablation" / "ablation_results.txt"
    if not path.exists():
        return {"available": False, "source": str(path), "rows": [], "finding": None}

    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = _LINE.match(line)
        if not match:
            continue
        key, value = match.group(1), float(match.group(2))
        meta = _LABELS.get(key, {"config": key, "streams": ""})
        rows.append(
            {
                "key": key,
                "config": meta["config"],
                "streams": meta["streams"],
                "val_accuracy": value,
                "checkpoint": f"{key}.pth",
            }
        )

    best = max(rows, key=lambda r: r["val_accuracy"]) if rows else None
    full = next((r for r in rows if r["key"] == "D_full_QSFE"), None)
    finding = None
    if best and full and best["key"] != "D_full_QSFE":
        finding = (
            f"{best['config']} ({best['val_accuracy']:.2%} validation) outperforms the full "
            f"four-stream model ({full['val_accuracy']:.2%}). At this dataset scale the "
            "streams beyond frequency slowing and coherence contribute more noise than "
            "signal, consistent with their low learned gate activations. These are "
            "validation figures and are not comparable to the measured test accuracy."
        )

    for row in rows:
        row["best"] = bool(best and row["key"] == best["key"])

    return {
        "available": True,
        "source": str(path),
        "rows": rows,
        "finding": finding,
    }


# Published comparisons on the same dataset. These are external results, not
# measurements from this repository, and — unlike the ablation rows above — they
# genuinely are test accuracies.
BASELINES: list[dict[str, Any]] = [
    {"model": "CEEDNet Single", "params": 25_700_000, "params_label": "25.7M", "test_accuracy": 0.7732, "ours": False},
    {"model": "CEEDNet Ensemble", "params": 253_800_000, "params_label": "253.8M", "test_accuracy": 0.7916, "ours": False},
]


__all__ = ["BASELINES", "load_ablation"]
