import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
const UPLOAD_BUCKET =
  process.env.EXPO_PUBLIC_SUPABASE_BUCKET ?? 'reelize-artifacts';

// ---------- auth-expired event bus ----------

/**
 * Thrown when the auth token can't be refreshed (revoked / expired / network
 * loss past the retry window). Callers — and the `request()` wrapper — catch
 * this and dispatch an `authExpired` event so the AuthContext can route to
 * sign-in.
 */
export class AuthExpiredError extends Error {
  constructor(message = 'Auth session expired') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

/** Thrown before upload starts when the chosen file fails MIME/extension sniff. */
export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

export function subscribeAuthExpired(cb: AuthExpiredListener): () => void {
  authExpiredListeners.add(cb);
  return () => {
    authExpiredListeners.delete(cb);
  };
}

function emitAuthExpired(): void {
  for (const cb of authExpiredListeners) {
    try {
      cb();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[auth] authExpired listener threw', err);
    }
  }
}

// ---------- auth header ----------

async function authHeader(): Promise<Record<string, string>> {
  // getSession() is cache-only — it does not refresh. If the access token
  // has (or is about to) expire we must refresh ourselves, otherwise we ship
  // a stale JWT and Supabase returns 403 at /auth/v1/user. 60s of slack
  // avoids a refresh race against token lifetime.
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  const expiresAt = session?.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (session && expiresAt - nowSec < 60) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[auth] token refresh failed', error);
      throw new AuthExpiredError(error.message);
    }
    session = refreshed.session;
  }
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------- request wrapper ----------

export interface RequestOptions extends RequestInit {
  /** Abort signal; if absent we create a 60s timeout controller. */
  signal?: AbortSignal;
  /** Disable the single GET retry on network error / 5xx. */
  noRetry?: boolean;
}

