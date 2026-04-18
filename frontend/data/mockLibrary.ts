// Design seed templates — consumed by data/seed.ts to populate new accounts. Not imported by UI.

import { palette } from '@/constants/tokens';
import { DEFAULT_DNA, type DNAToken } from '@/components/brand/StyleDNA';

// -------------------- Types --------------------

export type ClassName = 'Biology' | 'Finance' | 'History' | 'Philosophy';

export interface ReelizeClass {
  id: string;
  name: ClassName;
  classColor: string;
  topicCount: number;
  clipCount: number;
  streakDays: number;
  recentTopics: string[];
  recentClipColors: string[];
  lastActiveAt: string; // ISO
  createdAt: string; // ISO
  tagline: string; // italic serif subtext
}

export interface Topic {
  id: string;
  classId: string;
  name: string;
  description: string;
  clipCount: number;
  progress: number; // 0..1
  lastStudied: string; // ISO
  estMinutes: number;
}

export interface Clip {
  id: string;
  topicId: string;
  classId: string;
  title: string;
  duration: string; // "0:30"
  durationMs: number;
  sourceCreator: string;
  generatedAt: string; // ISO
  thumbnailColor: string;
  styleDNA: DNAToken[];
}

export interface ActivityEntry {
  id: string;
  kind: 'studied' | 'generated' | 'saved' | 'streak';
  label: string;
  detail?: string;
  at: string; // ISO
}

export interface StreakDay {
  date: string; // YYYY-MM-DD
  intensity: 0 | 1 | 2 | 3 | 4; // 0 = no activity
}

// -------------------- Helpers --------------------

function perturb(base: DNAToken[], seed: number): DNAToken[] {
  return base.map((t, i) => {
    const jitter = (((seed + i * 7) % 13) - 6) / 100; // -0.06 .. +0.06
    const v = Math.max(0.08, Math.min(0.98, t.intensity + jitter));
    return { ...t, intensity: v };
  });
}

