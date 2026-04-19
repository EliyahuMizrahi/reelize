import { useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  getJob,
  getJobArtifact,
  getJobEvents,
  type JobEvent,
  type SfxItem,
} from '@/services/api';

export type JobStreamStatus =
  | 'idle'        // no jobId
  | 'loading'     // subscribing / fetching history
  | 'running'     // events arriving
  | 'done'        // job.done seen
  | 'failed'      // job.failed seen
  | 'cancelled';  // job.cancelled seen

export interface JobStreamState {
  /** Full event history, ordered by id. */
  events: JobEvent[];
  /** The most recent event of each type (e.g. byType['audio.done']). */
  byType: Record<string, JobEvent>;
  /** 0–100, monotonic. Derived from the highest progress_pct seen so far. */
  progressPct: number;
  /** Last event's `message` field, or empty string. */
  latestMessage: string;
  /** High-level job lifecycle state. */
  status: JobStreamStatus;
  /** Populated on job.failed or on fetch/subscribe error. */
  error: string | null;
  /** Signed URL of the hero frame once `artifacts.hero.done` fires. */
  heroUrl: string | null;
  /** SFX candidates emitted with `artifacts.sfx.done` (keys, not signed URLs). */
  sfxItems: SfxItem[];
}

const TERMINAL_EVENT_TYPES = new Set([
  'job.done',
  'job.failed',
  'job.cancelled',
]);

const TERMINAL_JOB_STATUSES = new Set(['done', 'failed', 'cancelled']);

function statusFromEventType(t: string): JobStreamStatus | null {
  if (t === 'job.done') return 'done';
  if (t === 'job.failed') return 'failed';
  if (t === 'job.cancelled') return 'cancelled';
  return null;
}

/**
 * Subscribe to a job's progress stream. Fetches past events from
 * `/jobs/:id/events`, then subscribes to Supabase Realtime for new inserts.
 * Events are deduped by id, so the refresh race (history vs. realtime)
 * can't double-count. Passing `null` returns the idle state and does not
 * open a connection.
 *
 * Resilience: we watch the channel's subscribe callback for errors/timeouts
 * and reconnect with 2s → 30s backoff, falling back to polling `/jobs/:id`
 * after 3 failed reconnects. A 10s polling refresh also runs in parallel as
 * a belt-and-braces safety net.
 */
