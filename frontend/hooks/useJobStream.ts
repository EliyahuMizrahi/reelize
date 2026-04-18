import { useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
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
  | 'failed';     // job.failed seen

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

/**
 * Subscribe to a job's progress stream. Fetches past events from
 * `/jobs/:id/events`, then subscribes to Supabase Realtime for new inserts.
 * Events are deduped by id, so the refresh race (history vs. realtime)
 * can't double-count. Passing `null` returns the idle state and does not
 * open a connection.
 */
export function useJobStream(jobId: string | null | undefined): JobStreamState {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [status, setStatus] = useState<JobStreamStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!jobId) {
      seenIds.current = new Set();
      setEvents([]);
      setStatus('idle');
      setError(null);
      return;
    }

    seenIds.current = new Set();
    setEvents([]);
    setError(null);
    setStatus('loading');

    let cancelled = false;

    const ingest = (incoming: JobEvent | JobEvent[]) => {
      if (cancelled) return;
      const batch = Array.isArray(incoming) ? incoming : [incoming];
      const fresh: JobEvent[] = [];
      for (const e of batch) {
        if (e && typeof e.id === 'number' && !seenIds.current.has(e.id)) {
          seenIds.current.add(e.id);
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
        if (e.type === 'job.done') setStatus('done');
        else if (e.type === 'job.failed') {
          setStatus('failed');
          setError(e.message ?? 'Job failed');
        } else {
          setStatus((s) => (s === 'loading' || s === 'idle' ? 'running' : s));
        }
      }
    };

    // Subscribe first so any inserts that happen between subscribe + history
    // fetch are captured by both paths and deduped by id.
    const channel = supabase
      .channel(`job-events-${jobId}`)
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
      .subscribe();

    getJobEvents(jobId)
      .then((history) => ingest(history))
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to load events');
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
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
