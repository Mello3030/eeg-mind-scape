"""FastAPI application for the QSFE-Net EEG dementia model.

Run from the repository root:
    uvicorn backend.app.main:app --reload
or:
    python backend/run.py
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ..api.db import db_diagnostics, init_db
from ..api.routers import analyses, auth, history, patients, reports
from .catalog import CatalogUnavailable, get_catalog
from .config import DEFAULT_JWT_SECRET, get_settings
from .inference import InferenceError
from .model import ModelError, registry
from .routers import dataset, predict, system
from .version import __version__

logger = logging.getLogger("qsfe.server")

DESCRIPTION = """
Inference server for **QSFE-Net** (Quadrant-Stream Fusion EEG Network), a
three-class EEG classifier for **Normal / MCI / Dementia**.

Each recording is reduced to four clinically grounded feature streams —
frequency slowing (S1), coherence (S2), complexity (S3) and hemispheric
asymmetry (S4) — which are encoded separately and fused with learned per-patient
gates. Every prediction therefore ships with the gate weights that produced it,
plus the decoded biomarkers behind them.
""".strip()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    logger.info("Repo root: %s", settings.repo_root)

    if settings.eager_load:
        try:
            model = registry.get()
            logger.info(
                "Loaded %s on %s (%s params, streams=%s, extractor_compatible=%s)",
                model.checkpoint_path.name,
                model.device,
                f"{model.n_parameters:,}",
                model.stream_dims,
                model.extractor_compatible,
            )
        except ModelError as exc:
            # Serve anyway: /health reports the problem and /model/reload can fix it.
            logger.warning("Model not loaded: %s", exc)

    if settings.jwt_secret == DEFAULT_JWT_SECRET:
        logger.warning(
            "QSFE_JWT_SECRET is unset — using the built-in development secret. "
            "Anyone can mint valid tokens. Set it before exposing this server."
        )

    init_db()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    diagnostics = db_diagnostics()
    logger.info(
        "Database: %s (backend=%s, connected=%s, counts=%s)",
        diagnostics["url"],
        diagnostics["backend"],
        diagnostics["connected"],
        diagnostics["counts"],
    )
    if not diagnostics["connected"]:
        logger.error("Database is NOT reachable: %s", diagnostics["error"])
    elif not diagnostics["persistent"]:
        # Silent data loss is the worst failure mode here: the API looks healthy,
        # writes succeed, and everything disappears on the next restart.
        logger.warning(
            "DATA IS NOT PERSISTENT — running on SQLite at %s. On Render/Vercel and "
            "similar hosts this file is wiped on every restart and redeploy. Set "
            "QSFE_DATABASE_URL to a Postgres (Neon) URL to keep accounts, patients "
            "and analyses.",
            settings.resolved_database_url,
        )
    logger.info("Dataset catalog available: %s", get_catalog().available)
    yield


app = FastAPI(
    title="QSFE-Net ML Server",
    description=DESCRIPTION,
    version=__version__,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    # Vite walks to the next free port when its preferred one is taken, so a dev
    # server can land on 8081, 8083, 5174... Enumerating those was a recurring
    # source of opaque "Failed to fetch" errors. Loopback on any port is not a
    # meaningful boundary — anything running there is already on the machine —
    # while deployed origins still have to be listed explicitly above.
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(InferenceError)
async def inference_error_handler(request: Request, exc: InferenceError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(ModelError)
async def model_error_handler(request: Request, exc: ModelError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(CatalogUnavailable)
async def catalog_error_handler(request: Request, exc: CatalogUnavailable) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


app.include_router(system.router)
app.include_router(predict.router)
app.include_router(dataset.router)

# Application layer — accounts, patients, analyses, history, reports.
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(analyses.router)
app.include_router(history.router)
app.include_router(reports.router)


@app.get("/", tags=["system"])
def root() -> dict:
    return {
        "name": "QSFE-Net ML Server",
        "version": __version__,
        "docs": "/docs",
        "endpoints": [
            "GET  /health",
            "GET  /model/info",
            "GET  /model/checkpoints",
            "POST /model/reload",
            "POST /predict",
            "POST /predict/features",
            "POST /predict/record/{serial}",
            "GET  /dataset",
            "GET  /dataset/records",
            "GET  /dataset/records/{serial}",
            "GET  /dataset/schema",
            "POST /api/auth/register",
            "POST /api/auth/login",
            "GET  /api/auth/me",
            "GET/POST /api/patients",
            "POST /api/analyses",
            "POST /api/analyses/from-record/{serial}",
            "GET  /api/history",
            "GET  /api/history/stats",
            "GET  /api/history/compare?ids=...",
            "GET  /api/history/patients/{id}/timeline",
            "GET  /api/analyses/{id}/waveform",
            "GET  /model/performance",
            "GET  /model/ablation",
            "GET  /api/reports/{id}?format=json|html|pdf",
        ],
    }
