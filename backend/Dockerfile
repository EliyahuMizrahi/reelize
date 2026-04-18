FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/cache/huggingface \
    TORCH_HOME=/cache/torch \
    XDG_CACHE_HOME=/cache

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
#     --build-arg TORCH_INDEX=https://download.pytorch.org/whl/cu124 \
#     --build-arg TORCH_SUFFIX=+cu124 \
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

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
