"""Tests for the ``/v1/transcribe`` and ``/v1/jobs/{job_id}`` endpoints."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_transcribe_with_valid_audio(
    client, sample_audio_bytes, auth_headers, mock_transcriber
):
    resp = await client.post(
        "/v1/transcribe",
        headers=auth_headers,
        files={"audio": ("recording.webm", sample_audio_bytes, "audio/webm")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "done"
    assert body["result"]["text"] == "stub:204"
    assert body["result"]["language"] == "pt"
    assert body["result"]["duration"] == 1.23


async def test_transcribe_rejects_empty_file(client, auth_headers):
    resp = await client.post(
        "/v1/transcribe",
        headers=auth_headers,
        files={"audio": ("empty.wav", b"", "audio/wav")},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == "empty file"


async def test_transcribe_rejects_oversized_file(client, auth_headers, monkeypatch):
    """Bump the limit down so the test is quick, then send a too-big payload."""
    from app import config as config_mod

    monkeypatch.setenv("STT_MAX_FILE_SIZE_MB", "0")  # any positive bytes > 0 MB
    config_mod.get_settings.cache_clear()  # type: ignore[attr-defined]

    resp = await client.post(
        "/v1/transcribe",
        headers=auth_headers,
        files={"audio": ("big.wav", b"\x00" * 200, "audio/wav")},
    )
    assert resp.status_code == 413
    config_mod.get_settings.cache_clear()  # type: ignore[attr-defined]


async def test_transcribe_returns_job_id(client, sample_audio_bytes, auth_headers, mock_transcriber):
    resp = await client.post(
        "/v1/transcribe",
        headers=auth_headers,
        files={"audio": ("x.wav", sample_audio_bytes, "audio/wav")},
    )
    body = resp.json()
    assert "id" in body and len(body["id"]) >= 16
    assert body["status"] == "done"


async def test_get_job_unknown_returns_404(client, auth_headers):
    resp = await client.get("/v1/jobs/does-not-exist", headers=auth_headers)
    assert resp.status_code == 404


async def test_transcribe_uses_provided_language(
    client, sample_audio_bytes, auth_headers, mock_transcriber
):
    resp = await client.post(
        "/v1/transcribe",
        headers=auth_headers,
        data={"language": "en"},
        files={"audio": ("x.wav", sample_audio_bytes, "audio/wav")},
    )
    body = resp.json()
    assert resp.status_code == 200
    assert body["result"]["language"] == "en"


async def test_transcribe_falls_back_to_default_language(
    client, sample_audio_bytes, auth_headers, mock_transcriber
):
    resp = await client.post(
        "/v1/transcribe",
        headers=auth_headers,
        files={"audio": ("x.wav", sample_audio_bytes, "audio/wav")},
    )
    body = resp.json()
    assert resp.status_code == 200
    assert body["result"]["language"] == "pt"  # default from env


async def test_transcribe_propagates_internal_error(
    client, sample_audio_bytes, auth_headers, monkeypatch
):
    """If the model raises, the endpoint returns 502 with the error message."""

    class _Boom:
        model_size = "tiny"
        device = "cpu"

        def is_loaded(self):
            return True

        def transcribe_bytes(self, *_a, **_kw):
            raise RuntimeError("model crashed")

    from app import stt

    monkeypatch.setattr(stt, "get_transcriber", lambda: _Boom())
    resp = await client.post(
        "/v1/transcribe",
        headers=auth_headers,
        files={"audio": ("x.wav", sample_audio_bytes, "audio/wav")},
    )
    assert resp.status_code == 502
    assert "model crashed" in resp.json()["detail"]
