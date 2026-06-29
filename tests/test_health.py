"""Tests for ``/health`` and ``/ready``."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_health_returns_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_ready_when_model_loaded(client, mock_transcriber):
    resp = await client.get("/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["model"] == "tiny"
    assert body["device"] == "cpu"
    assert "queue" in body and "by_status" in body["queue"]


async def test_ready_when_model_loading(client):
    class _Loading:
        model_size = "tiny"
        device = "cpu"

        def is_loaded(self):
            return False

    from app import stt

    saved = stt.get_transcriber
    stt.get_transcriber = lambda: _Loading()
    try:
        resp = await client.get("/ready")
    finally:
        stt.get_transcriber = saved
    assert resp.status_code == 200
    assert resp.json()["status"] == "loading"
