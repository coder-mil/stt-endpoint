"""``POST /v1/transcribe`` — the only public transcription endpoint.

Synchronous response: the API blocks until the job finishes (limited by the
queue semaphore). For longer audio, clients can swap this for a fire-and-poll
pattern via ``/v1/jobs/{id}`` (route below).
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..auth import require_api_key
from ..config import get_settings
from ..queue import Job, get_job_queue
from .. import stt as _stt_module  # late-bound so monkeypatch.setattr(app.stt, ...) takes effect

router = APIRouter(prefix="/v1", tags=["transcribe"])


def _job_to_dict(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "status": job.status,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
    }


@router.post("/transcribe", dependencies=[Depends(require_api_key)])
async def transcribe(
    audio: UploadFile = File(...),
    language: str | None = Form(default=None),
) -> dict[str, Any]:
    """Transcribe a single audio upload and return the result inline."""
    settings = get_settings()
    contents = await audio.read()
    if not contents:
        raise HTTPException(status_code=422, detail="empty file")
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"file exceeds {settings.max_file_size_mb} MB",
        )

    job = await get_job_queue().create()
    transcriber = _stt_module.get_transcriber()

    async def _run() -> dict[str, Any]:
        # Run the blocking call directly. ``asyncio.to_thread`` (3.9+) is the
        # portable equivalent of ``loop.run_in_executor(None, ...)`` and
        # avoids the "no current event loop in thread" gotcha when this
        # coroutine itself runs inside an executor.
        return await asyncio.wait_for(
            asyncio.to_thread(
                transcriber.transcribe_bytes, contents, audio.filename, language
            ),
            timeout=settings.timeout_seconds,
        )

    try:
        await get_job_queue().run(job, _run)
    except asyncio.TimeoutError:
        job.status = "error"
        job.error = f"timeout after {settings.timeout_seconds}s"
        raise HTTPException(status_code=504, detail=job.error)

    response = _job_to_dict(job)
    if job.status == "error":
        # 502 = upstream model failure (not a client problem)
        raise HTTPException(status_code=502, detail=job.error or "transcribe failed")
    return response


@router.get("/jobs/{job_id}", dependencies=[Depends(require_api_key)])
def get_job(job_id: str) -> dict[str, Any]:
    """Inspect a previously-created job's status (mostly for sync clients)."""
    job = get_job_queue().get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return _job_to_dict(job)
