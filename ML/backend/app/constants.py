"""Domain constants shared by the server and (eventually) the frontend.

These mirror the conventions baked into ``src/datasets/feature_extraction.py``
and ``src/datasets/eeg_dataset.py``; they are duplicated here rather than
imported so the API contract stays stable if the research code is refactored.
"""

from __future__ import annotations

from itertools import combinations

CLASS_NAMES: list[str] = ["Normal", "MCI", "Dementia"]

# CAUEEG EDF layout: 19 EEG channels, then EKG and Photic (both dropped).
CHANNEL_NAMES: list[str] = [
    "Fp1", "F3", "C3", "P3", "O1",
    "Fp2", "F4", "C4", "P4", "O2",
    "F7", "T3", "T5",
    "F8", "T4", "T6",
    "Fz", "Cz", "Pz",
]
N_EEG_CHANNELS = len(CHANNEL_NAMES)

BAND_NAMES: list[str] = ["delta", "theta", "alpha", "beta"]
BAND_RANGES: dict[str, tuple[float, float]] = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 30.0),
}

# S1 packs 5 values per channel, in this order.
S1_FEATURE_NAMES: list[str] = ["theta_alpha_ratio", "delta", "theta", "alpha", "beta"]

# S2 iterates i<j over the 19 channels, 4 bands per pair -> 171 * 4 = 684.
COHERENCE_PAIRS: list[tuple[int, int]] = list(combinations(range(N_EEG_CHANNELS), 2))

# S4 uses these left/right electrode pairs, 4 bands each -> 8 * 4 = 32.
ASYMMETRY_PAIRS: list[tuple[int, int]] = [
    (0, 5), (1, 6), (2, 7), (3, 8), (4, 9), (10, 13), (11, 14), (12, 15)
]

STREAM_KEYS: list[str] = ["s1", "s2", "s3", "s4"]

STREAM_INFO: dict[str, dict[str, str | int]] = {
    "s1": {
        "key": "s1",
        "name": "Frequency slowing",
        "dim": 95,
        "description": (
            "Theta/alpha ratio plus absolute delta, theta, alpha and beta band "
            "power for each of the 19 channels (19 x 5)."
        ),
        "clinical_meaning": (
            "Cortical slowing is the best established EEG marker of dementia: "
            "power shifts from alpha/beta toward theta/delta as impairment progresses."
        ),
    },
    "s2": {
        "key": "s2",
        "name": "Coherence",
        "dim": 684,
        "description": "Magnitude-squared coherence for all 171 channel pairs across 4 bands.",
        "clinical_meaning": (
            "Functional disconnection between cortical regions; alpha-band coherence "
            "typically drops in Alzheimer's disease."
        ),
    },
    "s3": {
        "key": "s3",
        "name": "Complexity",
        "dim": 19,
        "description": "Spectral entropy of the normalised PSD, one value per channel.",
        "clinical_meaning": (
            "Loss of signal complexity/irregularity accompanies neurodegeneration."
        ),
    },
    "s4": {
        "key": "s4",
        "name": "Hemispheric asymmetry",
        "dim": 32,
        "description": "Normalised left/right power difference for 8 symmetric pairs across 4 bands.",
        "clinical_meaning": (
            "Asymmetric degeneration distinguishes focal pathology from diffuse decline."
        ),
    },
}

# Feature dimensions the current extractor produces; a checkpoint must match
# these to be usable for live EDF inference.
EXTRACTOR_DIMS: dict[str, int] = {"s1": 95, "s2": 684, "s3": 19, "s4": 32}


def coherence_pair_labels() -> list[str]:
    return [f"{CHANNEL_NAMES[i]}-{CHANNEL_NAMES[j]}" for i, j in COHERENCE_PAIRS]


def asymmetry_pair_labels() -> list[str]:
    return [f"{CHANNEL_NAMES[i]}/{CHANNEL_NAMES[j]}" for i, j in ASYMMETRY_PAIRS]
