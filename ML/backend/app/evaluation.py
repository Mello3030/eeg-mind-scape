"""Measured performance of the active checkpoint on the CAUEEG test split.

The frontend used to ship a hardcoded confusion matrix and per-class metrics.
Those numbers could not be reproduced from anything in this repository, so they
are computed here instead: every test-split patient with cached feature crops is
scored with the currently loaded checkpoint, exactly as `/predict` would score
it, and the resulting matrix is what the UI displays.

The sweep costs a few seconds (the crops are precomputed; only the forward pass
runs), so the result is cached per checkpoint and recomputed on reload.
"""

from __future__ import annotations

import threading
import time
from typing import Any

import numpy as np

from .catalog import CatalogUnavailable, get_catalog
from .constants import CLASS_NAMES
from .inference import score
from .model import ModelError, registry

_lock = threading.Lock()
_cache: dict[str, dict[str, Any]] = {}


def _metrics_from_matrix(matrix: np.ndarray) -> dict[str, Any]:
    """Per-class precision/recall/F1 and the macro/accuracy summary.

    Rows are the true class, columns the predicted class.
    """
    total = int(matrix.sum())
    correct = int(np.trace(matrix))
    per_class: list[dict[str, Any]] = []

    for i, name in enumerate(CLASS_NAMES):
        tp = int(matrix[i, i])
        predicted = int(matrix[:, i].sum())
        actual = int(matrix[i, :].sum())
        precision = tp / predicted if predicted else 0.0
        recall = tp / actual if actual else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        per_class.append(
            {
                "label": name,
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
                "support": actual,
            }
        )

    macro_f1 = float(np.mean([c["f1"] for c in per_class])) if per_class else 0.0
    return {
        "accuracy": round(correct / total, 4) if total else 0.0,
        "macro_f1": round(macro_f1, 4),
        "n_evaluated": total,
        "per_class": per_class,
    }


def evaluate_split(split: str = "test", n_crops: int = 5, force: bool = False) -> dict[str, Any]:
    """Score every patient in ``split`` that has cached features.

    Raises CatalogUnavailable when the dataset is absent and ModelError when no
    checkpoint is loaded — both surface as 503 through the app's handlers.
    """
    model = registry.get()
    key = f"{model.checkpoint_path.name}:{split}:{n_crops}"

    with _lock:
        if not force and key in _cache:
            return _cache[key]

    catalog = get_catalog()
    records = [r for r in catalog.all_records() if r["split"] == split]
    if not records:
        raise CatalogUnavailable(f"No records in the '{split}' split.")

    matrix = np.zeros((len(CLASS_NAMES), len(CLASS_NAMES)), dtype=np.int64)
    skipped = 0
    started = time.perf_counter()

    for record in records:
        serial = record["serial"]
        true_index = record["class_label"]
        if true_index is None or not catalog.cached_feature_paths(serial):
            skipped += 1
            continue
        try:
            streams = catalog.load_cached_features(serial, n_crops)
            result = score(streams, model)
        except (ValueError, KeyError, OSError):
            skipped += 1
            continue
        matrix[int(true_index), int(result["prediction"]["class_index"])] += 1

    if not matrix.sum():
        raise CatalogUnavailable(
            f"No cached features found for the '{split}' split — nothing to evaluate."
        )

    payload = {
        "split": split,
        "n_crops": n_crops,
        "checkpoint": model.checkpoint_path.name,
        "device": str(model.device),
        "n_parameters": model.n_parameters,
        "labels": CLASS_NAMES,
        "confusion_matrix": matrix.tolist(),
        "skipped": skipped,
        "elapsed_seconds": round(time.perf_counter() - started, 2),
        "computed": True,
        **_metrics_from_matrix(matrix),
    }

    with _lock:
        _cache[key] = payload
    return payload


def cached_only(split: str = "test", n_crops: int = 5) -> dict[str, Any] | None:
    """The cached result for the active checkpoint, without computing one."""
    model = registry.peek()
    if model is None:
        return None
    with _lock:
        return _cache.get(f"{model.checkpoint_path.name}:{split}:{n_crops}")


def invalidate() -> None:
    with _lock:
        _cache.clear()


__all__ = ["CatalogUnavailable", "ModelError", "cached_only", "evaluate_split", "invalidate"]
