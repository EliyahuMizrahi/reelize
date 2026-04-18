import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
const UPLOAD_BUCKET =
  process.env.EXPO_PUBLIC_SUPABASE_BUCKET ?? 'reelize-artifacts';

async function authHeader(): Promise<Record<string, string>> {
  // getSession() is cache-only — it does not refresh. If the access token
  // has (or is about to) expire we must refresh ourselves, otherwise we ship
  // a stale JWT and Supabase returns 403 at /auth/v1/user. 60s of slack
  // avoids a refresh race against token lifetime.
  let { data } = await supabase.auth.getSession();
  let session = data.session;
  const expiresAt = session?.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (session && expiresAt - nowSec < 60) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error) {
      // Refresh failed (revoked, network, invalid). Fall through with no
      // auth header — the request will 401 and the UI can route to login.
      return {};
    }
    session = refreshed.session;
  }
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const authed = await authHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...authed,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      else if (body?.message) message = body.message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ---------- analyze pipeline ----------

export interface AnalyzeResponse {
  job_id: string;
  status: string;
  clip_id: string | null;
}

export interface JobRow {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | string;
  source_type: string;
  source_url: string | null;
  clip_id: string | null;
  created_at: string;
  updated_at: string;
  error: string | null;
  video_analysis?: unknown;
  audio_manifest?: unknown;
  artifact_prefix?: string | null;
}

export interface AnalyzeInput {
  url?: string;
  video?: { uri: string; name: string; type: string };
  clipContext?: string;
  gameHint?: string;
  clipId?: string;
  /** Progress 0–1 during the direct-to-storage upload phase, or -1 when
   *  progress can't be tracked on the current platform. */
  onUploadProgress?: (pct: number) => void;
}

interface SignUploadResponse {
  key: string;
  upload_url: string;
  token: string;
  path: string;
  bucket: string;
  content_type: string;
}

async function signUpload(filename: string, contentType: string): Promise<SignUploadResponse> {
  return request<SignUploadResponse>('/uploads/sign', {
    method: 'POST',
    body: JSON.stringify({ filename, content_type: contentType }),
  });
}

/**
 * Upload a local video straight to Supabase Storage, bypassing the backend
 * tunnel entirely. Returns the storage key the caller then passes to
 * `/analyze`. We prefer the JS SDK's `uploadToSignedUrl` because it handles
 * the RN/web quirks (Blob, FormData, auth headers) in one place.
 */
async function uploadVideoDirect(
  video: { uri: string; name: string; type: string },
  onProgress?: (pct: number) => void,
): Promise<string> {
  const signed = await signUpload(video.name, video.type);
  onProgress?.(0);

  // React Native file URIs: fetch(uri).blob() works on Expo SDK 49+ / RN 0.72+.
  // If that fails we fall back to pushing the file-like object through the
  // JS SDK, which accepts { uri, name, type } on native.
  let body: Blob | { uri: string; name: string; type: string };
  try {
    const r = await fetch(video.uri);
    body = await r.blob();
  } catch {
    body = { uri: video.uri, name: video.name, type: video.type };
  }

  const { error } = await supabase.storage
    .from(signed.bucket ?? UPLOAD_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, body as any, {
      contentType: signed.content_type,
      upsert: true,
    });
  if (error) {
    throw new Error(`Upload to storage failed: ${error.message}`);
  }
  // SDK doesn't expose byte-level progress — report completion so callers
  // using indeterminate spinners can flip to "processing" state.
  onProgress?.(1);
  return signed.key;
}

/**
 * Kick off a Reelize analysis job on the Python backend.
 *
 * `video` uploads go direct-to-storage first — the tunnel between the app
 * and the backend can't reliably carry multi-MB bodies (504s). We only hit
 * `/analyze` once the bytes are in the bucket, handing over a short key.
 *
 * `clipId` links the job back to a pre-created clips row — the worker flips
 * that clip's status to `ready` on completion and writes `style_dna`.
 */
export async function analyze(input: AnalyzeInput): Promise<AnalyzeResponse> {
  if (!input.url && !input.video) {
    throw new Error('Provide a url or a video');
  }
  const form = new FormData();
  if (input.url) form.append('url', input.url);
  if (input.clipContext) form.append('clip_context', input.clipContext);
  if (input.gameHint) form.append('game_hint', input.gameHint);
  if (input.clipId) form.append('clip_id', input.clipId);
  if (input.video) {
    const uploadKey = await uploadVideoDirect(input.video, input.onUploadProgress);
    form.append('upload_key', uploadKey);
  }
  return request<AnalyzeResponse>('/analyze', {
    method: 'POST',
    body: form,
  });
}

export function getJob(jobId: string): Promise<JobRow> {
  return request<JobRow>(`/jobs/${jobId}`);
}

export function listJobs(limit = 20): Promise<JobRow[]> {
  return request<JobRow[]>(`/jobs?limit=${limit}`);
}

// ---------- streaming progress + artifacts ----------

export interface JobEvent {
  id: number;
  type: string;
  stage: string | null;
  progress_pct: number | null;
  message: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

/** Replay progress history for a job. Pass sinceId to fetch only newer events. */
export function getJobEvents(jobId: string, sinceId?: number, limit?: number): Promise<JobEvent[]> {
  const params = new URLSearchParams();
  if (sinceId !== undefined) params.set('since_id', String(sinceId));
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  return request<JobEvent[]>(`/jobs/${jobId}/events${qs ? `?${qs}` : ''}`);
}

/** Value for a single artifact slot. Strings are direct signed URLs; maps are
 * keyed by a label (e.g. `voices` → { SPEAKER_00: url, SPEAKER_01: url }). */
export type ArtifactValue = string | Record<string, string>;

export interface ArtifactsResponse {
  ttl_seconds: number;
  artifacts: Record<string, ArtifactValue>;
}

export function listJobArtifacts(jobId: string, ttlSeconds = 3600): Promise<ArtifactsResponse> {
  return request<ArtifactsResponse>(`/jobs/${jobId}/artifacts?ttl_seconds=${ttlSeconds}`);
}

export interface ArtifactResponse {
  name: string;
  ttl_seconds: number;
  url: ArtifactValue;
  key: string | Record<string, string>;
}

export function getJobArtifact(
  jobId: string,
  name: string,
  ttlSeconds = 3600,
): Promise<ArtifactResponse> {
  return request<ArtifactResponse>(
    `/jobs/${jobId}/artifacts/${encodeURIComponent(name)}?ttl_seconds=${ttlSeconds}`,
  );
}

// ---------- job control ----------

export function cancelJob(jobId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/jobs/${jobId}/cancel`, { method: 'POST' });
}

// ---------- SFX review ----------

export interface SfxItem {
  id: number;
  key: string;
  video_time: number;
  duration: number;
  strength: number;
  section_idx: number;
  beat_offset: number | null;
}

export interface SelectSfxResponse {
  kept: SfxItem[];
  deleted: string[];
}

export function selectSfx(jobId: string, keepIds: number[]): Promise<SelectSfxResponse> {
  return request<SelectSfxResponse>(`/jobs/${jobId}/sfx/select`, {
    method: 'POST',
    body: JSON.stringify({ keep_ids: keepIds }),
  });
}

export type SfxItemWithUrl = SfxItem & { url: string | null };

export interface SfxListResponse {
  ttl_seconds: number;
  items: SfxItemWithUrl[];
}

export function listSfxWithUrls(jobId: string, ttlSeconds = 3600): Promise<SfxListResponse> {
  return request<SfxListResponse>(`/jobs/${jobId}/sfx?ttl_seconds=${ttlSeconds}`);
}
