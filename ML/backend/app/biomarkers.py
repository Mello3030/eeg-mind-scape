"""Decode raw feature vectors into named, plottable clinical quantities.

The model consumes flat vectors; a UI needs to know that element 7 of S1 is the
delta power at F3. Everything here is derived from features that were already
computed for the forward pass, so it costs nothing extra.
"""

from __future__ import annotations

import numpy as np

from .constants import (
    ASYMMETRY_PAIRS,
    BAND_NAMES,
    CHANNEL_NAMES,
    COHERENCE_PAIRS,
    EXTRACTOR_DIMS,
    N_EEG_CHANNELS,
    asymmetry_pair_labels,
    coherence_pair_labels,
)


def _f(x) -> float:
    return float(np.asarray(x, dtype=np.float64))


def decode(streams: dict[str, np.ndarray], top_k: int = 10) -> dict | None:
    """Turn averaged s1..s4 vectors into a named biomarker report.

    Returns ``None`` when the vectors do not have the layout produced by the
    current extractor (e.g. features from an older experiment).
    """
    if any(streams[k].shape[-1] != dim for k, dim in EXTRACTOR_DIMS.items()):
        return None

    s1 = np.asarray(streams["s1"], dtype=np.float64).reshape(N_EEG_CHANNELS, 5)
    s2 = np.asarray(streams["s2"], dtype=np.float64).reshape(len(COHERENCE_PAIRS), len(BAND_NAMES))
    s3 = np.asarray(streams["s3"], dtype=np.float64)
    s4 = np.asarray(streams["s4"], dtype=np.float64).reshape(len(ASYMMETRY_PAIRS), len(BAND_NAMES))

    theta_alpha = s1[:, 0]
    band_power = s1[:, 1:]                     # (19, 4) delta/theta/alpha/beta
    total_power = band_power.sum(axis=1) + 1e-12
    relative_power = band_power / total_power[:, None]

    coherence_by_band = s2.mean(axis=0)
    pair_labels = coherence_pair_labels()
    alpha_idx = BAND_NAMES.index("alpha")
    alpha_coh = s2[:, alpha_idx]
    strongest = np.argsort(alpha_coh)[::-1][:top_k]
    weakest = np.argsort(alpha_coh)[:top_k]

    asym_labels = asymmetry_pair_labels()
    abs_asym = np.abs(s4)

    return {
        "summary": {
            "mean_theta_alpha_ratio": _f(theta_alpha.mean()),
            "max_theta_alpha_ratio": _f(theta_alpha.max()),
            "max_theta_alpha_channel": CHANNEL_NAMES[int(theta_alpha.argmax())],
            "mean_spectral_entropy": _f(s3.mean()),
            "mean_alpha_coherence": _f(alpha_coh.mean()),
            "mean_absolute_asymmetry": _f(abs_asym.mean()),
            "relative_band_power": {
                band: _f(relative_power[:, i].mean()) for i, band in enumerate(BAND_NAMES)
            },
        },
        "frequency_slowing": {
            "channels": CHANNEL_NAMES,
            "theta_alpha_ratio": [_f(v) for v in theta_alpha],
            "band_power": {
                band: [_f(v) for v in band_power[:, i]] for i, band in enumerate(BAND_NAMES)
            },
            "relative_band_power": {
                band: [_f(v) for v in relative_power[:, i]] for i, band in enumerate(BAND_NAMES)
            },
        },
        "coherence": {
            "mean_by_band": {band: _f(coherence_by_band[i]) for i, band in enumerate(BAND_NAMES)},
            "top_alpha_pairs": [
                {"pair": pair_labels[i], "coherence": _f(alpha_coh[i])} for i in strongest
            ],
            "lowest_alpha_pairs": [
                {"pair": pair_labels[i], "coherence": _f(alpha_coh[i])} for i in weakest
            ],
        },
        "complexity": {
            "channels": CHANNEL_NAMES,
            "spectral_entropy": [_f(v) for v in s3],
        },
        "asymmetry": {
            "pairs": asym_labels,
            "by_band": {
                band: [_f(v) for v in s4[:, i]] for i, band in enumerate(BAND_NAMES)
            },
            "most_asymmetric": {
                "pair": asym_labels[int(abs_asym.max(axis=1).argmax())],
                "band": BAND_NAMES[int(abs_asym.max(axis=0).argmax())],
                "value": _f(s4.reshape(-1)[int(abs_asym.argmax())]),
            },
        },
    }


def full_coherence_matrix(s2: np.ndarray, band: str) -> list[list[float]]:
    """Symmetric 19x19 coherence matrix for one band (for a heatmap)."""
    if band not in BAND_NAMES:
        raise ValueError(f"Unknown band '{band}'. Expected one of {BAND_NAMES}.")
    values = np.asarray(s2, dtype=np.float64).reshape(len(COHERENCE_PAIRS), len(BAND_NAMES))
    idx = BAND_NAMES.index(band)
    matrix = np.eye(N_EEG_CHANNELS)
    for (i, j), v in zip(COHERENCE_PAIRS, values[:, idx]):
        matrix[i, j] = matrix[j, i] = v
    return matrix.tolist()
