import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { Display, Headline, Title, TitleSm, BodyLg, Body, BodySm, Mono, MonoSm, Overline, Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Surface, Divider } from '@/components/ui/Surface';
import { Chip } from '@/components/ui/Chip';
import { Noctis, NoctisLockup } from '@/components/brand/Noctis';
import { Shards } from '@/components/brand/Shards';
import { StyleDNA, DEFAULT_DNA } from '@/components/brand/StyleDNA';
import { ShimmerBadge } from '@/components/brand/Shimmer';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, spacing, radii, layout, motion } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';

const MAX = layout.maxContent;
const NARROW = 768;

// ───────────────────────── Utility link ─────────────────────────
function NavLink({ label, onPress }: { label: string; onPress?: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed, hovered }: any) => ({ opacity: pressed ? 0.6 : hovered ? 0.78 : 1 })}>
      <Text variant="bodySm" weight="medium" color={colors.mutedText as string}>
        {label}
      </Text>
    </Pressable>
  );
}

// ───────────────────────── Sticky nav ─────────────────────────
function MarketingNav({ narrow }: { narrow: boolean }) {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  return (
    <View
      style={{
        position: Platform.OS === 'web' ? ('sticky' as any) : 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        backgroundColor: (isDark ? 'rgba(4,20,30,0.82)' : 'rgba(245,248,247,0.88)'),
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        paddingVertical: 16,
        backdropFilter: 'blur(14px)' as any,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: MAX,
          alignSelf: 'center',
          paddingHorizontal: narrow ? spacing.xl : spacing['3xl'],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable onPress={() => router.push('/marketing' as any)}>
          <NoctisLockup size={34} color={isDark ? palette.mist : palette.ink} eyeColor={palette.sage} />
        </Pressable>
        {!narrow && (
          <View style={{ flexDirection: 'row', gap: spacing['2xl'] }}>
            <NavLink label="Product" />
            <NavLink label="Process" />
            <NavLink label="Pricing" />
            <NavLink label="Library" />
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          {!narrow && (
            <Button
              variant="ghost"
              size="sm"
              title="Sign in"
              haptic={false}
              onPress={() => router.push('/(auth)/sign-in' as any)}
            />
          )}
          <Button
            variant="primary"
            size="sm"
            title="Get started"
            haptic={false}
            onPress={() => router.push('/(auth)/sign-up' as any)}
          />
        </View>
      </View>
    </View>
  );
}

// ───────────────────────── Hero composition ─────────────────────────
function HeroComposition() {
  const [phase, setPhase] = useState<'assembled' | 'exploded'>('assembled');
  const medallionOpacity = useSharedValue(0);
  const medallionScale = useSharedValue(0.86);
  const orbit = useSharedValue(0);

  useEffect(() => {
    const loop = () => {
      setPhase('assembled');
      medallionOpacity.value = withTiming(0, { duration: motion.dur.fast });
      medallionScale.value = withTiming(0.86, { duration: motion.dur.fast });
      setTimeout(() => {
        setPhase('exploded');
        medallionOpacity.value = withDelay(
          600,
          withTiming(1, { duration: motion.dur.slow, easing: Easing.bezier(...motion.ease.entrance) }),
        );
        medallionScale.value = withDelay(
          600,
          withTiming(1, { duration: motion.dur.slow, easing: Easing.bezier(...motion.ease.entrance) }),
        );
      }, 400);
    };
    loop();
    const id = setInterval(loop, 5200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    orbit.value = withRepeat(withTiming(1, { duration: 22000, easing: Easing.linear }), -1);
  }, []);

  const medStyle = useAnimatedStyle(() => ({
    opacity: medallionOpacity.value,
    transform: [{ scale: medallionScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value * 360}deg` }],
  }));

  return (
    <View style={{ width: 420, height: 420, alignItems: 'center', justifyContent: 'center' }}>
      {/* faint rotating halo ring */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: 380,
            height: 380,
            borderRadius: 190,
            borderWidth: 1,
            borderColor: palette.teal,
            opacity: 0.28,
            borderStyle: 'dashed',
          },
          ringStyle,
        ]}
      />
      {/* Shards underlay */}
      <View style={{ position: 'absolute' }}>
        <Shards size={340} phase={phase} color={palette.sage} duration={1400} />
      </View>
      {/* Medallion on top when exploded */}
      <Animated.View style={[{ position: 'absolute' }, medStyle]}>
        <StyleDNA variant="medallion" size={220} spinning showLabels={false} tokens={DEFAULT_DNA} />
      </Animated.View>
    </View>
  );
}

// ───────────────────────── Sample gallery card ─────────────────────────
interface SampleCard {
  topic: string;
  className: string;
  classColor: string;
  creator: string;
  duration: string;
  tint: string;
}

const SAMPLES: SampleCard[] = [
  { topic: 'Krebs Cycle', className: 'Biology', classColor: palette.sage, creator: '@mryummy', duration: '0:27', tint: palette.tealDeep },
  { topic: 'Compound Interest', className: 'Finance', classColor: palette.gold, creator: '@aliabdaal', duration: '0:31', tint: '#3A2E1E' },
  { topic: 'Why Rome Fell', className: 'History', classColor: palette.alert, creator: '@theasiancomet', duration: '0:29', tint: '#3A1A14' },
  { topic: 'Stoicism Primer', className: 'Philosophy', classColor: palette.tealBright, creator: '@philosopherclip', duration: '0:24', tint: '#1A3A3A' },
  { topic: 'Options Greeks', className: 'Finance', classColor: palette.gold, creator: '@aliabdaal', duration: '0:33', tint: '#2A2618' },
  { topic: 'Photosynthesis', className: 'Biology', classColor: palette.sage, creator: '@mryummy', duration: '0:28', tint: palette.tealDeep },
  { topic: 'The Silk Road', className: 'History', classColor: palette.alert, creator: '@theasiancomet', duration: '0:30', tint: '#5A2418' },
  { topic: 'Plato on Forms', className: 'Philosophy', classColor: palette.tealBright, creator: '@philosopherclip', duration: '0:26', tint: '#2A4A4A' },
];

function SampleClipCard({ sample }: { sample: SampleCard }) {
  return (
    <View
      style={{
        width: 188,
        height: 334, // 9:16 ratio-ish
        borderRadius: radii['2xl'],
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: sample.classColor + '55',
        marginRight: spacing.lg,
      }}
    >
      <LinearGradient
        colors={[sample.tint, sample.classColor + '33', palette.ink]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Shards underlay */}
      <View style={{ position: 'absolute', top: 40, left: 30, opacity: 0.22 }}>
        <Shards size={140} phase="assembled" color={sample.classColor} />
      </View>
      {/* legibility */}
      <LinearGradient
        colors={['transparent', 'rgba(4,20,30,0.92)']}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* top-right StyleDNA icon */}
      <View style={{ position: 'absolute', top: 12, right: 12 }}>
        <StyleDNA variant="icon" size={36} showLabels={false} spinning tokens={DEFAULT_DNA} color={sample.classColor} />
      </View>
      {/* label */}
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
        <Chip variant="class" classColor={sample.classColor} label={sample.className} size="sm" />
        <Title color={palette.mist} style={{ marginTop: 8 }} numberOfLines={2}>
          {sample.topic}
        </Title>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <MonoSm color={palette.fog} style={{ opacity: 0.8 }}>{sample.creator}</MonoSm>
          <MonoSm color={palette.fog} style={{ opacity: 0.6 }}>{sample.duration}</MonoSm>
        </View>
      </View>
    </View>
  );
}

// ───────────────────────── Process step ─────────────────────────
interface ProcessStep {
  n: string;
  head: string;
  body: string;
  icon: React.ReactNode;
}

function ProcessStepCard({ step, narrow, index }: { step: ProcessStep; narrow: boolean; index: number }) {
  const { colors } = useAppTheme();
  return (
    <Animated.View
      entering={ENTER.fadeUpSlow(stagger(index, 120, 80))}
      style={{ flex: narrow ? undefined : 1, width: narrow ? '100%' : undefined }}
    >
      <Surface
        padded={spacing['2xl']}
        radius="2xl"
        style={{
          minHeight: 280,
          justifyContent: 'space-between',
          backgroundColor: colors.card as string,
        }}
      >
        <View>
          <Mono muted>{step.n}</Mono>
          <View style={{ marginTop: spacing.lg, marginBottom: spacing.lg }}>{step.icon}</View>
          <Title style={{ marginBottom: spacing.sm }}>{step.head}</Title>
          <Body muted style={{ maxWidth: 320 }}>
            {step.body}
          </Body>
        </View>
      </Surface>
    </Animated.View>
  );
}

// ───────────────────────── Pricing tier ─────────────────────────
interface PricingTier {
  name: string;
  price: string;
  note: string;
  line: string;
  features: string[];
  featured?: boolean;
  cta: string;
}

const TIERS: PricingTier[] = [
  {
    name: 'Free',
    price: '0',
    note: '/ forever',
    line: 'For the curious scroller.',
    features: ['10 clips per month', '1 class', 'Style DNA preview', 'Watermarked exports'],
    cta: 'Start free',
  },
  {
    name: 'Student',
    price: '6',
    note: '/ month',
    line: 'For the serious study habit.',
    features: ['Unlimited clips', 'Unlimited classes & topics', 'Full Style DNA', 'Transcripts + notes', 'Priority generation'],
    featured: true,
    cta: 'Start trial',
  },
  {
    name: 'Scholar',
    price: '14',
    note: '/ month',
    line: 'For the deep archive.',
    features: ['Everything in Student', 'Creator fingerprint export', 'Local-first library', 'Private share links', 'Early features'],
    cta: 'Go scholar',
  },
];

function PricingCard({ tier, index }: { tier: PricingTier; index: number }) {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  return (
    <Animated.View
      entering={ENTER.fadeUpSlow(stagger(index, 120, 80))}
      style={{ flex: 1, minWidth: 260 }}
    >
      <Surface
        padded={spacing['2xl']}
        radius="2xl"
        bordered
        style={{
          backgroundColor: tier.featured ? palette.ink : palette.paperDeep,
          borderColor: tier.featured ? palette.teal : palette.paperDeep,
          borderWidth: tier.featured ? 1 : 0,
          minHeight: 460,
          justifyContent: 'space-between',
          ...(tier.featured && {
            shadowColor: palette.teal,
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.28,
            shadowRadius: 40,
          }),
        }}
      >
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Mono color={tier.featured ? palette.sage : palette.teal}>{tier.name.toUpperCase()}</Mono>
            {tier.featured && <ShimmerBadge label="MOST CHOSEN" compact />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xl, gap: 6 }}>
            <Display color={tier.featured ? palette.mist : palette.ink}>${tier.price}</Display>
            <BodySm color={tier.featured ? palette.fog : palette.teal}>{tier.note}</BodySm>
          </View>
          <BodySm
            italic
            family="serif"
            color={tier.featured ? palette.fog : palette.teal}
            style={{ marginTop: 4 }}
          >
            {tier.line}
          </BodySm>
          <View style={{ height: 1, backgroundColor: tier.featured ? palette.inkBorder : palette.fog, marginVertical: spacing.xl }} />
          <View style={{ gap: spacing.md }}>
            {tier.features.map((f) => (
              <View key={f} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                <View style={{ marginTop: 4 }}>
                  <Feather name="check" size={14} color={tier.featured ? palette.sage : palette.teal} />
                </View>
                <Body color={tier.featured ? palette.mist : palette.ink} style={{ flex: 1 }}>
                  {f}
                </Body>
              </View>
            ))}
          </View>
        </View>
        <View style={{ marginTop: spacing['2xl'] }}>
          <Button
            variant={tier.featured ? 'shimmer' : 'ghost'}
            title={tier.cta}
            fullWidth
            haptic={false}
            onPress={() => router.push('/(auth)/sign-up' as any)}
          />
        </View>
      </Surface>
    </Animated.View>
  );
}

// ───────────────────────── Testimonial card ─────────────────────────
interface Quote {
  quote: string;
  name: string;
  role: string;
}

const QUOTES: Quote[] = [
  {
    quote:
      'I stopped bookmarking reels and started learning them. Six months in my Biology shelf looks more useful than a textbook.',
    name: 'Priya N.',
    role: 'Pre-med · Toronto',
  },
  {
    quote:
      'It picked up my favorite creator\u2019s rhythm so well the lesson felt like they made it for me. That\u2019s the whole trick.',
    name: 'Marcus A.',
    role: 'Software engineer · Berlin',
  },
  {
    quote:
      'The Style DNA thing felt like a gimmick until it didn\u2019t. Now I can tell why one clip sticks and another one doesn\u2019t.',
    name: 'Hana T.',
    role: 'PhD, communication · Kyoto',
  },
];

function QuoteCard({ q, index }: { q: Quote; index: number }) {
  return (
    <Animated.View
      entering={ENTER.fadeUpSlow(stagger(index, 120, 60))}
      style={{ flex: 1, minWidth: 280 }}
    >
      <Surface
        padded={spacing['2xl']}
        radius="2xl"
        bordered
        style={{ minHeight: 260 }}
      >
        <Text variant="titleSm" family="serif" italic style={{ lineHeight: 30 }}>
          &ldquo;{q.quote}&rdquo;
        </Text>
        <View style={{ flex: 1 }} />
        <View style={{ marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Noctis variant="head" size={24} color={palette.teal} eyeColor={palette.sage} />
          <View>
            <BodySm weight="semibold">{q.name}</BodySm>
            <MonoSm muted>{q.role}</MonoSm>
          </View>
        </View>
      </Surface>
    </Animated.View>
  );
}

// ───────────────────────── Marketing landing ─────────────────────────
export default function MarketingScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW;

  const scrollY = useSharedValue(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = e.nativeEvent.contentOffset.y;
  };

  const noctisPerchStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [0, 400], [0, -40], Extrapolation.CLAMP) },
      { rotate: `${interpolate(scrollY.value, [0, 400], [0, -6], Extrapolation.CLAMP)}deg` },
    ],
  }));

  const flyingNoctisStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [900, 2100], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: interpolate(p, [0, 1], [0, 400]) },
        { translateY: interpolate(p, [0, 0.5, 1], [0, -20, 80]) },
        { rotate: `${interpolate(p, [0, 1], [-4, 8])}deg` },
      ],
      opacity: interpolate(scrollY.value, [800, 1000, 2100, 2300], [0, 1, 1, 0], Extrapolation.CLAMP),
    };
  });

  const SECTION_PAD = narrow ? spacing['3xl'] : spacing['6xl'];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background as string }}>
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        style={{ flex: 1 }}
        stickyHeaderIndices={Platform.OS === 'web' ? undefined : [0]}
      >
        <MarketingNav narrow={narrow} />

        {/* ── Hero ────────────────────────────────────────── */}
        <View
          style={{
            paddingTop: narrow ? spacing['4xl'] : spacing['6xl'],
            paddingBottom: SECTION_PAD,
            paddingHorizontal: narrow ? spacing.xl : spacing['3xl'],
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: MAX,
              alignSelf: 'center',
              flexDirection: narrow ? 'column' : 'row',
              alignItems: narrow ? 'flex-start' : 'center',
              gap: narrow ? spacing['3xl'] : spacing['5xl'],
            }}
          >
            <View style={{ flex: narrow ? undefined : 1.1, width: narrow ? '100%' : undefined }}>
              <Animated.View entering={ENTER.fadeUp(40)}>
                <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.xl }}>
                  <ShimmerBadge label="PRIVATE BETA" compact />
                  <Mono muted>v 0.4 · april 2026</Mono>
                </View>
              </Animated.View>
              <Animated.View entering={ENTER.fadeUpSlow(140)}>
                <Display style={{ letterSpacing: -1.6, lineHeight: narrow ? 56 : 64 }}>
                  Learn in the language of the feed.
                </Display>
              </Animated.View>
              <Animated.View entering={ENTER.fadeUp(260)}>
                <Text
                  variant="titleSm"
                  family="serif"
                  italic
                  muted
                  style={{ marginTop: spacing.xl, maxWidth: 520, lineHeight: 30 }}
                >
                  Reelize turns the reel you scrolled past into the lesson you remember.
                </Text>
              </Animated.View>
              <Animated.View
                entering={ENTER.fadeUp(380)}
                style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing['3xl'], flexWrap: 'wrap' }}
              >
                <Button
                  variant="shimmer"
                  size="lg"
                  title="Open the app"
                  haptic={false}
                  trailing={<Feather name="arrow-right" size={16} color={palette.ink} />}
                  onPress={() => router.push('/(auth)/sign-up' as any)}
                />
                <Button
                  variant="ghost"
                  size="lg"
                  title="Watch the demo"
                  haptic={false}
                  leading={<Feather name="play" size={14} color={colors.text as string} />}
                />
              </Animated.View>
              <Animated.View entering={ENTER.fadeUp(540)} style={{ marginTop: spacing['3xl'], flexDirection: 'row', gap: spacing.xl, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.sage }} />
                  <MonoSm muted>no ads. no public feed.</MonoSm>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.gold }} />
                  <MonoSm muted>your shelf stays yours.</MonoSm>
                </View>
              </Animated.View>
            </View>

            {/* Hero visual */}
            <View style={{ flex: narrow ? undefined : 1, alignItems: 'center', justifyContent: 'center', width: narrow ? '100%' : undefined }}>
              <Animated.View entering={ENTER.fadeSlow(600)} style={{ alignItems: 'center' }}>
                <HeroComposition />
                {/* Noctis perched beside hero */}
                <Animated.View style={[{ position: 'absolute', right: 0, bottom: -20 }, noctisPerchStyle]}>
                  <Noctis
                    variant="perched"
                    size={96}
                    color={isDark ? palette.mist : palette.ink}
                    eyeColor={palette.sage}
                    animated
                  />
                </Animated.View>
              </Animated.View>
            </View>
          </View>
        </View>

        {/* ── Section: Problem ────────────────────────────── */}
        <Section overline="01 PROBLEM" narrow={narrow} paddingTop={SECTION_PAD}>
          <View
            style={{
              flexDirection: narrow ? 'column' : 'row',
              gap: narrow ? spacing['2xl'] : spacing['5xl'],
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: narrow ? undefined : 1, width: narrow ? '100%' : undefined }}>
              <Animated.View entering={ENTER.fadeUp(40)}>
                <Headline style={{ maxWidth: 440, lineHeight: 42 }}>
                  Attention is short. Learning doesn&rsquo;t have to be.
                </Headline>
              </Animated.View>
            </View>
            <View style={{ flex: narrow ? undefined : 1, width: narrow ? '100%' : undefined, gap: spacing.xl }}>
              <Animated.View entering={ENTER.fadeUp(160)}>
                <BodyLg muted style={{ maxWidth: 520 }}>
                  You save a hundred reels a week. You open six. You remember none. The scroll is
                  not the problem &mdash; the format is. Video that taught you something for thirty
                  seconds deserves a shape you can find again.
                </BodyLg>
              </Animated.View>
              <Animated.View entering={ENTER.fadeUp(260)}>
                <View
                  style={{
                    paddingLeft: spacing.xl,
                    borderLeftWidth: 1,
                    borderLeftColor: palette.teal,
                  }}
                >
                  <Text variant="title" family="serif" italic style={{ lineHeight: 32, maxWidth: 480 }}>
                    &ldquo;The scroll is a library with no shelves. Reelize is the shelves.&rdquo;
                  </Text>
                  <Mono muted style={{ marginTop: spacing.md }}>&mdash; from the notebook</Mono>
                </View>
              </Animated.View>
            </View>
          </View>
        </Section>

        {/* ── Section: Process ────────────────────────────── */}
        <Section overline="02 PROCESS" narrow={narrow} paddingTop={SECTION_PAD}>
          <View style={{ marginBottom: spacing['3xl'] }}>
            <Animated.View entering={ENTER.fadeUp(40)}>
              <Headline style={{ maxWidth: 640 }}>
                Three steps, then the machine goes to work.
              </Headline>
            </Animated.View>
            <Animated.View entering={ENTER.fadeUp(160)} style={{ marginTop: spacing.md }}>
              <Body muted style={{ maxWidth: 560 }}>
                Noctis watches each one. He won&rsquo;t make a sound, but he&rsquo;ll remember.
              </Body>
            </Animated.View>
          </View>

          {/* Flying Noctis parallax on this section */}
          {!narrow && (
            <Animated.View
              pointerEvents="none"
              style={[
                { position: 'absolute', top: 180, left: '18%', zIndex: 2 },
                flyingNoctisStyle,
              ]}
            >
              <Noctis variant="silhouette" size={54} color={palette.teal} eyeColor={palette.sage} />
            </Animated.View>
          )}

          <View
            style={{
              flexDirection: narrow ? 'column' : 'row',
              gap: narrow ? spacing.xl : spacing['2xl'],
            }}
          >
            <ProcessStepCard
              index={0}
              narrow={narrow}
              step={{
                n: '01',
                head: 'Paste a reel.',
                body: 'TikTok, Reels, Shorts \u2014 any thirty-second clip you learned something from, or almost did.',
                icon: <ProcessIcon kind="paste" />,
              }}
            />
            <ProcessStepCard
              index={1}
              narrow={narrow}
              step={{
                n: '02',
                head: 'Name what you want to learn.',
                body: 'One line. &ldquo;Krebs cycle.&rdquo; &ldquo;Why Rome fell.&rdquo; The topic sits in front of the style.',
                icon: <ProcessIcon kind="topic" />,
              }}
            />
            <ProcessStepCard
              index={2}
              narrow={narrow}
              step={{
                n: '03',
                head: 'Get a lesson in its language.',
                body: 'Same pacing, same cuts, same voice energy \u2014 the creator\u2019s rhythm, your subject.',
                icon: <ProcessIcon kind="generate" />,
              }}
            />
          </View>
        </Section>

        {/* ── Section: Sample gallery ────────────────────── */}
        <Section overline="03 LESSONS" narrow={narrow} paddingTop={SECTION_PAD}>
          <View style={{ marginBottom: spacing['2xl'] }}>
            <Animated.View entering={ENTER.fadeUp(40)}>
              <Headline style={{ maxWidth: 640 }}>
                A shelf, not a feed.
              </Headline>
            </Animated.View>
            <Animated.View entering={ENTER.fadeUp(160)} style={{ marginTop: spacing.md }}>
              <Body muted style={{ maxWidth: 560 }}>
                Each lesson is a self-contained clip. Filed by class, tagged by topic,
                attributed to the creator whose style it borrowed.
              </Body>
            </Animated.View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20, marginLeft: narrow ? -spacing.xl : -spacing['3xl'] }}
            contentContainerStyle={{ paddingHorizontal: narrow ? spacing.xl : spacing['3xl'], paddingVertical: spacing.md }}
          >
            {SAMPLES.map((s, i) => (
              <Animated.View key={s.topic} entering={ENTER.fadeUp(stagger(i, 60, 40))}>
                <SampleClipCard sample={s} />
              </Animated.View>
            ))}
          </ScrollView>
        </Section>

        {/* ── Section: Testimonials ─────────────────────── */}
        <Section overline="04 VOICES" narrow={narrow} paddingTop={SECTION_PAD}>
          <View style={{ marginBottom: spacing['2xl'] }}>
            <Animated.View entering={ENTER.fadeUp(40)}>
              <Headline style={{ maxWidth: 720 }}>
                What early readers said.
              </Headline>
            </Animated.View>
          </View>
          <View
            style={{
              flexDirection: narrow ? 'column' : 'row',
              gap: spacing.xl,
            }}
          >
            {QUOTES.map((q, i) => (
              <QuoteCard key={q.name} q={q} index={i} />
            ))}
          </View>
        </Section>

        {/* ── Section: Pricing (paper background) ───────── */}
        <View
          style={{
            backgroundColor: palette.paper,
            paddingTop: SECTION_PAD,
            paddingBottom: SECTION_PAD,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: MAX,
              alignSelf: 'center',
              paddingHorizontal: narrow ? spacing.xl : spacing['3xl'],
            }}
          >
            <Animated.View entering={ENTER.fadeUp(40)}>
              <Overline color={palette.teal} style={{ marginBottom: spacing.md, fontFamily: 'JetBrainsMono_500Medium' }}>
                05 PRICING
              </Overline>
            </Animated.View>
            <Animated.View entering={ENTER.fadeUpSlow(120)}>
              <Text variant="display2" family="serif" color={palette.ink}>
                Simple, for now.
              </Text>
            </Animated.View>
            <Animated.View entering={ENTER.fadeUp(200)} style={{ marginTop: spacing.md, marginBottom: spacing['3xl'] }}>
              <Body color={palette.teal} style={{ maxWidth: 560 }}>
                One tier for the free scroller. One for the student. One for the archivist.
                Cancel anytime. Your library is always yours to keep.
              </Body>
            </Animated.View>
            <View
              style={{
                flexDirection: narrow ? 'column' : 'row',
                gap: spacing.xl,
              }}
            >
              {TIERS.map((t, i) => (
                <PricingCard key={t.name} tier={t} index={i} />
              ))}
            </View>
          </View>
        </View>

        {/* ── Footer ───────────────────────────────────── */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border as string,
            paddingTop: spacing['4xl'],
            paddingBottom: spacing['3xl'],
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: MAX,
              alignSelf: 'center',
              paddingHorizontal: narrow ? spacing.xl : spacing['3xl'],
              flexDirection: narrow ? 'column' : 'row',
              gap: spacing['2xl'],
              justifyContent: 'space-between',
            }}
          >
            <View style={{ gap: spacing.md, flex: narrow ? undefined : 1, maxWidth: 340 }}>
              <NoctisLockup size={34} color={isDark ? palette.mist : palette.ink} eyeColor={palette.sage} />
              <BodySm muted>
                A private self-study tool, built for people who already scroll.
              </BodySm>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing['3xl'] }}>
              <FooterColumn title="Product" links={['Marketing', 'Changelog', 'Roadmap', 'Status']} />
              <FooterColumn title="Company" links={['About', 'Notebook', 'Hiring', 'Press']} />
              <FooterColumn title="Legal" links={['Privacy', 'Terms', 'Cookies', 'Licenses']} />
            </View>
          </View>
          <View
            style={{
              width: '100%',
              maxWidth: MAX,
              alignSelf: 'center',
              paddingHorizontal: narrow ? spacing.xl : spacing['3xl'],
              marginTop: spacing['3xl'],
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <MonoSm muted>{`\u00A9 2026 reelize, inc. \u00b7 built in new york`}</MonoSm>
            <MonoSm muted>v 0.4.2</MonoSm>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ───────────────────────── Section wrapper ─────────────────────────
function Section({
  children,
  overline,
  narrow,
  paddingTop,
}: {
  children: React.ReactNode;
  overline: string;
  narrow: boolean;
  paddingTop: number;
}) {
  return (
    <View
      style={{
        paddingTop,
        paddingBottom: 0,
        paddingHorizontal: narrow ? spacing.xl : spacing['3xl'],
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: MAX,
          alignSelf: 'center',
          position: 'relative',
        }}
      >
        <Animated.View entering={ENTER.fade(20)}>
          <Overline muted style={{ marginBottom: spacing['2xl'] }}>
            {overline}
          </Overline>
        </Animated.View>
        {children}
      </View>
    </View>
  );
}

// ───────────────────────── Process icon ─────────────────────────
function ProcessIcon({ kind }: { kind: 'paste' | 'topic' | 'generate' }) {
  const { colors } = useAppTheme();
  if (kind === 'paste') {
    return (
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.border as string,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.inkTint + (Platform.OS === 'web' ? '' : ''),
        }}
      >
        <Feather name="link" size={22} color={palette.sage} />
      </View>
    );
  }
  if (kind === 'topic') {
    return (
      <View style={{ width: 60, height: 60, justifyContent: 'center' }}>
        <Text variant="display2" family="serif" italic color={palette.sage}>
          Aa
        </Text>
      </View>
    );
  }
  return (
    <View style={{ width: 60, height: 60 }}>
      <StyleDNA variant="medallion" size={60} showLabels={false} spinning tokens={DEFAULT_DNA} />
    </View>
  );
}

// ───────────────────────── Footer column ─────────────────────────
function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <View style={{ gap: spacing.sm, minWidth: 120 }}>
      <Overline muted style={{ marginBottom: spacing.xs }}>
        {title}
      </Overline>
      {links.map((l) => (
        <NavLink key={l} label={l} />
      ))}
    </View>
  );
}
