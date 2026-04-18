import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
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
}

/**
 * Kick off a Reelize analysis job on the Python backend.
 * Pass either `url` or `video` (upload). `clipId` links the job back to a
 * pre-created clips row — the worker flips that clip's status to `ready`
 * on completion and writes `style_dna`.
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
    form.append('video', {
      uri: input.video.uri,
      name: input.video.name,
      type: input.video.type,
    } as any);
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
