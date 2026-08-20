"""Convenience entry point:  python backend/run.py [--reload]"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running this file directly, without installing the package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402

from backend.app.config import get_settings  # noqa: E402


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Run the QSFE-Net ML server.")
    parser.add_argument("--host", default=settings.host)
    parser.add_argument("--port", type=int, default=settings.port)
    parser.add_argument("--reload", action="store_true", help="Auto-reload on code changes.")
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()

    uvicorn.run(
        "backend.app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        workers=args.workers if not args.reload else 1,
    )


if __name__ == "__main__":
    main()
