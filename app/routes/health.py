"""Health/readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..queue import get_job_queue
from .. import stt as _stt_module

# Look the symbol up on ``app.stt`` at call time (rather than caching a
# local reference at import time) so tests can ``monkeypatch.setattr(app.stt,
# "get_transcriber", ...)``.
router = APIRouter(tags=["health"])


def _status() -> dict:
    t = _stt_module.get_transcriber()
    return {
        "status": "ready" if t.is_loaded() else "loading",
        "model": t.model_size,
        "device": t.device,
        "queue": get_job_queue().stats(),
    }


@router.get("/health")
def health() -> dict:
    """Liveness probe: server is up."""
    return {"status": "ok"}


@router.get("/ready")
def ready() -> dict:
    """Readiness probe: model loaded and queue bounded."""
    return _status()


__all__ = ["router"]


# Re-export helpers for tests (no-op at runtime).
def get_transcriber():  # pragma: no cover - re-export shim for tests
    return _stt_module.get_transcriber()
