"""EDF loading, cropping and normalisation — mirrors the training pipeline.

Training used ``precompute_multicrop.py``: read 21 channels, keep the first 19
(drop EKG and Photic), take a 2000-sample (10 s) crop, then z-normalise each
channel. Inference repeats that, but picks crops deterministically so the same
recording always yields the same prediction.
"""

from __future__ import annotations

import logging

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pyedflib
from scipy.signal import resample_poly

from .config import get_settings
from .constants import CHANNEL_NAMES, N_EEG_CHANNELS


class SignalError(ValueError):
    """Raised when a recording cannot be used for inference."""


@dataclass
class Recording:
    signal: np.ndarray          # (19, n_samples), raw units
    sample_rate: float
    duration_seconds: float
    channel_labels: list[str]
    n_source_channels: int
    resampled_from: float | None = None

    @property
    def n_samples(self) -> int:
        return int(self.signal.shape[1])


logger = logging.getLogger("qsfe.preprocessing")

_UNREADABLE = (
    "This file could not be read as EDF. Check that it is a European Data Format "
    "recording and that it is not truncated."
)


def read_edf(path: str | Path) -> Recording:
    """Read an EDF file and return its first 19 channels at 200 Hz."""
    path = Path(path)
    try:
        reader = pyedflib.EdfReader(str(path))
    except Exception as exc:  # pyedflib raises bare OSError/Exception
        # pyedflib puts the absolute path in its message, which would expose the
        # server's filesystem layout to any client. Keep it in the log instead.
        logger.warning("EDF open failed for %s: %s", path, exc)
        raise SignalError(_UNREADABLE) from exc

    try:
        n_source = reader.signals_in_file
        labels = list(reader.getSignalLabels())
        if n_source < N_EEG_CHANNELS:
            raise SignalError(
                f"Recording has {n_source} channels; at least {N_EEG_CHANNELS} "
                "EEG channels are required."
            )

        rates = {round(float(reader.getSampleFrequency(i)), 6) for i in range(N_EEG_CHANNELS)}
        if len(rates) > 1:
            raise SignalError(f"EEG channels have mixed sample rates: {sorted(rates)}")
        fs = rates.pop()
        if fs <= 0:
            raise SignalError("Invalid sample rate reported by the EDF header.")

        n_samples = int(reader.getNSamples()[0])
        signal = np.zeros((N_EEG_CHANNELS, n_samples), dtype=np.float64)
        for i in range(N_EEG_CHANNELS):
            signal[i, :] = reader.readSignal(i)
    finally:
        reader.close()

    if not np.isfinite(signal).all():
        signal = np.nan_to_num(signal, nan=0.0, posinf=0.0, neginf=0.0)

    settings = get_settings()
    target = float(settings.sample_rate)
    resampled_from = None
    if abs(fs - target) > 1e-6 and settings.resample_uploads:
        signal = _resample(signal, fs, target)
        resampled_from, fs = fs, target

    return Recording(
        signal=signal,
        sample_rate=fs,
        duration_seconds=signal.shape[1] / fs,
        channel_labels=labels[:N_EEG_CHANNELS],
        n_source_channels=n_source,
        resampled_from=resampled_from,
    )


def read_edf_window(
    path: str | Path,
    start_seconds: float = 0.0,
    duration_seconds: float = 30.0,
    max_points: int = 3000,
    channels: list[str] | None = None,
) -> dict:
    """Read one time window of an EDF for display, without loading the whole file.

    Returns samples in their native units and sample rate — this feeds the EEG
    viewer, not the model, so no resampling or z-normalisation is applied.
    Decimation is by striding, which is adequate for a plot whose width is far
    below the Nyquist frequency of the signal.
    """
    path = Path(path)
    try:
        reader = pyedflib.EdfReader(str(path))
    except Exception as exc:
        logger.warning("EDF open failed for %s: %s", path, exc)
        raise SignalError(_UNREADABLE) from exc

    try:
        labels = list(reader.getSignalLabels())[:N_EEG_CHANNELS]
        names = CHANNEL_NAMES[: len(labels)]
        fs = float(reader.getSampleFrequency(0))
        if fs <= 0:
            raise SignalError("Invalid sample rate reported by the EDF header.")
        total_samples = int(reader.getNSamples()[0])
        total_seconds = total_samples / fs

        wanted = names if not channels else [c for c in names if c in set(channels)]
        if not wanted:
            raise SignalError(f"None of the requested channels exist. Available: {names}")

        start = max(0, min(int(round(start_seconds * fs)), max(0, total_samples - 1)))
        count = int(round(duration_seconds * fs))
        count = max(1, min(count, total_samples - start))
        step = max(1, count // max_points)

        data: list[list[float]] = []
        for name in wanted:
            raw = reader.readSignal(names.index(name), start, count)
            decimated = np.asarray(raw[::step], dtype=np.float64)
            decimated = np.nan_to_num(decimated, nan=0.0, posinf=0.0, neginf=0.0)
            data.append([round(float(v), 3) for v in decimated])
    finally:
        reader.close()

    return {
        "channels": wanted,
        "source_labels": labels,
        "sample_rate": fs,
        "effective_sample_rate": fs / step,
        "start_seconds": start / fs,
        "duration_seconds": count / fs,
        "total_duration_seconds": total_seconds,
        "n_points": len(data[0]) if data else 0,
        "data": data,
    }


def _resample(signal: np.ndarray, fs: float, target: float) -> np.ndarray:
    """Rational resampling to the training sample rate."""
    from fractions import Fraction

    ratio = Fraction(target / fs).limit_denominator(1000)
    return resample_poly(signal, ratio.numerator, ratio.denominator, axis=1)


def crop_starts(n_samples: int, n_crops: int, crop_length: int) -> list[int]:
    """Deterministic, evenly spaced crop start indices.

    One crop -> the centre crop used for validation/test during training.
    N crops -> N evenly spaced windows spanning the recording.
    """
    if n_samples <= crop_length:
        return [0]
    span = n_samples - crop_length
    if n_crops <= 1:
        return [span // 2]
    step = span / (n_crops - 1)
    return sorted({int(round(i * step)) for i in range(n_crops)})


def extract_crops(recording: Recording, n_crops: int) -> tuple[np.ndarray, list[int]]:
    """Return ``(crops, starts)`` with crops shaped (n_crops, 19, crop_length)."""
    crop_length = get_settings().crop_length
    signal = recording.signal

    if signal.shape[1] < crop_length:
        pad = crop_length - signal.shape[1]
        signal = np.pad(signal, ((0, 0), (0, pad)))

    starts = crop_starts(signal.shape[1], n_crops, crop_length)
    crops = np.stack([signal[:, s: s + crop_length] for s in starts])
    return normalize(crops), starts


def normalize(crops: np.ndarray) -> np.ndarray:
    """Per-channel z-normalisation, exactly as in training."""
    mean = crops.mean(axis=-1, keepdims=True)
    std = crops.std(axis=-1, keepdims=True) + 1e-8
    return (crops - mean) / std
