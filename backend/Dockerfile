# TODO: move to a digest-pinned base (python:3.11-slim-bookworm@sha256:...)
# once we're on a stable build; version-tag is good enough for now.
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/cache/huggingface \
    TORCH_HOME=/cache/torch \
    XDG_CACHE_HOME=/cache

# curl is required by HEALTHCHECK below; keep it in runtime.
# TODO: split builder/runtime so build-essential + git don't ship in the
# final image. Holding off until the torch/demucs install is proven stable
# across CPU and CUDA builds — a split now risks breaking the pinned wheels.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      libsndfile1 \
      git \
      curl \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Heavy torch wheels in their own layer so code changes don't bust the cache.
#
# Pinned to 2.8.0. torchaudio 2.11 dropped the classic soundfile backend from
# `torchaudio.save()` and hard-requires torchcodec; on CPU-only hosts that
# crashes demucs at 92%. 2.8.x still has the soundfile path and plays nicely
# with pyannote.audio 4.x.
#
# To build for an NVIDIA GPU (e.g. RTX 3090, Ampere), override both args:
#   docker compose build \
#     --build-arg TORCH_INDEX=https://download.pytorch.org/whl/cu128 \
#     --build-arg TORCH_SUFFIX=+cu128 \
#     backend
# Or use docker-compose.gpu.yml (see below) which does both + wires in the
# nvidia runtime.
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
ARG TORCH_SUFFIX=+cpu
RUN pip install --index-url ${TORCH_INDEX} \
      "torch==2.8.0${TORCH_SUFFIX}" torchaudio==2.8.0 torchvision==0.23.0

COPY requirements.txt .
RUN pip install -r requirements.txt

# Belt-and-suspenders: if pyannote ever pulls torchcodec back in, remove it
# so torchaudio.save() doesn't route through its broken CPU path.
RUN pip uninstall -y torchcodec 2>/dev/null || true

COPY . .

# Non-root user for runtime. /app, /cache and /app/tmp need to be writable
# because the app downloads models and writes scratch media there.
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 appuser \
    && mkdir -p /cache /app/tmp \
    && chown -R appuser:appuser /app /cache

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/health || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
