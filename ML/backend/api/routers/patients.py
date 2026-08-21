"""Patient CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import crud
from ..auth import current_user, scope_of
from ..db import get_db
from ..models import Patient, User
from ..schemas import (
    PatientCreate,
    PatientDetail,
    PatientListResponse,
    PatientOut,
    PatientUpdate,
    PredictionSummary,
)

router = APIRouter(prefix="/api/patients", tags=["patients"])


def _detail(db: Session, patient: Patient) -> PatientDetail:
    n_predictions, n_uploads = crud.patient_counts(db, patient.id)
    latest = crud.latest_prediction(db, patient.id)
    return PatientDetail(
        **PatientOut.model_validate(patient).model_dump(),
        n_predictions=n_predictions,
        n_uploads=n_uploads,
        latest_prediction=PredictionSummary.model_validate(latest) if latest else None,
    )


def _get_or_404(db: Session, patient_id: str, user: User) -> Patient:
    # A patient owned by someone else reads as missing, not forbidden — a 403
    # would confirm the id exists.
    patient = crud.get_patient(db, patient_id, owner_id=scope_of(user))
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No patient '{patient_id}'.")
    return patient


@router.post("", response_model=PatientDetail, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> PatientDetail:
    if payload.code and crud.get_patient_by_code(db, payload.code):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Code '{payload.code}' already exists.")
    try:
        patient = crud.create_patient(db, {**payload.model_dump(), "owner_id": user.id})
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Patient conflicts with an existing row.") from exc
    return _detail(db, patient)


@router.get("", response_model=PatientListResponse)
def list_patients(
    search: str | None = Query(None, description="Match name, code or dataset serial."),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> PatientListResponse:
    patients, total = crud.list_patients(db, search, limit, offset, owner_id=scope_of(user))
    return PatientListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[_detail(db, p) for p in patients],
    )


@router.get("/{patient_id}", response_model=PatientDetail)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> PatientDetail:
    return _detail(db, _get_or_404(db, patient_id, user))


@router.patch("/{patient_id}", response_model=PatientDetail)
def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> PatientDetail:
    patient = _get_or_404(db, patient_id, user)
    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"]:
        clash = crud.get_patient_by_code(db, data["code"])
        if clash and clash.id != patient.id:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Code '{data['code']}' already exists.")
    return _detail(db, crud.update_patient(db, patient, data))


@router.delete("/{patient_id}", status_code=status.HTTP_200_OK)
def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> dict:
    patient = _get_or_404(db, patient_id, user)
    n_predictions, n_uploads = crud.patient_counts(db, patient.id)
    files_removed = crud.delete_patient(db, patient)
    return {
        "deleted": patient_id,
        "predictions_deleted": n_predictions,
        "uploads_deleted": n_uploads,
        "files_removed": files_removed,
    }
