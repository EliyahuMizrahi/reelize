import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { EffectSpec } from '../types';

interface Props {
  items: EffectSpec[];
  fps: number;
  width: number;
  height: number;
}

// ── zoom_in: scale full-frame 1.0 → 1.12 over effect.dur via spring. ──────
const ZoomIn: React.FC<{ durFrames: number }> = ({ durFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 60 },
    durationInFrames: durFrames,
  });
  const scale = interpolate(s, [0, 1], [1.0, 1.12]);
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        // translucent dark ring so the effect reads on busy bgs
        boxShadow: 'inset 0 0 200px rgba(0,0,0,0.25)',
      }}
    />
  );
};

// ── beat_pulse: quick 1.0 → 1.04 scale pulse. ─────────────────────────────
const BeatPulse: React.FC<{ durFrames: number }> = ({ durFrames }) => {
  const frame = useCurrentFrame();
  const half = Math.max(1, Math.round(durFrames / 2));
  const scale =
    frame < half
      ? interpolate(frame, [0, half], [1.0, 1.04], { extrapolateRight: 'clamp' })
      : interpolate(frame, [half, durFrames], [1.04, 1.0], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    />
  );
};

// ── cut_flash: full-screen white flash for ~2 frames. ─────────────────────
const CutFlash: React.FC<{ durFrames: number }> = ({ durFrames }) => {
  const frame = useCurrentFrame();
  const flashFrames = Math.min(2, Math.max(1, durFrames));
  const opacity = interpolate(
    frame,
    [0, flashFrames, flashFrames + 1],
    [1, 1, 0],
    { extrapolateRight: 'clamp' },
  );
  return (
    <AbsoluteFill
      style={{
        backgroundColor: 'white',
        opacity,
      }}
    />
  );
};

// ── slow_mo / speed_ramp: can't retime pre-baked bg in-comp; keep as noop.
// Log once so the absence is visible during dev.
const SlowMoNoop: React.FC = () => {
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/rules-of-hooks
  if (typeof window !== 'undefined') {
    // Quiet in render — verbose in studio.
    // console.debug('slow_mo is a noop on pre-baked bg footage');
  }
  return null;
};

const SpeedRampNoop: React.FC = () => null;

export const Effects: React.FC<Props> = ({ items, fps }) => {
  return (
    <>
      {items.map((e, i) => {
        const from = Math.max(0, Math.round(e.at * fps));
        const durFrames = Math.max(1, Math.round(e.dur * fps));
        let child: React.ReactNode = null;
        switch (e.type) {
          case 'zoom_in':
            child = <ZoomIn durFrames={durFrames} />;
            break;
          case 'beat_pulse':
            child = <BeatPulse durFrames={durFrames} />;
            break;
          case 'cut_flash':
            child = <CutFlash durFrames={durFrames} />;
            break;
          case 'slow_mo':
            child = <SlowMoNoop />;
            break;
          case 'speed_ramp':
            child = <SpeedRampNoop />;
            break;
          default:
            child = null;
        }
        if (!child) return null;
        return (
          <Sequence
            key={`fx-${i}`}
            from={from}
            durationInFrames={durFrames}
            layout="none"
          >
            {child}
          </Sequence>
        );
      })}
    </>
  );
};
