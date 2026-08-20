"""Checkpoint loading and the process-wide model registry.

The architecture comes from ``src/models/qsfe_net.py``, but the stream input
dimensions there are edited by hand between experiments (S1 has been both 19 and
95). The server therefore ignores the hardcoded dims and rebuilds each encoder
from the shapes stored in the checkpoint, so any QSFE-Net checkpoint loads
correctly and reports honestly whether it matches the current extractor.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path

import torch

from . import research
from .config import get_settings
from .constants import CLASS_NAMES, EXTRACTOR_DIMS, STREAM_KEYS


class ModelError(RuntimeError):
    """Raised when a checkpoint cannot be loaded or is unusable."""


@dataclass
class LoadedModel:
    module: "torch.nn.Module"
    device: torch.device
    checkpoint_path: Path
    stream_dims: dict[str, int]
    num_classes: int
    n_parameters: int
    class_names: list[str] = field(default_factory=lambda: list(CLASS_NAMES))

    @property
    def extractor_compatible(self) -> bool:
        """Whether live EDF features can be fed to this checkpoint."""
        return self.stream_dims == EXTRACTOR_DIMS

    @property
    def dim_mismatch(self) -> dict[str, dict[str, int]]:
        return {
            k: {"checkpoint": self.stream_dims[k], "extractor": EXTRACTOR_DIMS[k]}
            for k in STREAM_KEYS
            if self.stream_dims.get(k) != EXTRACTOR_DIMS[k]
        }


def resolve_device(preference: str | None = None) -> torch.device:
    pref = (preference or get_settings().device).lower()
    if pref == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if pref == "cuda" and not torch.cuda.is_available():
        raise ModelError("CUDA requested but no CUDA device is available.")
    return torch.device(pref)


def _read_state_dict(path: Path) -> dict[str, torch.Tensor]:
    if not path.exists():
        raise ModelError(f"Checkpoint not found: {path}")
    try:
        state = torch.load(path, map_location="cpu", weights_only=True)
    except Exception as exc:
        raise ModelError(f"Could not read checkpoint {path.name}: {exc}") from exc
    if not isinstance(state, dict):
        raise ModelError(f"{path.name} does not contain a state dict.")
    # Tolerate checkpoints saved as {"state_dict": ...} or DataParallel prefixes.
    if "state_dict" in state and isinstance(state["state_dict"], dict):
        state = state["state_dict"]
    return {k.removeprefix("module."): v for k, v in state.items()}


def _infer_shapes(state: dict[str, torch.Tensor]) -> tuple[dict[str, int], int]:
    dims: dict[str, int] = {}
    for key in STREAM_KEYS:
        weight = state.get(f"{key}_encoder.encoder.0.weight")
        if weight is None:
            raise ModelError(
                f"Checkpoint is missing '{key}_encoder' — not a QSFE-Net checkpoint."
            )
        dims[key] = int(weight.shape[1])

    head = [k for k in state if k.startswith("classifier.") and k.endswith(".weight")]
    if not head:
        raise ModelError("Checkpoint has no classifier head.")
    last = max(head, key=lambda k: int(k.split(".")[1]))
    return dims, int(state[last].shape[0])


def load_model(checkpoint: Path | None = None, device: str | None = None) -> LoadedModel:
    settings = get_settings()
    path = Path(checkpoint) if checkpoint else settings.checkpoint_path
    state = _read_state_dict(path)
    dims, num_classes = _infer_shapes(state)

    net = research.qsfe_net()
    module = net.QSFENet(num_classes=num_classes)
    for key, dim in dims.items():
        encoder = getattr(module, f"{key}_encoder")
        if encoder.encoder[0].in_features != dim:
            setattr(module, f"{key}_encoder", net.StreamEncoder(dim))

    try:
        module.load_state_dict(state, strict=True)
    except RuntimeError as exc:
        raise ModelError(f"Checkpoint does not match QSFE-Net: {exc}") from exc

    torch_device = resolve_device(device)
    module.to(torch_device).eval()

    return LoadedModel(
        module=module,
        device=torch_device,
        checkpoint_path=path,
        stream_dims=dims,
        num_classes=num_classes,
        n_parameters=sum(p.numel() for p in module.parameters()),
        class_names=list(CLASS_NAMES[:num_classes]),
    )


class ModelRegistry:
    """Lazily loads and caches the active model; safe across worker threads."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model: LoadedModel | None = None
        self._error: str | None = None

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def get(self) -> LoadedModel:
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is None:
                try:
                    self._model = load_model()
                    self._error = None
                except ModelError as exc:
                    self._error = str(exc)
                    raise
        return self._model

    def peek(self) -> LoadedModel | None:
        return self._model

    def try_load(self) -> LoadedModel | None:
        """Load without raising — used at startup and by /health."""
        try:
            return self.get()
        except ModelError:
            return None

    def reload(self, checkpoint: Path | None = None, device: str | None = None) -> LoadedModel:
        with self._lock:
            model = load_model(checkpoint, device)
            self._model = model
            self._error = None
        return model


registry = ModelRegistry()
