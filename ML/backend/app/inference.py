"""End-to-end inference: EDF (or raw feature vectors) -> prediction + explanation.

A recording is longer than the 10 s window the model was trained on, so several
crops are scored and their softmax probabilities and gate weights are averaged.
That is both more stable than a single crop and closer to how the multi-crop
training data was built.
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import torch

from . import biomarkers as biomarkers_mod
from . import features as features_mod
from .config import get_settings
from .constants import STREAM_INFO, STREAM_KEYS
from .model import LoadedModel, ModelError, registry
from .preprocessing import Recording, SignalError, extract_crops, read_edf


class InferenceError(ValueError):
    """Raised when the request cannot be scored (bad shapes, unusable file)."""


def clamp_crops(n_crops: int | None) -> int:
    settings = get_settings()
    if n_crops is None:
        return settings.default_n_crops
    return max(1, min(int(n_crops), settings.max_n_crops))


def _as_batch(streams: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Accept a single sample or a stack; always return (n, dim) arrays."""
    out: dict[str, np.ndarray] = {}
    n_rows: set[int] = set()
    for key in STREAM_KEYS:
        if key not in streams:
            raise InferenceError(f"Missing feature stream '{key}'.")
        arr = np.asarray(streams[key], dtype=np.float32)
        if arr.ndim == 1:
            arr = arr[None, :]
        elif arr.ndim != 2:
            raise InferenceError(f"Stream '{key}' must be 1-D or 2-D, got shape {arr.shape}.")
        if not np.isfinite(arr).all():
            raise InferenceError(f"Stream '{key}' contains NaN or infinite values.")
        n_rows.add(arr.shape[0])
        out[key] = arr
    if len(n_rows) != 1:
        raise InferenceError(f"Feature streams disagree on sample count: {sorted(n_rows)}")
    return out


def _check_dims(batch: dict[str, np.ndarray], model: LoadedModel) -> None:
    bad = {
        k: {"given": int(batch[k].shape[1]), "expected": model.stream_dims[k]}
        for k in STREAM_KEYS
        if batch[k].shape[1] != model.stream_dims[k]
    }
    if bad:
        raise InferenceError(
            "Feature dimensions do not match the loaded checkpoint "
            f"({model.checkpoint_path.name}): {bad}"
        )


def score(streams: dict[str, np.ndarray], model: LoadedModel | None = None) -> dict:
    """Run the network over a batch of feature vectors and average the crops."""
    model = model or registry.get()
    batch = _as_batch(streams)
    _check_dims(batch, model)

    tensors = [torch.from_numpy(batch[k]).to(model.device) for k in STREAM_KEYS]
    with torch.no_grad():
        # BatchNorm in eval mode uses running stats, so a single crop is fine.
        logits, gates = model.module(*tensors)
        probs = torch.softmax(logits, dim=1)

    probs_np = probs.cpu().numpy().astype(np.float64)
    gates_np = gates.cpu().numpy().astype(np.float64)

    mean_probs = probs_np.mean(axis=0)
    mean_gates = gates_np.mean(axis=0)
    class_index = int(mean_probs.argmax())

    return {
        "prediction": {
            "class_index": class_index,
            "label": model.class_names[class_index],
            "confidence": float(mean_probs[class_index]),
        },
        "probabilities": {
            name: float(mean_probs[i]) for i, name in enumerate(model.class_names)
        },
        "gates": _describe_gates(mean_gates),
        "per_crop": [
            {
                "index": i,
                "probabilities": {
                    name: float(probs_np[i, j]) for j, name in enumerate(model.class_names)
                },
                "predicted_label": model.class_names[int(probs_np[i].argmax())],
                "gates": {k: float(gates_np[i, j]) for j, k in enumerate(STREAM_KEYS)},
            }
            for i in range(probs_np.shape[0])
        ],
        "n_crops_scored": int(probs_np.shape[0]),
    }


