"""Higher-level wrapper around ``faster-whisper`` with lazy model loading
and CUDA→CPU fallback.

Design notes:
- Model is NOT loaded at import time. It is loaded on the first call to
  ``transcribe_bytes`` so service startup stays fast (and so tests can run
  without the model being present).
- ``transcribe_bytes`` is synchronous (faster-whisper blocks), so callers
  wrap it in ``loop.run_in_executor``.
- If the active device is CUDA and either load or inference raises, we
  re-create the model on CPU with int8 and retry exactly once.
"""

from __future__ import annotations

import io
import logging
import os
import threading
from dataclasses import dataclass

log = logging.getLogger("stt.transcriber")

# File-extension → Whisper-supported container hint. Whisper sniffs the
# container itself; we only use this for logging.
_EXT_HINTS = {
    ".webm": "audio/webm",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".flac": "audio/flac",
}


@dataclass
class TranscribeResult:
    """Uniform result shape returned by ``Transcriber.transcribe_bytes``."""

    text: str
    language: str
    duration: float
    model: str

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "language": self.language,
            "duration": self.duration,
            "model": self.model,
        }


class Transcriber:
    """Thin wrapper around ``faster_whisper.WhisperModel``."""

    def __init__(
        self,
        model_size: str = "base",
        device: str = "cuda",
        compute_type: str = "float16",
        language: str = "pt",
        models_dir: str = "./models",
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.language = language or None  # None = auto-detect
        self.models_dir = models_dir
        self._model = None
        self._lock = threading.Lock()
        self._loaded = False
        self._on_cpu_fallback = False

    # ------------------------------------------------------------------ model

    def is_loaded(self) -> bool:
        return self._loaded

    def _ensure_model(self) -> None:
        """Load the model on first use (thread-safe)."""
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            log.info(
                "loading model",
                extra={
                    "event": "stt_load_start",
                    "model": self.model_size,
                    "device": self.device,
                    "compute_type": self.compute_type,
                },
            )
            os.makedirs(self.models_dir, exist_ok=True)
            # Imported here so tests without faster-whisper installed still run.
            from faster_whisper import WhisperModel

            try:
                self._model = WhisperModel(
                    self.model_size,
                    device=self.device,
                    compute_type=self.compute_type,
                    download_root=self.models_dir,
                )
            except Exception as exc:  # noqa: BLE001
                log.error(
                    "load failed",
                    extra={
                        "event": "stt_load_failed",
                        "device": self.device,
                        "error": str(exc),
                    },
                )
                if self.device != "cpu":
                    self._fallback_to_cpu()
                else:
                    raise
            self._loaded = True
            log.info(
                "model ready",
                extra={
                    "event": "stt_load_ok",
                    "model": self.model_size,
                    "device": self.device,
                },
            )

    def _fallback_to_cpu(self) -> None:
        log.info(
            "falling back to cpu",
            extra={"event": "stt_fallback_cpu"},
        )
        self._on_cpu_fallback = True
        self.device = "cpu"
        self.compute_type = "int8"
        from faster_whisper import WhisperModel

        self._model = WhisperModel(
            self.model_size,
            device="cpu",
            compute_type="int8",
            download_root=self.models_dir,
        )

    # ----------------------------------------------------------- transcription

    def _do_transcribe(self, audio_bytes: bytes, filename: str | None, language: str | None) -> TranscribeResult:
        try:
            self._ensure_model()
        except Exception as exc:
            log.error(
                "ensure_model failed",
                extra={"event": "stt_load_failed", "error": str(exc)},
            )
            raise

        lang = language or self.language
        lang = lang or None  # None → auto-detect

        ext_hint = _EXT_HINTS.get(
            "." + (filename.rsplit(".", 1)[-1].lower() if filename and "." in filename else ""),
            "unknown",
        )
        log.info(
            "transcribe start",
            extra={
                "event": "stt_transcribe_start",
                "extra_filename": filename,
                "format": ext_hint,
                "bytes": len(audio_bytes),
                "language": lang,
                "device": self.device,
            },
        )

        audio_file = io.BytesIO(audio_bytes)
        try:
            segments_iter, info = self._model.transcribe(
                audio_file,
                beam_size=5,
                language=lang,
            )
            # faster-whisper generators need to be materialized eagerly.
            segments = list(segments_iter)
            text = " ".join(seg.text.strip() for seg in segments).strip()
            duration = float(getattr(info, "duration", 0.0) or 0.0)
            result = TranscribeResult(
                text=text,
                language=getattr(info, "language", lang or "auto"),
                duration=duration,
                model=self.model_size,
            )
        except Exception as exc:
            log.error(
                "transcribe failed",
                extra={
                    "event": "stt_transcribe_failed",
                    "device": self.device,
                    "error": str(exc),
                },
            )
            # One-shot CUDA→CPU retry
            if self.device == "cuda" and not self._on_cpu_fallback:
                self._fallback_to_cpu()
                return self._do_transcribe(audio_bytes, filename, language)
            raise

        log.info(
            "transcribe done",
            extra={
                "event": "stt_transcribe_done",
                "chars": len(result.text),
                "duration_sec": result.duration,
                "language": result.language,
            },
        )
        return result

    def transcribe_bytes(
        self,
        audio_bytes: bytes,
        filename: str | None = None,
        language: str | None = None,
    ) -> dict:
        """Public entry point. Returns a JSON-serializable dict."""
        if not audio_bytes or len(audio_bytes) < 100:
            return TranscribeResult(
                text="", language=language or self.language or "auto", duration=0.0, model=self.model_size
            ).to_dict()
        return self._do_transcribe(audio_bytes, filename, language).to_dict()


# ----------------------------------------------------------------- singleton

_transcriber: Transcriber | None = None
_transcriber_lock = threading.Lock()


def get_transcriber() -> Transcriber:
    """Lazy singleton matching the current settings."""
    global _transcriber
    if _transcriber is None:
        with _transcriber_lock:
            if _transcriber is None:
                from .config import get_settings

                s = get_settings()
                _transcriber = Transcriber(
                    model_size=s.model_size,
                    device=s.device,
                    compute_type=s.compute_type,
                    language=s.language,
                    models_dir=s.models_dir,
                )
    return _transcriber


def reset_transcriber() -> None:
    """Drop the cached singleton (used by tests)."""
    global _transcriber
    _transcriber = None
