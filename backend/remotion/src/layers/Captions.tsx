import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { CaptionSpec, CaptionStyle } from '../types';

interface Props {
  items: CaptionSpec[];
  fps: number;
  styleDna?: Record<string, unknown>;
}

// Font-feel → system font stack. We ship safe fallbacks (no webfont fetch at
// render time = no flakey network deps inside headless chromium).
const FONT_STACKS: Record<string, string> = {
  'rounded-sans':
    '"Inter", "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif',
  serif: '"Source Serif Pro", "Georgia", "Times New Roman", serif',
  mono: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Consolas, monospace',
};

function fontFamily(feel?: string): string {
  if (!feel) return FONT_STACKS['rounded-sans'];
  return FONT_STACKS[feel] ?? FONT_STACKS['rounded-sans'];
}

function transformText(raw: string, c: CaptionStyle['case']): string {
  switch (c) {
    case 'upper':
      return raw.toUpperCase();
    case 'lower':
      return raw.toLowerCase();
    case 'mixed':
    default:
      return raw;
  }
}

function positionStyle(position?: CaptionStyle['position']): React.CSSProperties {
  // 1080x1920: keep safe-area padding, bottom third sits at y ≈ 1200–1600.
  switch (position) {
    case 'top':
      return { justifyContent: 'flex-start', paddingTop: 220 };
    case 'bottom':
      return { justifyContent: 'flex-end', paddingBottom: 320 };
    case 'middle':
    default:
      return { justifyContent: 'center' };
  }
}

function buildTextShadow(strokeColor?: string, strokeWidth?: number): string | undefined {
  if (!strokeColor || !strokeWidth || strokeWidth <= 0) return undefined;
  // 8-direction stroke approximation — cheap and works in Chromium.
  const s = strokeWidth;
  const c = strokeColor;
  const offsets: Array<[number, number]> = [];
  for (let dx = -s; dx <= s; dx++) {
    for (let dy = -s; dy <= s; dy++) {
      if (dx === 0 && dy === 0) continue;
      offsets.push([dx, dy]);
    }
  }
  return offsets.map(([dx, dy]) => `${dx}px ${dy}px 0 ${c}`).join(', ');
}

const CaptionItem: React.FC<{ item: CaptionSpec }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = item.style ?? {};
  const animation = style.animation ?? 'pop';

  // Entrance animation.
  let opacity = 1;
  let scale = 1;
  if (animation === 'fade_in') {
    opacity = interpolate(frame, [0, Math.round(fps * 0.2)], [0, 1], {
      extrapolateRight: 'clamp',
    });
  } else if (animation === 'pop') {
    const s = spring({ frame, fps, config: { damping: 10, stiffness: 220 } });
    scale = 0.85 + 0.15 * s;
    opacity = interpolate(s, [0, 1], [0, 1], { extrapolateRight: 'clamp' });
  } else if (animation === 'word_highlight') {
    // Single-line brightness pulse. Full per-word highlighting needs word
    // timestamps we don't have in v1 of the TimelineSpec.
    opacity = interpolate(frame, [0, Math.round(fps * 0.1)], [0, 1], {
      extrapolateRight: 'clamp',
    });
  }

  const text = transformText(item.text, style.case);
  const bg = style.background ?? undefined;

  const css: React.CSSProperties = {
    fontFamily: fontFamily(style.font_feel),
    fontWeight: style.weight ?? 800,
    fontSize: style.size ?? 84,
    color: style.color ?? '#FFFFFF',
    textShadow: buildTextShadow(style.stroke_color ?? '#000000', style.stroke_width_px ?? 6),
    padding: bg ? '16px 28px' : 0,
    backgroundColor: bg ?? 'transparent',
    borderRadius: bg ? 16 : 0,
    lineHeight: 1.1,
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    maxWidth: '88%',
    opacity,
    transform: `scale(${scale})`,
  };

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
        ...positionStyle(style.position),
      }}
    >
      <div style={css}>{text}</div>
    </AbsoluteFill>
  );
};

export const Captions: React.FC<Props> = ({ items, fps }) => {
  return (
    <>
      {items.map((item, i) => {
        const from = Math.max(0, Math.round(item.start * fps));
        const dur = Math.max(1, Math.round((item.end - item.start) * fps));
        return (
          <Sequence key={`cap-${i}`} from={from} durationInFrames={dur} layout="none">
            <CaptionItem item={item} />
          </Sequence>
        );
      })}
    </>
  );
};
