// Read-only SELECT functions against Supabase.
// Throws on any Supabase error — callers (hooks) surface them.

import { supabase } from '@/lib/supabase';
import type { Row } from '@/types/supabase';

export type ClassWithCounts = Row<'classes'> & {
  topic_count: number;
  clip_count: number;
};

export type TopicWithClipCount = Row<'topics'> & {
  clip_count: number;
};

// ------- Classes -------

export async function fetchClasses(
  userId: string,
): Promise<ClassWithCounts[]> {
  // Single round-trip using relational count aggregates.
  const { data, error } = await supabase
    .from('classes')
    .select('*, topics(count), clips(count)')
    .eq('user_id', userId)
    .order('last_active_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data) return [];

  return data.map((row: any) => {
    const topicCount = Array.isArray(row.topics)
      ? Number(row.topics[0]?.count ?? 0)
      : 0;
    const clipCount = Array.isArray(row.clips)
      ? Number(row.clips[0]?.count ?? 0)
      : 0;
    const { topics, clips, ...rest } = row;
    return {
      ...(rest as Row<'classes'>),
      topic_count: topicCount,
      clip_count: clipCount,
    };
  });
}

export async function fetchClass(id: string): Promise<Row<'classes'> | null> {
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ------- Topics -------

export async function fetchTopicsForClass(
  classId: string,
): Promise<TopicWithClipCount[]> {
  const { data, error } = await supabase
    .from('topics')
    .select('*, clips(count)')
    .eq('class_id', classId)
    .order('last_studied_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data) return [];

  return data.map((row: any) => {
    const clipCount = Array.isArray(row.clips)
      ? Number(row.clips[0]?.count ?? 0)
      : 0;
    const { clips, ...rest } = row;
    return {
      ...(rest as Row<'topics'>),
      clip_count: clipCount,
    };
  });
}

export async function fetchTopic(id: string): Promise<Row<'topics'> | null> {
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ------- Clips -------

export async function fetchClipsForTopic(
  topicId: string,
): Promise<Row<'clips'>[]> {
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchClip(id: string): Promise<Row<'clips'> | null> {
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ------- Feed -------

export async function fetchFeed(
  userId: string,
  limit = 30,
): Promise<Row<'clips'>[]> {
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ------- Activity -------

export async function fetchActivity(
  userId: string,
  limit = 24,
): Promise<Row<'activity'>[]> {
  const { data, error } = await supabase
    .from('activity')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ------- Profile stats -------

export async function fetchProfileStats(userId: string): Promise<{
  clipCount: number;
  classCount: number;
  topicCount: number;
}> {
  const [clipRes, classRes, topicRes] = await Promise.all([
    supabase
      .from('clips')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('topics')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  if (clipRes.error) throw clipRes.error;
  if (classRes.error) throw classRes.error;
  if (topicRes.error) throw topicRes.error;

  return {
    clipCount: clipRes.count ?? 0,
    classCount: classRes.count ?? 0,
    topicCount: topicRes.count ?? 0,
  };
}
