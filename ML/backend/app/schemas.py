"""Pydantic request/response models — the contract the frontend codes against."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Vector = list[float] | list[list[float]]


# --- Shared -----------------------------------------------------------------
class StreamInfo(BaseModel):
    key: str
    name: str
    dim: int
    description: str
    clinical_meaning: str


class GateStream(BaseModel):
    key: str
    name: str
    weight: float = Field(description="Raw sigmoid gate value in [0, 1].")
    relative_contribution: float = Field(description="Share of the total gate mass.")


class Gates(BaseModel):
    weights: dict[str, float]
    relative_contribution: dict[str, float]
    dominant_stream: str
    dominant_stream_name: str
    streams: list[GateStream]


class Prediction(BaseModel):
    class_index: int
    label: str
    confidence: float


class CropResult(BaseModel):
    index: int
    probabilities: dict[str, float]
    predicted_label: str
    gates: dict[str, float]


class RecordingInfo(BaseModel):
    sample_rate: float
    duration_seconds: float
    n_samples: int
    n_source_channels: int
    channels_used: list[str]
    resampled_from: float | None = None
    crop_length: int
    crop_starts: list[int]


class ModelStamp(BaseModel):
    checkpoint: str
    device: str


class PredictionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    prediction: Prediction
    probabilities: dict[str, float]
    gates: Gates
    n_crops_scored: int
    biomarkers: dict[str, Any] | None = Field(
        default=None,
        description="Named clinical quantities decoded from the feature vectors.",
    )
    per_crop: list[CropResult] | None = None
    recording: RecordingInfo | None = None
    timing_ms: dict[str, float] | None = None
    model: ModelStamp
    source: dict[str, Any] | None = Field(
        default=None, description="Where the scored signal came from."
    )
    ground_truth: dict[str, Any] | None = Field(
        default=None, description="Dataset label, when scoring a known patient."
    )


# --- Health / model ---------------------------------------------------------
class HealthResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    status: Literal["ok", "degraded"]
    version: str
    model_loaded: bool
    model_error: str | None = None
    device: str | None = None
    checkpoint: str | None = None
    extractor_compatible: bool | None = None
    dataset_available: bool
    database: dict[str, Any] | None = None
    paths: dict[str, Any]


class ModelInfoResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    architecture: str = "QSFE-Net"
    checkpoint: str
    checkpoint_path: str
    device: str
    n_parameters: int
    num_classes: int
    class_names: list[str]
    stream_dims: dict[str, int]
    extractor_dims: dict[str, int]
    extractor_compatible: bool
    dim_mismatch: dict[str, dict[str, int]]
    streams: list[StreamInfo]
    sample_rate: int
    crop_length: int
    default_n_crops: int


class ReloadRequest(BaseModel):
    checkpoint: str | None = Field(
        default=None,
        description="Path to a .pth checkpoint; relative paths resolve from the repo root.",
    )
    device: str | None = Field(default=None, description='"cpu", "cuda" or "auto".')


class CheckpointInfo(BaseModel):
    name: str
    path: str
    size_bytes: int
    stream_dims: dict[str, int] | None = None
    num_classes: int | None = None
    extractor_compatible: bool | None = None
    active: bool = False
    error: str | None = None


# --- Feature-vector scoring -------------------------------------------------
class FeaturePredictRequest(BaseModel):
    s1: Vector = Field(description="Frequency-slowing features.")
    s2: Vector = Field(description="Coherence features.")
    s3: Vector = Field(description="Complexity features.")
    s4: Vector = Field(description="Asymmetry features.")
    include_biomarkers: bool = True
    include_per_crop: bool = False


# --- Dataset catalog --------------------------------------------------------
class RecordSummary(BaseModel):
    serial: str
    split: str
    age: int | None = None
    symptom: list[str] = []
    class_label: int | None = None
    class_name: str | None = None
    has_edf: bool = False
    cached_crops: int = 0


class RecordListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[RecordSummary]


class DatasetSummaryResponse(BaseModel):
    available: bool
    task_name: str | None = None
    task_description: str | None = None
    class_names: list[str] = []
    counts: dict[str, Any] = {}
    edf_dir: str | None = None
    feature_dir: str | None = None


class ErrorResponse(BaseModel):
    detail: str
