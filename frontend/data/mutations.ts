// Write operations against Supabase.
// Every mutation auto-fills user_id from the current auth session.
// Throws on Supabase error — callers must handle.

import { supabase } from '@/lib/supabase';
import { palette } from '@/constants/tokens';
import type { Insert, Row, Update } from '@/types/supabase';

// ---------- auth helper ----------

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

// ---------- Classes ----------

export async function createClass(input: {
  name: string;
  colorHex?: string;
  description?: string;
}): Promise<Row<'classes'>> {
  const user_id = await requireUserId();
  const payload: Insert<'classes'> = {
    user_id,
    name: input.name.trim(),
    color_hex: input.colorHex ?? palette.sage,
    description: input.description ?? null,
  };
  const { data, error } = await supabase
    .from('classes')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClass(
  id: string,
  patch: {
    name?: string;
    colorHex?: string;
    description?: string;
    lastActiveAt?: string;
  },
): Promise<Row<'classes'>> {
  const update: Update<'classes'> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.colorHex !== undefined) update.color_hex = patch.colorHex;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.lastActiveAt !== undefined) update.last_active_at = patch.lastActiveAt;
  const { data, error } = await supabase
    .from('classes')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Topics ----------

export async function createTopic(input: {
  classId: string;
  name: string;
  description?: string;
}): Promise<Row<'topics'>> {
  const user_id = await requireUserId();
  const payload: Insert<'topics'> = {
    user_id,
    class_id: input.classId,
    name: input.name.trim(),
    description: input.description ?? null,
  };
  const { data, error } = await supabase
    .from('topics')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTopic(
  id: string,
  patch: {
    name?: string;
    description?: string;
    progress?: number;
    lastStudiedAt?: string;
  },
): Promise<Row<'topics'>> {
  const update: Update<'topics'> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.progress !== undefined) update.progress = patch.progress;
  if (patch.lastStudiedAt !== undefined) update.last_studied_at = patch.lastStudiedAt;
  const { data, error } = await supabase
    .from('topics')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTopic(id: string): Promise<void> {
  const { error } = await supabase.from('topics').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Clips ----------

export async function createClip(
  input: Omit<Insert<'clips'>, 'user_id'>,
): Promise<Row<'clips'>> {
  const user_id = await requireUserId();
  const payload: Insert<'clips'> = { ...input, user_id };
  const { data, error } = await supabase
    .from('clips')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClip(id: string): Promise<void> {
  const { error } = await supabase.from('clips').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Jobs ----------

export async function createJob(
  input: Omit<Insert<'jobs'>, 'user_id'>,
): Promise<Row<'jobs'>> {
  const user_id = await requireUserId();
  const payload: Insert<'jobs'> = { ...input, user_id };
  const { data, error } = await supabase
    .from('jobs')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteJob(id: string): Promise<void> {
  const { error } = await supabase.from('jobs').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Activity ----------

export async function logActivity(
  kind: Row<'activity'>['kind'],
  refId?: string,
  message?: string,
): Promise<void> {
  const user_id = await requireUserId();
  const payload: Insert<'activity'> = {
    user_id,
    kind,
    ref_id: refId ?? null,
    message: message ?? null,
  };
  const { error } = await supabase.from('activity').insert(payload);
  if (error) throw error;
}

// ---------- Unsorted helper ----------

/**
 * Find-or-create the user's "Unsorted" class + topic pair.
 * Used by generation when no explicit class/topic is provided.
 */
export async function ensureUnsortedTopic(topicName?: string): Promise<{
  classId: string;
  topicId: string;
}> {
  const user_id = await requireUserId();

  // 1) find-or-create Unsorted class
  const { data: existingClass, error: fc } = await supabase
    .from('classes')
    .select('*')
    .eq('user_id', user_id)
    .eq('name', 'Unsorted')
    .maybeSingle();
  if (fc) throw fc;

  let cls: Row<'classes'>;
  if (existingClass) {
    cls = existingClass;
  } else {
    const { data, error } = await supabase
      .from('classes')
      .insert({
        user_id,
        name: 'Unsorted',
        color_hex: palette.fog,
        description: 'Odds and ends, not yet shelved.',
      } satisfies Insert<'classes'>)
      .select()
      .single();
    if (error) throw error;
    cls = data;
  }

  // 2) find-or-create topic with `topicName` inside the class
  const name = (topicName ?? 'Loose ends').trim() || 'Loose ends';
  const { data: existingTopic, error: ft } = await supabase
    .from('topics')
    .select('*')
    .eq('user_id', user_id)
    .eq('class_id', cls.id)
    .eq('name', name)
    .maybeSingle();
  if (ft) throw ft;

  let topic: Row<'topics'>;
  if (existingTopic) {
    topic = existingTopic;
  } else {
    const { data, error } = await supabase
      .from('topics')
      .insert({
        user_id,
        class_id: cls.id,
        name,
      } satisfies Insert<'topics'>)
      .select()
      .single();
    if (error) throw error;
    topic = data;
  }

  return { classId: cls.id, topicId: topic.id };
}

// ---------- Seed ----------

const SEED_CLASSES: {
  name: string;
  colorHex: string;
  description: string;
}[] = [
  {
    name: 'Biology',
    colorHex: palette.sage,
    description: 'the wet machinery of things.',
  },
  {
    name: 'Finance',
    colorHex: palette.gold,
    description: 'time, compounded.',
  },
  {
    name: 'Philosophy',
    colorHex: palette.tealBright,
    description: 'the examined life, in reel form.',
  },
];

const SEED_TOPICS: Record<string, { name: string; description: string; clips: {
  title: string;
  duration_s: number;
  source_creator: string;
  source_platform: string;
  thumbnail_color: string;
}[] }[]> = {
  Biology: [
    {
      name: 'Krebs Cycle',
      description: 'The wheel that turns food into ATP.',
      clips: [
        {
          title: 'Krebs Cycle in one breath',
          duration_s: 27,
          source_creator: '@mryummy',
          source_platform: 'TikTok',
          thumbnail_color: palette.tealDeep,
        },
        {
          title: 'Krebs Cycle, part II',
          duration_s: 32,
          source_creator: '@sciencevisualised',
          source_platform: 'Instagram',
          thumbnail_color: palette.teal,
        },
      ],
    },
    {
      name: 'Photosynthesis',
      description: 'Leaves as wet solar panels.',
      clips: [
        {
          title: 'Photosynthesis — the fast version',
          duration_s: 28,
          source_creator: '@mryummy',
          source_platform: 'TikTok',
          thumbnail_color: palette.tealDeep,
        },
      ],
    },
    {
      name: 'Mitosis',
      description: 'One cell becomes two, identically.',
      clips: [
        {
          title: 'Mitosis in 30s',
          duration_s: 30,
          source_creator: '@nerdysundays',
          source_platform: 'YouTube',
          thumbnail_color: palette.inkElevated,
        },
      ],
    },
  ],
  Finance: [
    {
      name: 'Compound Interest',
      description: 'The graph bends, then launches.',
      clips: [
        {
          title: 'Compound Interest, explained',
          duration_s: 31,
          source_creator: '@aliabdaal',
          source_platform: 'YouTube',
          thumbnail_color: '#3A2E1E',
        },
        {
          title: 'Compound Interest: the fast version',
          duration_s: 24,
          source_creator: '@humphreytalks',
          source_platform: 'TikTok',
          thumbnail_color: '#2A2618',
        },
      ],
    },
    {
      name: 'Options Greeks',
      description: 'Delta, gamma, theta, vega.',
      clips: [
        {
          title: 'Options Greeks in one breath',
          duration_s: 33,
          source_creator: '@aliabdaal',
          source_platform: 'YouTube',
          thumbnail_color: '#2A2618',
        },
      ],
    },
    {
      name: 'Inflation',
      description: 'Why a dollar shrinks while you sleep.',
      clips: [
        {
          title: 'Inflation — a second look',
          duration_s: 26,
          source_creator: '@jackbutcher',
          source_platform: 'Instagram',
          thumbnail_color: '#5A4730',
        },
      ],
    },
  ],
  Philosophy: [
    {
      name: 'Stoicism Primer',
      description: 'The obstacle is the way.',
      clips: [
        {
          title: 'Stoicism Primer',
          duration_s: 24,
          source_creator: '@philosopherclip',
          source_platform: 'Instagram',
          thumbnail_color: '#1A3A3A',
        },
        {
          title: 'Stoicism Primer, part II',
          duration_s: 28,
          source_creator: '@theschooloflife',
          source_platform: 'YouTube',
          thumbnail_color: palette.tealBright,
        },
      ],
    },
    {
      name: 'Plato on Forms',
      description: 'Shadows on the cave wall.',
      clips: [
        {
          title: 'Plato on Forms in 30s',
          duration_s: 30,
          source_creator: '@letterstolucian',
          source_platform: 'TikTok',
          thumbnail_color: '#2A4A4A',
        },
      ],
    },
  ],
};

/**
 * Populate a fresh account with three classes, a handful of topics and
 * clips, plus two weeks of activity — enough to demo the full shelf UX.
 */
export async function seedDemoShelf(): Promise<void> {
  const user_id = await requireUserId();

  const now = new Date();

  for (const cls of SEED_CLASSES) {
    // Skip if this class already exists for user.
    const { data: existing } = await supabase
      .from('classes')
      .select('id')
      .eq('user_id', user_id)
      .eq('name', cls.name)
      .maybeSingle();
    if (existing) continue;

    const { data: createdClass, error: ce } = await supabase
      .from('classes')
      .insert({
        user_id,
        name: cls.name,
        color_hex: cls.colorHex,
        description: cls.description,
        last_active_at: now.toISOString(),
      } satisfies Insert<'classes'>)
      .select()
      .single();
    if (ce) throw ce;

    const topics = SEED_TOPICS[cls.name] ?? [];
    for (const t of topics) {
      const { data: createdTopic, error: te } = await supabase
        .from('topics')
        .insert({
          user_id,
          class_id: createdClass.id,
          name: t.name,
          description: t.description,
          progress: Math.random() * 0.8 + 0.1,
          last_studied_at: now.toISOString(),
        } satisfies Insert<'topics'>)
        .select()
        .single();
      if (te) throw te;

      if (t.clips.length) {
        const clipPayload: Insert<'clips'>[] = t.clips.map((c) => ({
          user_id,
          topic_id: createdTopic.id,
          title: c.title,
          duration_s: c.duration_s,
          source_creator: c.source_creator,
          source_platform: c.source_platform,
          thumbnail_color: c.thumbnail_color,
          status: 'ready',
        }));
        const { error: cle } = await supabase.from('clips').insert(clipPayload);
        if (cle) throw cle;
      }
    }
  }

  // Activity backfill: ~10 rows scattered across the last 18 days.
  const activityPayload: Insert<'activity'>[] = [];
  const kinds: Row<'activity'>['kind'][] = [
    'studied',
    'generated',
    'studied',
    'saved',
    'studied',
    'generated',
    'created_topic',
    'studied',
    'generated',
    'studied',
  ];
  kinds.forEach((kind, i) => {
    const daysAgo = (i * 17) % 18; // deterministic spread
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    d.setUTCHours(9 + (i * 3) % 12, 0, 0, 0);
    activityPayload.push({
      user_id,
      kind,
      message:
        kind === 'generated'
          ? 'Generated a new clip'
          : kind === 'studied'
            ? 'Studied a clip'
            : kind === 'saved'
              ? 'Saved a clip'
              : 'Created a topic',
      occurred_at: d.toISOString(),
    });
  });
  const { error: ae } = await supabase.from('activity').insert(activityPayload);
  if (ae) throw ae;
}
