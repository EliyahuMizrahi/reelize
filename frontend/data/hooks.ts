// React hooks for async Supabase queries. No third-party cache —
// useState + useEffect + abort-on-unmount.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import {
  fetchActivity,
  fetchClass,
  fetchClasses,
  fetchClip,
  fetchClipsForTopic,
  fetchFeed,
  fetchProfileStats,
  fetchTopic,
  fetchTopicsForClass,
  type ClassWithCounts,
  type TopicWithClipCount,
} from '@/data/queries';
import { supabase } from '@/lib/supabase';
import type { Row } from '@/types/supabase';

/**
 * Subscribe to clips-table changes and invoke `refresh()` on every event.
 * RLS filters the broadcast to only rows the current user owns, so we don't
 * need a user-scoped filter. Pass a Postgres filter string (e.g.
 * `topic_id=eq.<uuid>`) to narrow further.
 */
function useClipsLiveRefresh(refresh: () => void, filter?: string): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const idRef = useRef<string>('');
  if (!idRef.current) idRef.current = Math.random().toString(36).slice(2, 10);

  useEffect(() => {
    const channel = supabase
      .channel(`clips-live-${idRef.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clips',
          ...(filter ? { filter } : {}),
        },
        () => refreshRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter]);
}

export interface AsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Generic async runner that cancels in-flight results on unmount or dep change.
 */
export function useAsync<T>(
  run: () => Promise<T>,
  deps: unknown[],
): AsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    run()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
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

export function useClip(id: string | undefined): AsyncResult<Row<'clips'>> {
  const result = useAsync<Row<'clips'> | null>(
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
  return result as AsyncResult<Row<'clips'>>;
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
