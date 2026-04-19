# Reelize Architecture

Reelize is an AI-powered short-form video generation platform. Users provide a reference video (YouTube Short, TikTok, Reel), the backend analyzes its audio/visual style, and generates a new video matching those characteristics.

```mermaid
%% Made with Canvas Cloud AI (modified for Reelize)
graph TD
    %% Client
    client_mobile["Expo / React Native App"]

    %% Backend
    api_fastapi["FastAPI Backend"]
    job_queue["Job Queue / Worker"]

    %% Audio Analysis
    audio_demucs["Demucs (stem separation)"]
    audio_whisper["Whisper (transcription)"]
    audio_shazam["Shazam (music ID)"]
    audio_beats["librosa (beats / energy)"]
    audio_pyannote["pyannote (diarization)"]

    %% Video Analysis
    video_gemini_scenes["Gemini (scene detection)"]
    video_keyframes["Keyframe Extractor"]

    %% Generation
    gen_gemini_script["Gemini (script + timeline)"]
    gen_elevenlabs["ElevenLabs (voice synthesis)"]

    %% Rendering
    render_remotion["Remotion Renderer"]

    %% Storage & Data
    db_supabase["Supabase Postgres"]
    storage_supabase["Supabase Storage"]
    storage_r2["Cloudflare R2"]

    %% Flow
    client_mobile --> api_fastapi
    api_fastapi --> job_queue
    api_fastapi --> db_supabase
    api_fastapi --> storage_supabase

    job_queue --> audio_demucs
    job_queue --> audio_whisper
    job_queue --> audio_shazam
    job_queue --> audio_beats
    job_queue --> audio_pyannote
    job_queue --> video_gemini_scenes
    video_gemini_scenes --> video_keyframes

    audio_demucs --> gen_gemini_script
    audio_whisper --> gen_gemini_script
    audio_shazam --> gen_gemini_script
    audio_beats --> gen_gemini_script
    audio_pyannote --> gen_gemini_script
    video_keyframes --> gen_gemini_script

    gen_gemini_script --> gen_elevenlabs
    gen_gemini_script --> render_remotion
    gen_elevenlabs --> render_remotion

    render_remotion --> storage_r2
    render_remotion --> storage_supabase
    storage_supabase --> client_mobile
    storage_r2 --> client_mobile
```

*Made with [Canvas Cloud AI](https://canvascloud.ai) — AI-powered cloud architecture diagramming*

## Components

- **Client** — Expo / React Native app (mobile + web) for upload, previewing, and downloading generated videos.
- **Backend API** — FastAPI server that orchestrates jobs, serves signed URLs, and manages state in Supabase.
- **Job Queue / Worker** — Serialized background worker that runs the analysis and render pipeline, preventing GPU/memory contention.
- **Audio Pipeline** — Demucs (stem separation), Whisper (transcription), Shazam (music ID), librosa (beat grid + energy envelope), and pyannote (speaker diarization).
- **Video Analyzer** — Gemini-powered scene detection with multi-pass keyframe refinement.
- **Script Generation** — Gemini produces the script and timeline from the combined audio/video manifest.
- **Voice Synthesis** — ElevenLabs generates narration from the script.
- **Renderer** — Remotion (React-based video framework) composes the final video with layered audio, voice, and footage.
- **Storage** — Supabase Postgres for job state and metadata; Supabase Storage / Cloudflare R2 for media assets and final renders.

## Data Flow

1. User uploads or links a reference video from the client.
2. FastAPI creates a job and enqueues it for the worker.
3. Audio and video analysis pipelines run in parallel, writing results into a shared manifest.
4. Gemini consumes the manifest to generate a script and shot timeline.
5. ElevenLabs synthesizes voice audio for the script.
6. Remotion renders the final composition with voice, music, and selected footage.
7. The output is stored and returned to the client via a signed URL.
