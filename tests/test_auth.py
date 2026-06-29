"""Tests for ``X-API-Key`` authentication."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_missing_api_key_returns_401(client, sample_audio_bytes):
    resp = await client.post(
        "/v1/transcribe",
        files={"audio": ("x.wav", sample_audio_bytes, "audio/wav")},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid api key"


async def test_wrong_api_key_returns_401(client, sample_audio_bytes):
    resp = await client.post(
        "/v1/transcribe",
        headers={"X-API-Key": "definitely-wrong"},
        files={"audio": ("x.wav", sample_audio_bytes, "audio/wav")},
    )
    assert resp.status_code == 401


async def test_valid_api_key_returns_200(client, sample_audio_bytes, auth_headers, mock_transcriber):
    resp = await client.post(
        "/v1/transcribe",
        headers=auth_headers,
        files={"audio": ("x.wav", sample_audio_bytes, "audio/wav")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "done"
    assert body["result"]["text"].startswith("stub:")


async def test_health_is_unauthenticated(client):
    """Liveness probe must be reachable without a key."""
    resp = await client.get("/health")
    assert resp.status_code == 200
