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

# Heavy CUDA wheels in their own layer so code changes don't bust the cache
RUN pip install --index-url https://download.pytorch.org/whl/cu128 \
      torch torchaudio torchvision

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
