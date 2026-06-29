"""Application settings loaded from environment variables.

All variables are prefixed STT_ (e.g. ``STT_MODEL_SIZE``).
The ``Settings`` instance is created at import time and reused.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration object consumed throughout the service."""

    model_config = SettingsConfigDict(
        env_prefix="STT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Auth ---
    api_key: str = "change-me-in-production"
    model_size: str = "base"
    device: str = "cuda"
    compute_type: str = "float16"

    # --- Behavior ---
    language: str = "pt"
    beam_size: int = 5

    # --- Limits / concurrency ---
    max_concurrent: int = 1
    max_file_size_mb: int = 25
    timeout_seconds: int = 120

    # --- Storage / logging ---
    models_dir: str = "./models"
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached singleton settings instance."""
    return Settings()
