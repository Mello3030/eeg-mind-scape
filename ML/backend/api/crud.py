"""Database operations. Routers stay thin; all SQL lives here."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..app.constants import CLASS_NAMES, STREAM_KEYS
from . import storage
from .models import Patient, Prediction, Upload

# --- Patients ---------------------------------------------------------------
def create_patient(db: Session, data: dict[str, Any]) -> Patient:
    patient = Patient(**{k: v for k, v in data.items() if v is not None})
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


def get_patient(db: Session, patient_id: str) -> Patient | None:
    return db.get(Patient, patient_id)


def get_patient_by_serial(db: Session, serial: str) -> Patient | None:
    return db.scalar(select(Patient).where(Patient.dataset_serial == serial))


def get_patient_by_code(db: Session, code: str) -> Patient | None:
    return db.scalar(select(Patient).where(Patient.code == code))


def list_patients(
    db: Session,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Patient], int]:
    stmt = select(Patient)
    if search:
        needle = f"%{search.lower()}%"
        stmt = stmt.where(
            func.lower(func.coalesce(Patient.name, "")).like(needle)
            | func.lower(func.coalesce(Patient.code, "")).like(needle)
            | func.lower(func.coalesce(Patient.dataset_serial, "")).like(needle)
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Patient.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return list(rows), total


def update_patient(db: Session, patient: Patient, data: dict[str, Any]) -> Patient:
    for key, value in data.items():
        setattr(patient, key, value)
    db.commit()
    db.refresh(patient)
    return patient


def delete_patient(db: Session, patient: Patient) -> int:
    """Delete a patient with their uploads and predictions. Returns files removed."""
    removed = 0
    for upload in list(patient.uploads):
        if _is_last_reference(db, upload) and storage.delete(upload.stored_path):
            removed += 1
    db.delete(patient)
    db.commit()
    return removed


def patient_counts(db: Session, patient_id: str) -> tuple[int, int]:
    predictions = db.scalar(
        select(func.count()).select_from(Prediction).where(Prediction.patient_id == patient_id)
    ) or 0
    uploads = db.scalar(
        select(func.count()).select_from(Upload).where(Upload.patient_id == patient_id)
    ) or 0
    return predictions, uploads


def latest_prediction(db: Session, patient_id: str) -> Prediction | None:
    return db.scalar(
        select(Prediction)
        .where(Prediction.patient_id == patient_id)
        .order_by(Prediction.created_at.desc())
        .limit(1)
    )


# --- Uploads ----------------------------------------------------------------
def create_upload(db: Session, data: dict[str, Any]) -> Upload:
    upload = Upload(**data)
    db.add(upload)
    db.commit()
    db.refresh(upload)
    return upload


def find_upload_by_hash(db: Session, sha256: str, patient_id: str | None) -> Upload | None:
    return db.scalar(
        select(Upload)
        .where(Upload.sha256 == sha256, Upload.patient_id == patient_id)
        .order_by(Upload.created_at.desc())
        .limit(1)
    )


def _is_last_reference(db: Session, upload: Upload) -> bool:
    """True when no other upload row points at the same stored file."""
    others = db.scalar(
        select(func.count())
        .select_from(Upload)
        .where(Upload.stored_path == upload.stored_path, Upload.id != upload.id)
    ) or 0
    return others == 0


def delete_upload(db: Session, upload: Upload) -> bool:
    removed = _is_last_reference(db, upload) and storage.delete(upload.stored_path)
    db.delete(upload)
    db.commit()
    return bool(removed)


# --- Predictions ------------------------------------------------------------
def create_prediction(
    db: Session,
    result: dict[str, Any],
    *,
    patient_id: str | None = None,
    upload_id: str | None = None,
    source_kind: str = "upload",
    source_ref: str | None = None,
    notes: str | None = None,
    model_version: str | None = None,
) -> Prediction:
    """Persist an inference result produced by ``backend.app.inference``."""
    probs = result.get("probabilities", {})
    gates = (result.get("gates") or {}).get("weights", {})

    prediction = Prediction(
        patient_id=patient_id,
        upload_id=upload_id,
        source_kind=source_kind,
        source_ref=source_ref,
        predicted_label=result["prediction"]["label"],
        predicted_index=result["prediction"]["class_index"],
        confidence=result["prediction"]["confidence"],
        prob_normal=float(probs.get("Normal", 0.0)),
        prob_mci=float(probs.get("MCI", 0.0)),
        prob_dementia=float(probs.get("Dementia", 0.0)),
        gate_s1=float(gates.get("s1", 0.0)),
        gate_s2=float(gates.get("s2", 0.0)),
        gate_s3=float(gates.get("s3", 0.0)),
        gate_s4=float(gates.get("s4", 0.0)),
        dominant_stream=(result.get("gates") or {}).get("dominant_stream"),
        n_crops=int(result.get("n_crops_scored", 1)),
        checkpoint=(result.get("model") or {}).get("checkpoint"),
        device=(result.get("model") or {}).get("device"),
        model_version=model_version,
        biomarkers=result.get("biomarkers"),
        per_crop=result.get("per_crop"),
        recording=result.get("recording"),
        timing_ms=result.get("timing_ms"),
        ground_truth=result.get("ground_truth"),
        notes=notes,
    )
    db.add(prediction)
    db.commit()
    db.refresh(prediction)
    return prediction


def get_prediction(db: Session, prediction_id: str) -> Prediction | None:
    return db.scalar(
        select(Prediction)
        .options(selectinload(Prediction.patient), selectinload(Prediction.upload))
        .where(Prediction.id == prediction_id)
    )


def list_predictions(
    db: Session,
    patient_id: str | None = None,
    label: str | None = None,
    source_kind: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    min_confidence: float | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Prediction], int]:
    stmt = select(Prediction)
    if patient_id:
        stmt = stmt.where(Prediction.patient_id == patient_id)
    if label:
        stmt = stmt.where(Prediction.predicted_label == label)
    if source_kind:
        stmt = stmt.where(Prediction.source_kind == source_kind)
    if since:
        stmt = stmt.where(Prediction.created_at >= since)
    if until:
        stmt = stmt.where(Prediction.created_at <= until)
    if min_confidence is not None:
        stmt = stmt.where(Prediction.confidence >= min_confidence)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Prediction.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return list(rows), total


def get_predictions_by_ids(db: Session, ids: list[str]) -> list[Prediction]:
    rows = db.scalars(
        select(Prediction)
        .options(selectinload(Prediction.patient))
        .where(Prediction.id.in_(ids))
    ).all()
    order = {pid: i for i, pid in enumerate(ids)}
    return sorted(rows, key=lambda p: order.get(p.id, len(order)))


def delete_prediction(db: Session, prediction: Prediction) -> None:
    db.delete(prediction)
    db.commit()


# --- Aggregates -------------------------------------------------------------
def stats(db: Session) -> dict[str, Any]:
    total = db.scalar(select(func.count()).select_from(Prediction)) or 0

    by_label = []
    for name in CLASS_NAMES:
        count, mean_conf = db.execute(
            select(func.count(), func.avg(Prediction.confidence)).where(
                Prediction.predicted_label == name
            )
        ).one()
        by_label.append(
            {"label": name, "count": int(count or 0), "mean_confidence": float(mean_conf or 0.0)}
        )

    gate_cols = [Prediction.gate_s1, Prediction.gate_s2, Prediction.gate_s3, Prediction.gate_s4]
    gate_means = db.execute(select(*[func.avg(col) for col in gate_cols])).one()

    labelled = db.scalars(
        select(Prediction).where(Prediction.ground_truth.is_not(None))
    ).all()
    correct = sum(1 for p in labelled if (p.ground_truth or {}).get("correct") is True)
    scored = [p for p in labelled if (p.ground_truth or {}).get("correct") is not None]

    first_at, last_at = db.execute(
        select(func.min(Prediction.created_at), func.max(Prediction.created_at))
    ).one()

    daily = db.execute(
        select(func.date(Prediction.created_at), func.count())
        .group_by(func.date(Prediction.created_at))
        .order_by(func.date(Prediction.created_at))
    ).all()

    return {
        "total_predictions": total,
        "total_patients": db.scalar(select(func.count()).select_from(Patient)) or 0,
        "total_uploads": db.scalar(select(func.count()).select_from(Upload)) or 0,
        "by_label": by_label,
        "mean_gates": {
            key: float(gate_means[i] or 0.0) for i, key in enumerate(STREAM_KEYS)
        },
        "mean_confidence": float(
            db.scalar(select(func.avg(Prediction.confidence))) or 0.0
        ),
        "accuracy_on_labelled": (correct / len(scored)) if scored else None,
        "n_labelled": len(scored),
        "first_prediction_at": first_at,
        "last_prediction_at": last_at,
        "daily_counts": [{"date": str(day), "count": int(count)} for day, count in daily],
    }


def patient_timeline(db: Session, patient_id: str) -> list[Prediction]:
    return list(
        db.scalars(
            select(Prediction)
            .where(Prediction.patient_id == patient_id)
            .order_by(Prediction.created_at.asc())
        ).all()
    )