def _describe_gates(gate_values: np.ndarray) -> dict:
    """Gate weights plus their relative share - the interpretability output."""
    total = float(gate_values.sum()) + 1e-12
    weights = {k: float(gate_values[i]) for i, k in enumerate(STREAM_KEYS)}
    contributions = {k: float(gate_values[i] / total) for i, k in enumerate(STREAM_KEYS)}
    dominant = max(weights, key=weights.get)
    return {
        "weights": weights,
        "relative_contribution": contributions,
        "dominant_stream": dominant,
        "dominant_stream_name": STREAM_INFO[dominant]["name"],
        "streams": [
            {
                "key": k,
                "name": STREAM_INFO[k]["name"],
                "weight": weights[k],
                "relative_contribution": contributions[k],
            }
            for k in STREAM_KEYS
        ],
    }


def predict_recording(
    recording: Recording,
    n_crops: int | None = None,
    include_biomarkers: bool = True,
    include_per_crop: bool = False,
) -> dict:
    """Full pipeline for an in-memory recording."""
    model = registry.get()
    if not model.extractor_compatible:
        raise InferenceError(
            "The loaded checkpoint was trained on a different feature layout "
            f"({model.dim_mismatch}), so raw EEG cannot be scored with it. "
            "Load a matching checkpoint via POST /model/reload."
        )

    n_crops = clamp_crops(n_crops)
    started = time.perf_counter()

    crops, starts = extract_crops(recording, n_crops)
    crop_t = time.perf_counter()
    streams = features_mod.extract_batch(crops)
    feature_t = time.perf_counter()

    result = score(streams, model)
    done = time.perf_counter()

    if include_biomarkers:
        averaged = {k: streams[k].mean(axis=0) for k in STREAM_KEYS}
        result["biomarkers"] = biomarkers_mod.decode(averaged)

    if not include_per_crop:
        result.pop("per_crop", None)

    settings = get_settings()
    result["recording"] = {
        "sample_rate": recording.sample_rate,
        "duration_seconds": round(recording.duration_seconds, 3),
        "n_samples": recording.n_samples,
        "n_source_channels": recording.n_source_channels,
        "channels_used": recording.channel_labels,
        "resampled_from": recording.resampled_from,
        "crop_length": settings.crop_length,
        "crop_starts": starts,
    }
    result["timing_ms"] = {
        "cropping": round((crop_t - started) * 1000, 1),
        "feature_extraction": round((feature_t - crop_t) * 1000, 1),
        "model": round((done - feature_t) * 1000, 1),
        "total": round((time.perf_counter() - started) * 1000, 1),
    }
    result["model"] = {
        "checkpoint": model.checkpoint_path.name,
        "device": str(model.device),
    }
    return result


def predict_edf(
    path: str | Path,
    n_crops: int | None = None,
    include_biomarkers: bool = True,
    include_per_crop: bool = False,
) -> dict:
    try:
        recording = read_edf(path)
    except SignalError as exc:
        raise InferenceError(str(exc)) from exc
    return predict_recording(recording, n_crops, include_biomarkers, include_per_crop)


def predict_features(
    streams: dict[str, np.ndarray],
    include_biomarkers: bool = True,
    include_per_crop: bool = False,
) -> dict:
    """Score precomputed feature vectors (cached .npz, offline pipelines)."""
    model = registry.get()
    result = score(streams, model)
    if include_biomarkers:
        batch = _as_batch(streams)
        result["biomarkers"] = biomarkers_mod.decode(
            {k: batch[k].mean(axis=0) for k in STREAM_KEYS}
        )
    if not include_per_crop:
        result.pop("per_crop", None)
    result["model"] = {
        "checkpoint": model.checkpoint_path.name,
        "device": str(model.device),
    }
    return result


__all__ = [
    "InferenceError",
    "ModelError",
    "predict_edf",
    "predict_features",
    "predict_recording",
    "score",
]
