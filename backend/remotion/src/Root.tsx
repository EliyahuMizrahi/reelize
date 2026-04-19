import React from 'react';
import { Composition } from 'remotion';
import { MainComp } from './Composition';
import { EMPTY_TIMELINE, type TimelineSpec } from './types';

// Remotion's <Composition> generic defaults to Record<string, unknown> unless
// a zod schema is supplied — without zod we erase the strict TimelineSpec
// type at the prop-forwarding boundary and recover it inside MainComp.
const MainCompLoose = MainComp as unknown as React.FC<Record<string, unknown>>;

// Resolve durationInFrames from whatever TimelineSpec is supplied via --props
// (falls back to the default 10s baseline used in studio preview).
export const Root: React.FC = () => {
  return (
    <Composition
      id="MainComp"
      component={MainCompLoose}
      fps={EMPTY_TIMELINE.fps}
      width={EMPTY_TIMELINE.width}
      height={EMPTY_TIMELINE.height}
      durationInFrames={Math.max(1, Math.round(EMPTY_TIMELINE.duration_s * EMPTY_TIMELINE.fps))}
      defaultProps={EMPTY_TIMELINE as unknown as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const spec = props as unknown as TimelineSpec;
        const fps = spec.fps ?? EMPTY_TIMELINE.fps;
        const seconds = spec.duration_s ?? EMPTY_TIMELINE.duration_s;
        return {
          durationInFrames: Math.max(1, Math.round(seconds * fps)),
          fps,
          width: spec.width ?? EMPTY_TIMELINE.width,
          height: spec.height ?? EMPTY_TIMELINE.height,
        };
      }}
    />
  );
};
