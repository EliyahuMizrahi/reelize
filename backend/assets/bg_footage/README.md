# Background footage library

Drop pre-downloaded background clips here. The generation worker picks one at
random (optionally style-matched) to lay under the narration.

## Layout

```
backend/assets/bg_footage/
├── minecraft_parkour/
│   ├── clip_01.mp4
│   └── ...
├── subway_surfers/
│   ├── clip_01.mp4
│   └── ...
└── manifest.json      # optional — auto-generated on first scan if absent
```

## Clip requirements

- MP4 / H.264 / AAC, ideally portrait 9:16 (1080x1920). Landscape works but
  will be center-cropped at render time.
- At least 60 seconds long (longer = more trim flexibility).
- No audio track needed — it'll be muted at render time. Any audio is ignored.

## manifest.json format (optional)

If you want deterministic or tagged picks, drop a manifest:

```json
{
  "clips": [
    {
      "path": "minecraft_parkour/clip_01.mp4",
      "category": "minecraft_parkour",
      "duration_s": 180.4,
      "tags": ["high_energy", "vertical_motion"]
    }
  ]
}
```

Without a manifest, the picker globs `**/*.mp4`, ffprobes each for duration on
first use, and caches results to `backend/assets/bg_footage/.cache.json`.

## What doesn't belong here

- Template source videos (those live in Storage)
- Generated outputs (those live in Storage under `generation/{clip_id}/`)
- Voice samples (those live in Storage under `{job_id}/voices/`)
