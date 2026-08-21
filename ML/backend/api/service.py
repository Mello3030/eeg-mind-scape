"""Application services: run the model, then file the result away.

This is the seam between the ML server (``backend/app``) and the application
layer — routers call these functions, which own the "predict, then persist"
transaction so nothing is stored without a result and vice versa.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..app.catalog import CatalogUnavailable, get_catalog
from ..app.config import get_settings
from ..app.inference import (
    InferenceError,
    clamp_crops,
    predict_edf,
    predict_features,
)
from ..app.version import __version__
from . import crud, storage
from .models import Prediction
from .storage import StoredFile


_SERIAL_RE = re.compile(r"^(\d{1,5})$")


def _ground_truth_from_filename(filename: str, predicted_label: str, sha256: str) -> dict | None:
    """Recover a CAUEEG label for an upload whose filename is a dataset serial.

    CAUEEG EDFs are de-identified — patient name is literally ``X``, every other
    header field is blank and the start date is a placeholder — so the file's
    contents identify nothing. The filename is the only handle an upload gives
    us, and a filename is weak evidence: anyone can rename a file. The label is
    therefore marked ``inferred_from: filename`` so the interface can present it
    as a guess rather than as verified truth.

    When the dataset EDF is present we hash it and compare. A match upgrades the
    record to ``content_sha256`` and settles the question; a mismatch means the
    upload is a different recording wearing that name, and no label is returned
    at all. Deployments without the bulk signal data simply stay at the weaker
    level rather than losing the feature.
    """
    stem = Path(filename).stem.strip()
    match = _SERIAL_RE.match(stem)
    if not match:
        return None

    serial = match.group(1).zfill(5)
    try:
        catalog = get_catalog()
    except CatalogUnavailable:
        return None

    try:
        record = catalog.get(serial)
    except KeyError:
        # Known to CAUEEG but outside the three-class task (parkinsonian
        # syndrome, TGA, FTD, NPH). Report that plainly rather than letting the
        # interface call a catalogued recording "unknown", and never guess a
        # class the benchmark deliberately leaves unassigned.
        excluded = catalog.excluded_record(serial)
        if excluded is None:
            return None
        return {
            "class_name": None,
            "class_label": None,
            "split": None,
            "age": excluded.get("age"),
            "symptom": excluded.get("symptom", []),
            "correct": None,
            "serial": excluded["serial"],
            "inferred_from": "filename",
            "excluded_from_task": True,
            "abnormal_label": excluded.get("abnormal_label"),
        }

    if not record.get("class_name"):
        return None

    basis = "filename"
    edf = catalog.edf_path(record["serial"])
    if edf.exists():
        digest = storage.sha256_of(edf)
        if digest == sha256:
            basis = "content_sha256"
        elif digest is not None:
            # Same name, different recording. Guessing here would attach one
            # patient's diagnosis to another's EEG.
            return None
        # digest is None: unreadable, so neither confirmed nor refuted. Stay at
        # the filename level rather than discarding a probably-correct label.

    return {
        "class_label": record["class_label"],
        "class_name": record["class_name"],
        "split": record["split"],
        "age": record["age"],
        "symptom": record["symptom"],
        "correct": record["class_name"] == predicted_label,
        "serial": record["serial"],
        "inferred_from": basis,
    }


def analyse_upload(
    db: Session,
    stored: StoredFile,
    filename: str,
    *,
    patient_id: str | None = None,
    n_crops: int | None = None,
    notes: str | None = None,
) -> Prediction:
    """Score a stored EDF file and persist the upload plus the prediction."""
    result = predict_edf(stored.path, n_crops, True, True)
    recording = result.get("recording") or {}

    upload = crud.find_upload_by_hash(db, stored.sha256, patient_id)
    if upload is None:
        upload = crud.create_upload(
            db,
            {
                "patient_id": patient_id,
                "filename": filename,
                "stored_path": stored.relative_path,
                "size_bytes": stored.size_bytes,
                "sha256": stored.sha256,
                "sample_rate": recording.get("sample_rate"),
                "duration_seconds": recording.get("duration_seconds"),
                "n_channels": recording.get("n_source_channels"),
            },
        )

    if not get_settings().keep_uploads:
        storage.delete(upload.stored_path)

    result["source"] = {"kind": "upload", "filename": filename}

    truth = _ground_truth_from_filename(
        filename, result["prediction"]["label"], stored.sha256
    )
    if truth is not None:
        result["ground_truth"] = truth

    return crud.create_prediction(
        db,
        result,
        patient_id=patient_id,
        upload_id=upload.id,
        source_kind="upload",
        source_ref=filename,
        notes=notes,
        model_version=__version__,
    )


def analyse_dataset_record(
    db: Session,
    serial: str,
    *,
    owner_id: str,
    patient_id: str | None = None,
    create_patient: bool = True,
    n_crops: int | None = None,
    use_cached_features: bool = True,
    notes: str | None = None,
) -> Prediction:
    """Score a CAUEEG patient by serial and file it against a patient row."""
    catalog = get_catalog()
    record = catalog.get(serial)          # raises KeyError / CatalogUnavailable
    serial = record["serial"]
    crops = clamp_crops(n_crops)

    cached = catalog.cached_feature_paths(serial) if use_cached_features else []
    if cached:
        streams = catalog.load_cached_features(serial, crops)
        result = predict_features(streams, True, True)
        result["source"] = {
            "kind": "cached_features",
            "serial": serial,
            "files": [p.name for p in cached[:crops]],
        }
        source_kind = "dataset_features"
    else:
        edf = catalog.edf_path(serial)
        if not edf.exists():
            raise InferenceError(
                f"Neither cached features nor an EDF file exist for serial '{serial}'."
            )
        result = predict_edf(edf, crops, True, True)
        result["source"] = {"kind": "edf", "serial": serial, "files": [edf.name]}
        source_kind = "dataset_edf"

    result["ground_truth"] = {
        "class_label": record["class_label"],
        "class_name": record["class_name"],
        "split": record["split"],
        "age": record["age"],
        "symptom": record["symptom"],
        "correct": record["class_name"] == result["prediction"]["label"],
    }

    resolved_patient_id = _resolve_dataset_patient(db, record, patient_id, create_patient, owner_id)

    return crud.create_prediction(
        db,
        result,
        patient_id=resolved_patient_id,
        source_kind=source_kind,
        source_ref=serial,
        notes=notes,
        model_version=__version__,
    )


def _resolve_dataset_patient(
    db: Session,
    record: dict[str, Any],
    patient_id: str | None,
    create: bool,
    owner_id: str,
) -> str | None:
    if patient_id:
        return patient_id
    if not create:
        return None
    # Scoped to the caller: two researchers scoring the same CAUEEG serial each
    # get their own patient row rather than sharing one.
    existing = crud.get_patient_by_serial(db, record["serial"], owner_id=owner_id)
    if existing:
        return existing.id
    patient = crud.create_patient(
        db,
        {
            "owner_id": owner_id,
            # The code is unique instance-wide, so qualify it per owner to keep a
            # second researcher from colliding on the same serial.
            "code": f"CAUEEG-{record['serial']}-{owner_id[:6]}",
            "name": f"CAUEEG {record['serial']}",
            "age": record.get("age"),
            "dataset_serial": record["serial"],
            "notes": f"Imported from the CAUEEG {record['split']} split.",
        },
    )
    return patient.id


def reanalyse(
    db: Session, prediction: Prediction, n_crops: int | None = None, owner_id: str | None = None
) -> Prediction:
    """Re-run a stored analysis with the currently loaded checkpoint."""
    if prediction.source_kind in {"dataset_features", "dataset_edf"} and prediction.source_ref:
        return analyse_dataset_record(
            db,
            prediction.source_ref,
            # Re-analysis stays on the existing patient, so ownership is whatever
            # that row already carries.
            owner_id=owner_id or "",
            patient_id=prediction.patient_id,
            create_patient=False,
            n_crops=n_crops,
            use_cached_features=prediction.source_kind == "dataset_features",
            notes=prediction.notes,
        )

    upload = prediction.upload
    if upload is None:
        raise InferenceError(
            "This prediction has no stored recording to re-analyse."
        )
    path = storage.resolve(upload.stored_path)
    if not path.exists():
        # Uploaded EDFs sit on the container filesystem, which most hosts wipe on
        # restart. The scored result survives in the database; only the source
        # signal is gone, so say that rather than surfacing a bare path.
        raise InferenceError(
            f"The source recording '{upload.filename}' is no longer on the server, so this "
            "analysis cannot be re-run. Its stored results and biomarkers are unaffected. "
            "Upload the recording again to score it with the current checkpoint."
        )

    result = predict_edf(path, n_crops, True, True)
    result["source"] = {"kind": "upload", "filename": upload.filename}
    return crud.create_prediction(
        db,
        result,
        patient_id=prediction.patient_id,
        upload_id=upload.id,
        source_kind="upload",
        source_ref=upload.filename,
        notes=prediction.notes,
        model_version=__version__,
    )


__all__ = [
    "CatalogUnavailable",
    "InferenceError",
    "analyse_dataset_record",
    "analyse_upload",
    "reanalyse",
]
