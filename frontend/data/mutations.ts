// Write operations against Supabase.
// Every mutation auto-fills user_id from the current auth session.
// Throws on Supabase error — callers must handle.

import { supabase } from '@/lib/supabase';
import { palette } from '@/constants/tokens';
import { generate as apiGenerate } from '@/services/api';
import type { Insert, Row, Update } from '@/types/supabase';

// ---------- auth helper ----------

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

// ---------- Profile ----------

/**
 * Patch the `profiles` row for a user. Email changes go through
 * `supabase.auth.updateUser` first — Supabase owns the canonical email on
 * `auth.users`, and our `profiles` table doesn't carry a mirror column, so
 * the auth write is the one and only write needed for email.
 *
 * Password changes are intentionally NOT handled here — call
 * `updatePassword` separately so it can't silently piggy-back on a profile
 * edit.
 */
export async function updateProfile(
  userId: string,
  patch: {
    username?: string;
    email?: string;
    avatar_url?: string | null;
  },
): Promise<void> {
  if (patch.email !== undefined) {
    const { error: authErr } = await supabase.auth.updateUser({
      email: patch.email,
    });
    if (authErr) throw authErr;
  }

  const update: Update<'profiles'> = {};
  if (patch.username !== undefined) update.username = patch.username;
  if (patch.avatar_url !== undefined) update.avatar_url = patch.avatar_url;

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', userId);
  if (error) throw error;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
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
  await logActivity('created_class', data.id, `Created class: ${data.name}`)
    .catch(() => {});
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
  await logActivity('created_topic', data.id, `Created topic: ${data.name}`)
    .catch(() => {});
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

// ---------- Templates ----------

/**
 * Snapshot a completed job's sfx manifest + video_analysis (and the source
 * clip's style_dna, if present) into a new template row. The snapshots are
 * copies — deleting the source job/clip later leaves the template intact.
 *
 * Shape note: `sfx_manifest` is stored as `{ items: SfxItem[] }` — i.e.
 * just the SFX portion of `jobs.audio_manifest`, not the whole audio blob.
 * Downstream readers (SFX review, generation) only know how to read the
 * items key, so writing the full audio manifest here would break them.
 */
export async function createTemplateFromJob(input: {
  jobId: string;
  classId?: string | null;
  name: string;
  description?: string | null;
}): Promise<Row<'templates'>> {
  const user_id = await requireUserId();

  // Pull the job's manifests + style_dna in one trip. The clip lookup below
  // is only for thumbnail/duration metadata when the source happens to be a
  // saved clip — style_dna now lives on the job row itself (see worker's
  // final update), so URL-sourced jobs carry it too.
  const { data: job, error: je } = await supabase
    .from('jobs')
    .select(
      'id, clip_id, audio_manifest, video_analysis, style_dna, clip_context, source_url',
    )
    .eq('id', input.jobId)
    .maybeSingle();
  if (je) throw je;
  if (!job) throw new Error(`Job ${input.jobId} not found`);

  let style_dna: Row<'templates'>['style_dna'] = job.style_dna ?? null;
  let source_clip_id: string | null = job.clip_id ?? null;
  let thumbnail_color: string | null = null;
  let duration_s: number | null = null;
  if (source_clip_id) {
    const { data: clip, error: ce } = await supabase
      .from('clips')
      .select('style_dna, thumbnail_color, duration_s')
      .eq('id', source_clip_id)
      .maybeSingle();
    if (ce) throw ce;
    if (clip) {
      if (!style_dna) style_dna = clip.style_dna;
      thumbnail_color = clip.thumbnail_color;
      duration_s = clip.duration_s;
    }
  }

  // Narrow the audio_manifest down to just the SFX slice. Backend shapes:
  //   audio_manifest = { sfx: { items: [...] }, voices: {...}, ... }
  // Template consumers only look at sfx_manifest.items, so we hand them
  // exactly that sub-object (or null if the job didn't produce SFX).
  const am = (job.audio_manifest ?? null) as
    | { sfx?: unknown }
    | null;
  const sfx_manifest = am && typeof am === 'object' ? am.sfx ?? null : null;

  const payload: Insert<'templates'> = {
    user_id,
    class_id: input.classId ?? null,
    source_clip_id,
    source_job_id: job.id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    sfx_manifest: sfx_manifest as Insert<'templates'>['sfx_manifest'],
    video_analysis: job.video_analysis,
    style_dna,
    thumbnail_color,
    duration_s,
  };

  const { data, error } = await supabase
    .from('templates')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  await logActivity('saved', data.id, `Saved template: ${data.name}`)
    .catch(() => {});
  return data;
}

export async function updateTemplate(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    classId?: string | null;
  },
): Promise<Row<'templates'>> {
  const update: Update<'templates'> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.classId !== undefined) update.class_id = patch.classId;
  const { data, error } = await supabase
    .from('templates')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Kick off a template-driven generation job on the backend.
 *
 * The backend now owns both the clip row and job row for the generate path
 * — we POST `/generate` with the template + topic context and get back the
 * `{ clipId, jobId }` pair the generation screen subscribes to.
 *
 * `classId` is optional; when omitted the server falls back to the template's
 * own `class_id`. `topic` is the natural-language prompt ("Pythagorean
 * theorem"), distinct from `title` which is the displayed clip name.
 */
export async function generateClipFromTemplate(input: {
  templateId: string;
  topicId: string;
  title: string;
  topic: string;
  classId?: string | null;
}): Promise<{ clipId: string; jobId: string }> {
  const res = await apiGenerate({
    templateId: input.templateId,
    topicId: input.topicId,
    classId: input.classId ?? null,
    title: input.title.trim(),
    topic: input.topic.trim(),
  });
  return { clipId: res.clip_id, jobId: res.job_id };
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
 * Find-or-create a topic inside a specific class. Used when we have a class
 * context (e.g. generating a clip from a template filed under that class) but
 * no specific topic — we pick the first topic of the class, or create a
 * default "Clips" topic if the class is empty.
 */
export async function ensureTopicInClass(
  classId: string,
  topicName = 'Clips',
): Promise<{ topicId: string }> {
  const user_id = await requireUserId();

  const { data: existing, error: fe } = await supabase
    .from('topics')
    .select('id')
    .eq('class_id', classId)
    .eq('user_id', user_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (fe) throw fe;
  if (existing) return { topicId: existing.id };

  const { data, error } = await supabase
    .from('topics')
    .insert({
      user_id,
      class_id: classId,
      name: topicName,
    } satisfies Insert<'topics'>)
    .select('id')
    .single();
  if (error) throw error;
  return { topicId: data.id };
}

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
