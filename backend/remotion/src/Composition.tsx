import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Bg } from './layers/Bg';
import { Sfx } from './layers/Sfx';
import { Audio } from './layers/Audio';
import { Captions } from './layers/Captions';
import { Effects } from './layers/Effects';
import type { TimelineSpec } from './types';

// Layer order (bottom → top): bg → sfx → audio → captions → effects.
// Audio/sfx layers render nothing visual, but the DOM order is preserved for
// predictable z-indexing if any of them ever surface UI.
export const MainComp: React.FC<TimelineSpec> = (props) => {
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Bg bg={props.bg} fps={props.fps} />
      <Sfx items={props.sfx} fps={props.fps} />
      <Audio items={props.audio} fps={props.fps} />
      <Captions items={props.captions} fps={props.fps} styleDna={props.style_dna} />
      <Effects items={props.effects} fps={props.fps} width={props.width} height={props.height} />
    </AbsoluteFill>
  );
};
