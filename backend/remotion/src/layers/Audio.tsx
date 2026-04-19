import React from 'react';
import { Audio as RemotionAudio, Sequence, staticFile } from 'remotion';
import type { AudioSpec } from '../types';

interface Props {
  items: AudioSpec[];
  fps: number;
}

// Voice + music track. TTS entries use default trim_in=0/volume=1, music
// entries pass trim_in (source-side offset) and volume (ducked gain).
export const Audio: React.FC<Props> = ({ items, fps }) => {
  return (
    <>
      {items.map((a, i) => {
        const from = Math.max(0, Math.round(a.start * fps));
        const dur = Math.max(1, Math.round((a.end - a.start) * fps));
        const startFrom = Math.max(0, Math.round((a.trim_in ?? 0) * fps));
        const volume = a.volume ?? 1;
        return (
          <Sequence key={`audio-${i}`} from={from} durationInFrames={dur} layout="none">
            <RemotionAudio
              src={staticFile(a.src)}
              startFrom={startFrom}
              volume={volume}
            />
          </Sequence>
        );
      })}
    </>
  );
};
