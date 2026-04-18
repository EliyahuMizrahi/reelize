import React, { useEffect } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { palette, shimmer, radii } from '@/constants/tokens';
import { Text } from '@/components/ui/Text';

interface ShimmerBadgeProps {
  label: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

/**
 * ShimmerBadge — sage→teal metallic gradient pill.
 * Used sparingly to mark "AI-generated" moments.
 */
export function ShimmerBadge({ label, style, compact = false }: ShimmerBadgeProps) {
  const shift = useSharedValue(0);
  useEffect(() => {
    shift.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      -1,
    );
  }, []);
  const sheen = useAnimatedStyle(() => ({
    transform: [{ translateX: -80 + shift.value * 220 }],
  }));
  return (
    <View style={[{ overflow: 'hidden', borderRadius: radii.pill, alignSelf: 'flex-start' }, style]}>
      <LinearGradient
        colors={[palette.sageSoft, palette.sage, palette.teal]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: compact ? 8 : 12, paddingVertical: compact ? 3 : 5 }}
      >
        <Text variant="overline" weight="semibold" color={palette.ink}>
          {label}
        </Text>
      </LinearGradient>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 60,
            backgroundColor: 'rgba(255,255,255,0.28)',
          },
          sheen,
        ]}
      />
    </View>
  );
}

interface ShimmerFillProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  borderRadius?: number;
  intensity?: 'soft' | 'bold';
}

/**
 * ShimmerFill — a container that draws the shimmer gradient as its background.
 * Use for progress rings, AI markers, large accent surfaces.
 */
export function ShimmerFill({ style, children, borderRadius = radii.lg, intensity = 'soft' }: ShimmerFillProps) {
  const colors = intensity === 'soft'
    ? [palette.sageSoft, palette.sage, palette.tealBright, palette.teal]
    : [palette.sage, palette.tealBright, palette.teal, palette.tealDeep];
  return (
    <View style={[{ borderRadius, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={colors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      />
      {children ? (
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>{children}</View>
      ) : null}
    </View>
  );
}

interface ShimmerRingProps {
  size?: number;
  strokeWidth?: number;
  progress?: number; // 0..1
  style?: StyleProp<ViewStyle>;
}

/**
 * Decorative shimmer ring — used in generation progress + Style DNA mini-badges.
 * Note: simple visual version; caller can animate progress via prop.
 */
export function ShimmerRing({ size = 64, strokeWidth = 3, progress = 1, style }: ShimmerRingProps) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={[palette.sageSoft, palette.sage, palette.tealBright, palette.teal, palette.sage]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: strokeWidth,
          right: strokeWidth,
          top: strokeWidth,
          bottom: strokeWidth,
          borderRadius: (size - strokeWidth * 2) / 2,
          backgroundColor: palette.ink,
        }}
      />
    </View>
  );
}