export function useJobStream(jobId: string | null | undefined): JobStreamState {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [status, setStatus] = useState<JobStreamStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<number>>(new Set());
  const lastEventIdRef = useRef<number>(0);
  const statusRef = useRef<JobStreamStatus>('idle');
  statusRef.current = status;

  useEffect(() => {
    if (!jobId) {
      seenIds.current = new Set();
      lastEventIdRef.current = 0;
      setEvents([]);
      setStatus('idle');
      setError(null);
      return;
    }

    seenIds.current = new Set();
    lastEventIdRef.current = 0;
    setEvents([]);
    setError(null);
    setStatus('loading');

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let terminalPollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectAttempts = 0;

    const ingest = (incoming: JobEvent | JobEvent[]) => {
      if (cancelled) return;
      const batch = Array.isArray(incoming) ? incoming : [incoming];
      const fresh: JobEvent[] = [];
      for (const e of batch) {
        if (e && typeof e.id === 'number' && !seenIds.current.has(e.id)) {
          seenIds.current.add(e.id);
          if (e.id > lastEventIdRef.current) lastEventIdRef.current = e.id;
          fresh.push(e);
        }
      }
      if (fresh.length === 0) return;
      setEvents((prev) => {
        const merged = prev.concat(fresh);
        merged.sort((a, b) => a.id - b.id);
        return merged;
      });
      for (const e of fresh) {
        const terminal = statusFromEventType(e.type);
        if (terminal) {
          setStatus(terminal);
          if (terminal === 'failed') {
            setError(e.message ?? 'Job failed');
          }
        } else {
          setStatus((s) =>
            s === 'loading' || s === 'idle' ? 'running' : s,
          );
        }
      }
    };

    // Also trust the job row itself: if the backend has already marked the
    // job done/failed/cancelled before we fetched events (fast jobs), we
    // shouldn't sit in `loading` forever.
    const checkJobStatus = async () => {
      if (cancelled) return;
      try {
        const job = await getJob(jobId);
        if (cancelled) return;
        const s = (job.status ?? '').toLowerCase();
        if (TERMINAL_JOB_STATUSES.has(s)) {
          const next =
            s === 'done' ? 'done' : s === 'failed' ? 'failed' : 'cancelled';
          setStatus((prev) =>
            // Only promote into terminal from a non-terminal state.
            prev === 'done' || prev === 'failed' || prev === 'cancelled'
              ? prev
              : (next as JobStreamStatus),
          );
          if (s === 'failed' && job.error) setError(job.error);
        }
      } catch (err) {
        // Polling is best-effort; don't surface transient errors.
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn('[useJobStream] getJob poll failed', err);
      }
    };

    const catchUp = async () => {
      if (cancelled) return;
      try {
        const since = lastEventIdRef.current || undefined;
        const history = await getJobEvents(jobId, since);
        if (cancelled) return;
        ingest(history);

        // Fast-job race: history empty or non-terminal but the job itself
        // already finished — reconcile via `/jobs/:id`.
        const currentStatus = statusRef.current;
        const hasTerminalEvent = history.some((e) =>
          TERMINAL_EVENT_TYPES.has(e.type),
        );
        if (
          !hasTerminalEvent &&
          currentStatus !== 'done' &&
          currentStatus !== 'failed' &&
          currentStatus !== 'cancelled'
        ) {
          await checkJobStatus();
        }
      } catch (err) {
        if (cancelled) return;
        setError((err as Error)?.message ?? 'Failed to load events');
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      reconnectAttempts += 1;
      if (reconnectAttempts > 3) {
        // eslint-disable-next-line no-console
        console.warn(
          '[useJobStream] 3 reconnects failed, falling back to polling only',
        );
        // Leave realtime detached; the polling intervals below cover us.
        return;
      }
      const delay = Math.min(30_000, 2_000 * 2 ** (reconnectAttempts - 1));
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(), delay);
    };

    const connect = () => {
      if (cancelled) return;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      channel = supabase
        .channel(`job-events-${jobId}-${Math.random().toString(36).slice(2, 6)}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'job_events',
            filter: `job_id=eq.${jobId}`,
          },
          (payload) => ingest(payload.new as JobEvent),
        )
        .subscribe((subStatus, err) => {
          if (cancelled) return;
          if (subStatus === 'SUBSCRIBED') {
            reconnectAttempts = 0;
            // Race protection: replay anything that landed between the
            // previous disconnect and now.
            void catchUp();
          } else if (
            subStatus === 'CHANNEL_ERROR' ||
            subStatus === 'TIMED_OUT' ||
            subStatus === 'CLOSED'
          ) {
            // eslint-disable-next-line no-console
            console.warn(
              `[useJobStream] realtime ${subStatus}`,
              err ?? '',
            );
            scheduleReconnect();
          }
        });
    };

    connect();
    void catchUp();

    // Safety-net polling — refetch the job row every ~10s so we always
    // converge even if realtime is flaky. We stop polling once terminal.
    pollTimer = setInterval(() => {
      const s = statusRef.current;
      if (s === 'done' || s === 'failed' || s === 'cancelled') return;
      void checkJobStatus();
    }, 10_000);

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (terminalPollTimer) clearInterval(terminalPollTimer);
    };
  }, [jobId]);

  const { byType, progressPct, latestMessage } = useMemo(() => {
    const bt: Record<string, JobEvent> = {};
    let maxPct = 0;
    for (const e of events) {
      bt[e.type] = e;
      if (typeof e.progress_pct === 'number' && e.progress_pct > maxPct) {
        maxPct = e.progress_pct;
      }
    }
    const last = events[events.length - 1];
    return {
      byType: bt,
      progressPct: maxPct,
      latestMessage: last?.message ?? '',
    };
  }, [events]);

  // SFX items travel inline in the event payload — no extra fetch needed.
  const sfxItems = useMemo<SfxItem[]>(() => {
    const ev = byType['artifacts.sfx.done'];
    const raw = (ev?.data as { items?: unknown })?.items;
    return Array.isArray(raw) ? (raw as SfxItem[]) : [];
  }, [byType]);

  // Hero frame: the event carries a storage key; resolve to a signed URL once.
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const heroEventId = byType['artifacts.hero.done']?.id ?? null;
  useEffect(() => {
    if (!jobId || heroEventId === null) {
      setHeroUrl(null);
      return;
    }
    let cancelled = false;
    getJobArtifact(jobId, 'hero_frame')
      .then((r) => {
        if (cancelled) return;
        if (typeof r.url === 'string') setHeroUrl(r.url);
      })
      .catch(() => {
        /* non-fatal — UI falls back to the procedural thumbnail */
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, heroEventId]);

  return {
    events,
    byType,
    progressPct,
    latestMessage,
    status,
    error,
    heroUrl,
    sfxItems,
  };
}
