"""Structured JSON logging setup."""

from __future__ import annotations

import json
import logging
import sys
from typing import Any


class JsonFormatter(logging.Formatter):
    """Format log records as compact single-line JSON."""

    DEFAULT_FIELDS = {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "message",
        "asctime",
    }
    # ``extra={'filename': ...}`` would shadow a reserved LogRecord attr;
    # callers must prefix such fields with an underscore or another word.
    _RESERVED_PREFIX_HINTS = {"filename", "module", "name", "msg", "levelname", "levelno"}

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # Surface any extra={} fields the caller added. Any field whose name
        # collides with a LogRecord attribute (e.g. 'filename', 'module') is
        # emitted with an ``extra_`` prefix so JSON consumers stay readable.
        for key, value in record.__dict__.items():
            if key in self.DEFAULT_FIELDS or key.startswith("_"):
                continue
            if key in self._RESERVED_PREFIX_HINTS:
                payload[f"extra_{key}"] = value
            else:
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> None:
    """Configure the root logger with a single JSON stderr handler."""
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(numeric_level)
    # Tame noisy third-party loggers.
    for noisy in ("httpx", "httpcore", "multipart", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
