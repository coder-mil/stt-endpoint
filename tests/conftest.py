"""Pytest fixtures.

Sets the ``STT_API_KEY`` env var BEFORE the app is imported so the
``Settings`` singleton picks it up.
"""

from __future__ import annotations

import os

# Must run before any `app.*` import.
os.environ.setdefault("STT_API_KEY", "test-key")
os.environ.setdefault("STT_MODEL_SIZE", "tiny")
os.environ.setdefault("STT_DEVICE", "cpu")
os.environ.setdefault("STT_COMPUTE_TYPE", "int8")
os.environ.setdefault("STT_MAX_FILE_SIZE_MB", "25")
os.environ.setdefault("STT_TIMEOUT_SECONDS", "30")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402,F401  (registers routers)
from app import queue as queue_mod  # noqa: E402
from app import stt as stt_mod  # noqa: E402
from app.routes import transcribe as transcribe_routes  # noqa: E402


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"X-API-Key": "test-key"}


@pytest.fixture
def sample_audio_bytes() -> bytes:
    """A small payload that always clears the 100-byte floor check."""
    return b"RIFF" + b"\x00" * 200  # looks like a (truncated) WAV header


@pytest.fixture
def mock_transcriber(monkeypatch):
    """Replace the transcriber used by the route with a deterministic stub."""
    class _Fake:
        model_size = "tiny"
        device = "cpu"

        def is_loaded(self) -> bool:
            return True

        def transcribe_bytes(self, audio_bytes, filename=None, language=None):
            return {
                "text": f"stub:{len(audio_bytes)}",
                "language": language or "pt",
                "duration": 1.23,
                "model": self.model_size,
            }

    fake = _Fake()
    # ``app.stt.get_transcriber`` is looked up at call time inside the routes
    # (late-bound), so a single patch propagates to health + transcribe.
    monkeypatch.setattr(stt_mod, "get_transcriber", lambda: fake)
    return fake


@pytest.fixture
async def client():
    """An httpx async client wired straight to the ASGI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
def _reset_singletons():
    """Drop in-memory state between tests so they don't leak."""
    queue_mod.reset_job_queue()
    stt_mod.reset_transcriber()
    yield
    queue_mod.reset_job_queue()
    stt_mod.reset_transcriber()
