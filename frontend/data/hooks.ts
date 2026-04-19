// React hooks for async Supabase queries. No third-party cache —
// useState + useEffect + abort-on-unmount.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import {
  fetchActivity,
  fetchClass,
  fetchClasses,
  fetchClip,
  fetchClipsForClass,
  fetchClipsForTopic,
  fetchFeed,
  fetchProfileStats,
  fetchTemplate,
  fetchTemplatesForClass,
  fetchTemplatesForUser,
  fetchTopic,
  fetchTopicsForClass,
  type ClassWithCounts,
  type ClipWithClass,
  type TopicWithClipCount,
} from '@/data/queries';
import { supabase } from '@/lib/supabase';
import type { Row } from '@/types/supabase';

/**
 * Subscribe to a Supabase table's postgres_changes broadcast and call
 * `refresh()` on every event. RLS filters the broadcast to rows the current
 * user owns, so a user-scoped filter isn't required. `filter` can narrow
 * further (e.g. `topic_id=eq.<uuid>`).
 *
 * TODO(Resource #14): share a single channel per (table, filter) at the
 * AuthProvider level and fan out to subscribers — right now every hook
 * instance opens its own channel, which will hit the 100-channel Supabase
 * cap quickly on list screens. The shared-cache below is a minimum viable
 * refcount; the full fix lives with a context-level manager.
 */

interface SharedChannelEntry {
  channel: ReturnType<typeof supabase.channel>;
  listeners: Set<() => void>;
  refCount: number;
}

const sharedChannels = new Map<string, SharedChannelEntry>();

