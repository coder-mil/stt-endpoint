# syntax=docker/dockerfile:1.6
# =============================================================================
# STT Endpoint — CPU-only base image.
#
# Multi-stage build keeps the runtime image minimal.
# For GPU builds see Dockerfile.cuda.
# =============================================================================

# -------- Stage 1: build the wheel --------
FROM python:3.11-slim AS builder
WORKDIR /build

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md LICENSE ./
COPY app ./app

RUN python -m pip install --no-cache-dir --upgrade pip build \
 && python -m build --wheel --outdir /dist

# -------- Stage 2: runtime --------
FROM python:3.11-slim AS runtime
WORKDIR /app

# curl for healthcheck; libgomp1 for faster-whisper/numpy.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl libgomp1 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /dist/*.whl /tmp/
RUN python -m pip install --no-cache-dir /tmp/*.whl

ENV STT_MODELS_DIR=/app/models \
    STT_DEVICE=cpu \
    STT_COMPUTE_TYPE=int8 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN mkdir -p /app/models
VOLUME ["/app/models"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
