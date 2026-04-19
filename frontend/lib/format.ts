// Shared formatting helpers. Keep type signatures forgiving so screens can
// pass raw ISO strings, Date instances, or null/undefined timestamps without
// wrapping every callsite in guards.

import type { DNAToken } from '@/components/brand/StyleDNA';
import { DEFAULT_DNA } from '@/components/brand/StyleDNA';

type TimestampInput = string | number | Date | null | undefined;

/**
 * Human-friendly relative time string — "just now", "3h ago", "2d ago", etc.
 * Returns '' for nullish input so screens can render nothing when a row
 * has no timestamp yet.
 */
export function formatRelative(input: TimestampInput): string {
  if (input == null) return '';
  const then =
    input instanceof Date
      ? input.getTime()
      : typeof input === 'number'
        ? input
        : new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
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

/**
 * Format a duration in seconds as `m:ss` (e.g. 95 → "1:35").
 */
export function formatDuration(seconds: number | null | undefined): string {
  const sec = Math.max(0, Math.round(Number(seconds ?? 0)));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// Structural type — accepts any template-like row with the fields we touch.
// Using `unknown` for the nested JSON shapes keeps us tolerant of Supabase's
// `Json` type without forcing every caller through a cast.
export interface TemplateLike {
  sfx_manifest?: unknown;
  video_analysis?: unknown;
  duration_s?: number | string | null;
}

/**
 * One-line "what's in this template" summary — e.g. "3 sfx · 5 cuts · 14s".
 * Falls back to "recipe saved" when no parts are populated.
 */
export function summarizeTemplate(template: TemplateLike): string {
  const parts: string[] = [];

  const sfx = template.sfx_manifest as
    | { items?: unknown[]; selected_ids?: unknown[] }
    | null
    | undefined;
  const sfxCount = Array.isArray(sfx?.items)
    ? sfx!.items!.length
    : Array.isArray(sfx?.selected_ids)
      ? sfx!.selected_ids!.length
      : 0;
  if (sfxCount > 0) parts.push(`${sfxCount} sfx`);

  const analysis = template.video_analysis as
    | { segments?: unknown[] }
    | null
    | undefined;
  const segCount = Array.isArray(analysis?.segments)
    ? analysis!.segments!.length
    : 0;
  if (segCount > 0) parts.push(`${segCount} cuts`);

  if (template.duration_s != null) {
    parts.push(`${Math.round(Number(template.duration_s))}s`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'recipe saved';
}

// ── style_dna helpers ──────────────────────────────────────────────────────

/** Shape matches what worker.py writes into clips.style_dna. Every field is
 *  optional — we guard accordingly. */
export interface StyleDnaShape {
  pacing?: { cuts_per_sec?: number | null; cut_count?: number | null } | null;
  hook?: { style?: string | null; description?: string | null } | null;
  captions?: {
    present?: boolean;
    style_description?: string;
    font_feel?: string;
    position?: string;
  } | null;
  voice?: {
    num_speakers?: number | null;
    energy?: string | null;
    turns?: Array<{
      start?: number | null;
      end?: number | null;
      speaker?: string | null;
      text?: string | null;
    }>;
  } | null;
  music?: {
    bpm?: number | null;
    sections?: Array<{ song?: string | null; label?: string | null }>;
  } | null;
  visual?: { palette?: unknown; description?: string } | null;
  beat_alignment?: {
    cuts_on_beat_pct?: number | null;
    beat_count?: number | null;
  } | null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Derive the six Style DNA token intensities from a clip's `style_dna` blob.
 * Falls back to DEFAULT_DNA when the blob is missing or the fields we need
 * aren't present — callers shouldn't have to branch on that.
 */
export function dnaTokensFromStyle(
  styleDna: unknown,
): { tokens: DNAToken[]; hasReal: boolean } {
  if (!styleDna || typeof styleDna !== 'object') {
    return { tokens: DEFAULT_DNA, hasReal: false };
  }
  const s = styleDna as StyleDnaShape;
  let anyReal = false;

  // pacing: cuts_per_sec in the 0.2..2.0 range maps roughly to 0..1.
  let pacing = 0.55;
  const cps = s.pacing?.cuts_per_sec;
  if (typeof cps === 'number' && cps > 0) {
    pacing = clamp01(cps / 2.0);
    anyReal = true;
  }

  // cuts: total cut count, normalized against a soft cap of 30.
  let cuts = 0.6;
  const cc = s.pacing?.cut_count;
  if (typeof cc === 'number' && cc > 0) {
    cuts = clamp01(cc / 30);
    anyReal = true;
  }

  // captions: present + density of caption-style metadata.
  let captions = 0.5;
  if (s.captions) {
    const present = !!s.captions.present;
    const fields = [
      s.captions.style_description,
      s.captions.font_feel,
      s.captions.position,
    ].filter((x) => typeof x === 'string' && x.length > 0).length;
    captions = clamp01(present ? 0.55 + fields * 0.15 : fields * 0.2);
    anyReal = true;
  }

  // voice: speaker count + turn coverage as a proxy for diarization richness.
  let voice = 0.5;
  const turns = s.voice?.turns ?? [];
  const ns = s.voice?.num_speakers;
  if (turns.length > 0 || (typeof ns === 'number' && ns > 0)) {
    const tScore = clamp01(turns.length / 12);
    const sScore = typeof ns === 'number' ? clamp01(ns / 3) : 0;
    voice = clamp01(0.35 + tScore * 0.4 + sScore * 0.25);
    anyReal = true;
  }

  // music: bpm + whether we've tagged any sections.
  let music = 0.45;
  const bpm = s.music?.bpm;
  const sections = s.music?.sections ?? [];
  if ((typeof bpm === 'number' && bpm > 0) || sections.length > 0) {
    const bScore = typeof bpm === 'number' ? clamp01(bpm / 160) : 0;
    const sScore = clamp01(sections.length / 3);
    music = clamp01(0.35 + bScore * 0.35 + sScore * 0.3);
    anyReal = true;
  }

  // visual: beat-alignment as a sidelong proxy when palette details are thin.
  let visual = 0.6;
  const onBeat = s.beat_alignment?.cuts_on_beat_pct;
  if (typeof onBeat === 'number' && onBeat >= 0) {
    visual = clamp01(onBeat);
    anyReal = true;
  }

  const tokens: DNAToken[] = [
    { id: 'pacing', label: 'Pacing', intensity: pacing, glyph: 'pacing' },
    { id: 'cuts', label: 'Cuts', intensity: cuts, glyph: 'cuts' },
    { id: 'captions', label: 'Captions', intensity: captions, glyph: 'captions' },
    { id: 'voice', label: 'Voice', intensity: voice, glyph: 'voice' },
    { id: 'music', label: 'Music', intensity: music, glyph: 'music' },
    { id: 'visual', label: 'Visual', intensity: visual, glyph: 'visual' },
  ];

  return { tokens: anyReal ? tokens : DEFAULT_DNA, hasReal: anyReal };
}

/**
 * Build the creator-fingerprint summary shown on the player's DNA overlay.
 * When `style_dna` is empty the fields fall back to placeholder copy the
 * player used to hardcode.
 */
export function creatorSummaryFromStyle(
  styleDna: unknown,
  handle: string,
): {
  handle: string;
  avgCutsPerMin: number;
  captionStyle: string;
  voiceEnergy: string;
  signatureTransition: string;
} {
  const s = (styleDna && typeof styleDna === 'object'
    ? (styleDna as StyleDnaShape)
    : {}) as StyleDnaShape;

  const cps = s.pacing?.cuts_per_sec;
  const avgCutsPerMin =
    typeof cps === 'number' && cps > 0 ? Math.max(1, Math.round(cps * 60)) : 22;

  const captionStyle =
    s.captions?.style_description?.trim() ||
    s.captions?.font_feel?.trim() ||
    'Full-sentence emphasis';

  const voiceEnergy =
    s.voice?.energy?.trim() ||
    (typeof s.voice?.num_speakers === 'number' && s.voice.num_speakers > 1
      ? 'Dialogue, layered'
      : 'Warm, measured');

  const signatureTransition =
    s.hook?.description?.trim() ||
    s.hook?.style?.trim() ||
    'Slow whip-pan';

  return {
    handle,
    avgCutsPerMin,
    captionStyle,
    voiceEnergy,
    signatureTransition,
  };
}

/**
 * Derive the transcript view-model from a clip's `style_dna.voice.turns`.
 * Returns null when no real turns exist — callers show a placeholder.
 */
export function transcriptFromStyle(
  styleDna: unknown,
): { speaker: 0 | 1; t: string; text: string }[] | null {
  if (!styleDna || typeof styleDna !== 'object') return null;
  const s = styleDna as StyleDnaShape;
  const turns = s.voice?.turns;
  if (!Array.isArray(turns) || turns.length === 0) return null;
  const rows: { speaker: 0 | 1; t: string; text: string }[] = [];
  for (const t of turns) {
    const text = (t?.text ?? '').toString().trim();
    if (!text) continue;
    const start = typeof t?.start === 'number' ? t.start : 0;
    const speakerTag = (t?.speaker ?? '').toString();
    const speaker: 0 | 1 = speakerTag === 'SPEAKER_00' ? 0 : 1;
    rows.push({ speaker, t: formatDuration(start), text });
  }
  return rows.length > 0 ? rows : null;
}
