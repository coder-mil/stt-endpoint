"""ASGI entrypoint. Use ``uvicorn app.main:app`` to run."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import get_settings
from .logging_config import setup_logging
from .routes import health as health_routes
from .routes import transcribe as transcribe_routes

setup_logging(get_settings().log_level)
log = logging.getLogger("stt.main")


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("startup", extra={"event": "stt_startup"})
    try:
        yield
    finally:
        log.info("shutdown", extra={"event": "stt_shutdown"})


app = FastAPI(
    title="STT Endpoint",
    description="Speech-to-text microservice backed by faster-whisper.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health_routes.router)
app.include_router(transcribe_routes.router)
