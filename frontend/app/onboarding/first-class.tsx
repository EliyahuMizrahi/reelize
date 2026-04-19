import React, { useState } from 'react';
import { View, Platform, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Headline, Body, BodySm, Mono, Overline, TitleSm } from '@/components/ui/Text';
import { ENTER } from '@/components/ui/motion';
import { useAuth } from '@/contexts/AuthContext';
import { palette, spacing, radii } from '@/constants/tokens';

import OnboardingProgress from '@/components/onboarding/Progress';

type ClassKey = 'biology' | 'finance' | 'history';

type ClassDef = {
  key: ClassKey;
  name: string;
  number: string;
  accent: string;
  surface: string;
  ink: string;
  blurb: string;
  tag: string;
  emblem: (color: string) => React.ReactNode;
};

const CLASSES: ClassDef[] = [
  {
    key: 'biology',
    name: 'Biology',
    number: 'BIO · 101',
    accent: palette.sage,
    surface: palette.paper,
    ink: palette.ink,
    blurb:
      'Cells, systems, and the quiet engineering of living things. Start with a reel on mitosis and end with a 30-second lesson that leaves a mark.',
    tag: 'Life, patterned.',
    emblem: (c) => (
      <Svg width={56} height={56} viewBox="0 0 60 60">
        <Circle cx={30} cy={30} r={20} stroke={c} strokeWidth={1.3} fill="transparent" />
        <Path
          d="M 14 30 C 20 18, 40 18, 46 30 C 40 42, 20 42, 14 30 Z"
          stroke={c}
          strokeWidth={1.2}
          fill="transparent"
        />
        <Circle cx={30} cy={30} r={3} fill={c} />
      </Svg>
    ),
  },
  {
    key: 'finance',
    name: 'Finance',
    number: 'FIN · 101',
    accent: palette.gold,
    surface: palette.paperDeep,
    ink: palette.ink,
    blurb:
      'Markets are a language of incentive and time. Paste a short about yields or options and Reelize translates it at the speed you scroll.',
    tag: 'Money, read slowly.',
    emblem: (c) => (
      <Svg width={56} height={56} viewBox="0 0 60 60">
        <Path
          d="M 10 46 L 22 32 L 32 40 L 50 18"
          stroke={c}
          strokeWidth={1.5}
          fill="transparent"
        />
        <Path d="M 42 18 L 52 18 L 52 28" stroke={c} strokeWidth={1.5} fill="transparent" />
        <Rect x={8} y={48} width={44} height={1.2} fill={c} opacity={0.6} />
      </Svg>
    ),
  },
  {
    key: 'history',
    name: 'History',
    number: 'HIS · 101',
    accent: palette.alert,
    surface: palette.paper,
    ink: palette.ink,
    blurb:
      'Every era has a rhythm. Bring a clip from the Fall of Rome or the Moon landing — the lesson keeps the pulse, loses the filler.',
    tag: 'Time, compressed.',
    emblem: (c) => (
      <Svg width={56} height={56} viewBox="0 0 60 60">
        <Circle cx={30} cy={30} r={20} stroke={c} strokeWidth={1.3} fill="transparent" />
        <Path d="M 30 12 L 30 30 L 42 36" stroke={c} strokeWidth={1.5} fill="transparent" />
        <Circle cx={30} cy={30} r={1.6} fill={c} />
      </Svg>
    ),
  },
];

