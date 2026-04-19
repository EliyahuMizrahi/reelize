import React from 'react';
import { Audio as RemotionAudio, Sequence, staticFile } from 'remotion';
import type { AudioSpec } from '../types';

interface Props {
  items: AudioSpec[];
  fps: number;
}

// Voice-over track: one <Audio> per TTS chunk, scheduled to its start/end.
export const Audio: React.FC<Props> = ({ items, fps }) => {
  return (
    <>
      {items.map((a, i) => {
        const from = Math.max(0, Math.round(a.start * fps));
        const dur = Math.max(1, Math.round((a.end - a.start) * fps));
        return (
          <Sequence key={`audio-${i}`} from={from} durationInFrames={dur} layout="none">
            <RemotionAudio src={staticFile(a.src)} />
          </Sequence>
        );
      })}
    </>
  );
};
