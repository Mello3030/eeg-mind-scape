"""Bridge to the research code in ``src/`` — loaded, never modified.

``src/`` is not a package (no ``__init__.py``) and its scripts assume they are
run with ``sys.path`` pointing at ``src/datasets``. Rather than mutate
``sys.path`` globally, each module is loaded from its file path under a private
module name. Only import-time code runs; the ``__main__`` blocks (which contain
the hardcoded ``D:\Major`` paths) never execute.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

from .config import get_settings


def _load(module_name: str, path: Path) -> ModuleType:
    if module_name in sys.modules:
        return sys.modules[module_name]
    if not path.exists():
        raise FileNotFoundError(f"Research module not found: {path}")
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:  # pragma: no cover - defensive
        raise ImportError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def feature_extraction() -> ModuleType:
    """``src/datasets/feature_extraction.py`` — the four stream extractors."""
    src = get_settings().src_dir
    return _load("_qsfe_feature_extraction", src / "datasets" / "feature_extraction.py")


def qsfe_net() -> ModuleType:
    """``src/models/qsfe_net.py`` — StreamEncoder / GatedFusion / QSFENet."""
    src = get_settings().src_dir
    return _load("_qsfe_net", src / "models" / "qsfe_net.py")
