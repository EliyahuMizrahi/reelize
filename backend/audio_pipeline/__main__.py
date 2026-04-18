"""CLI: python -m audio_pipeline <url> -o <output_dir>"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from .config import PipelineConfig
from .pipeline import Pipeline


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="audio_pipeline",
        description="Extract style features (stems, transcript, songs, beats, SFX) from a short-form video.",
    )
    parser.add_argument("url", help="Video URL (yt-dlp compatible)")
    parser.add_argument("-o", "--output", default="output", help="Output directory")
    parser.add_argument("--device", default="cuda", help="'cuda' or 'cpu'")
    parser.add_argument("--whisper-model", default="large-v3")
    parser.add_argument("--no-diarize", action="store_true", help="Skip speaker diarization")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )

    cfg = PipelineConfig(
        output_dir=args.output,
        device=args.device,
        whisper_model=args.whisper_model,
        enable_diarization=not args.no_diarize,
    )

    pipe = Pipeline(cfg)
    manifest = asyncio.run(pipe.run(args.url))

    print(f"\n✅ Done. Manifest: {cfg.manifest_path}")
    print(f"   Sections: {len(manifest['music']['sections'])}")
    print(f"   SFX: {manifest['sfx']['count']}")
    print(f"   BPM: {manifest['rhythm']['bpm']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
