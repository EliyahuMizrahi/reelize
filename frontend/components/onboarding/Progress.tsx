import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { palette, spacing } from '@/constants/tokens';
import { Mono } from '@/components/ui/Text';

interface OnboardingProgressProps {
  step: 0 | 1 | 2;
}

/**
 * Three-dot mono tracker with a shimmer on the active dot.
 * Renders the mono step numbers 01 · 02 · 03 with a subtle shimmer
 * on the current step. Non-interactive; purely orientational.
 */
export default function OnboardingProgress({ step }: OnboardingProgressProps) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(0, { duration: 1400, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
    );
  }, []);

  const activeStyle = useAnimatedStyle(() => ({
    opacity: 0.65 + 0.35 * shimmer.value,
    transform: [{ scaleX: 1 + 0.08 * shimmer.value }],
  }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      {[0, 1, 2].map((i) => {
        const isActive = i === step;
        const isDone = i < step;
        return (
          <View
            key={i}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
          >
            <Mono color={isActive ? palette.sage : isDone ? palette.fog : palette.teal}>
              {`0${i + 1}`}
            </Mono>
            {isActive ? (
              <Animated.View
                style={[
                  {
                    width: 22,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: palette.sage,
                  },
                  activeStyle,
                ]}
              />
            ) : (
              <View
                style={{
                  width: 10,
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: isDone ? palette.fog : palette.inkElevated,
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
