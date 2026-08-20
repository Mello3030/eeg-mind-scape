"""Filesystem storage for uploaded recordings.

Files are content-addressed by SHA-256 and filed under ``storage/uploads/<yyyy>/<mm>/``,
so re-uploading the same recording reuses the stored copy instead of duplicating
hundreds of megabytes.
"""

from __future__ import annotations

import hashlib
import shutil
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from ..app.config import get_settings

CHUNK = 1024 * 1024


class UploadTooLarge(ValueError):
    pass


class EmptyUpload(ValueError):
    pass


@dataclass
class StoredFile:
    path: Path
    sha256: str
    size_bytes: int
    reused: bool = False

    @property
    def relative_path(self) -> str:
        try:
            return str(self.path.relative_to(get_settings().storage_dir))
        except ValueError:  # outside the storage root
            return str(self.path)


async def save_upload(upload: UploadFile, suffix: str = ".edf") -> StoredFile:
    """Stream an upload to disk, hashing as it goes, enforcing the size cap."""
    settings = get_settings()
    tmp_dir = settings.upload_dir / "_incoming"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{id(upload):x}{suffix}"

    digest = hashlib.sha256()
    written = 0
    try:
        with tmp_path.open("wb") as out:
            while chunk := await upload.read(CHUNK):
                written += len(chunk)
                if written > settings.max_upload_bytes:
                    raise UploadTooLarge(
                        f"File exceeds the {settings.max_upload_mb} MB limit."
                    )
                digest.update(chunk)
                out.write(chunk)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()

    if written == 0:
        tmp_path.unlink(missing_ok=True)
        raise EmptyUpload("Uploaded file is empty.")

    sha = digest.hexdigest()
    final = _destination(sha, suffix)
    final.parent.mkdir(parents=True, exist_ok=True)

    if final.exists():
        tmp_path.unlink(missing_ok=True)
        return StoredFile(final, sha, final.stat().st_size, reused=True)

    shutil.move(str(tmp_path), final)
    return StoredFile(final, sha, written)


def _destination(sha: str, suffix: str) -> Path:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    return get_settings().upload_dir / f"{now:%Y}" / f"{now:%m}" / f"{sha[:16]}{suffix}"


def resolve(stored_path: str) -> Path:
    """Turn a stored (possibly relative) path back into an absolute path."""
    path = Path(stored_path)
    return path if path.is_absolute() else get_settings().storage_dir / path


def delete(stored_path: str) -> bool:
    path = resolve(stored_path)
    if path.exists():
        path.unlink()
        return True
    return False
