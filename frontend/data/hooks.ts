// React hooks for async Supabase queries. No third-party cache —
// useState + useEffect + abort-on-unmount.

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import {
  fetchActivity,
  fetchClass,
  fetchClasses,
  fetchClip,
  fetchClipsForTopic,
  fetchFeed,
  fetchProfileStats,
  fetchStreakGrid,
  fetchTopic,
  fetchTopicsForClass,
  type ClassWithCounts,
  type StreakDay,
  type TopicWithClipCount,
} from '@/data/queries';
import type { Row } from '@/types/supabase';

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
  return useAsync<Row<'clips'>[]>(
    () => {
      if (!topicId) return Promise.resolve([]);
      return fetchClipsForTopic(topicId);
    },
    [topicId],
  );
}

export function useClip(id: string | undefined): AsyncResult<Row<'clips'>> {
  const result = useAsync<Row<'clips'> | null>(
    () => {
      if (!id) return Promise.resolve(null);
      return fetchClip(id);
    },
    [id],
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
  streakDays: number;
}> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const result = useAsync<{
    clipCount: number;
    classCount: number;
    topicCount: number;
    streakDays: number;
  }>(
    () => {
      if (!userId)
        return Promise.resolve({
          clipCount: 0,
          classCount: 0,
          topicCount: 0,
          streakDays: 0,
        });
      return fetchProfileStats(userId);
    },
    [userId],
  );
  if (!userId) return emptyResult();
  return result;
}

export function useStreakGrid(weeks = 16): AsyncResult<StreakDay[]> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const result = useAsync<StreakDay[]>(
    () => {
      if (!userId) return Promise.resolve([]);
      return fetchStreakGrid(userId, weeks);
    },
    [userId, weeks],
  );
  if (!userId) return emptyResult();
  return result;
}
