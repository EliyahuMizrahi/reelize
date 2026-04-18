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
# Default: CPU-only. Pinned to 2.5.1 — the latest torch (2.11+) auto-loads
# torchcodec which hard-requires libnvrtc.so.13 (CUDA) even on CPU images and
# fails demucs on import. For a real GPU host, rebuild with:
#   docker compose build --build-arg TORCH_INDEX=https://download.pytorch.org/whl/cu124
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
RUN pip install --index-url ${TORCH_INDEX} \
      torch==2.5.1 torchaudio==2.5.1 torchvision==0.20.1

# torchcodec (a torch 2.11+ transitive) tries to dlopen libnvrtc.so.13 at
# import time and won't find it on CPU-only hosts. Demucs decodes WAV via the
# classic soundfile backend, so removing torchcodec is safe.
RUN pip uninstall -y torchcodec 2>/dev/null || true

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
