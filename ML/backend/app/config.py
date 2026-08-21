"""Runtime configuration for the QSFE-Net ML server.

Every path is resolved relative to the repository root (the parent of this
`backend/` folder) so the server is portable, unlike the hardcoded
``D:\Major\...`` paths used by the training scripts. Any value can be
overridden with a ``QSFE_``-prefixed environment variable or a ``backend/.env``
file, e.g. ``QSFE_CHECKPOINT=C:\some\other\model.pth``.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "insecure-development-secret-change-me-before-deploying-anywhere"

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_prefix="QSFE_",
        extra="ignore",
        protected_namespaces=(),
    )

    # --- Paths -------------------------------------------------------------
    repo_root: Path = REPO_ROOT
    # Relative to repo_root unless given as an absolute path.
    src_subdir: Path = Path("src")
    dataset_subdir: Path = Path("caueeg-dataset")
    feature_subdir: Path = Path("outputs/features_multicrop")
    checkpoint_subpath: Path = Path("outputs/qsfe_npz_best.pth")

    # --- Model / inference -------------------------------------------------
    device: str = "auto"          # "auto" | "cpu" | "cuda"
    eager_load: bool = True       # load the checkpoint at startup
    default_n_crops: int = 5      # crops averaged per recording
    max_n_crops: int = 16
    crop_length: int = 2000       # 10 s @ 200 Hz, matches training
    sample_rate: int = 200
    resample_uploads: bool = True  # resample non-200 Hz uploads to 200 Hz

    # --- Application layer (patients, uploads, history) --------------------
    database_url: str = ""        # empty -> sqlite in the storage folder
    db_echo: bool = False
    storage_subdir: Path = Path("backend/storage")
    keep_uploads: bool = True     # retain uploaded EDF files for re-analysis

    # --- Server ------------------------------------------------------------
    host: str = "127.0.0.1"
    port: int = 8000
    max_upload_mb: int = 300
    # 8080 is the Vite dev port, but Vite silently falls back to 8081/8082 when
    # it is already taken (EnterpriseDB and other local services claim 8080),
    # and a missed origin shows up as an opaque CORS failure in the browser
    # rather than an error in either log. Allow the fallbacks too.
    cors_origins: list[str] = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # --- Auth --------------------------------------------------------------
    # HS256 wants >= 32 bytes. Generate one with:
    #   python -c "import secrets; print(secrets.token_urlsafe(48))"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 12
    # Shared invite code that /api/auth/register requires, so a publicly
    # reachable instance does not accept accounts from anyone who finds it.
    # Set QSFE_REGISTRATION_CODE to change it; set it to an empty string to open
    # registration to everyone. This is a weak gate by construction — one secret
    # shared by every researcher, no per-invite tracking or revocation — so treat
    # it as a speed bump against drive-by signups, not as access control.
    registration_code: str = "passcode"
    # Postgres schema to confine every table to. Empty -> the connection's
    # default search_path (and, for SQLite, ignored entirely).
    db_schema: str = ""

    # --- Derived absolute paths -------------------------------------------
    def _abs(self, p: Path) -> Path:
        return p if p.is_absolute() else (self.repo_root / p)

    @property
    def src_dir(self) -> Path:
        return self._abs(self.src_subdir)

    @property
    def dataset_dir(self) -> Path:
        return self._abs(self.dataset_subdir)

    @property
    def annotation_file(self) -> Path:
        return self.dataset_dir / "dementia.json"

    @property
    def edf_dir(self) -> Path:
        return self.dataset_dir / "signal" / "edf"

    @property
    def feature_dir(self) -> Path:
        return self._abs(self.feature_subdir)

    @property
    def checkpoint_path(self) -> Path:
        return self._abs(self.checkpoint_subpath)

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def storage_dir(self) -> Path:
        return self._abs(self.storage_subdir)

    @property
    def upload_dir(self) -> Path:
        return self.storage_dir / "uploads"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(self.storage_dir / 'qsfe.db').as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
