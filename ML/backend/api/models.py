"""ORM models: patients, uploaded recordings, and stored predictions.

A ``Prediction`` is one scoring run. Its headline numbers (class probabilities,
the four gate weights) are stored as columns so they can be filtered, sorted and
aggregated in SQL; the bulky per-channel biomarkers and per-crop detail live in
JSON columns next to them.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, utcnow


def _uuid() -> str:
    return uuid.uuid4().hex


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(Base, TimestampMixin):
    """A platform account.

    Patients are owned by the researcher who created them: a researcher sees and
    deletes only their own, while an administrator sees every record. Ownership
    cascades — a prediction or upload is reachable exactly when its patient is.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="researcher")


class Patient(Base, TimestampMixin):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    # The researcher who created this record. Required: an unowned patient would
    # be invisible to every non-admin and impossible to clean up from the UI.
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Codes stay unique across the instance, so a clash is reported even when the
    # other record belongs to a different researcher.
    code: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(200))
    age: Mapped[int | None] = mapped_column(Integer)
    sex: Mapped[str | None] = mapped_column(String(16))
    notes: Mapped[str | None] = mapped_column(Text)
    # Link to a CAUEEG patient, when this record mirrors a dataset entry.
    dataset_serial: Mapped[str | None] = mapped_column(String(16), index=True)

    owner: Mapped["User"] = relationship()
    uploads: Mapped[list["Upload"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    predictions: Mapped[list["Prediction"]] = relationship(
        back_populates="patient",
        cascade="all, delete-orphan",
        order_by="Prediction.created_at.desc()",
    )


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    patient_id: Mapped[str | None] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    sample_rate: Mapped[float | None] = mapped_column(Float)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    n_channels: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    patient: Mapped[Patient | None] = relationship(back_populates="uploads")
    predictions: Mapped[list["Prediction"]] = relationship(
        back_populates="upload", cascade="all, delete-orphan"
    )


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    patient_id: Mapped[str | None] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    upload_id: Mapped[str | None] = mapped_column(
        ForeignKey("uploads.id", ondelete="CASCADE"), index=True
    )

    # Where the scored signal came from: upload | dataset_record | features
    source_kind: Mapped[str] = mapped_column(String(32), default="upload")
    source_ref: Mapped[str | None] = mapped_column(String(255))

    predicted_label: Mapped[str] = mapped_column(String(32), index=True)
    predicted_index: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Float)
    prob_normal: Mapped[float] = mapped_column(Float, default=0.0)
    prob_mci: Mapped[float] = mapped_column(Float, default=0.0)
    prob_dementia: Mapped[float] = mapped_column(Float, default=0.0)

    # The interpretability output — queryable, not buried in JSON.
    gate_s1: Mapped[float] = mapped_column(Float, default=0.0)
    gate_s2: Mapped[float] = mapped_column(Float, default=0.0)
    gate_s3: Mapped[float] = mapped_column(Float, default=0.0)
    gate_s4: Mapped[float] = mapped_column(Float, default=0.0)
    dominant_stream: Mapped[str | None] = mapped_column(String(8))

    n_crops: Mapped[int] = mapped_column(Integer, default=1)
    checkpoint: Mapped[str | None] = mapped_column(String(255))
    device: Mapped[str | None] = mapped_column(String(32))
    model_version: Mapped[str | None] = mapped_column(String(32))

    biomarkers: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    per_crop: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)
    recording: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    timing_ms: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    ground_truth: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )

    patient: Mapped[Patient | None] = relationship(back_populates="predictions")
    upload: Mapped[Upload | None] = relationship(back_populates="predictions")

    __table_args__ = (
        Index("ix_predictions_patient_created", "patient_id", "created_at"),
    )

    # --- Convenience ------------------------------------------------------
    @property
    def probabilities(self) -> dict[str, float]:
        return {
            "Normal": self.prob_normal,
            "MCI": self.prob_mci,
            "Dementia": self.prob_dementia,
        }

    @property
    def gates(self) -> dict[str, float]:
        return {
            "s1": self.gate_s1,
            "s2": self.gate_s2,
            "s3": self.gate_s3,
            "s4": self.gate_s4,
        }
