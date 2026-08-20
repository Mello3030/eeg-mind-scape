"""Pydantic models for the application API (``/api/...``)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# --- Auth -------------------------------------------------------------------
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    role: str


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="researcher")


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    token: str
    user: UserOut


# --- Patients ---------------------------------------------------------------
class PatientBase(BaseModel):
    code: str | None = Field(default=None, max_length=64, description="Clinic ID / MRN.")
    name: str | None = Field(default=None, max_length=200)
    age: int | None = Field(default=None, ge=0, le=130)
    sex: str | None = Field(default=None, max_length=16)
    notes: str | None = None
    dataset_serial: str | None = Field(
        default=None, max_length=16, description="CAUEEG serial, if this mirrors a dataset patient."
    )


class PatientCreate(PatientBase):
    pass


class PatientUpdate(PatientBase):
    pass


class PatientOut(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime


class PatientDetail(PatientOut):
    n_predictions: int = 0
    n_uploads: int = 0
    latest_prediction: "PredictionSummary | None" = None


class PatientListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[PatientDetail]


# --- Uploads ----------------------------------------------------------------
class UploadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str | None
    filename: str
    size_bytes: int
    sha256: str
    sample_rate: float | None
    duration_seconds: float | None
    n_channels: int | None
    created_at: datetime


# --- Predictions ------------------------------------------------------------
class PredictionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str | None
    upload_id: str | None
    source_kind: str
    source_ref: str | None
    predicted_label: str
    predicted_index: int
    confidence: float
    probabilities: dict[str, float]
    gates: dict[str, float]
    dominant_stream: str | None
    n_crops: int
    checkpoint: str | None
    created_at: datetime


class PredictionDetail(PredictionSummary):
    biomarkers: dict[str, Any] | None = None
    per_crop: list[dict[str, Any]] | None = None
    recording: dict[str, Any] | None = None
    timing_ms: dict[str, Any] | None = None
    ground_truth: dict[str, Any] | None = None
    notes: str | None = None
    device: str | None = None
    patient: PatientOut | None = None
    upload: UploadOut | None = None


class PredictionListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[PredictionSummary]


class PredictionNotes(BaseModel):
    notes: str | None = None


class AnalyseRecordRequest(BaseModel):
    """Score a CAUEEG dataset patient and file the result against a patient row."""

    patient_id: str | None = Field(
        default=None, description="Existing patient to attach the result to."
    )
    create_patient: bool = Field(
        default=True,
        description="If no patient_id is given, create/reuse a patient for this serial.",
    )
    n_crops: int | None = Field(default=None, ge=1)
    use_cached_features: bool = True
    notes: str | None = None


# --- History / dashboard ----------------------------------------------------
class LabelCount(BaseModel):
    label: str
    count: int
    mean_confidence: float


class HistoryStats(BaseModel):
    total_predictions: int
    total_patients: int
    total_uploads: int
    by_label: list[LabelCount]
    mean_gates: dict[str, float]
    mean_confidence: float
    accuracy_on_labelled: float | None = Field(
        default=None,
        description="Accuracy over predictions that carry dataset ground truth.",
    )
    n_labelled: int = 0
    first_prediction_at: datetime | None = None
    last_prediction_at: datetime | None = None
    daily_counts: list[dict[str, Any]] = []


class TimelinePoint(BaseModel):
    prediction_id: str
    created_at: datetime
    predicted_label: str
    confidence: float
    probabilities: dict[str, float]
    gates: dict[str, float]
    mean_theta_alpha_ratio: float | None = None


class PatientTimeline(BaseModel):
    patient: PatientOut
    points: list[TimelinePoint]
    trend: dict[str, Any] = Field(
        default_factory=dict,
        description="Direction of change between the first and latest analysis.",
    )


class ComparisonEntry(BaseModel):
    prediction: PredictionSummary
    patient_label: str | None = None
    biomarker_summary: dict[str, Any] | None = None


class ComparisonResponse(BaseModel):
    entries: list[ComparisonEntry]
    probability_matrix: dict[str, list[float]]
    gate_matrix: dict[str, list[float]]
    biomarker_matrix: dict[str, list[float | None]]
    labels: list[str]


PatientDetail.model_rebuild()
