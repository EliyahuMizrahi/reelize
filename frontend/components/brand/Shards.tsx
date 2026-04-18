import React, { useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { palette } from '@/constants/tokens';

const AnimatedG = Animated.createAnimatedComponent(G);

type ShardDef = { d: string; tx: number; ty: number; r: number; opacity: number };

const SHARDS: ShardDef[] = [
  { d: 'M 18 38 L 44 28 L 36 58 Z', tx: -34, ty: -26, r: -18, opacity: 0.85 },
  { d: 'M 52 18 L 78 24 L 62 46 Z', tx: 18, ty: -38, r: 22, opacity: 0.92 },
  { d: 'M 82 32 L 104 44 L 88 58 Z', tx: 42, ty: -10, r: 28, opacity: 0.78 },
  { d: 'M 84 66 L 108 78 L 82 92 Z', tx: 46, ty: 28, r: 14, opacity: 0.72 },
  { d: 'M 48 76 L 74 72 L 66 98 Z', tx: 4, ty: 42, r: -12, opacity: 0.65 },
  { d: 'M 20 66 L 40 60 L 44 86 Z', tx: -38, ty: 24, r: -28, opacity: 0.88 },
  { d: 'M 38 48 L 58 42 L 52 62 Z', tx: -10, ty: -4, r: 8, opacity: 0.55 },
  { d: 'M 66 52 L 82 50 L 76 68 Z', tx: 16, ty: 6, r: -6, opacity: 0.6 },
];

interface ShardProps {
  shard: ShardDef;
  progress: SharedValue<number>;
  color: string;
}

function Shard({ shard, progress, color }: ShardProps) {
  const animatedProps = useAnimatedProps(() => {
    const t = progress.value;
    return {
      transform: `translate(${shard.tx * t} ${shard.ty * t}) rotate(${shard.r * t} 60 60)`,
      opacity: shard.opacity * (1 - t * 0.6),
    } as any;
  });
  return (
    <AnimatedG animatedProps={animatedProps as any}>
      <Path d={shard.d} fill={color} />
    </AnimatedG>
  );
}

interface ShardsProps {
  size?: number;
  phase?: 'assembled' | 'exploded';
  color?: string;
  duration?: number;
  style?: ViewStyle;
}

/**
 * Shards — deconstruction/assembly primitive.
 * `assembled` = pieces are tight, reads as a silhouette.
 * `exploded` = pieces fly outward in orbit, ready for Style DNA overlay.
 */
export function Shards({
  size = 180,
  phase = 'assembled',
  color = palette.teal,
  duration = 1200,
  style,
}: ShardsProps) {
  const progress = useSharedValue(phase === 'assembled' ? 0 : 1);

  useEffect(() => {
    progress.value = withTiming(phase === 'assembled' ? 0 : 1, {
      duration,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [phase, duration]);

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {SHARDS.map((s, i) => (
          <Shard key={i} shard={s} progress={progress} color={color} />
        ))}
      </Svg>
    </View>
  );
}
