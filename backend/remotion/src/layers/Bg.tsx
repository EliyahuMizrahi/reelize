import React from 'react';
import { AbsoluteFill, Video, staticFile } from 'remotion';
import type { BgSpec } from '../types';

interface Props {
  bg: BgSpec;
  fps: number;
}

// Full-frame background video, muted so the TTS/sfx audio mixes cleanly.
// `startFrom` shifts the source in-point by bg.trim_in seconds.
export const Bg: React.FC<Props> = ({ bg, fps }) => {
  const startFrom = Math.max(0, Math.round((bg.trim_in ?? 0) * fps));
  return (
    <AbsoluteFill>
      <Video
        src={staticFile(bg.src)}
        startFrom={startFrom}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};
