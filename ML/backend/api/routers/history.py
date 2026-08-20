"""Past results: filtered history, dashboard stats, per-patient timeline, comparison."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ...app.constants import CLASS_NAMES, STREAM_KEYS
from .. import crud
from ..db import get_db
from ..models import Prediction
from ..schemas import (
    ComparisonEntry,
    ComparisonResponse,
    HistoryStats,
    PatientOut,
    PatientTimeline,
    PredictionListResponse,
    PredictionSummary,
    TimelinePoint,
)

router = APIRouter(prefix="/api/history", tags=["history"])

_TREND_KEYS = ("mean_theta_alpha_ratio", "mean_spectral_entropy", "mean_alpha_coherence")


@router.get("", response_model=PredictionListResponse)
def list_history(
    patient_id: str | None = None,
    label: str | None = Query(None, description="Normal, MCI or Dementia."),
    source_kind: str | None = Query(None, description="upload, dataset_features, dataset_edf."),
    since: datetime | None = None,
    until: datetime | None = None,
    min_confidence: float | None = Query(None, ge=0.0, le=1.0),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> PredictionListResponse:
    if label and label not in CLASS_NAMES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"label must be one of {CLASS_NAMES}.")
    rows, total = crud.list_predictions(
        db,
        patient_id=patient_id,
        label=label,
        source_kind=source_kind,
        since=since,
        until=until,
        min_confidence=min_confidence,
        limit=limit,
        offset=offset,
    )
    return PredictionListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[PredictionSummary.model_validate(row) for row in rows],
    )


@router.get("/stats", response_model=HistoryStats)
def history_stats(db: Session = Depends(get_db)) -> HistoryStats:
    """Dashboard aggregates over everything analysed so far."""
    return HistoryStats(**crud.stats(db))


@router.get("/patients/{patient_id}/timeline", response_model=PatientTimeline)
def patient_timeline(patient_id: str, db: Session = Depends(get_db)) -> PatientTimeline:
    """Every analysis for one patient in order, with the direction of change."""
    patient = crud.get_patient(db, patient_id)
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No patient '{patient_id}'.")

    rows = crud.patient_timeline(db, patient_id)
    points = [
        TimelinePoint(
            prediction_id=row.id,
            created_at=row.created_at,
            predicted_label=row.predicted_label,
            confidence=row.confidence,
            probabilities=row.probabilities,
            gates=row.gates,
            mean_theta_alpha_ratio=_summary_value(row, "mean_theta_alpha_ratio"),
        )
        for row in rows
    ]
    return PatientTimeline(
        patient=PatientOut.model_validate(patient),
        points=points,
        trend=_trend(rows),
    )


@router.get("/compare", response_model=ComparisonResponse)
def compare(
    ids: str = Query(..., description="Comma-separated analysis ids (2-8)."),
    db: Session = Depends(get_db),
) -> ComparisonResponse:
    """Line up several analyses side by side for a comparison chart."""
    wanted = [i.strip() for i in ids.split(",") if i.strip()]
    if not 2 <= len(wanted) <= 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide between 2 and 8 ids.")

    rows = crud.get_predictions_by_ids(db, wanted)
    missing = set(wanted) - {row.id for row in rows}
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown analyses: {sorted(missing)}")

    entries = [
        ComparisonEntry(
            prediction=PredictionSummary.model_validate(row),
            patient_label=(row.patient.code or row.patient.name) if row.patient else None,
            biomarker_summary=(row.biomarkers or {}).get("summary"),
        )
        for row in rows
    ]

    return ComparisonResponse(
        entries=entries,
        labels=[row.id[:8] for row in rows],
        probability_matrix={
            name: [row.probabilities.get(name, 0.0) for row in rows] for name in CLASS_NAMES
        },
        gate_matrix={key: [row.gates.get(key, 0.0) for row in rows] for key in STREAM_KEYS},
        biomarker_matrix={
            key: [_summary_value(row, key) for row in rows] for key in _TREND_KEYS
        },
    )


def _summary_value(row: Prediction, key: str) -> float | None:
    value = ((row.biomarkers or {}).get("summary") or {}).get(key)
    return float(value) if isinstance(value, (int, float)) else None


def _trend(rows: list[Prediction]) -> dict:
    """Compare the first and latest analysis of a patient."""
    if len(rows) < 2:
        return {"available": False, "reason": "Needs at least two analyses."}

    first, last = rows[0], rows[-1]
    trend: dict = {
        "available": True,
        "from": first.created_at.isoformat(),
        "to": last.created_at.isoformat(),
        "label_changed": first.predicted_label != last.predicted_label,
        "first_label": first.predicted_label,
        "latest_label": last.predicted_label,
        "dementia_probability_delta": last.prob_dementia - first.prob_dementia,
        "confidence_delta": last.confidence - first.confidence,
        "biomarker_delta": {},
    }
    for key in _TREND_KEYS:
        a, b = _summary_value(first, key), _summary_value(last, key)
        if a is not None and b is not None:
            trend["biomarker_delta"][key] = b - a
    return trend
