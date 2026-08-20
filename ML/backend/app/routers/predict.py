"""Prediction endpoints: EDF upload, precomputed features, and dataset patients."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import numpy as np
from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from ..catalog import CatalogUnavailable, get_catalog
from ..config import get_settings
from ..inference import (
    InferenceError,
    clamp_crops,
    predict_edf,
    predict_features,
)
from ..model import ModelError
from ..schemas import FeaturePredictRequest, PredictionResponse

router = APIRouter(tags=["predict"])

ALLOWED_SUFFIXES = {".edf", ".bdf", ".rec"}


def _fail(exc: Exception) -> HTTPException:
    if isinstance(exc, ModelError):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))


async def _spool_upload(upload: UploadFile) -> Path:
    """Stream the upload to a temp file, enforcing the size cap."""
    settings = get_settings()
    suffix = Path(upload.filename or "upload.edf").suffix.lower() or ".edf"
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type '{suffix}'. Expected one of {sorted(ALLOWED_SUFFIXES)}.",
        )

    tmp = Path(tempfile.mkdtemp(prefix="qsfe_upload_")) / f"recording{suffix}"
    written = 0
    try:
        with tmp.open("wb") as out:
            while chunk := await upload.read(1024 * 1024):
                written += len(chunk)
                if written > settings.max_upload_bytes:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        f"File exceeds the {settings.max_upload_mb} MB limit.",
                    )
                out.write(chunk)
    except Exception:
        shutil.rmtree(tmp.parent, ignore_errors=True)
        raise
    finally:
        await upload.close()

    if written == 0:
        shutil.rmtree(tmp.parent, ignore_errors=True)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty.")
    return tmp


@router.post("/predict", response_model=PredictionResponse)
async def predict_upload(
    file: UploadFile = File(..., description="EDF recording with at least 19 EEG channels."),
    n_crops: int | None = Query(None, ge=1, description="Crops to average; defaults to the server setting."),
    include_biomarkers: bool = Query(True),
    include_per_crop: bool = Query(False),
) -> PredictionResponse:
    """Score an uploaded EEG recording."""
    tmp = await _spool_upload(file)
    try:
        result = await run_in_threadpool(
            predict_edf, tmp, n_crops, include_biomarkers, include_per_crop
        )
    except (InferenceError, ModelError) as exc:
        raise _fail(exc) from exc
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)

    result["source"] = {"kind": "upload", "filename": file.filename}
    return PredictionResponse(**result)


@router.post("/predict/features", response_model=PredictionResponse)
async def predict_from_features(request: FeaturePredictRequest) -> PredictionResponse:
    """Score precomputed s1..s4 vectors (one crop each, or a stack of crops)."""
    streams = {
        key: np.asarray(getattr(request, key), dtype=np.float32)
        for key in ("s1", "s2", "s3", "s4")
    }
    try:
        result = await run_in_threadpool(
            predict_features, streams, request.include_biomarkers, request.include_per_crop
        )
    except (InferenceError, ModelError) as exc:
        raise _fail(exc) from exc

    result["source"] = {"kind": "features"}
    return PredictionResponse(**result)


@router.post("/predict/record/{serial}", response_model=PredictionResponse)
async def predict_record(
    serial: str,
    use_cached_features: bool = Query(
        True, description="Use the precomputed .npz crops when available (much faster)."
    ),
    n_crops: int | None = Query(None, ge=1),
    include_biomarkers: bool = Query(True),
    include_per_crop: bool = Query(False),
) -> PredictionResponse:
    """Score a patient from the local CAUEEG dataset by serial number."""
    catalog = get_catalog()
    try:
        record = catalog.get(serial)
    except CatalogUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

    serial = record["serial"]
    crops = clamp_crops(n_crops)
    cached = catalog.cached_feature_paths(serial) if use_cached_features else []

    try:
        if cached:
            streams = await run_in_threadpool(catalog.load_cached_features, serial, crops)
            result = await run_in_threadpool(
                predict_features, streams, include_biomarkers, include_per_crop
            )
            result["source"] = {
                "kind": "cached_features",
                "serial": serial,
                "files": [p.name for p in cached[:crops]],
            }
        else:
            edf = catalog.edf_path(serial)
            if not edf.exists():
                raise HTTPException(
                    status.HTTP_404_NOT_FOUND,
                    f"Neither cached features nor an EDF file exist for serial '{serial}'.",
                )
            result = await run_in_threadpool(
                predict_edf, edf, crops, include_biomarkers, include_per_crop
            )
            result["source"] = {"kind": "edf", "serial": serial, "files": [edf.name]}
    except (InferenceError, ModelError) as exc:
        raise _fail(exc) from exc

    result["ground_truth"] = {
        "class_label": record["class_label"],
        "class_name": record["class_name"],
        "split": record["split"],
        "age": record["age"],
        "symptom": record["symptom"],
        "correct": record["class_name"] == result["prediction"]["label"],
    }
    return PredictionResponse(**result)