function acquireSharedChannel(
  table: 'clips' | 'templates',
  filter: string | undefined,
  listener: () => void,
): () => void {
  const key = `${table}::${filter ?? ''}`;
  let entry = sharedChannels.get(key);
  if (!entry) {
    const listeners = new Set<() => void>();
    const channel = supabase
      .channel(`shared-${table}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        () => {
          for (const cb of listeners) cb();
        },
      )
      .subscribe();
    entry = { channel, listeners, refCount: 0 };
    sharedChannels.set(key, entry);
  }
  entry.listeners.add(listener);
  entry.refCount += 1;
  return () => {
    const e = sharedChannels.get(key);
    if (!e) return;
    e.listeners.delete(listener);
    e.refCount -= 1;
    if (e.refCount <= 0) {
      supabase.removeChannel(e.channel);
      sharedChannels.delete(key);
    }
  };
}

function useLiveRefresh(
  table: 'clips' | 'templates',
  refresh: () => void,
  filter?: string,
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const release = acquireSharedChannel(table, filter, () =>
      refreshRef.current(),
    );
    return release;
  }, [table, filter]);
}

function useClipsLiveRefresh(refresh: () => void, filter?: string): void {
  useLiveRefresh('clips', refresh, filter);
}

export interface AsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Generic async runner that cancels in-flight results on unmount or dep
 * change. Creates a fresh `AbortController` per run and passes `signal` into
 * the async function if it accepts one (so `fetch`/Supabase can bail), and
 * uses a monotonic tick counter to ignore stale resolves from superseded
 * runs.
 */
export function useAsync<T>(
  run: (signal?: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    tickRef.current += 1;
    const myTick = tickRef.current;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(() => run(controller.signal))
      .then((result) => {
        if (tickRef.current !== myTick) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (tickRef.current !== myTick) return;
        // AbortError on unmount/dep-change is expected — drop silently.
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, refresh };
}

// ---------- empty placeholder for unauthenticated callers ----------

function emptyResult<T>(): AsyncResult<T> {
  return { data: null, loading: false, error: null, refresh: () => {} };
}

// ---------- Named hooks ----------

export function useClasses(): AsyncResult<ClassWithCounts[]> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const result = useAsync<ClassWithCounts[]>(
    () => {
      if (!userId) return Promise.resolve([]);
      return fetchClasses(userId);
    },
    [userId],
  );
  if (!userId) return emptyResult();
  return result;
}

export function useClass(id: string | undefined): AsyncResult<Row<'classes'>> {
  const result = useAsync<Row<'classes'> | null>(
    () => {
      if (!id) return Promise.resolve(null);
      return fetchClass(id);
    },
    [id],
  );
  return result as AsyncResult<Row<'classes'>>;
}

export function useTopicsForClass(
  classId: string | undefined,
): AsyncResult<TopicWithClipCount[]> {
  const result = useAsync<TopicWithClipCount[]>(
    () => {
      if (!classId) return Promise.resolve([]);
      return fetchTopicsForClass(classId);
    },
    [classId],
  );
  return result;
}

export function useTopic(id: string | undefined): AsyncResult<Row<'topics'>> {
  const result = useAsync<Row<'topics'> | null>(
    () => {
      if (!id) return Promise.resolve(null);
      return fetchTopic(id);
    },
    [id],
  );
  return result as AsyncResult<Row<'topics'>>;
}

export function useClipsForTopic(
  topicId: string | undefined,
): AsyncResult<Row<'clips'>[]> {
  const result = useAsync<Row<'clips'>[]>(
    () => {
      if (!topicId) return Promise.resolve([]);
      return fetchClipsForTopic(topicId);
    },
    [topicId],
  );
  useClipsLiveRefresh(result.refresh, topicId ? `topic_id=eq.${topicId}` : undefined);
  return result;
}

export function useClipsForClass(
  classId: string | undefined,
): AsyncResult<Row<'clips'>[]> {
  const result = useAsync<Row<'clips'>[]>(
    () => {
      if (!classId) return Promise.resolve([]);
      return fetchClipsForClass(classId);
    },
    [classId],
  );
  useClipsLiveRefresh(result.refresh);
  return result;
}

export function useClip(id: string | undefined): AsyncResult<ClipWithClass> {
  const result = useAsync<ClipWithClass | null>(
    () => {
      if (!id) return Promise.resolve(null);
      return fetchClip(id);
    },
    [id],
  );
  useClipsLiveRefresh(
    result.refresh as () => void,
    id ? `id=eq.${id}` : undefined,
  );
  return result as AsyncResult<ClipWithClass>;
}

export function useTemplatesForClass(
  classId: string | undefined,
): AsyncResult<Row<'templates'>[]> {
  const result = useAsync<Row<'templates'>[]>(
    () => {
      if (!classId) return Promise.resolve([]);
      return fetchTemplatesForClass(classId);
    },
    [classId],
  );
  useLiveRefresh(
    'templates',
    result.refresh,
    classId ? `class_id=eq.${classId}` : undefined,
  );
  return result;
}

export function useTemplatesForUser(): AsyncResult<Row<'templates'>[]> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const result = useAsync<Row<'templates'>[]>(
    () => {
      if (!userId) return Promise.resolve([]);
      return fetchTemplatesForUser(userId);
    },
    [userId],
  );
  useLiveRefresh('templates', result.refresh);
  if (!userId) return emptyResult();
  return result;
}

export function useTemplate(
  id: string | undefined,
): AsyncResult<Row<'templates'>> {
  const result = useAsync<Row<'templates'> | null>(
    () => {
      if (!id) return Promise.resolve(null);
      return fetchTemplate(id);
    },
    [id],
  );
  useLiveRefresh(
    'templates',
    result.refresh as () => void,
    id ? `id=eq.${id}` : undefined,
  );
  return result as AsyncResult<Row<'templates'>>;
}

export function useFeed(limit = 30): AsyncResult<Row<'clips'>[]> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const result = useAsync<Row<'clips'>[]>(
    () => {
      if (!userId) return Promise.resolve([]);
      return fetchFeed(userId, limit);
    },
    [userId, limit],
  );
  useClipsLiveRefresh(result.refresh);
  if (!userId) return emptyResult();
  return result;
}

export function useActivity(limit = 24): AsyncResult<Row<'activity'>[]> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const result = useAsync<Row<'activity'>[]>(
    () => {
      if (!userId) return Promise.resolve([]);
      return fetchActivity(userId, limit);
    },
    [userId, limit],
  );
  if (!userId) return emptyResult();
  return result;
}

export function useProfileStats(): AsyncResult<{
  clipCount: number;
  classCount: number;
  topicCount: number;
}> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const result = useAsync<{
    clipCount: number;
    classCount: number;
    topicCount: number;
  }>(
    () => {
      if (!userId)
        return Promise.resolve({
          clipCount: 0,
          classCount: 0,
          topicCount: 0,
        });
      return fetchProfileStats(userId);
    },
    [userId],
  );
  if (!userId) return emptyResult();
  return result;
}
