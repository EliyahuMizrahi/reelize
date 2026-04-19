import React from 'react';
import { Audio as RemotionAudio, Sequence, staticFile } from 'remotion';
import type { SfxSpec } from '../types';

interface Props {
  items: SfxSpec[];
  fps: number;
}

// SFX layer: one-shot audio triggers at `item.at` seconds. No explicit end —
// the <Audio> plays until it naturally finishes.
export const Sfx: React.FC<Props> = ({ items, fps }) => {
  return (
    <>
      {items.map((s, i) => {
        const from = Math.max(0, Math.round(s.at * fps));
        return (
          <Sequence key={`sfx-${i}`} from={from} layout="none">
            <RemotionAudio
              src={staticFile(s.src)}
              startFrom={0}
              volume={s.gain ?? 1}
            />
          </Sequence>
        );
      })}
    </>
  );
};
