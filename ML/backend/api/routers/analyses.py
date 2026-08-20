"""Run an analysis and persist it: upload -> predict -> store."""

from __future__ import annotations

from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ...app.catalog import CatalogUnavailable, get_catalog
from ...app.inference import InferenceError
from ...app.model import ModelError
from ...app.preprocessing import SignalError, read_edf_window
from .. import crud, service, storage
from ..db import get_db
from ..models import Prediction
from ..schemas import (
    AnalyseRecordRequest,
    PredictionDetail,
    PredictionNotes,
    PredictionSummary,
)

router = APIRouter(prefix="/api/analyses", tags=["analyses"])

ALLOWED_SUFFIXES = {".edf", ".bdf", ".rec"}


def _get_or_404(db: Session, prediction_id: str) -> Prediction:
    prediction = crud.get_prediction(db, prediction_id)
    if prediction is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No analysis '{prediction_id}'.")
    return prediction


def _fail(exc: Exception) -> HTTPException:
    if isinstance(exc, ModelError):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    if isinstance(exc, CatalogUnavailable):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    if isinstance(exc, KeyError):
        return HTTPException(status.HTTP_404_NOT_FOUND, str(exc).strip("'"))
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))


@router.post("", response_model=PredictionDetail, status_code=status.HTTP_201_CREATED)
async def create_analysis(
    file: UploadFile = File(..., description="EDF recording."),
    patient_id: str | None = Form(None),
    notes: str | None = Form(None),
    n_crops: int | None = Form(None),
    db: Session = Depends(get_db),
) -> PredictionDetail:
    """Upload a recording, score it, and store the result against a patient."""
    if patient_id and crud.get_patient(db, patient_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No patient '{patient_id}'.")

    suffix = Path(file.filename or "upload.edf").suffix.lower() or ".edf"
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type '{suffix}'. Expected one of {sorted(ALLOWED_SUFFIXES)}.",
        )

    try:
        stored = await storage.save_upload(file, suffix)
    except storage.UploadTooLarge as exc:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(exc)) from exc
    except storage.EmptyUpload as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    try:
        prediction = await run_in_threadpool(
            service.analyse_upload,
            db,
            stored,
            file.filename or stored.path.name,
            patient_id=patient_id,
            n_crops=n_crops,
            notes=notes,
        )
    except (InferenceError, ModelError) as exc:
        raise _fail(exc) from exc

    return PredictionDetail.model_validate(_get_or_404(db, prediction.id))


