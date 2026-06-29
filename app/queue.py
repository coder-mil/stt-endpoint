"""In-process job queue with a semaphore-bounded worker pool.

Jobs are created synchronously and ran via ``JobQueue.run``, which yields a
future the caller can ``await``. Status is queryable afterwards through
``JobQueue.get``. State lives only in memory — restart wipes everything, which
is fine for a pure CPU service.
"""

from __future__ import annotations

import asyncio
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from .config import get_settings

JobStatus = str  # "queued" | "running" | "done" | "error"


@dataclass
class Job:
    """Single transcription task."""

    id: str
    status: JobStatus = "queued"
    result: dict | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None


class JobQueue:
    """Async-aware queue that limits concurrent jobs to ``max_concurrent``."""

    def __init__(self, max_concurrent: int | None = None) -> None:
        self._max_concurrent = max_concurrent or get_settings().max_concurrent
        # Lazily-created: the constructor may run in a thread without an event
        # loop (e.g. when httpx runs the endpoint inside anyio's threadpool).
        self._sem: asyncio.Semaphore | None = None
        self._jobs: dict[str, Job] = {}
        self._lock: asyncio.Lock | None = None
        self._init_lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def _ensure_primitives(self) -> None:
        """Create async primitives bound to the running event loop."""
        if self._sem is not None:
            return
        with self._init_lock:
            if self._sem is not None:
                return
            loop = asyncio.get_running_loop()
            if self._loop is None:
                self._loop = loop
            self._sem = asyncio.Semaphore(self._max_concurrent)
            self._lock = asyncio.Lock()

    async def create(self) -> Job:
        """Register a new queued job and return it."""
        self._ensure_primitives()
        assert self._lock is not None  # for type-checkers
        async with self._lock:
            job = Job(id=str(uuid.uuid4()))
            self._jobs[job.id] = job
            return job

    def get(self, job_id: str) -> Job | None:
        """Return the job with ``job_id`` or ``None``."""
        return self._jobs.get(job_id)

    def list_ids(self) -> list[str]:
        """Return ids of all known jobs (for debugging)."""
        return list(self._jobs.keys())

    def stats(self) -> dict:
        """Return counts of jobs grouped by status."""
        counts: dict[str, int] = {"queued": 0, "running": 0, "done": 0, "error": 0}
        for job in self._jobs.values():
            counts[job.status] = counts.get(job.status, 0) + 1
        return {"jobs_total": len(self._jobs), "by_status": counts}

    async def run(
        self,
        job: Job,
        work: Callable[[], Awaitable[dict]],
    ) -> None:
        """Execute ``work()`` under the semaphore and update job state."""
        self._ensure_primitives()
        assert self._sem is not None
        async with self._sem:
            job.started_at = time.time()
            job.status = "running"
            try:
                job.result = await work()
                job.status = "done"
            except Exception as exc:  # noqa: BLE001 — propagated to caller via job.error
                job.status = "error"
                job.error = str(exc)
            finally:
                job.finished_at = time.time()


# Module-level singleton. Created lazily so tests can monkeypatch settings first.
job_queue: JobQueue | None = None


def get_job_queue() -> JobQueue:
    """Return the process-wide ``JobQueue``."""
    global job_queue
    if job_queue is None:
        job_queue = JobQueue()
    return job_queue


def reset_job_queue() -> None:
    """Drop the singleton. Used by tests."""
    global job_queue
    job_queue = None
