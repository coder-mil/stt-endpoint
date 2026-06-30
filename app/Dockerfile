# syntax=docker/dockerfile:1.6
# =============================================================================
# STT Endpoint — CPU-only base image.
#
# Multi-stage build keeps the runtime image minimal.
# For GPU builds see Dockerfile.cuda.
#
# The default Whisper model is pre-baked into the image so that
# the very first transcription request is instant (no network download
# at runtime). Override with --build-arg STT_MODEL_SIZE=...
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

# -------- Stage 2: runtime base (install deps) --------
FROM python:3.11-slim AS runtime-base
WORKDIR /app

# curl for healthcheck; libgomp1 for faster-whisper/numpy.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl libgomp1 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /dist/*.whl /tmp/
RUN python -m pip install --no-cache-dir /tmp/*.whl

# -------- Stage 3: pre-bake the Whisper model --------
# Same base as runtime-base (deps available), but we download the model
# here so the runtime image's layer contains it.
ARG STT_MODEL_SIZE=base
FROM runtime-base AS baker

# Sanitize input — only allow short lowercase alnum + dash.
# Allowed: tiny, base, small, medium, large, large-v2, large-v3, distil-large-v3
# For "large-v3-turbo" use a community CT2 mirror (NOT in the official
# faster-whisper catalog, so not whitelisted here) and pass
# STT_HF_REPO=<huggingface-repo-id> instead.
RUN case "$STT_MODEL_SIZE" in \
       tiny|base|small|medium|large|large-v2|large-v3|distil-large-v3) ;; \
       *) echo "Invalid STT_MODEL_SIZE: $STT_MODEL_SIZE" && exit 1 ;; \
     esac

ENV STT_MODELS_DIR=/app/models

# Pre-download the model. ``STT_DEVICE=cpu`` here is irrelevant for the
# compute_type: on baker side we use ``int8`` so Whisper pre-allocates with
# the right quantization regardless of what the runtime device will be.
RUN python -c "\
import os; os.environ['HF_HUB_DISABLE_PROGRESS_BARS']='1'; \
from faster_whisper import WhisperModel; \
m = WhisperModel(os.environ['STT_MODEL_SIZE'], device='cpu', \
                 compute_type='int8', download_root='/app/models'); \
print('baked model:', os.environ['STT_MODEL_SIZE']); \
# Force resolution so the model files are on disk now, not lazy. \
import glob; files = glob.glob('/app/models/**/*.bin', recursive=True) \
            + glob.glob('/app/models/**/*.txt', recursive=True); \
print('files:', sorted(files))" || (echo 'bake failed'; exit 1)

# -------- Stage 4: runtime --------
FROM runtime-base AS runtime

ENV STT_MODELS_DIR=/app/models \
    STT_DEVICE=cpu \
    STT_COMPUTE_TYPE=int8 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Pull the pre-baked model files in.
COPY --from=baker /app/models /app/models

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:8000/ready >/dev/null 2>&1 || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
