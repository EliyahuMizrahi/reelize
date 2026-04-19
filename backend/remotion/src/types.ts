// TS mirror of backend/generation/types.py:TimelineSpec. Keep field names and
// types in lockstep — Python side is the source of truth.

export const SCHEMA_VERSION = 1;

export type CaptionPosition = 'top' | 'middle' | 'bottom';
export type CaptionAnimation = 'static' | 'fade_in' | 'word_highlight' | 'pop';
export type CaptionCase = 'upper' | 'mixed' | 'lower';
export type CaptionFontFeel = 'rounded-sans' | 'serif' | 'mono' | string;

export type EffectType =
  | 'zoom_in'
  | 'slow_mo'
  | 'speed_ramp'
  | 'cut_flash'
  | 'beat_pulse';

export interface BgSpec {
  src: string;
  trim_in: number;
  category?: string;
}

export interface AudioSpec {
  src: string;
  start: number;
  end: number;
  speaker?: string;
  // Optional music controls: source trim-in (seconds into the source file)
  // and per-clip gain. Absent = 0 / 1.0 (voice track behaviour).
  trim_in?: number;
  volume?: number;
}

export interface CaptionStyle {
  font_feel?: CaptionFontFeel;
  weight?: number | string;
  size?: number;
  color?: string;
  stroke_color?: string;
  stroke_width_px?: number;
  position?: CaptionPosition;
  animation?: CaptionAnimation;
  case?: CaptionCase;
  background?: string | null;
}

export interface CaptionSpec {
  text: string;
  start: number;
  end: number;
  style: CaptionStyle;
}

export interface SfxSpec {
  src: string;
  at: number;
  gain?: number;
  label?: string | null;
}

export interface EffectSpec {
  type: EffectType;
  at: number;
  dur: number;
}

// Top-middle visualization overlay. Free-form kind + props keeps the schema
// open — each render just needs to know which variant to mount and when.
export interface VizScene {
  kind: string;        // e.g. "pythagorean"
  start: number;       // seconds
  end: number;
  props?: Record<string, unknown>;
}

export interface TimelineSpec {
  schema_version: number;
  fps: number;
  width: number;
  height: number;
  duration_s: number;
  bg: BgSpec;
  audio: AudioSpec[];
  captions: CaptionSpec[];
  sfx: SfxSpec[];
  effects: EffectSpec[];
  viz?: VizScene[];
  style_dna: Record<string, unknown>;
}

// Default props used when <Composition /> has no --props input (studio mode).
export const EMPTY_TIMELINE: TimelineSpec = {
  schema_version: SCHEMA_VERSION,
  fps: 30,
  width: 1080,
  height: 1920,
  duration_s: 10,
  bg: { src: 'bg.mp4', trim_in: 0 },
  audio: [],
  captions: [],
  sfx: [],
  effects: [],
  viz: [],
  style_dna: {},
};
