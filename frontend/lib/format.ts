// Shared formatting helpers. Keep type signatures forgiving so screens can
// pass raw ISO strings, Date instances, or null/undefined timestamps without
// wrapping every callsite in guards.

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
