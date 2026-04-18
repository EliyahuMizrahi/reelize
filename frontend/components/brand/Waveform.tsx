import React, { useEffect, useMemo } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { palette } from '@/constants/tokens';

type Speaker = 0 | 1 | 2;

interface WaveformProps {
  bars?: number;
  height?: number;
  animated?: boolean;
  speakers?: Speaker[]; // length should match bars; diarization coloring
  progress?: number; // 0..1, used to highlight played bars
  color?: string;
  style?: StyleProp<ViewStyle>;
  seed?: number;
  barWidth?: number;
  barGap?: number;
}

const DIA_COLORS = [palette.sage, palette.tealBright, palette.sageSoft];

function pseudoRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function AnimatedBar({
  i,
  h,
  height,
  width,
  color,
  animated,
  dim,
}: {
  i: number;
  h: number; // 0..1 base
  height: number;
  width: number;
  color: string;
  animated: boolean;
  dim: boolean;
}) {
  const amp = useSharedValue(1);
  useEffect(() => {
    if (animated) {
      amp.value = withDelay(
        i * 40,
        withRepeat(
          withTiming(0.55 + Math.random() * 0.6, {
            duration: 520 + (i * 17) % 300,
            easing: Easing.inOut(Easing.quad),
          }),
          -1,
          true,
        ),
      );
    }
  }, [animated, i]);
  const animStyle = useAnimatedStyle(() => ({
    height: Math.max(4, h * height * amp.value),
  }));
  return (
    <Animated.View
      style={[
        {
          width,
          backgroundColor: color,
          borderRadius: 2,
          opacity: dim ? 0.3 : 0.92,
        },
        animStyle,
      ]}
    />
  );
}

/**
 * Waveform — audio viz with optional speaker diarization bars.
 * Used in player scrubber, deconstruction audio token, generation progress.
 */
export function Waveform({
  bars = 48,
  height = 44,
  animated = false,
  speakers,
  progress,
  color = palette.sage,
  style,
  seed = 7,
  barWidth = 3,
  barGap = 2,
}: WaveformProps) {
  const heights = useMemo(() => {
    const r = pseudoRandom(seed);
    return Array.from({ length: bars }).map((_, i) => {
      const envelope = 0.55 + 0.45 * Math.sin((i / bars) * Math.PI * 1.4);
      return 0.25 + r() * 0.75 * envelope;
    });
  }, [bars, seed]);

  const playedCount = progress != null ? Math.floor(progress * bars) : bars;

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', height, gap: barGap }, style]}>
      {heights.map((h, i) => {
        const speakerColor = speakers?.[i] != null ? DIA_COLORS[speakers[i] % DIA_COLORS.length] : color;
        const dim = progress != null && i >= playedCount;
        return (
          <AnimatedBar
            key={i}
            i={i}
            h={h}
            height={height}
            width={barWidth}
            color={speakerColor}
            animated={animated}
            dim={dim}
          />
        );
      })}
    </View>
  );
}

/**
 * Pacing graph — cuts-per-second line (used in deconstruction).
 */
export function PacingGraph({
  points,
  width = 200,
  height = 60,
  color = palette.sage,
  style,
}: {
  points?: number[];
  width?: number;
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const pts = points ?? Array.from({ length: 24 }).map((_, i) => {
    const r = Math.sin(i * 0.6) * 0.5 + 0.5;
    return r * 0.8 + 0.1;
  });
  const w = width / (pts.length - 1);

  return (
    <View style={[{ width, height, justifyContent: 'flex-end' }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 0 }}>
        {pts.map((p, i) => (
          <View
            key={i}
            style={{
              width: w - 1,
              height: Math.max(3, p * height),
              backgroundColor: color,
              opacity: 0.35 + p * 0.6,
              borderRadius: 1,
              marginRight: 1,
            }}
          />
        ))}
      </View>
    </View>
  );
}