function isoDaysAgo(days: number, hour = 10): string {
  const d = new Date('2026-04-17T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 12, 0, 0);
  return d.toISOString();
}

function dateKey(daysAgo: number): string {
  const d = new Date('2026-04-17T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// -------------------- Classes --------------------

export const MOCK_CLASSES: ReelizeClass[] = [
  {
    id: 'cls-biology',
    name: 'Biology',
    classColor: palette.sage,
    topicCount: 6,
    clipCount: 18,
    streakDays: 4,
    recentTopics: ['Krebs Cycle', 'Photosynthesis', 'Mitosis'],
    recentClipColors: [palette.tealDeep, palette.teal, palette.sage, palette.inkElevated],
    lastActiveAt: isoDaysAgo(0, 21),
    createdAt: isoDaysAgo(41, 10),
    tagline: 'the wet machinery of things.',
  },
  {
    id: 'cls-finance',
    name: 'Finance',
    classColor: palette.gold,
    topicCount: 5,
    clipCount: 14,
    streakDays: 2,
    recentTopics: ['Compound Interest', 'Options Greeks', 'Inflation'],
    recentClipColors: ['#3A2E1E', '#2A2618', palette.gold, '#5A4730'],
    lastActiveAt: isoDaysAgo(1, 22),
    createdAt: isoDaysAgo(33, 11),
    tagline: 'time, compounded.',
  },
  {
    id: 'cls-history',
    name: 'History',
    classColor: palette.alert,
    topicCount: 4,
    clipCount: 12,
    streakDays: 0,
    recentTopics: ['Why Rome Fell', 'The Silk Road', 'Industrial Revolution'],
    recentClipColors: ['#3A1A14', '#5A2418', palette.alert, '#2A1410'],
    lastActiveAt: isoDaysAgo(3, 14),
    createdAt: isoDaysAgo(28, 9),
    tagline: 'everything that came before.',
  },
  {
    id: 'cls-philosophy',
    name: 'Philosophy',
    classColor: palette.tealBright,
    topicCount: 3,
    clipCount: 12,
    streakDays: 1,
    recentTopics: ['Stoicism Primer', 'Plato on Forms', 'Wittgenstein'],
    recentClipColors: ['#1A3A3A', palette.tealBright, palette.teal, '#2A4A4A'],
    lastActiveAt: isoDaysAgo(2, 20),
    createdAt: isoDaysAgo(22, 8),
    tagline: 'the examined life, in reel form.',
  },
];

// -------------------- Topics --------------------

type RawTopic = Omit<Topic, 'classId' | 'id'> & { slug: string };

const TOPICS_BY_CLASS: Record<string, RawTopic[]> = {
  'cls-biology': [
    { slug: 'krebs-cycle', name: 'Krebs Cycle', description: 'The wheel that turns food into ATP.', clipCount: 4, progress: 0.82, lastStudied: isoDaysAgo(0, 21), estMinutes: 6 },
    { slug: 'photosynthesis', name: 'Photosynthesis', description: 'Leaves as wet solar panels.', clipCount: 3, progress: 0.61, lastStudied: isoDaysAgo(1, 19), estMinutes: 4 },
    { slug: 'mitosis', name: 'Mitosis', description: 'One cell becomes two, identically.', clipCount: 3, progress: 0.45, lastStudied: isoDaysAgo(3, 17), estMinutes: 5 },
    { slug: 'dna-replication', name: 'DNA Replication', description: 'The copy-editor of the genome.', clipCount: 3, progress: 0.30, lastStudied: isoDaysAgo(6, 11), estMinutes: 5 },
    { slug: 'neuron-firing', name: 'Neuron Firing', description: 'Sodium, potassium, and the spark.', clipCount: 3, progress: 0.18, lastStudied: isoDaysAgo(9, 10), estMinutes: 4 },
    { slug: 'natural-selection', name: 'Natural Selection', description: 'Why the lucky ones leave children.', clipCount: 2, progress: 0.0, lastStudied: isoDaysAgo(14, 16), estMinutes: 3 },
  ],
  'cls-finance': [
    { slug: 'compound-interest', name: 'Compound Interest', description: 'The graph bends, then launches.', clipCount: 4, progress: 0.92, lastStudied: isoDaysAgo(1, 22), estMinutes: 5 },
    { slug: 'options-greeks', name: 'Options Greeks', description: 'Delta, gamma, theta, vega.', clipCount: 3, progress: 0.55, lastStudied: isoDaysAgo(4, 20), estMinutes: 6 },
    { slug: 'inflation', name: 'Inflation', description: 'Why a dollar shrinks while you sleep.', clipCount: 3, progress: 0.42, lastStudied: isoDaysAgo(7, 18), estMinutes: 4 },
    { slug: 'bond-duration', name: 'Bond Duration', description: 'The seesaw of rates and prices.', clipCount: 2, progress: 0.14, lastStudied: isoDaysAgo(11, 15), estMinutes: 5 },
    { slug: 'dcf-basics', name: 'DCF Basics', description: 'Future cash, today\u2019s dollars.', clipCount: 2, progress: 0.0, lastStudied: isoDaysAgo(18, 13), estMinutes: 6 },
  ],
  'cls-history': [
    { slug: 'why-rome-fell', name: 'Why Rome Fell', description: 'Empires die bored, not loud.', clipCount: 4, progress: 0.70, lastStudied: isoDaysAgo(3, 14), estMinutes: 5 },
    { slug: 'silk-road', name: 'The Silk Road', description: 'Goods, germs, and ideas on the move.', clipCount: 3, progress: 0.38, lastStudied: isoDaysAgo(6, 12), estMinutes: 6 },
    { slug: 'industrial-revolution', name: 'Industrial Revolution', description: 'Steam and the rearranging of lives.', clipCount: 3, progress: 0.22, lastStudied: isoDaysAgo(10, 11), estMinutes: 5 },
    { slug: 'french-revolution', name: 'French Revolution', description: 'When the bread ran out.', clipCount: 2, progress: 0.0, lastStudied: isoDaysAgo(20, 16), estMinutes: 5 },
  ],
  'cls-philosophy': [
    { slug: 'stoicism-primer', name: 'Stoicism Primer', description: 'The obstacle is the way.', clipCount: 5, progress: 0.88, lastStudied: isoDaysAgo(2, 20), estMinutes: 5 },
    { slug: 'plato-forms', name: 'Plato on Forms', description: 'Shadows on the cave wall.', clipCount: 4, progress: 0.50, lastStudied: isoDaysAgo(5, 19), estMinutes: 4 },
    { slug: 'wittgenstein', name: 'Wittgenstein', description: 'Language as a game with rules.', clipCount: 3, progress: 0.20, lastStudied: isoDaysAgo(12, 17), estMinutes: 6 },
  ],
};

export const MOCK_TOPICS: Topic[] = Object.entries(TOPICS_BY_CLASS).flatMap(([classId, list]) =>
  list.map((t) => ({
    id: `${classId}-${t.slug}`,
    classId,
    name: t.name,
    description: t.description,
    clipCount: t.clipCount,
    progress: t.progress,
    lastStudied: t.lastStudied,
    estMinutes: t.estMinutes,
  })),
);

// -------------------- Clips --------------------

const CREATORS: Record<string, string[]> = {
  'cls-biology': ['@mryummy', '@sciencevisualised', '@nerdysundays'],
  'cls-finance': ['@aliabdaal', '@humphreytalks', '@jackbutcher'],
  'cls-history': ['@theasiancomet', '@historybuff', '@dan_carlin'],
  'cls-philosophy': ['@philosopherclip', '@theschooloflife', '@letterstolucian'],
};

function makeClips(): Clip[] {
  const clips: Clip[] = [];
  let seed = 3;
  MOCK_TOPICS.forEach((topic) => {
    const cls = MOCK_CLASSES.find((c) => c.id === topic.classId)!;
    const creators = CREATORS[topic.classId];
    for (let i = 0; i < topic.clipCount; i++) {
      seed = (seed * 7 + 13) % 97;
      const creator = creators[i % creators.length];
      const durSec = 22 + ((seed * 3) % 18); // 22..39s
      const mm = Math.floor(durSec / 60);
      const ss = durSec % 60;
      const durLabel = `${mm}:${ss.toString().padStart(2, '0')}`;
      const thumbPool = cls.recentClipColors;
      clips.push({
        id: `${topic.id}-clip-${i + 1}`,
        topicId: topic.id,
        classId: topic.classId,
        title: clipTitle(topic.name, i),
        duration: durLabel,
        durationMs: durSec * 1000,
        sourceCreator: creator,
        generatedAt: isoDaysAgo(Math.max(0, 14 - (seed % 14)), 8 + (seed % 12)),
        thumbnailColor: thumbPool[(i + seed) % thumbPool.length],
        styleDNA: perturb(DEFAULT_DNA, seed + i),
      });
    }
  });
  return clips;
}

function clipTitle(topicName: string, i: number): string {
  const suffixes = [
    topicName,
    `${topicName}, part II`,
    `${topicName} \u2014 a second look`,
    `${topicName}: the fast version`,
    `${topicName} in one breath`,
  ];
  return suffixes[i % suffixes.length];
}

export const MOCK_CLIPS: Clip[] = makeClips();

// -------------------- Streak / activity --------------------

export const STREAK_WEEKS = 16; // columns
export const STREAK_DAYS_PER_WEEK = 7;

function buildStreak(): StreakDay[] {
  const totalDays = STREAK_WEEKS * STREAK_DAYS_PER_WEEK;
  const out: StreakDay[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    // pseudo-random but deterministic: busier near present
    const weekIndex = Math.floor(i / STREAK_DAYS_PER_WEEK);
    const recencyBoost = Math.max(0, STREAK_WEEKS - weekIndex) / STREAK_WEEKS; // 0..1
    const noise = ((i * 2654435761) >>> 0) % 100; // 0..99
    const roll = noise + recencyBoost * 45;
    let intensity: StreakDay['intensity'];
    if (roll < 45) intensity = 0;
    else if (roll < 70) intensity = 1;
    else if (roll < 95) intensity = 2;
    else if (roll < 120) intensity = 3;
    else intensity = 4;
    // Last 4 days all active (recent streak)
    if (i <= 3) intensity = Math.max(intensity, 2 + (3 - i)) as StreakDay['intensity'];
    out.push({ date: dateKey(i), intensity });
  }
  return out;
}

export const MOCK_STREAK: StreakDay[] = buildStreak();

export const MOCK_ACTIVITY: ActivityEntry[] = [
  { id: 'a1', kind: 'studied', label: 'Studied Krebs Cycle', detail: '4 clips \u00b7 6m', at: isoDaysAgo(0, 21) },
  { id: 'a2', kind: 'generated', label: 'Generated Compound Interest', detail: 'from @aliabdaal', at: isoDaysAgo(1, 22) },
  { id: 'a3', kind: 'saved', label: 'Saved a clip from @mryummy', detail: 'to Biology', at: isoDaysAgo(1, 14) },
  { id: 'a4', kind: 'studied', label: 'Studied Stoicism Primer', detail: '3 clips \u00b7 5m', at: isoDaysAgo(2, 20) },
  { id: 'a5', kind: 'streak', label: '4-day streak', detail: 'kept the lamp lit', at: isoDaysAgo(2, 9) },
  { id: 'a6', kind: 'generated', label: 'Generated Options Greeks', detail: 'from @aliabdaal', at: isoDaysAgo(4, 20) },
  { id: 'a7', kind: 'studied', label: 'Studied Why Rome Fell', detail: '2 clips \u00b7 3m', at: isoDaysAgo(3, 14) },
];

// -------------------- Selectors --------------------

export function findClass(id: string | undefined): ReelizeClass | undefined {
  if (!id) return undefined;
  return MOCK_CLASSES.find((c) => c.id === id);
}

export function findTopic(id: string | undefined): Topic | undefined {
  if (!id) return undefined;
  return MOCK_TOPICS.find((t) => t.id === id);
}

export function topicsForClass(classId: string): Topic[] {
  return MOCK_TOPICS.filter((t) => t.classId === classId);
}

export function clipsForTopic(topicId: string): Clip[] {
  return MOCK_CLIPS.filter((c) => c.topicId === topicId);
}

export function clipsForClass(classId: string): Clip[] {
  return MOCK_CLIPS.filter((c) => c.classId === classId);
}

export function totalTopics(): number {
  return MOCK_TOPICS.length;
}

export function totalClips(): number {
  return MOCK_CLIPS.length;
}

export function uniqueCreators(classId: string): string[] {
  const set = new Set<string>();
  clipsForClass(classId).forEach((c) => set.add(c.sourceCreator));
  return Array.from(set);
}

export function formatRelative(iso: string, nowIso: string = '2026-04-17T12:00:00Z'): string {
  const then = new Date(iso).getTime();
  const now = new Date(nowIso).getTime();
  const diff = Math.max(0, now - then);
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

export function joinedFormatted(iso: string = '2026-03-02T10:00:00Z'): string {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  return `joined ${month} ${d.getUTCFullYear()}`;
}

export const USER_PROFILE = {
  username: 'isaac.s',
  joinedAt: '2026-03-02T10:00:00Z',
  clipsGenerated: MOCK_CLIPS.length,
  classCount: MOCK_CLASSES.length,
  streak: 4,
};