export default function FirstClassScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const isWeb = Platform.OS === 'web';
  const [selected, setSelected] = useState<ClassKey | null>(null);
  const { width } = useWindowDimensions();
  const stacked = width < 720;

  const handleSelect = (key: ClassKey) => {
    if (!isWeb) {
      Haptics.selectionAsync().catch(() => {});
    }
    setSelected(key);
  };

  const handleEnter = () => {
    if (!isWeb) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    if (isAuthenticated) {
      router.replace('/(tabs)/feed');
    } else {
      router.replace('/(auth)/sign-up');
    }
  };

  return (
    <Screen background="inkGradient" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing['2xl'],
          paddingTop: spacing['5xl'],
          paddingBottom: spacing['2xl'],
          ...(isWeb ? { alignItems: 'center' } : {}),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 960, ...(isWeb ? { alignSelf: 'center' } : {}) }}>
        <Animated.View entering={ENTER.fadeUp(60)}>
          <Overline color={palette.sage}>Chapter 02 · First shelf</Overline>
        </Animated.View>

        <Animated.View entering={ENTER.fadeUpSlow(200)} style={{ marginTop: spacing.lg, maxWidth: 520 }}>
          <Headline color={palette.mist}>Pick your first shelf.</Headline>
        </Animated.View>

        <Animated.View entering={ENTER.fadeUp(360)} style={{ marginTop: spacing.md, maxWidth: 520 }}>
          <Body color={palette.fog} italic>
            A shelf starts with one disc. You can add more any time — the library grows with you.
          </Body>
        </Animated.View>

        <View
          style={{
            marginTop: spacing['4xl'],
            flexDirection: stacked ? 'column' : 'row',
            gap: spacing.lg,
          }}
        >
          {CLASSES.map((c, i) => (
            <Animated.View
              key={c.key}
              entering={ENTER.fadeUp(500 + i * 120)}
              style={{ flex: stacked ? undefined : 1 }}
            >
              <ClassCard
                def={c}
                selected={selected === c.key}
                onSelect={() => handleSelect(c.key)}
              />
            </Animated.View>
          ))}
        </View>
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: spacing['2xl'],
          paddingBottom: spacing['3xl'],
          paddingTop: spacing.md,
          borderTopWidth: 1,
          borderTopColor: palette.inkBorder,
          ...(isWeb ? { alignItems: 'center' } : {}),
        }}
      >
        <View style={{ width: '100%', maxWidth: 440, ...(isWeb ? { alignSelf: 'center' } : {}) }}>
        <Button
          title="Enter your library"
          variant={selected ? 'primary' : 'tertiary'}
          size="lg"
          fullWidth
          disabled={!selected}
          onPress={handleEnter}
        />
        <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <OnboardingProgress step={2} />
        </View>
        </View>
      </View>
    </Screen>
  );
}

function ClassCard({
  def,
  selected,
  onSelect,
}: {
  def: ClassDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const scale = useSharedValue(1);
  const liftY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: liftY.value }],
  }));

  const onPressIn = () => {
    scale.value = withTiming(0.985, { duration: 120, easing: Easing.bezier(0.4, 0, 0.2, 1) });
  };
  const onPressOut = () => {
    scale.value = withTiming(1, { duration: 160, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  };

  React.useEffect(() => {
    liftY.value = withSpring(selected ? -4 : 0, { damping: 18, stiffness: 180 });
  }, [selected]);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onSelect}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{
          borderRadius: radii.lg,
          overflow: 'hidden',
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? def.accent : palette.inkBorder,
          backgroundColor: def.surface,
        }}
      >
        {/* paper-texture hatch: thin diagonal lines rendered with SVG */}
        <Svg
          width="100%"
          height={6}
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        >
          <Rect x={0} y={0} width={100} height={6} fill={def.accent} opacity={0.25} />
        </Svg>

        <View style={{ padding: spacing.xl, paddingTop: spacing.xl + spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Mono color={def.ink} style={{ opacity: 0.55 }}>
              {def.number}
            </Mono>
            <SelectionMark active={selected} accent={def.accent} />
          </View>

          <View style={{ marginTop: spacing.lg, alignItems: 'flex-start' }}>
            {def.emblem(def.ink)}
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <TitleSm color={def.ink} family="serif" weight="bold">
              {def.name}
            </TitleSm>
            <BodySm color={def.ink} family="serif" italic style={{ marginTop: spacing.xs, opacity: 0.7 }}>
              {def.tag}
            </BodySm>
          </View>

          <Body family="serif" color={def.ink} style={{ marginTop: spacing.md, opacity: 0.82 }}>
            {def.blurb}
          </Body>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function SelectionMark({ active, accent }: { active: boolean; accent: string }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.4,
        borderColor: active ? accent : palette.teal,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? accent : 'transparent',
      }}
    >
      {active ? (
        <Svg width={10} height={8} viewBox="0 0 10 8">
          <Path
            d="M 1 4 L 4 7 L 9 1"
            stroke={palette.ink}
            strokeWidth={1.6}
            fill="none"
          />
        </Svg>
      ) : null}
    </View>
  );
}
