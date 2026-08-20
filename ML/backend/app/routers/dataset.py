"""Browse the local CAUEEG annotations and cached features (read-only)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from ..catalog import CatalogUnavailable, get_catalog
from ..config import get_settings
from ..constants import BAND_NAMES, CHANNEL_NAMES, CLASS_NAMES, STREAM_INFO
from ..schemas import (
    DatasetSummaryResponse,
    RecordListResponse,
    RecordSummary,
)

router = APIRouter(prefix="/dataset", tags=["dataset"])


@router.get("", response_model=DatasetSummaryResponse)
def dataset_summary() -> DatasetSummaryResponse:
    settings = get_settings()
    catalog = get_catalog()
    if not catalog.available:
        return DatasetSummaryResponse(available=False)
    task = catalog.task()
    return DatasetSummaryResponse(
        available=True,
        task_name=task.get("task_name"),
        task_description=task.get("task_description"),
        class_names=list(task.get("class_label_to_name") or CLASS_NAMES),
        counts=catalog.counts(),
        edf_dir=str(settings.edf_dir),
        feature_dir=str(settings.feature_dir),
    )


@router.get("/records", response_model=RecordListResponse)
def list_records(
    split: str | None = Query(None, pattern="^(train|val|test)$"),
    class_name: str | None = Query(None, description="Normal, MCI or Dementia."),
    search: str | None = Query(None, description="Match against serial or symptom tags."),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> RecordListResponse:
    catalog = get_catalog()
    try:
        items, total = catalog.query(split, class_name, search, limit, offset)
    except CatalogUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return RecordListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[RecordSummary(**item) for item in items],
    )


@router.get("/records/{serial}", response_model=RecordSummary)
def get_record(serial: str) -> RecordSummary:
    catalog = get_catalog()
    try:
        record = catalog.get(serial)
    except CatalogUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    record["has_edf"] = catalog.edf_path(record["serial"]).exists()
    record["cached_crops"] = len(catalog.cached_feature_paths(record["serial"]))
    return RecordSummary(**record)


@router.get("/schema", tags=["dataset"])
def feature_schema() -> dict:
    """Static description of channels, bands and streams — handy for the UI."""
    return {
        "class_names": CLASS_NAMES,
        "channels": CHANNEL_NAMES,
        "bands": BAND_NAMES,
        "streams": list(STREAM_INFO.values()),
    }
