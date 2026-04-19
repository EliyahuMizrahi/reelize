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
      ca-certificates \
      gnupg \
      # ── Remotion headless Chromium runtime deps ──────────────────────
      # Remotion (@remotion/renderer) downloads Chrome Headless Shell at
      # first render; these system libs are what that binary links against
      # on Debian bookworm. Trimming any of them causes Chromium to crash
      # with a cryptic libX*/libnss error — keep the full list.
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libexpat1 \
      libfontconfig1 \
      libgbm1 \
      libgcc-s1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxkbcommon0 \
      libxrandr2 \
      libxrender1 \
      libxss1 \
      libxtst6 \
      lsb-release \
      wget \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Node 20 for the Remotion render subprocess. NodeSource ships a clean apt
# repo so we avoid the stale Node that Debian's own repos pin.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version

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

# Remotion npm deps in their own layer (package.json changes rarely, so this
# stays cached across code edits). `remotion/` is a side project inside the
# backend image — its node_modules end up at /app/remotion/node_modules.
COPY remotion/package.json remotion/package-lock.json* remotion/
RUN cd remotion && npm install --no-audit --no-fund

# Pre-fetch Chrome Headless Shell so the first /generate request doesn't
# spend 30s downloading it inside the request path. Falls back gracefully
# (swallowed exit code) if Remotion hasn't stabilized the CLI name yet —
# the renderer also lazy-downloads at runtime.
RUN cd remotion \
    && (npx --yes remotion browser ensure 2>/dev/null \
        || npx --yes remotion install 2>/dev/null \
        || echo "remotion: skipping browser prefetch, will lazy-download")

# Remotion writes its Chromium cache under $HOME/.cache/remotion by default.
# We run as appuser (uid 10001) below, so point the cache at /cache (already
# owned by appuser) to avoid the "read-only file system" bootstrap error.
ENV REMOTION_BROWSER_EXECUTABLE="" \
    PUPPETEER_CACHE_DIR=/cache/puppeteer \
    REMOTION_CACHE_DIR=/cache/remotion

COPY . .

# Non-root user for runtime. /app, /cache and /app/tmp need to be writable
# because the app downloads models and writes scratch media there. The
# puppeteer + remotion subdirs of /cache hold the Chromium binary Remotion
# downloads at first render.
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 appuser \
    && mkdir -p /cache /cache/puppeteer /cache/remotion /app/tmp \
    && chown -R appuser:appuser /app /cache

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/health || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
