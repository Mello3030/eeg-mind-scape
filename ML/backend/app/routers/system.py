"""Health, model metadata and checkpoint management."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool

from ..ablation import BASELINES, load_ablation
from ..catalog import CatalogUnavailable, get_catalog
from ..evaluation import cached_only, evaluate_split, invalidate
from ..config import get_settings
from ..constants import EXTRACTOR_DIMS, STREAM_INFO
from ..model import ModelError, load_model, registry
from ..reference import load_reference, reference_path
from ..schemas import (
    CheckpointInfo,
    HealthResponse,
    ModelInfoResponse,
    ReloadRequest,
)
from ..version import __version__
from ...api.db import db_diagnostics

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    model = registry.try_load()
    return HealthResponse(
        status="ok" if model else "degraded",
        version=__version__,
        model_loaded=model is not None,
        model_error=registry.error,
        device=str(model.device) if model else None,
        checkpoint=model.checkpoint_path.name if model else None,
        extractor_compatible=model.extractor_compatible if model else None,
        dataset_available=get_catalog().available,
        database=db_diagnostics(),
        paths={
            "repo_root": str(settings.repo_root),
            "checkpoint": str(settings.checkpoint_path),
            "dataset_dir": str(settings.dataset_dir),
            "feature_dir": str(settings.feature_dir),
            "src_dir": str(settings.src_dir),
        },
    )


@router.get("/model/info", response_model=ModelInfoResponse)
def model_info() -> ModelInfoResponse:
    settings = get_settings()
    try:
        model = registry.get()
    except ModelError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    return ModelInfoResponse(
        checkpoint=model.checkpoint_path.name,
        checkpoint_path=str(model.checkpoint_path),
        device=str(model.device),
        n_parameters=model.n_parameters,
        num_classes=model.num_classes,
        class_names=model.class_names,
        stream_dims=model.stream_dims,
        extractor_dims=EXTRACTOR_DIMS,
        extractor_compatible=model.extractor_compatible,
        dim_mismatch=model.dim_mismatch,
        streams=list(STREAM_INFO.values()),
        sample_rate=settings.sample_rate,
        crop_length=settings.crop_length,
        default_n_crops=settings.default_n_crops,
    )


@router.get("/model/checkpoints", response_model=list[CheckpointInfo])
def list_checkpoints() -> list[CheckpointInfo]:
    """Every .pth under outputs/, with the stream dims it was trained for."""
    settings = get_settings()
    outputs = settings.repo_root / "outputs"
    active = registry.peek()
    found: list[CheckpointInfo] = []

    for path in sorted(outputs.rglob("*.pth")) if outputs.exists() else []:
        info = CheckpointInfo(
            name=path.name,
            path=str(path),
            size_bytes=path.stat().st_size,
            active=bool(active and active.checkpoint_path == path),
        )
        try:
            probe = load_model(path, device="cpu")
            info.stream_dims = probe.stream_dims
            info.num_classes = probe.num_classes
            info.extractor_compatible = probe.extractor_compatible
        except ModelError as exc:
            info.error = str(exc)
        found.append(info)

    return found


@router.post("/model/reload", response_model=ModelInfoResponse)
def reload_model(request: ReloadRequest) -> ModelInfoResponse:
    settings = get_settings()
    checkpoint: Path | None = None
    if request.checkpoint:
        checkpoint = Path(request.checkpoint)
        if not checkpoint.is_absolute():
            checkpoint = settings.repo_root / checkpoint
    try:
        registry.reload(checkpoint, request.device)
    except ModelError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    invalidate()  # measured metrics belong to the checkpoint that produced them
    return model_info()


@router.get("/model/performance")
async def model_performance(
    split: str = Query("test", pattern="^(train|val|test)$"),
    n_crops: int = Query(5, ge=1, le=16),
    refresh: bool = Query(False, description="Recompute instead of using the cache."),
) -> dict:
    """Confusion matrix and per-class metrics, measured on the local dataset.

    Every number here is produced by scoring the split with the active
    checkpoint — nothing is transcribed. The first call takes a few seconds.
    """
    try:
        result = await run_in_threadpool(evaluate_split, split, n_crops, refresh)
    except CatalogUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except ModelError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return result


@router.get("/model/ablation")
def model_ablation() -> dict:
    """The ablation study, parsed from outputs/ablation/ablation_results.txt."""
    study = load_ablation()
    measured = cached_only()
    return {
        **study,
        "baselines": BASELINES,
        "baselines_note": (
            "Published results for comparison; not measured by this server."
        ),
        "active_checkpoint_accuracy": measured["accuracy"] if measured else None,
    }


@router.get("/model/reference")
async def model_reference(
    refresh: bool = Query(False, description="Recompute instead of using the cache."),
) -> dict:
    """Class-conditional biomarker distributions, measured on the training split.

    This is what lets the UI say a recording's theta/alpha ratio is *high* rather
    than merely reporting the number: it places one recording against the spread
    of Normal, MCI and Dementia patients the model was trained on. It describes
    the features, not the checkpoint, so it survives a checkpoint switch.

    Normally served from the file `backend/scripts/build_reference.py` wrote. If
    that file is missing the sweep runs inline and the first call takes minutes.
    """
    try:
        return await run_in_threadpool(load_reference, refresh)
    except CatalogUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"{exc} Run `python backend/scripts/build_reference.py` to precompute "
            f"{reference_path().name}.",
        ) from exc
