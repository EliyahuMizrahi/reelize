// Design seed templates — consumed by data/seed.ts to populate new accounts. Not imported by UI.

import { palette } from '@/constants/tokens';
import type { DNAToken } from '@/components/brand/StyleDNA';

export type ClassName = 'Biology' | 'Finance' | 'History' | 'Philosophy';

export interface CreatorFingerprint {
  handle: string;
  avgCutsPerMin: number;
  captionStyle: string;
  voiceEnergy: string;
  signatureTransition: string;
}

export interface TranscriptLine {
  speaker: 0 | 1;
  t: string; // mm:ss
  text: string;
}

export interface Clip {
  id: string;
  topic: string;
  className: ClassName;
  classColor: string;
  sourceCreator: string;
  sourceDuration: string; // mono "0:27"
  generatedAt: string;
  thumbnailColor: string;
  durationMs: number;
  cutPoints: number[]; // 0..1 fractions along clip
  tokens: DNAToken[];
  creator: CreatorFingerprint;
  transcript: TranscriptLine[];
}

// Class color palette — pulled from brand tokens
const CLASS_COLORS: Record<ClassName, string> = {
  Biology: palette.sage,
  Finance: palette.gold,
  History: palette.alert,
  Philosophy: palette.tealBright,
};

function dnaFor(pacing: number, cuts: number, captions: number, voice: number, music: number, visual: number): DNAToken[] {
  return [
    { id: 'pacing', label: 'Pacing', intensity: pacing, glyph: 'pacing' },
    { id: 'cuts', label: 'Cuts', intensity: cuts, glyph: 'cuts' },
    { id: 'captions', label: 'Captions', intensity: captions, glyph: 'captions' },
    { id: 'voice', label: 'Voice', intensity: voice, glyph: 'voice' },
    { id: 'music', label: 'Music', intensity: music, glyph: 'music' },
    { id: 'visual', label: 'Visual', intensity: visual, glyph: 'visual' },
  ];
}

