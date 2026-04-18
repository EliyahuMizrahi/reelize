import React, { useEffect } from 'react';
import { View, Platform, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Headline, Body, BodySm, Mono, Overline, TitleSm } from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { ENTER } from '@/components/ui/motion';
import { palette, spacing, radii, motion } from '@/constants/tokens';

import { OnboardingProgress } from './_progress';

type Step = {
  number: string;
  title: string;
  body: string;
  pullQuote: string;
};

const STEPS: Step[] = [
  {
    number: '01',
    title: 'Paste a reel you love.',
    body: 'Drop a TikTok, Reels, or YouTube Short link. The clip becomes the grammar of your lesson — its cuts, its captions, its energy.',
    pullQuote: 'Bring the feed in.',
  },
  {
    number: '02',
    title: 'Name what you want to learn.',
    body: 'One line is enough. "The Krebs cycle." "How bond yields move." Reelize pulls on that thread to teach it to you.',
    pullQuote: 'Aim the lesson.',
  },
  {
    number: '03',
    title: 'Get a lesson in its language.',
    body: 'Thirty seconds. Same pacing. Same voice energy. Saved privately to your shelf — no feed, no social layer, just you and the topic.',
    pullQuote: 'Study at its speed.',
  },
];

export default function HowItWorksScreen() {
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  // Noctis walks/flies a parallax path between steps
  const flight = useSharedValue(0);

  useEffect(() => {
    flight.value = withDelay(
      400,
      withTiming(1, { duration: motion.dur.epic, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
    );
  }, []);

  const noctisStyle = useAnimatedStyle(() => {
    // From top-right → drifts left-down slightly, then back up — subtle parallax
    const x = interpolate(flight.value, [0, 0.5, 1], [0, -14, -4]);
    const y = interpolate(flight.value, [0, 0.5, 1], [0, 10, 2]);
    const rot = interpolate(flight.value, [0, 0.5, 1], [0, -3, 1]);
    return {
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${rot}deg` }],
    };
  });

  const handleNext = () => {
    if (!isWeb) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    router.push('/onboarding/first-class');
  };

  return (
    <Screen background="ink" edges={['top', 'bottom']}>
      {/* Parallax Noctis in corner */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: spacing['4xl'],
            right: spacing.xl,
            zIndex: 2,
          },
          noctisStyle,
        ]}
      >
        <Noctis
          variant="watching"
          size={64}
          color={palette.mist}
          eyeColor={palette.sage}
          animated
        />
      </Animated.View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing['2xl'],
          paddingTop: spacing['5xl'],
          paddingBottom: spacing['3xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={ENTER.fadeUp(60)}>
          <Overline color={palette.sage}>Chapter 01 · How it works</Overline>
        </Animated.View>

        <Animated.View
          entering={ENTER.fadeUpSlow(200)}
          style={{ marginTop: spacing.lg, maxWidth: 520 }}
        >
          <Headline color={palette.mist}>
            Three moves. One lesson in the shape of the thing you were already watching.
          </Headline>
        </Animated.View>

        <View style={{ marginTop: spacing['4xl'], gap: spacing.xl }}>
          {STEPS.map((s, i) => (
            <Animated.View key={s.number} entering={ENTER.fadeUp(360 + i * 140)}>
              <EditorialCard step={s} />
            </Animated.View>
          ))}
        </View>

        <Animated.View entering={ENTER.fadeUp(900)} style={{ marginTop: spacing['4xl'] }}>
          <Body color={palette.fog} italic>
            No likes. No followers. No feed of other people&apos;s lessons. Just a shelf of
            your reels, teaching you what you told them to.
          </Body>
        </Animated.View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: spacing['2xl'],
          paddingBottom: spacing['3xl'],
          paddingTop: spacing.md,
          backgroundColor: palette.ink,
          borderTopWidth: 1,
          borderTopColor: palette.inkBorder,
        }}
      >
        <Button
          title="Next"
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleNext}
          trailing={
            <Svg width={16} height={10} viewBox="0 0 16 10">
              <Path
                d="M 0 5 L 12 5 M 9 1 L 13 5 L 9 9"
                stroke={palette.ink}
                strokeWidth={1.6}
                fill="none"
              />
            </Svg>
          }
        />
        <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <OnboardingProgress step={1} />
        </View>
      </View>
    </Screen>
  );
}

function EditorialCard({ step }: { step: Step }) {
  return (
    <View
      style={{
        borderRadius: radii.lg,
        padding: spacing.xl,
        backgroundColor: palette.inkTint,
        borderWidth: 1,
        borderColor: palette.inkBorder,
        flexDirection: 'row',
        gap: spacing.lg,
      }}
    >
      <View style={{ width: 44, alignItems: 'flex-start' }}>
        <View
          style={{
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
            borderRadius: radii.xs,
            backgroundColor: palette.ink,
            borderWidth: 1,
            borderColor: palette.inkBorder,
          }}
        >
          <Mono color={palette.sage}>{step.number}</Mono>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <TitleSm color={palette.mist}>{step.title}</TitleSm>
        <Body color={palette.fog} style={{ marginTop: spacing.sm }}>
          {step.body}
        </Body>
        <View
          style={{
            marginTop: spacing.md,
            paddingTop: spacing.md,
            borderTopWidth: 1,
            borderTopColor: palette.inkBorder,
          }}
        >
          <BodySm color={palette.sage} italic family="serif">
            &ldquo;{step.pullQuote}&rdquo;
          </BodySm>
        </View>
      </View>
    </View>
  );
}
