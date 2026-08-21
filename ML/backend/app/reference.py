"""Class-conditional biomarker reference distributions, measured on the training split.

The `/analysis` page needs to answer "why did the model call this recording MCI?".
A gate weight alone cannot answer it: it says which stream the model leaned on,
not what that stream saw. To say a value is *high* or *low* you need something to
compare it against, and the only defensible comparison in this project is the
data the model was trained on.

So: every training-split patient with cached feature crops is decoded through the
same `biomarkers.decode` the serving path uses, and the headline marker of each
stream is summarised per class. The result is a small table of
`marker -> class -> {mean, sd, ...}` that lets the UI place one recording on the
distribution it was learned from.

Two deliberate constraints:

- **Training split only.** The val split backs the ablation and the test split
  backs `/model/performance`; reusing either here would leak an evaluation set
  into the explanation shown next to its own prediction.
- **No transcribed clinical thresholds.** Whether a marker rises or falls with
  impairment is *measured* (`direction` = sign of the Dementia-minus-Normal mean
  difference), never asserted from the literature.

The sweep reads every cached crop of ~950 patients and takes a few minutes, so it
is precomputed once by `backend/scripts/build_reference.py` into
`outputs/reference/biomarker_reference.json` and only recomputed when that file is
missing or a caller passes `force`. Nothing here depends on the checkpoint — these
are properties of the features, so switching checkpoints does not invalidate them.
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np

from . import biomarkers as biomarkers_mod
from .catalog import CatalogUnavailable, get_catalog
from .config import get_settings
from .constants import CLASS_NAMES, STREAM_KEYS

REFERENCE_SPLIT = "train"

#: The marker each stream is summarised by, in stream order. `path` walks into
#: the `summary` block of a decoded biomarker report.
MARKERS: list[dict[str, Any]] = [
    {
        "key": "mean_theta_alpha_ratio",
        "stream": "S1",
        "path": ("mean_theta_alpha_ratio",),
        "label": "Mean theta/alpha ratio",
        "description": (
            "Slow-band power divided by alpha power, averaged over the 19 channels. "
            "The single most replicated EEG correlate of cognitive decline."
        ),
    },
    {
        "key": "relative_theta_power",
        "stream": "S1",
        "path": ("relative_band_power", "theta"),
        "label": "Relative theta power",
        "description": "Share of total band power falling in 4-8 Hz, averaged over channels.",
    },
    {
        "key": "relative_alpha_power",
        "stream": "S1",
        "path": ("relative_band_power", "alpha"),
        "label": "Relative alpha power",
        "description": "Share of total band power falling in 8-13 Hz, averaged over channels.",
    },
    {
        "key": "mean_alpha_coherence",
        "stream": "S2",
        "path": ("mean_alpha_coherence",),
        "label": "Mean alpha coherence",
        "description": (
            "Magnitude-squared coherence in the alpha band, averaged over all 171 "
            "electrode pairs. Lower values indicate weaker cortical coupling."
        ),
    },
    {
        "key": "mean_spectral_entropy",
        "stream": "S3",
        "path": ("mean_spectral_entropy",),
        "label": "Mean spectral entropy",
        "description": (
            "Shannon entropy of the normalised power spectrum, averaged over channels. "
            "Lower values mean a more rhythmic, less complex signal."
        ),
    },
    {
        "key": "mean_absolute_asymmetry",
        "stream": "S4",
        "path": ("mean_absolute_asymmetry",),
        "label": "Mean absolute asymmetry",
        "description": (
            "Magnitude of the normalised left-right power difference over 8 symmetric "
            "electrode pairs and 4 bands, regardless of which side leads."
        ),
    },
]

_lock = threading.Lock()
_cache: dict[str, Any] | None = None


def _dig(summary: dict[str, Any], path: tuple[str, ...]) -> float | None:
    node: Any = summary
    for step in path:
        if not isinstance(node, dict) or step not in node:
            return None
        node = node[step]
    try:
        value = float(node)
    except (TypeError, ValueError):
        return None
    return value if np.isfinite(value) else None


def _summarise(values: list[float]) -> dict[str, Any]:
    array = np.asarray(values, dtype=np.float64)
    return {
        "n": int(array.size),
        "mean": float(array.mean()),
        # Sample SD: these are a sample of the population the model will meet,
        # not the whole of it. With n in the hundreds the difference is cosmetic,
        # but ddof=1 is the honest estimator and avoids a divide-by-zero at n=1.
        "sd": float(array.std(ddof=1)) if array.size > 1 else 0.0,
        "median": float(np.median(array)),
        "p25": float(np.percentile(array, 25)),
        "p75": float(np.percentile(array, 75)),
        "min": float(array.min()),
        "max": float(array.max()),
    }


def compute_reference(split: str = REFERENCE_SPLIT, max_crops: int | None = None) -> dict[str, Any]:
    """Decode every patient in ``split`` and summarise each marker per class.

    Raises :class:`CatalogUnavailable` when the dataset annotations are missing,
    and :class:`RuntimeError` when no patient in the split has cached features.
    """
    catalog = get_catalog()
    records = [r for r in catalog.all_records() if r["split"] == split]

    # marker key -> class name -> per-patient values
    collected: dict[str, dict[str, list[float]]] = {
        marker["key"]: {name: [] for name in CLASS_NAMES} for marker in MARKERS
    }
    used = 0
    skipped_no_features = 0
    skipped_undecodable = 0
    started = time.perf_counter()

    for record in records:
        class_name = record.get("class_name")
        if class_name not in collected[MARKERS[0]["key"]]:
            continue
        if not catalog.cached_feature_paths(record["serial"]):
            skipped_no_features += 1
            continue

        streams = catalog.load_cached_features(record["serial"], max_crops)
        # Average across crops before decoding — exactly what the serving path
        # does in `inference.predict_*`, so a reference value and a served value
        # are the same quantity computed the same way.
        averaged = {k: np.asarray(streams[k], dtype=np.float64).mean(axis=0) for k in STREAM_KEYS}
        decoded = biomarkers_mod.decode(averaged)
        if decoded is None:
            skipped_undecodable += 1
            continue

        summary = decoded["summary"]
        for marker in MARKERS:
            value = _dig(summary, marker["path"])
            if value is not None:
                collected[marker["key"]][class_name].append(value)
        used += 1

    if not used:
        raise RuntimeError(
            f"No decodable cached features found for the '{split}' split — "
            "cannot build a biomarker reference."
        )

    markers: dict[str, Any] = {}
    for marker in MARKERS:
        by_class = {
            name: _summarise(values)
            for name, values in collected[marker["key"]].items()
            if values
        }
        if len(by_class) < len(CLASS_NAMES):
            # A class with no usable patient cannot anchor a comparison; drop the
            # marker rather than let the UI compare against a missing baseline.
            continue
        normal = by_class["Normal"]
        dementia = by_class["Dementia"]
        difference = dementia["mean"] - normal["mean"]

        # Cohen's d between the two end classes. A marker can point somewhere
        # confidently and still be worthless if the groups it is pointing between
        # overlap almost completely — S4's class means differ by well under a
        # tenth of an SD — so the UI needs to be able to say that out loud.
        pooled = np.sqrt((normal["sd"] ** 2 + dementia["sd"] ** 2) / 2)
        separation = abs(difference) / pooled if pooled > 1e-12 else 0.0
        markers[marker["key"]] = {
            "key": marker["key"],
            "stream": marker["stream"],
            "label": marker["label"],
            "description": marker["description"],
            # Measured, not asserted: +1 means the marker is higher in Dementia
            # than in Normal across this split, -1 that it is lower.
            "direction": 1 if difference > 0 else -1 if difference < 0 else 0,
            "dementia_minus_normal": difference,
            # |Cohen's d| between the Normal and Dementia groups: how much this
            # marker can discriminate at all, independent of any one recording.
            "separation": float(separation),
            "by_class": by_class,
        }

    return {
        "split": split,
        "class_names": CLASS_NAMES,
        "n_patients": used,
        "n_by_class": {
            name: len(collected[MARKERS[0]["key"]][name]) for name in CLASS_NAMES
        },
        "skipped": {
            "no_cached_features": skipped_no_features,
            "undecodable": skipped_undecodable,
        },
        "max_crops": max_crops,
        "elapsed_seconds": round(time.perf_counter() - started, 2),
        "markers": markers,
        "note": (
            "Reference distributions measured on the CAUEEG training split. Marker "
            "direction is derived from the Dementia-minus-Normal mean difference in "
            "this data, not from published thresholds. These are population "
            "statistics for interpretation, not diagnostic cut-offs."
        ),
    }


def reference_path() -> Path:
    return get_settings().repo_root / "outputs" / "reference" / "biomarker_reference.json"


def save_reference(payload: dict[str, Any]) -> Path:
    path = reference_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def load_reference(force: bool = False) -> dict[str, Any]:
    """The reference table: from memory, else the precomputed file, else measured.

    Computing takes minutes, so a cold call with no precomputed file is slow by
    design rather than silently returning something weaker.
    """
    global _cache
    with _lock:
        if _cache is not None and not force:
            return _cache

        path = reference_path()
        if path.exists() and not force:
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload = None
            if isinstance(payload, dict) and payload.get("markers"):
                payload["source"] = "precomputed"
                _cache = payload
                return _cache

        payload = compute_reference()
        payload["source"] = "measured"
        try:
            save_reference(payload)
        except OSError:
            pass  # a read-only outputs/ is not a reason to fail the request
        _cache = payload
        return _cache


def invalidate() -> None:
    global _cache
    with _lock:
        _cache = None


__all__ = [
    "CatalogUnavailable",
    "MARKERS",
    "REFERENCE_SPLIT",
    "compute_reference",
    "invalidate",
    "load_reference",
    "reference_path",
    "save_reference",
]