@router.post(
    "/from-record/{serial}",
    response_model=PredictionDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_analysis_from_record(
    serial: str,
    payload: AnalyseRecordRequest | None = None,
    db: Session = Depends(get_db),
) -> PredictionDetail:
    """Score a CAUEEG dataset patient and store the result with its ground truth."""
    payload = payload or AnalyseRecordRequest()
    if payload.patient_id and crud.get_patient(db, payload.patient_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No patient '{payload.patient_id}'.")

    try:
        prediction = await run_in_threadpool(
            service.analyse_dataset_record,
            db,
            serial,
            patient_id=payload.patient_id,
            create_patient=payload.create_patient,
            n_crops=payload.n_crops,
            use_cached_features=payload.use_cached_features,
            notes=payload.notes,
        )
    except (InferenceError, ModelError, CatalogUnavailable, KeyError) as exc:
        raise _fail(exc) from exc

    return PredictionDetail.model_validate(_get_or_404(db, prediction.id))


@router.post(
    "/{prediction_id}/reanalyse",
    response_model=PredictionDetail,
    status_code=status.HTTP_201_CREATED,
)
async def reanalyse(
    prediction_id: str,
    n_crops: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> PredictionDetail:
    """Re-score a stored analysis with the currently loaded checkpoint."""
    prediction = _get_or_404(db, prediction_id)
    try:
        fresh = await run_in_threadpool(service.reanalyse, db, prediction, n_crops)
    except (InferenceError, ModelError, CatalogUnavailable, KeyError) as exc:
        raise _fail(exc) from exc
    return PredictionDetail.model_validate(_get_or_404(db, fresh.id))


@router.get("/{prediction_id}", response_model=PredictionDetail)
def get_analysis(prediction_id: str, db: Session = Depends(get_db)) -> PredictionDetail:
    return PredictionDetail.model_validate(_get_or_404(db, prediction_id))


@router.patch("/{prediction_id}", response_model=PredictionSummary)
def update_notes(
    prediction_id: str, payload: PredictionNotes, db: Session = Depends(get_db)
) -> PredictionSummary:
    prediction = _get_or_404(db, prediction_id)
    prediction.notes = payload.notes
    db.commit()
    db.refresh(prediction)
    return PredictionSummary.model_validate(prediction)


@router.get("/{prediction_id}/recording")
def download_recording(prediction_id: str, db: Session = Depends(get_db)) -> FileResponse:
    """Download the EDF this analysis was computed from."""
    prediction = _get_or_404(db, prediction_id)
    if prediction.upload is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This analysis has no stored recording.")
    path = storage.resolve(prediction.upload.stored_path)
    if not path.exists():
        raise HTTPException(status.HTTP_410_GONE, "The stored recording has been removed.")
    return FileResponse(path, filename=prediction.upload.filename, media_type="application/octet-stream")


def _source_edf(prediction: Prediction) -> Path:
    """The EDF a stored analysis was computed from — an upload, or a dataset
    recording resolved through the catalog."""
    if prediction.upload is not None:
        path = storage.resolve(prediction.upload.stored_path)
        if not path.exists():
            raise HTTPException(status.HTTP_410_GONE, "The stored recording has been removed.")
        return path

    if prediction.source_kind.startswith("dataset") and prediction.source_ref:
        try:
            path = get_catalog().edf_path(prediction.source_ref)
        except CatalogUnavailable as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
        if not path.exists():
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                f"No EDF file for dataset serial '{prediction.source_ref}'. This analysis "
                "was scored from cached features, which contain no viewable signal.",
            )
        return path

    raise HTTPException(status.HTTP_404_NOT_FOUND, "This analysis has no viewable recording.")


@router.get("/{prediction_id}/waveform")
async def get_waveform(
    prediction_id: str,
    start: float = Query(0.0, ge=0.0, description="Window start, in seconds."),
    duration: float = Query(30.0, gt=0.0, le=300.0, description="Window length, in seconds."),
    max_points: int = Query(3000, ge=100, le=20000, description="Points per channel after decimation."),
    channels: str | None = Query(None, description="Comma-separated channel names; default all 19."),
    db: Session = Depends(get_db),
) -> dict:
    """Return a decimated slice of the source EEG for the viewer.

    This is display data read straight from the EDF — it is not the normalised
    tensor the model saw. ``scored_windows`` marks where the crops that produced
    this prediction actually sit, so the viewer can show what was scored.
    """
    prediction = _get_or_404(db, prediction_id)
    path = _source_edf(prediction)
    wanted = [c.strip() for c in channels.split(",") if c.strip()] if channels else None

    try:
        window = await run_in_threadpool(
            read_edf_window, path, start, duration, max_points, wanted
        )
    except SignalError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    recording = prediction.recording or {}
    model_rate = recording.get("sample_rate") or window["sample_rate"]
    crop_seconds = (recording.get("crop_length") or 2000) / model_rate
    window["scored_windows"] = [
        {"start_seconds": s / model_rate, "duration_seconds": crop_seconds}
        for s in (recording.get("crop_starts") or [])
    ]
    window["analysis_id"] = prediction.id
    return window


@router.delete("/{prediction_id}")
def delete_analysis(prediction_id: str, db: Session = Depends(get_db)) -> dict:
    prediction = _get_or_404(db, prediction_id)
    crud.delete_prediction(db, prediction)
    return {"deleted": prediction_id}
