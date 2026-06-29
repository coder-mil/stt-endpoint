"""API-key authentication dependency for protected routes."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from .config import get_settings


async def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    """Reject the request unless ``X-API-Key`` matches the configured secret."""
    settings = get_settings()
    if not x_api_key or x_api_key != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid api key",
            headers={"WWW-Authenticate": "ApiKey"},
        )


__all__ = ["require_api_key"]
