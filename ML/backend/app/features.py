"""Feature-stream extraction, delegated to the research code.

The four extractors in ``src/datasets/feature_extraction.py`` are the single
source of truth: any drift between training features and serving features would
silently wreck accuracy, so nothing is reimplemented here.
"""

from __future__ import annotations

import numpy as np

from . import research
from .constants import EXTRACTOR_DIMS, STREAM_KEYS

_STREAM_BY_EXTRACTOR_KEY = {
    "s1_freq_slowing": "s1",
    "s2_coherence": "s2",
    "s3_complexity": "s3",
    "s4_asymmetry": "s4",
}


def extract_streams(crop: np.ndarray) -> dict[str, np.ndarray]:
    """Extract s1..s4 from one normalised (19, 2000) crop."""
    module = research.feature_extraction()
    raw = module.extract_all_features(crop)
    return {
        _STREAM_BY_EXTRACTOR_KEY[key]: np.asarray(vec, dtype=np.float32)
        for key, vec in raw.items()
    }


def extract_batch(crops: np.ndarray) -> dict[str, np.ndarray]:
    """Extract features for a stack of crops -> {stream: (n_crops, dim)}."""
    per_crop = [extract_streams(crop) for crop in crops]
    return {k: np.stack([f[k] for f in per_crop]) for k in STREAM_KEYS}


def extractor_dims() -> dict[str, int]:
    return dict(EXTRACTOR_DIMS)