export const MOCK_CLIPS: Clip[] = [
  {
    id: 'krebs-cycle-01',
    topic: 'Krebs Cycle',
    className: 'Biology',
    classColor: CLASS_COLORS.Biology,
    sourceCreator: '@mryummy',
    sourceDuration: '0:27',
    generatedAt: '2026-04-16T21:14:00Z',
    thumbnailColor: palette.tealDeep,
    durationMs: 27_000,
    cutPoints: [0.12, 0.26, 0.41, 0.58, 0.72, 0.88],
    tokens: dnaFor(0.92, 0.95, 0.74, 0.82, 0.58, 0.77),
    creator: {
      handle: '@mryummy',
      avgCutsPerMin: 42,
      captionStyle: 'Word-by-word drop',
      voiceEnergy: 'Frenetic, amused',
      signatureTransition: 'Hard match-cut on beat',
    },
    transcript: [
      { speaker: 0, t: '0:00', text: 'So your mitochondria are eating right now. Watch this.' },
      { speaker: 0, t: '0:04', text: 'Acetyl-CoA walks in. Two carbons, ready to burn.' },
      { speaker: 1, t: '0:09', text: 'Citrate forms. Six carbons. The wheel starts turning.' },
      { speaker: 0, t: '0:14', text: 'Each spin spits out CO2, NADH, FADH2 — and one ATP, direct.' },
      { speaker: 1, t: '0:20', text: 'The real payoff comes later, in the electron transport chain.' },
      { speaker: 0, t: '0:25', text: 'Eight steps. One loop. Infinite energy.' },
    ],
  },
  {
    id: 'compound-interest-02',
    topic: 'Compound Interest',
    className: 'Finance',
    classColor: CLASS_COLORS.Finance,
    sourceCreator: '@aliabdaal',
    sourceDuration: '0:31',
    generatedAt: '2026-04-16T18:02:00Z',
    thumbnailColor: '#3A2E1E',
    durationMs: 30_000,
    cutPoints: [0.08, 0.22, 0.37, 0.52, 0.68, 0.84],
    tokens: dnaFor(0.64, 0.58, 0.88, 0.71, 0.62, 0.70),
    creator: {
      handle: '@aliabdaal',
      avgCutsPerMin: 22,
      captionStyle: 'Full-sentence emphasis',
      voiceEnergy: 'Warm, measured',
      signatureTransition: 'Slow whip-pan',
    },
    transcript: [
      { speaker: 0, t: '0:00', text: 'Einstein called it the eighth wonder of the world. He was not joking.' },
      { speaker: 0, t: '0:06', text: 'Put in a hundred. Earn ten percent. Next year, you earn on one-ten.' },
      { speaker: 0, t: '0:13', text: 'The graph doesn\'t creep. It bends. Then it launches.' },
      { speaker: 0, t: '0:19', text: 'Time does the heavy lifting. You just have to stay in the chair.' },
      { speaker: 0, t: '0:26', text: 'Start today. The tree you plant now is the shade you sit in later.' },
    ],
  },
  {
    id: 'why-rome-fell-03',
    topic: 'Why Rome Fell',
    className: 'History',
    classColor: CLASS_COLORS.History,
    sourceCreator: '@theasiancomet',
    sourceDuration: '0:29',
    generatedAt: '2026-04-15T14:48:00Z',
    thumbnailColor: '#3A1A14',
    durationMs: 29_000,
    cutPoints: [0.10, 0.23, 0.35, 0.50, 0.64, 0.79, 0.92],
    tokens: dnaFor(0.86, 0.81, 0.68, 0.90, 0.74, 0.85),
    creator: {
      handle: '@theasiancomet',
      avgCutsPerMin: 38,
      captionStyle: 'Bracketed reaction text',
      voiceEnergy: 'Confident, dramatic',
      signatureTransition: 'Zoom-punch on key word',
    },
    transcript: [
      { speaker: 0, t: '0:00', text: 'Rome didn\'t fall in a day. It unraveled for three hundred years.' },
      { speaker: 0, t: '0:06', text: 'Silver coins got thinner. Soldiers got paid in grain.' },
      { speaker: 1, t: '0:12', text: 'The borders stretched. The tax base shrank.' },
      { speaker: 0, t: '0:18', text: 'Then the Visigoths walked in. Nobody locked the door.' },
      { speaker: 0, t: '0:24', text: 'Empires don\'t die loud. They die bored.' },
    ],
  },
  {
    id: 'stoicism-primer-04',
    topic: 'Stoicism Primer',
    className: 'Philosophy',
    classColor: CLASS_COLORS.Philosophy,
    sourceCreator: '@philosopherclip',
    sourceDuration: '0:24',
    generatedAt: '2026-04-14T09:30:00Z',
    thumbnailColor: '#1A3A3A',
    durationMs: 24_000,
    cutPoints: [0.14, 0.30, 0.48, 0.66, 0.83],
    tokens: dnaFor(0.48, 0.42, 0.80, 0.55, 0.38, 0.62),
    creator: {
      handle: '@philosopherclip',
      avgCutsPerMin: 14,
      captionStyle: 'Single-line, serif',
      voiceEnergy: 'Quiet, deliberate',
      signatureTransition: 'Dissolve to aphorism',
    },
    transcript: [
      { speaker: 0, t: '0:00', text: 'Marcus Aurelius ran an empire and wrote his thoughts to himself.' },
      { speaker: 0, t: '0:07', text: 'The obstacle is the way. What stands in front of you becomes the path.' },
      { speaker: 0, t: '0:14', text: 'You don\'t control events. You control your response. That\'s it.' },
      { speaker: 0, t: '0:20', text: 'Two thousand years old. Still the best notebook ever kept.' },
    ],
  },
  {
    id: 'options-greeks-05',
    topic: 'Options Greeks',
    className: 'Finance',
    classColor: CLASS_COLORS.Finance,
    sourceCreator: '@aliabdaal',
    sourceDuration: '0:33',
    generatedAt: '2026-04-13T22:11:00Z',
    thumbnailColor: '#2A2618',
    durationMs: 33_000,
    cutPoints: [0.06, 0.18, 0.29, 0.42, 0.55, 0.68, 0.81, 0.93],
    tokens: dnaFor(0.74, 0.68, 0.92, 0.66, 0.48, 0.72),
    creator: {
      handle: '@aliabdaal',
      avgCutsPerMin: 22,
      captionStyle: 'Full-sentence emphasis',
      voiceEnergy: 'Warm, measured',
      signatureTransition: 'Slow whip-pan',
    },
    transcript: [
      { speaker: 0, t: '0:00', text: 'Four letters. Delta, gamma, theta, vega. Each one tells you one thing.' },
      { speaker: 0, t: '0:08', text: 'Delta: how much the option moves when the stock moves.' },
      { speaker: 1, t: '0:14', text: 'Gamma: how fast delta itself changes. Curvature.' },
      { speaker: 0, t: '0:20', text: 'Theta bleeds you slowly. Vega swings on volatility.' },
      { speaker: 0, t: '0:28', text: 'Know the greeks. Then the price stops feeling random.' },
    ],
  },
  {
    id: 'photosynthesis-06',
    topic: 'Photosynthesis',
    className: 'Biology',
    classColor: CLASS_COLORS.Biology,
    sourceCreator: '@mryummy',
    sourceDuration: '0:28',
    generatedAt: '2026-04-12T16:00:00Z',
    thumbnailColor: palette.tealDeep,
    durationMs: 28_000,
    cutPoints: [0.11, 0.24, 0.38, 0.53, 0.67, 0.82],
    tokens: dnaFor(0.88, 0.90, 0.70, 0.78, 0.52, 0.80),
    creator: {
      handle: '@mryummy',
      avgCutsPerMin: 42,
      captionStyle: 'Word-by-word drop',
      voiceEnergy: 'Frenetic, amused',
      signatureTransition: 'Hard match-cut on beat',
    },
    transcript: [
      { speaker: 0, t: '0:00', text: 'A leaf is a solar panel. A wet, stubborn, green solar panel.' },
      { speaker: 0, t: '0:06', text: 'Photons hit chlorophyll. Electrons get excited. The machine starts.' },
      { speaker: 1, t: '0:13', text: 'Water splits. Oxygen leaves the building. That\'s the air you\'re breathing.' },
      { speaker: 0, t: '0:20', text: 'CO2 walks in. Glucose walks out. Simple trade. World-changing receipt.' },
      { speaker: 0, t: '0:26', text: 'Every leaf. Every second. Right now.' },
    ],
  },
];

export function findClipById(id: string | undefined): Clip {
  if (!id) return MOCK_CLIPS[0];
  return MOCK_CLIPS.find((c) => c.id === id) ?? MOCK_CLIPS[0];
}

export function nextClipId(id: string): string {
  const i = MOCK_CLIPS.findIndex((c) => c.id === id);
  if (i === -1) return MOCK_CLIPS[0].id;
  return MOCK_CLIPS[(i + 1) % MOCK_CLIPS.length].id;
}
