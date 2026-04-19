import React, { useEffect } from 'react';
import Svg, { Path, Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { palette } from '@/constants/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

export type NoctisVariant =
  | 'silhouette'   // full crow, facing right
  | 'watching'     // silhouette with animated blink/tilt
  | 'perched'      // crow on a branch (taller viewBox)
  | 'head'         // cropped to head+eye (avatar-friendly)
  | 'scroll'       // perched with a scroll in beak (empty state for library)
  | 'mark';        // lockup mark — clean silhouette, no animation, full detail

interface NoctisProps {
  variant?: NoctisVariant;
  size?: number;
  color?: string;
  eyeColor?: string;
  animated?: boolean;
}

/**
 * Noctis — two overlapping angular shards forming a crow silhouette.
 * Reads as a crow from afar, abstract geometry up close.
 * He is not cute. He is sharp, ancient, watchful.
 */
export function Noctis({
  variant = 'silhouette',
  size = 80,
  color = palette.ink,
  eyeColor = palette.sage,
  animated = false,
}: NoctisProps) {
  const eyeOpacity = useSharedValue(1);

  useEffect(() => {
    if (animated) {
      eyeOpacity.value = withRepeat(
        withSequence(
          withDelay(3600, withTiming(0, { duration: 110, easing: Easing.in(Easing.cubic) })),
          withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
          withDelay(180, withTiming(0, { duration: 90 })),
          withTiming(1, { duration: 160 }),
        ),
        -1,
      );
    }
  }, [animated]);

  const eyeProps = useAnimatedProps(() => ({ opacity: eyeOpacity.value }));

  // Two overlapping angular shards forming the crow
  // Shard A: main body + back + tail
  const bodyShard =
    'M 16 86 L 34 58 L 58 40 L 80 34 L 90 42 L 84 70 L 74 92 L 52 104 L 32 102 Z';
  // Shard B: head + wing flange (overlaps body)
  const wingShard =
    'M 38 64 L 72 42 L 92 40 L 108 50 L 94 58 L 76 64 L 56 82 Z';
  // Beak sliver (sharp)
  const beakTip = 'M 92 42 L 110 48 L 94 54 Z';

  if (variant === 'head') {
    return (
      <Svg width={size} height={size} viewBox="44 28 64 54">
        <Path d={bodyShard} fill={color} />
        <Path d={wingShard} fill={color} opacity={0.42} />
        <Path d={beakTip} fill={color} />
        <Circle cx={96} cy={48} r={3.6} fill={eyeColor} />
        <Circle cx={97.5} cy={46.8} r={1.1} fill="#FFFFFF" opacity={0.7} />
      </Svg>
    );
  }

  if (variant === 'perched') {
    return (
      <Svg width={size} height={size * 1.18} viewBox="0 0 120 142">
        <Path d={bodyShard} fill={color} />
        <Path d={wingShard} fill={color} opacity={0.42} />
        <Path d={beakTip} fill={color} />
        <AnimatedCircle cx={96} cy={48} r={2.8} fill={eyeColor} animatedProps={eyeProps} />
        <Circle cx={97.2} cy={47.1} r={0.95} fill="#FFFFFF" opacity={0.65} />
        {/* legs */}
        <Path d="M 54 102 L 58 118 L 54 118 Z" fill={color} />
        <Path d="M 68 104 L 72 118 L 68 118 Z" fill={color} />
        {/* branch */}
        <Path d="M 4 120 L 116 116 L 116 124 L 4 128 Z" fill={color} opacity={0.88} />
        <Path d="M 90 118 L 108 106 L 110 110 L 94 122 Z" fill={color} opacity={0.5} />
      </Svg>
    );
  }

  if (variant === 'scroll') {
    return (
      <Svg width={size * 1.1} height={size} viewBox="0 0 132 120">
        <Path d={bodyShard} fill={color} />
        <Path d={wingShard} fill={color} opacity={0.42} />
        <Path d={beakTip} fill={color} />
        <Circle cx={96} cy={48} r={2.8} fill={eyeColor} />
        <Circle cx={97.2} cy={47.1} r={0.95} fill="#FFFFFF" opacity={0.65} />
        {/* scroll in beak */}
        <Path d="M 108 48 L 126 44 L 128 52 L 110 56 Z" fill={palette.paper} />
        <Path d="M 126 42 L 130 44 L 130 54 L 126 56 Z" fill={palette.paperDeep} />
        <Path d="M 112 50 L 122 49" stroke={color} strokeWidth={0.6} opacity={0.5} />
        <Path d="M 112 52 L 120 51" stroke={color} strokeWidth={0.6} opacity={0.5} />
      </Svg>
    );
  }

  if (variant === 'mark') {
    return (
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id="markEye" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.sageSoft} />
            <Stop offset="1" stopColor={palette.teal} />
          </LinearGradient>
        </Defs>
        <Path d={bodyShard} fill={color} />
        <Path d={wingShard} fill={color} opacity={0.42} />
        <Path d={beakTip} fill={color} />
        <Circle cx={96} cy={48} r={3.1} fill="url(#markEye)" />
        <Circle cx={97.3} cy={46.9} r={1} fill="#FFFFFF" opacity={0.7} />
      </Svg>
    );
  }

  // silhouette / watching
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d={bodyShard} fill={color} />
      <Path d={wingShard} fill={color} opacity={0.42} />
      <Path d={beakTip} fill={color} />
      <AnimatedCircle cx={96} cy={48} r={2.8} fill={eyeColor} animatedProps={eyeProps} />
      <Circle cx={97.2} cy={47.1} r={0.95} fill="#FFFFFF" opacity={0.65} />
    </Svg>
  );
}

/**
 * Noctis lockup — mark + wordmark, for launch/marketing moments.
 */
export function NoctisLockup({
  size = 64,
  color = palette.ink,
  eyeColor = palette.sage,
}: {
  size?: number;
  color?: string;
  eyeColor?: string;
}) {
  return (
    <Svg width={size * 3.6} height={size} viewBox="0 0 340 80">
      <G>
        <Path
          d="M 10 60 L 26 38 L 44 26 L 60 22 L 68 28 L 64 50 L 56 66 L 38 72 L 22 70 Z"
          fill={color}
        />
        <Path
          d="M 28 46 L 54 30 L 68 28 L 78 34 L 70 42 L 56 46 L 42 58 Z"
          fill={color}
          opacity={0.42}
        />
        <Path d="M 68 28 L 82 34 L 70 40 Z" fill={color} />
        <Circle cx={72} cy={34} r={2.2} fill={eyeColor} />
      </G>
    </Svg>
  );
}
