"""Pydantic models for the application API (``/api/...``)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --- Auth -------------------------------------------------------------------
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    role: str


_COMMON_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789", "1234567890",
    "qwertyui", "qwerty123", "letmein1", "welcome1", "abc12345", "iloveyou",
    "admin123", "root1234", "changeme", "football",
    "baseball", "sunshine", "princess", "trustno1", "passw0rd", "p@ssw0rd",
}


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def _not_obvious(cls, value: str) -> str:
        """Reject the passwords an attacker tries first.

        Deliberately not a complexity policy — forcing symbols and digits pushes
        people toward `Password1!` and a sticky note. This only blocks the
        handful of strings that are guessed immediately.
        """
        if value.lower() in _COMMON_PASSWORDS:
            raise ValueError("That password is too common. Choose something less predictable.")
        if len(set(value)) < 5:
            raise ValueError("Password needs more variety than that.")
        return value
    role: str = Field(default="researcher")
    # Checked against QSFE_REGISTRATION_CODE by the route, not here: a validator
    # cannot read settings, and a wrong code must answer 403 rather than 422.
    registration_code: str = ""


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
    # Lives on the summary, not just the detail: PATCH /api/analyses/{id} answers
    # with a summary, so without this the one endpoint that edits notes could not
    # echo them back — and history rows carry notes the list UI already reads.
    notes: str | None = None
    # Likewise on the summary: every list view (history, dashboard, patient
    # timeline) shows a match/miss badge per row, and it was silently blank for
    # dataset recordings because the field only existed on the detail schema.
    ground_truth: dict[str, Any] | None = None


class PredictionDetail(PredictionSummary):
    biomarkers: dict[str, Any] | None = None
    per_crop: list[dict[str, Any]] | None = None
    recording: dict[str, Any] | None = None
    timing_ms: dict[str, Any] | None = None
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