async function doFetch<T>(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<T> {
  const authed = await authHeader();
  const res = await fetch(url, {
    ...init,
    signal,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...authed,
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    emitAuthExpired();
    throw new AuthExpiredError(`Unauthorized (${res.status})`);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail)
        message =
          typeof body.detail === 'string'
            ? body.detail
            : JSON.stringify(body.detail);
      else if (body?.message) message = body.message;
    } catch {
      /* keep default */
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  // Some endpoints return 204; guard against empty bodies.
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const method = (init?.method ?? 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';
  const maxAttempts = init?.noRetry || !isIdempotent ? 1 : 2;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Set up abort: use caller's signal if present, else a 60s timeout.
    let controller: AbortController | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let signal = init?.signal;
    if (!signal) {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller!.abort(), 60_000);
      signal = controller.signal;
    }

    try {
      return await doFetch<T>(url, init ?? {}, signal);
    } catch (err) {
      lastErr = err;
      if (err instanceof AuthExpiredError) {
        // doFetch already emitted; just propagate.
        throw err;
      }
      // Bail on 4xx (except 5xx / network). DOMException AbortError => no retry.
      const status = (err as { status?: number } | undefined)?.status;
      const isAbort =
        (err as { name?: string } | undefined)?.name === 'AbortError';
      if (isAbort) throw err;
      if (status && status >= 400 && status < 500) throw err;
      if (attempt + 1 >= maxAttempts) throw err;
      // Backoff briefly before single retry.
      await new Promise((r) => setTimeout(r, 250));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------- analyze pipeline ----------

export interface AnalyzeResponse {
  job_id: string;
  status: string;
  clip_id: string | null;
}

/**
 * Fields returned by the list endpoint (`/jobs`). Mirrors the backend's
 * summary projection — no heavy JSON blobs.
 */
export interface JobSummary {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | string;
  source_type: string;
  source_url: string | null;
  clip_id: string | null;
  created_at: string;
  updated_at: string;
  error: string | null;
  artifact_prefix?: string | null;
}

/** Full job row returned by `/jobs/:id`, including manifests. */
export interface JobDetail extends JobSummary {
  video_analysis?: unknown;
  audio_manifest?: unknown;
}

/** @deprecated Use `JobDetail` (or `JobSummary` for list rows). */
export type JobRow = JobDetail;

export interface AnalyzeInput {
  url?: string;
  video?: { uri: string; name: string; type: string };
  clipContext?: string;
  gameHint?: string;
  clipId?: string;
  /** Progress 0–1 during the direct-to-storage upload phase, or -1 when
   *  progress can't be tracked on the current platform. */
  onUploadProgress?: (pct: number) => void;
  /** Abort the upload + analyze call. */
  signal?: AbortSignal;
}

interface SignUploadResponse {
  key: string;
  upload_url: string;
  token: string;
  path: string;
  bucket: string;
  content_type: string;
}

async function signUpload(
  filename: string,
  contentType: string,
): Promise<SignUploadResponse> {
  return request<SignUploadResponse>('/uploads/sign', {
    method: 'POST',
    body: JSON.stringify({ filename, content_type: contentType }),
  });
}

// ---------- upload validation ----------

const ALLOWED_EXTS = new Set(['mp4', 'mov', 'm4v', 'webm']);

/**
 * Pre-flight sanity check. We reject HEIC/octet-stream before spending the
 * round-trip on a signed URL, so the user sees a clear error and the bucket
 * doesn't accumulate zero-byte garbage.
 */
function validateVideoAsset(video: {
  name: string;
  type: string;
  uri?: string;
}): void {
  const name = (video.name ?? '').toLowerCase();
  const type = (video.type ?? '').toLowerCase();

  // Extension sniff.
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';
  if (!ext) {
    throw new UploadValidationError(
      'File has no extension; expected .mp4, .mov, .m4v, or .webm.',
    );
  }
  if (ext === 'heic' || ext === 'heif') {
    throw new UploadValidationError(
      'HEIC/HEIF images are not supported — choose a video file.',
    );
  }
  if (!ALLOWED_EXTS.has(ext)) {
    throw new UploadValidationError(
      `Unsupported file type .${ext}; use .mp4, .mov, .m4v, or .webm.`,
    );
  }

  // MIME sniff.
  if (type === 'application/octet-stream') {
    throw new UploadValidationError(
      'Unknown MIME type (application/octet-stream); please re-export as MP4.',
    );
  }
  if (type && !type.startsWith('video/')) {
    throw new UploadValidationError(
      `Expected a video/* MIME type, got "${type}".`,
    );
  }
}

/**
 * Upload a local video straight to Supabase Storage, bypassing the backend
 * tunnel entirely. Returns the storage key the caller then passes to
 * `/analyze`.
 *
 * We XHR the signed-PUT URL ourselves so `xhr.upload.onprogress` gives
 * byte-level progress (the Supabase SDK only emits 0 then 1). On platforms
 * where XHR isn't viable we fall back to the SDK's `uploadToSignedUrl` and
 * emit -1 (indeterminate) for the middle of the upload.
 */
async function uploadVideoDirect(
  video: { uri: string; name: string; type: string },
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  validateVideoAsset(video);

  const signed = await signUpload(video.name, video.type);
  onProgress?.(0);

  // Convert RN file URI → Blob if possible. If this fails we're on a platform
  // where `fetch(fileUri)` doesn't produce a body XHR can PUT — fall back.
  let blob: Blob | null = null;
  try {
    const r = await fetch(video.uri);
    blob = await r.blob();
  } catch {
    blob = null;
  }

  const xhrUrl = signed.upload_url;
  // Prefer XHR PUT for byte-level progress, but only if we have both a URL
  // and a Blob in hand. In React Native on some versions `xhr.upload` is
  // missing — we can still send, but no progress events — that's acceptable.
  if (blob && xhrUrl && typeof XMLHttpRequest !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', xhrUrl, true);
      xhr.setRequestHeader('Content-Type', signed.content_type);
      if (signed.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${signed.token}`);
      }
      // `x-upsert` matches the SDK's behavior (idempotent re-uploads).
      xhr.setRequestHeader('x-upsert', 'true');

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            onProgress(e.loaded / e.total);
          } else {
            onProgress(-1);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(
            new Error(
              `Upload to storage failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`,
            ),
          );
        }
      };
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

      const onAbort = () => xhr.abort();
      if (signal) {
        if (signal.aborted) {
          xhr.abort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      try {
        xhr.send(blob);
      } catch (err) {
        reject(err);
      }
    });
    onProgress?.(1);
    return signed.key;
  }

  // Fallback: SDK path. Flip to indeterminate mid-upload because we can't
  // observe byte counts.
  onProgress?.(-1);
  const body = blob ?? { uri: video.uri, name: video.name, type: video.type };
  const { error } = await supabase.storage
    .from(signed.bucket ?? UPLOAD_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, body as any, {
      contentType: signed.content_type,
      upsert: true,
    });
  if (error) {
    throw new Error(`Upload to storage failed: ${error.message}`);
  }
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
    const uploadKey = await uploadVideoDirect(
      input.video,
      input.onUploadProgress,
      input.signal,
    );
    form.append('upload_key', uploadKey);
  }
  return request<AnalyzeResponse>('/analyze', {
    method: 'POST',
    body: form,
    signal: input.signal,
  });
}

export function getJob(jobId: string, signal?: AbortSignal): Promise<JobDetail> {
  return request<JobDetail>(`/jobs/${jobId}`, { signal });
}

// ---------- generate (template-driven) ----------

export interface GenerateInput {
  templateId: string;
  topicId: string;
  classId?: string | null;
  title: string;
  topic: string;
}

export interface GenerateResponse {
  job_id: string;
  clip_id: string;
  status: string;
}

/**
 * Kick off a template-driven generation job on the backend.
 *
 * The backend owns clip-row creation + job-row creation here — the frontend
 * only supplies the template, topic context, and title. The worker flips the
 * returned clip to `ready` once render completes.
 */
export async function generate(input: GenerateInput): Promise<GenerateResponse> {
  const form = new FormData();
  form.append('template_id', input.templateId);
  form.append('topic', input.topic);
  form.append('topic_id', input.topicId);
  if (input.classId != null) form.append('class_id', input.classId);
  form.append('title', input.title);
  return request<GenerateResponse>('/generate', {
    method: 'POST',
    body: form,
  });
}

export function listJobs(
  limit = 20,
  signal?: AbortSignal,
): Promise<JobSummary[]> {
  return request<JobSummary[]>(`/jobs?limit=${limit}`, { signal });
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
export async function getJobEvents(
  jobId: string,
  sinceId?: number,
  limit?: number,
  signal?: AbortSignal,
): Promise<JobEvent[]> {
  const params = new URLSearchParams();
  if (sinceId !== undefined) params.set('since_id', String(sinceId));
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  const resp = await request<{
    events: JobEvent[];
    has_more: boolean;
    max_id: number | null;
  }>(`/jobs/${jobId}/events${qs ? `?${qs}` : ''}`, { signal });
  return resp.events ?? [];
}

/** Value for a single artifact slot. Strings are direct signed URLs; maps are
 * keyed by a label (e.g. `voices` → { SPEAKER_00: url, SPEAKER_01: url }). */
export type ArtifactValue = string | Record<string, string>;

export interface ArtifactsResponse {
  ttl_seconds: number;
  artifacts: Record<string, ArtifactValue>;
}

export function listJobArtifacts(
  jobId: string,
  ttlSeconds = 3600,
): Promise<ArtifactsResponse> {
  return request<ArtifactsResponse>(
    `/jobs/${jobId}/artifacts?ttl_seconds=${ttlSeconds}`,
  );
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
  return request<{ status: string }>(`/jobs/${jobId}/cancel`, {
    method: 'POST',
  });
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

export function selectSfx(
  jobId: string,
  keepIds: number[],
): Promise<SelectSfxResponse> {
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

export function listSfxWithUrls(
  jobId: string,
  ttlSeconds = 3600,
): Promise<SfxListResponse> {
  return request<SfxListResponse>(
    `/jobs/${jobId}/sfx?ttl_seconds=${ttlSeconds}`,
  );
}
