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


class NotAnEdf(ValueError):
    """Content does not begin with an EDF header."""


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
    first_chunk = True
    try:
        with tmp_path.open("wb") as out:
            while chunk := await upload.read(CHUNK):
                # EDF and BDF both start with an 8-byte version field: "0" padded
                # with spaces for EDF, 0xFF + "BIOSEMI" for BDF. Checking it here
                # rejects a mislabelled file before writing hundreds of MB that
                # can only fail at decode.
                if first_chunk:
                    first_chunk = False
                    if not _looks_like_edf(chunk):
                        raise NotAnEdf(
                            "This file is not in European Data Format. Its contents do not "
                            "start with an EDF or BDF header, whatever the file extension says."
                        )
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


def _looks_like_edf(head: bytes) -> bool:
    """True when the buffer opens with an EDF or BDF version field."""
    if len(head) < 8:
        return False
    if head[:8] == b"0       ":          # EDF / EDF+
        return True
    if head[0] == 0xFF and head[1:8] == b"BIOSEMI":  # BDF (Biosemi)
        return True
    return False


def _destination(sha: str, suffix: str) -> Path:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    return get_settings().upload_dir / f"{now:%Y}" / f"{now:%m}" / f"{sha[:16]}{suffix}"


def sha256_of(path: Path) -> str | None:
    """Hash a file already on disk, in the same chunks `save_upload` uses.

    Returns ``None`` if it cannot be read, so a caller comparing hashes treats
    an unreadable file as "cannot confirm" rather than as a mismatch.
    """
    digest = hashlib.sha256()
    try:
        with Path(path).open("rb") as handle:
            while chunk := handle.read(CHUNK):
                digest.update(chunk)
    except OSError:
        return None
    return digest.hexdigest()


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
