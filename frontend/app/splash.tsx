import React, { useEffect, useState } from 'react';
import {
  View,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Display, Body, BodySm } from '@/components/ui/Text';
import { NoctisSprite } from '@/components/brand/NoctisSprite';
import { ENTER } from '@/components/ui/motion';
import { palette, spacing, radii } from '@/constants/tokens';

// ── Bird sizing ───────────────────────────────────────────────────────
const NOCTIS_SIZE_MOBILE = 160;
const NOCTIS_SIZE_WEB = 180;

// ── Typewriter phrases ────────────────────────────────────────────────
// Cycles through these one at a time — types each, holds, then deletes.
const PHRASES = [
  'Welcome.',
  'Come in.',
  'Quiet in here.',
  'The shelf is yours.',
];
const TYPE_SPEED_MS = 55;
const DELETE_SPEED_MS = 28;
const HOLD_AT_FULL_MS = 1500;
const GAP_BETWEEN_MS = 320;

// ── Typewriter hook ───────────────────────────────────────────────────
function useTypewriter(phrases: string[]) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'typing' | 'holding' | 'deleting'>('typing');

  useEffect(() => {
    const current = phrases[phraseIdx];

    if (phase === 'typing') {
      if (text.length < current.length) {
        const t = setTimeout(() => setText(current.slice(0, text.length + 1)), TYPE_SPEED_MS);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase('holding'), 0);
      return () => clearTimeout(t);
    }

    if (phase === 'holding') {
      const t = setTimeout(() => setPhase('deleting'), HOLD_AT_FULL_MS);
      return () => clearTimeout(t);
    }

    // deleting
    if (text.length > 0) {
      const t = setTimeout(() => setText(text.slice(0, text.length - 1)), DELETE_SPEED_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setPhraseIdx((i) => (i + 1) % phrases.length);
      setPhase('typing');
    }, GAP_BETWEEN_MS);
    return () => clearTimeout(t);
  }, [text, phase, phraseIdx, phrases]);

  return text;
}

// Blinking cursor — Reanimated so it runs on the native thread.
function useCursor() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 420, easing: Easing.in(Easing.cubic) }),
        withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
      ),
      -1,
    );
  }, []);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export default function SplashScreen() {
  const router = useRouter();
  const isWeb = Platform.OS === 'web';
  const { height: windowHeight } = useWindowDimensions();
  const BOTTOM_OFFSET = Math.round(windowHeight * 0.06);

  const typed = useTypewriter(PHRASES);
  const cursorStyle = useCursor();

  const handleStart = () => {
    if (!isWeb) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    router.replace('/(auth)/sign-up');
  };

  const handleSignIn = () => {
    router.replace('/(auth)/sign-in');
  };

  return (
    <Screen background="inkGradient" edges={['top', 'bottom']}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing['2xl'],
          paddingTop: spacing['3xl'],
          paddingBottom: BOTTOM_OFFSET,
          alignItems: 'center',
        }}
      >
        {/* Header */}
        <Animated.View
          entering={ENTER.fadeUpSlow(80)}
          style={{ width: '100%', maxWidth: 440, alignItems: 'center' }}
        >
          <Display color={palette.mist} align="center">
            Reelize
          </Display>
          <Body
            family="serif"
            italic
            color={palette.fog}
            align="center"
            style={{ marginTop: spacing.sm }}
          >
            Learn in the language of the feed.
          </Body>
        </Animated.View>

        {/* Middle: bubble on the left, Noctis on the right */}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 520,
            gap: spacing.sm,
          }}
        >
          <Animated.View
            entering={ENTER.fadeSlow(360)}
            style={{ flex: 1, alignItems: 'flex-end' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: 240 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: palette.paper,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radii.lg,
                  minHeight: 56,
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.25,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                  <Body family="serif" color={palette.ink}>
                    {typed}
                  </Body>
                  <Animated.View style={cursorStyle}>
                    <Body family="serif" color={palette.ink}>
                      |
                    </Body>
                  </Animated.View>
                </View>
              </View>
              <BubbleTail />
            </View>
          </Animated.View>

          <Animated.View entering={ENTER.fadeSlow(360)}>
            <NoctisSprite
              size={isWeb ? NOCTIS_SIZE_WEB : NOCTIS_SIZE_MOBILE}
              animation="talking"
              fps={8}
            />
          </Animated.View>
        </View>

        {/* Bottom CTA cluster */}
        <View style={{ width: '100%', maxWidth: 440, alignItems: 'center' }}>
          <Animated.View entering={ENTER.fadeUp(700)} style={{ width: '100%' }}>
            <Button title="Start" variant="primary" size="lg" fullWidth onPress={handleStart} />
          </Animated.View>

          <Animated.View
            entering={ENTER.fadeUp(860)}
            style={{
              marginTop: spacing.xl,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: spacing.xs,
            }}
          >
            <BodySm color={palette.fog}>Already have a shelf?</BodySm>
            <Pressable onPress={handleSignIn}>
              <BodySm color={palette.sage} weight="semibold">
                Sign in →
              </BodySm>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Screen>
  );
}

function BubbleTail() {
  return (
    <Svg width={10} height={18} viewBox="0 0 10 18" style={{ marginLeft: -1 }}>
      <Path d="M 0 0 L 10 9 L 0 18 Z" fill={palette.paper} />
    </Svg>
  );
}
