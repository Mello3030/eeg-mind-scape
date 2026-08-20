"""Read-only access to the CAUEEG annotation file and the cached feature .npz.

This exists so the frontend can browse the local dataset (pick a patient, see
the ground-truth label, score it) without every screen needing an upload. It is
optional: if the dataset folder is absent, the catalog reports itself as
unavailable and the rest of the server still works.
"""

from __future__ import annotations

import json
import threading
from functools import lru_cache
from pathlib import Path

import numpy as np

from .config import get_settings
from .constants import CLASS_NAMES, STREAM_KEYS

SPLITS = {"train": "train_split", "val": "validation_split", "test": "test_split"}


class CatalogUnavailable(RuntimeError):
    """Raised when the annotation file is missing."""


class Catalog:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._records: list[dict] | None = None
        self._by_serial: dict[str, dict] = {}
        self._task: dict = {}

    def _ensure(self) -> None:
        if self._records is not None:
            return
        with self._lock:
            if self._records is not None:
                return
            path = get_settings().annotation_file
            if not path.exists():
                raise CatalogUnavailable(f"Annotation file not found: {path}")
            with path.open(encoding="utf-8") as handle:
                data = json.load(handle)

            records: list[dict] = []
            for split, key in SPLITS.items():
                for record in data.get(key, []):
                    records.append(
                        {
                            "serial": record["serial"],
                            "split": split,
                            "age": record.get("age"),
                            "symptom": record.get("symptom", []),
                            "class_label": record.get("class_label"),
                            "class_name": record.get("class_name"),
                        }
                    )
            self._records = records
            self._by_serial = {r["serial"]: r for r in records}
            self._task = {
                "task_name": data.get("task_name"),
                "task_description": data.get("task_description"),
                "class_label_to_name": data.get("class_label_to_name", CLASS_NAMES),
            }

    @property
    def available(self) -> bool:
        try:
            self._ensure()
            return True
        except CatalogUnavailable:
            return False

    def task(self) -> dict:
        self._ensure()
        return dict(self._task)

    def all_records(self) -> list[dict]:
        self._ensure()
        assert self._records is not None
        return self._records

    def get(self, serial: str) -> dict:
        self._ensure()
        serial = serial.strip()
        record = self._by_serial.get(serial) or self._by_serial.get(serial.zfill(5))
        if record is None:
            raise KeyError(f"No record with serial '{serial}'.")
        return dict(record)

    def query(
        self,
        split: str | None = None,
        class_name: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        records = self.all_records()
        if split:
            records = [r for r in records if r["split"] == split]
        if class_name:
            wanted = class_name.lower()
            records = [r for r in records if (r["class_name"] or "").lower() == wanted]
        if search:
            needle = search.lower()
            records = [
                r
                for r in records
                if needle in r["serial"].lower()
                or any(needle in s.lower() for s in r["symptom"])
            ]
        total = len(records)
        page = records[offset: offset + limit]
        return [self._decorate(r) for r in page], total

    def _decorate(self, record: dict) -> dict:
        out = dict(record)
        out["has_edf"] = self.edf_path(record["serial"]).exists()
        out["cached_crops"] = len(self.cached_feature_paths(record["serial"]))
        return out

    def counts(self) -> dict:
        records = self.all_records()
        by_split: dict[str, dict[str, int]] = {}
        for record in records:
            bucket = by_split.setdefault(record["split"], {})
            name = record["class_name"] or "unknown"
            bucket[name] = bucket.get(name, 0) + 1
        return {
            "total": len(records),
            "by_split": {k: sum(v.values()) for k, v in by_split.items()},
            "by_split_and_class": by_split,
        }

    # --- Files -------------------------------------------------------------
    def edf_path(self, serial: str) -> Path:
        return get_settings().edf_dir / f"{serial}.edf"

    def cached_feature_paths(self, serial: str) -> list[Path]:
        feature_dir = get_settings().feature_dir
        if not feature_dir.exists():
            return []
        return sorted(feature_dir.glob(f"{serial}_crop*.npz"))

    def load_cached_features(self, serial: str, max_crops: int | None = None) -> dict[str, np.ndarray]:
        """Stack the cached .npz crops for one patient into (n_crops, dim) arrays."""
        paths = self.cached_feature_paths(serial)
        if not paths:
            raise FileNotFoundError(f"No cached features for serial '{serial}'.")
        if max_crops:
            paths = paths[:max_crops]
        loaded = []
        for path in paths:
            with np.load(path) as data:
                loaded.append({k: np.asarray(data[k], dtype=np.float32) for k in STREAM_KEYS})
        return {k: np.stack([item[k] for item in loaded]) for k in STREAM_KEYS}


@lru_cache
def get_catalog() -> Catalog:
    return Catalog()
