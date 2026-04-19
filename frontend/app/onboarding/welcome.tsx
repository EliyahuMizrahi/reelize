import React from 'react';
import { View, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Display, Body, Mono, Overline } from '@/components/ui/Text';
import { ENTER } from '@/components/ui/motion';
import { palette, spacing, radii } from '@/constants/tokens';

import OnboardingProgress from '@/components/onboarding/Progress';

function StoryboardGlyph({
  kind,
  color,
}: {
  kind: 'shards' | 'reel' | 'student';
  color: string;
}) {
  if (kind === 'shards') {
    return (
      <Svg width={56} height={56} viewBox="0 0 60 60">
        <Path d="M 10 16 L 24 10 L 22 28 Z" fill={color} opacity={0.9} />
        <Path d="M 30 8 L 48 14 L 40 28 Z" fill={color} opacity={0.65} />
        <Path d="M 14 34 L 32 32 L 26 52 Z" fill={color} opacity={0.8} />
        <Path d="M 38 36 L 52 42 L 42 54 Z" fill={color} opacity={0.55} />
      </Svg>
    );
  }
  if (kind === 'reel') {
    // stylized 9:16 reel with play triangle
    return (
      <Svg width={40} height={56} viewBox="0 0 40 56">
        <Rect x={1} y={1} width={38} height={54} rx={6} stroke={color} strokeWidth={1.4} fill="transparent" />
        <Path d="M 16 20 L 28 28 L 16 36 Z" fill={color} />
        <Line x1={6} y1={46} x2={20} y2={46} stroke={color} strokeWidth={1} opacity={0.5} />
      </Svg>
    );
  }
  // student — minimal scholar mark (open book + eye)
  return (
    <Svg width={56} height={56} viewBox="0 0 60 60">
      <Path d="M 8 20 L 30 14 L 52 20 L 52 46 L 30 40 L 8 46 Z" stroke={color} strokeWidth={1.4} fill="transparent" />
      <Path d="M 30 14 L 30 40" stroke={color} strokeWidth={1} opacity={0.6} />
      <Circle cx={30} cy={28} r={2.4} fill={color} />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  const handleBegin = () => {
    if (!isWeb) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    router.push('/onboarding/how-it-works');
  };

  return (
    <Screen background="inkGradient" edges={['top', 'bottom']}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing['2xl'],
          paddingTop: spacing['6xl'],
          paddingBottom: spacing['3xl'],
          justifyContent: 'space-between',
          ...(isWeb ? { alignItems: 'center' } : {}),
        }}
      >
        <View style={{ width: '100%', maxWidth: 560, ...(isWeb ? { alignSelf: 'center' } : {}) }}>
          <Animated.View entering={ENTER.fadeUp(80)}>
            <Overline color={palette.sage}>Chapter 00 · Welcome</Overline>
          </Animated.View>

          <Animated.View entering={ENTER.fadeUpSlow(240)} style={{ marginTop: spacing.xl }}>
            <Display color={palette.mist}>You scroll.</Display>
          </Animated.View>
          <Animated.View entering={ENTER.fadeUpSlow(420)}>
            <Display color={palette.sageSoft} italic>
              Now you&apos;ll study.
            </Display>
          </Animated.View>

          <Animated.View entering={ENTER.fadeUp(700)} style={{ marginTop: spacing.xl, maxWidth: 460 }}>
            <Body color={palette.fog}>
              Paste a short-form video you love. Reelize turns it into a 30-second lesson in the same
              pacing, the same cuts, the same voice. Your private shelf of reels that teach.
            </Body>
          </Animated.View>

          {/* Mini storyboard */}
          <Animated.View
            entering={ENTER.fadeUp(900)}
            style={{
              marginTop: spacing['4xl'],
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <StoryboardFrame index="01" label="Reel">
              <StoryboardGlyph kind="reel" color={palette.mist} />
            </StoryboardFrame>
            <View style={{ paddingHorizontal: spacing.sm, opacity: 0.55 }}>
              <Svg width={28} height={10} viewBox="0 0 28 10">
                <Path
                  d="M 0 5 L 22 5 M 18 1 L 24 5 L 18 9"
                  stroke={palette.sage}
                  strokeWidth={1.2}
                  fill="none"
                />
              </Svg>
            </View>
            <StoryboardFrame index="02" label="Shards">
              <StoryboardGlyph kind="shards" color={palette.sageSoft} />
            </StoryboardFrame>
            <View style={{ paddingHorizontal: spacing.sm, opacity: 0.55 }}>
              <Svg width={28} height={10} viewBox="0 0 28 10">
                <Path
                  d="M 0 5 L 22 5 M 18 1 L 24 5 L 18 9"
                  stroke={palette.sage}
                  strokeWidth={1.2}
                  fill="none"
                />
              </Svg>
            </View>
            <StoryboardFrame index="03" label="Lesson">
              <StoryboardGlyph kind="student" color={palette.mist} />
            </StoryboardFrame>
          </Animated.View>
        </View>

        <View style={{ width: '100%', maxWidth: 440, ...(isWeb ? { alignSelf: 'center' } : {}) }}>
          <Animated.View entering={ENTER.fadeUp(1100)}>
            <Button
              title="Begin"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleBegin}
              trailing={<ArrowGlyph />}
            />
          </Animated.View>
          <View style={{ marginTop: spacing['2xl'], alignItems: 'center' }}>
            <OnboardingProgress step={0} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

function StoryboardFrame({
  index,
  label,
  children,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        width: 84,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: palette.inkBorder,
        backgroundColor: palette.inkTint,
        alignItems: 'center',
      }}
    >
      <Mono color={palette.sage}>{index}</Mono>
      <View style={{ height: 60, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xs }}>
        {children}
      </View>
      <Overline color={palette.fog}>{label}</Overline>
    </View>
  );
}

function ArrowGlyph() {
  return (
    <Svg width={16} height={10} viewBox="0 0 16 10">
      <Path
        d="M 0 5 L 12 5 M 9 1 L 13 5 L 9 9"
        stroke={palette.ink}
        strokeWidth={1.6}
        fill="none"
      />
    </Svg>
  );
}
