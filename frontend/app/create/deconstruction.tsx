import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Platform, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Surface } from '@/components/ui/Surface';
import {
  Headline,
  Body,
  BodySm,
  Mono,
  MonoSm,
  Overline,
  Text,
} from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { Shards } from '@/components/brand/Shards';
import { StyleDNA, DEFAULT_DNA } from '@/components/brand/StyleDNA';
import { Waveform, PacingGraph } from '@/components/brand/Waveform';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing, motion } from '@/constants/tokens';

/* ===========================================================
   Token definitions — six style facets
   =========================================================== */

type TokenKey = 'pacing' | 'hook' | 'caption' | 'voice' | 'music' | 'visual';

interface TokenMeta {
  key: TokenKey;
  overline: string;
  detailTitle: string;
  detailBody: string;
  detailStats: string;
}

const TOKENS: TokenMeta[] = [
  {
    key: 'pacing',
    overline: 'PACING · 4.3 cuts/s',
    detailTitle: 'A pulse you can feel.',
    detailBody:
      'Cuts don\'t happen on a metronome. They land on stressed syllables — the word that carries the idea. That\'s what gives this source its nervous, alert quality.',
    detailStats: 'Cut frequency: 4.3 / 1.1 variance · 14 cuts in 27s · avg shot length 1.93s',
  },
  {
    key: 'hook',
    overline: 'HOOK · 2.1s open',
    detailTitle: 'Open the loop fast.',
    detailBody:
      'The first line sets a question the rest of the clip answers. Under two seconds before the viewer has a reason to stay.',
    detailStats: 'Opening gambit: declarative pattern-break · scroll-stop target < 2.5s',
  },
  {
    key: 'caption',
    overline: 'CAPTIONS · Shouty bold',
    detailTitle: 'Type is a second voice.',
    detailBody:
      'Bold, all-caps, word-by-word. Captions don\'t transcribe — they emphasize. Italics handle nouns; caps carry the punchline.',
    detailStats: 'Display family · 3 weight steps · 36–64pt · word-drop at 180ms',
  },
  {
    key: 'voice',
    overline: 'VOICE · Mono · 182 bpm',
    detailTitle: 'Close, breathy, unhedged.',
    detailBody:
      'Single speaker, speaking quickly but landing consonants cleanly. Flat reverb, warm low end — the voice sounds confident and close to the mic.',
    detailStats: 'Single speaker · 182 bpm speech · LUFS -14 · breath cuts every ~4s',
  },
  {
    key: 'music',
    overline: 'MUSIC · Lo-fi + punch',
    detailTitle: 'A bed under the voice.',
    detailBody:
      'Textural lo-fi loop, sub-heavy kick on transitions. The music doesn\'t lead — it underlines. Drops briefly on the payoff so the line lands in silence.',
    detailStats: 'Lo-fi loop · 84 bpm · side-chained to VO · drop 0:21–0:24',
  },
  {
    key: 'visual',
    overline: 'VISUAL · Warm neutrals',
    detailTitle: 'A palette of lived-in light.',
    detailBody:
      'Nothing saturated. Skin tones toward amber, shadows pushed toward teal. Feels filmic without announcing it.',
    detailStats: 'Lift -6 amber · gamma neutral · gain +3 teal shadow · film grain 0.08',
  },
];

/* ===========================================================
   Timing: 3 phases totaling ~3800ms
   Phase 1: 0–1200ms   → Source video playing + "Analyzing…"
   Phase 2: 1200–2400ms → Freeze, then shatter outward
   Phase 3: 2400–3800ms → Tokens materialize in orbit
   =========================================================== */

type Phase = 1 | 2 | 3;

const ORBIT_RADIUS_BASE = 132;

function useOrbitLayout(count: number, radius: number) {
  return useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      // Start at top, walk clockwise
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * radius, y: Math.sin(a) * radius, angle: a };
    });
  }, [count, radius]);
}

/* ===========================================================
   Phase 1 — source video frame (stylized 9:16 mini)
   =========================================================== */

function SourceFrame({ visible }: { visible: boolean }) {
  const { colors } = useAppTheme();
  const scan = useSharedValue(0);
  useEffect(() => {
    scan.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.linear }),
      -1,
    );
  }, []);
  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scan.value * 284 - 40 }],
    opacity: visible ? 0.6 : 0,
  }));
  if (!visible) return null;
  return (
    <View style={{ width: 160, height: 284, borderRadius: radii.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border as string, backgroundColor: palette.tealDeep }}>
      {/* stylized frame content */}
      <Svg width={160} height={284} viewBox="0 0 160 284">
        <Rect x={0} y={0} width={160} height={284} fill={palette.tealDeep} />
        <Path d="M 0 180 L 50 150 L 100 170 L 160 130 L 160 284 L 0 284 Z" fill={palette.ink} opacity={0.45} />
        <Circle cx={80} cy={110} r={30} fill={palette.sage} opacity={0.35} />
        <Circle cx={80} cy={110} r={14} fill={palette.mist} opacity={0.78} />
        <Path d="M 74 102 L 90 110 L 74 118 Z" fill={palette.ink} />
        <Rect x={20} y={236} width={120} height={6} rx={3} fill={palette.mist} opacity={0.22} />
        <Rect x={20} y={236} width={64} height={6} rx={3} fill={palette.sage} />
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            height: 40,
            backgroundColor: 'rgba(255,255,255,0.08)',
          },
          scanStyle,
        ]}
      />
    </View>
  );
}

function AnalyzingCaption() {
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 640, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(0.35, { duration: 640, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
    );
  }, []);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 0.85 + 0.3 * pulse.value }] }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md }}>
      <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.sage }, dot]} />
      <MonoSm muted>ANALYZING</MonoSm>
    </View>
  );
}

/* ===========================================================
   Phase 2 — shard ring (ignites outward)
   Uses the Shards primitive for correctness, plus 6 "ignition" radii
   =========================================================== */

/** Radial "ignition" streak. Positioned absolute from stage center, rotated
 * to an angle, stretched by scaleX on the UI thread. */
function IgnitionBeam({ angleDeg, index, active }: { angleDeg: number; index: number; active: boolean }) {
  const prog = useSharedValue(0);
  useEffect(() => {
    if (active) {
      prog.value = withDelay(
        index * 55,
        withTiming(1, { duration: 900, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
      );
    }
  }, [active, index]);
  const style = useAnimatedStyle(() => ({
    opacity: prog.value < 0.08 ? 0 : 0.85 * (1 - prog.value) + 0.05,
    transform: [{ rotate: `${angleDeg}deg` }, { scaleX: prog.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: -0.75,
          width: 150,
          height: 1.5,
          backgroundColor: palette.sage,
          transformOrigin: '0 50%',
        } as any,
        style,
      ]}
    />
  );
}

function IgnitionBeams({ active }: { active: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', width: 1, height: 1, left: '50%', top: '50%' }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <IgnitionBeam key={i} index={i} angleDeg={(i / 6) * 360} active={active} />
      ))}
    </View>
  );
}

/* ===========================================================
   Phase 3 — orbiting tokens.
   Each token is its own component so it can own hooks.
   =========================================================== */

interface OrbitTokenProps {
  token: TokenMeta;
  index: number;
  phase: Phase;
  pos: { x: number; y: number; angle: number };
  onPress: (key: TokenKey) => void;
}

function TokenVisualMini({ kind }: { kind: TokenKey }) {
  switch (kind) {
    case 'pacing':
      return <PacingGraph width={88} height={34} color={palette.sage} />;
    case 'hook':
      return (
        <Text variant="bodySm" family="serif" italic color={palette.mist}>
          — "Most people don't know…"
        </Text>
      );
    case 'caption':
      return (
        <View style={{ alignItems: 'flex-start' }}>
          <Text
            variant="bodySm"
            weight="bold"
            color={palette.mist}
            upper
            style={{ letterSpacing: 0.4 }}
          >
            THE KREBS CYCLE{' '}
            <Text variant="bodySm" italic weight="bold" color={palette.sage} upper>
              *EXPLAINED*
            </Text>
          </Text>
        </View>
      );
    case 'voice':
      return (
        <Waveform
          bars={22}
          height={28}
          animated
          speakers={[0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]}
          color={palette.sage}
        />
      );
    case 'music':
      return (
        <PacingGraph
          width={88}
          height={34}
          color={palette.sageSoft}
          points={[0.2, 0.3, 0.25, 0.4, 0.55, 0.5, 0.7, 0.85, 0.7, 0.5, 0.35, 0.25, 0.3, 0.45, 0.6, 0.8]}
        />
      );
    case 'visual': {
      const sw = [palette.paperDeep, palette.gold, palette.teal, palette.tealDeep, palette.ink];
      return (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {sw.map((c, i) => (
            <View
              key={i}
              style={{ width: 14, height: 20, borderRadius: 2, backgroundColor: c, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}
            />
          ))}
        </View>
      );
    }
  }
}

function OrbitToken({ token, index, phase, pos, onPress }: OrbitTokenProps) {
  const { colors } = useAppTheme();

  // Appear in phase 3 with staggered entry, then continue to gently float/rotate
  const revealed = useSharedValue(0);
  const idle = useSharedValue(0);

  useEffect(() => {
    if (phase >= 3) {
      revealed.value = withDelay(
        index * 90,
        withTiming(1, { duration: 620, easing: Easing.bezier(...motion.ease.entrance) }),
      );
      idle.value = withDelay(
        900 + index * 140,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 3800 + index * 210, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
            withTiming(0, { duration: 3800 + index * 210, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
          ),
          -1,
        ),
      );
    }
  }, [phase, index]);

  const style = useAnimatedStyle(() => {
    const r = revealed.value;
    // seat-origin: shards had flown out. Tokens now replace them at orbit position.
    const tx = pos.x * r;
    const ty = pos.y * r;
    // drift: tiny radial breathing + tangential sway
    const sway = Math.sin((idle.value - 0.5) * Math.PI) * 3.5;
    const breathe = (idle.value - 0.5) * 4;
    const bx = Math.cos(pos.angle) * breathe + Math.cos(pos.angle + Math.PI / 2) * sway;
    const by = Math.sin(pos.angle) * breathe + Math.sin(pos.angle + Math.PI / 2) * sway;
    return {
      opacity: r,
      transform: [
        { translateX: tx + bx },
        { translateY: ty + by },
        { scale: 0.6 + 0.4 * r },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents={phase >= 3 ? 'auto' : 'none'}
      style={[
        {
          position: 'absolute',
          left: '50%',
          top: '50%',
          marginLeft: -92,
          marginTop: -30,
          width: 184,
        },
        style,
      ]}
    >
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
          onPress(token.key);
        }}
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? 0.97 : 1 }],
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <Surface
          elevation="raised"
          radius="lg"
          style={{
            paddingVertical: 10,
            paddingHorizontal: 12,
            gap: 6,
            alignItems: 'flex-start',
            backgroundColor: (colors.elevated as string) + 'F5',
          }}
        >
          <Overline muted style={{ letterSpacing: 1.4 }}>
            {token.overline}
          </Overline>
          <View style={{ alignSelf: 'stretch' }}>
            <TokenVisualMini kind={token.key} />
          </View>
        </Surface>
      </Pressable>
    </Animated.View>
  );
}

/* ===========================================================
   Detail modal — expanded token
   =========================================================== */

function TokenDetailSheet({
  token,
  onClose,
}: {
  token: TokenMeta | null;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Modal visible={!!token} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable onPress={onClose} style={{ flex: 1 }} />
        {token ? (
          <Animated.View
            entering={FadeIn.duration(motion.dur.slow)}
            style={{
              backgroundColor: colors.background as string,
              borderTopLeftRadius: radii['2xl'],
              borderTopRightRadius: radii['2xl'],
              borderTopWidth: 1,
              borderColor: colors.border as string,
              padding: spacing.xl,
              paddingBottom: spacing['4xl'],
              gap: spacing.lg,
            }}
          >
            {/* grab handle */}
            <View
              style={{
                alignSelf: 'center',
                width: 44,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border as string,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Overline muted style={{ flex: 1 }}>
                {token.overline}
              </Overline>
              <IconButton onPress={onClose} size={36} accessibilityLabel="Close">
                <Feather name="x" size={18} color={colors.text as string} />
              </IconButton>
            </View>

            {/* Big visualization */}
            <Surface elevation="card" radius="lg" padded={spacing.xl}>
              <TokenBigVisual kind={token.key} />
            </Surface>

            <Headline>{token.detailTitle}</Headline>
            <Body>{token.detailBody}</Body>
            <Mono muted>{token.detailStats}</Mono>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

function TokenBigVisual({ kind }: { kind: TokenKey }) {
  switch (kind) {
    case 'pacing':
      return <PacingGraph width={280} height={80} color={palette.sage} />;
    case 'hook':
      return (
        <Text variant="headline" family="serif" italic color={palette.mist} style={{ lineHeight: 40 }}>
          "Most people don't know what a mitochondrion actually does — watch."
        </Text>
      );
    case 'caption':
      return (
        <View style={{ gap: 6 }}>
          <Text variant="title" weight="bold" upper color={palette.mist} style={{ letterSpacing: 0.6 }}>
            THE KREBS CYCLE
          </Text>
          <Text variant="title" weight="bold" italic upper color={palette.sage} style={{ letterSpacing: 0.6 }}>
            *EXPLAINED*
          </Text>
        </View>
      );
    case 'voice':
      return (
        <Waveform
          bars={48}
          height={60}
          animated
          speakers={[0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0]}
          color={palette.sage}
        />
      );
    case 'music':
      return (
        <PacingGraph
          width={280}
          height={80}
          color={palette.sageSoft}
          points={[0.2, 0.3, 0.25, 0.4, 0.55, 0.5, 0.7, 0.85, 0.7, 0.5, 0.35, 0.25, 0.3, 0.45, 0.6, 0.8, 0.7, 0.5, 0.4, 0.3]}
        />
      );
    case 'visual': {
      const sw = [palette.paperDeep, palette.gold, palette.teal, palette.tealDeep, palette.ink];
      return (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {sw.map((c, i) => (
            <View
              key={i}
              style={{ flex: 1, height: 72, borderRadius: radii.sm, backgroundColor: c }}
            />
          ))}
        </View>
      );
    }
  }
}

/* ===========================================================
   Phase transition controller (attaches to a master timeline)
   =========================================================== */

function useDeconstructionTimeline() {
  const [phase, setPhase] = useState<Phase>(1);
  const [sourceOn, setSourceOn] = useState(true);
  const [shardsOn, setShardsOn] = useState(false);
  const [shardsPhase, setShardsPhase] = useState<'assembled' | 'exploded'>('assembled');

  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];
    // → at 1200ms the source shatters
    t.push(
      setTimeout(() => {
        setPhase(2);
        // Spawn shards (assembled) then immediately transition to exploded so the
        // Shards primitive tweens them outward.
        setShardsOn(true);
        // remove the source frame shortly after the shatter lands
        t.push(setTimeout(() => setSourceOn(false), 280));
        // let the shard component mount in 'assembled', then flip a tick later
        t.push(setTimeout(() => setShardsPhase('exploded'), 60));
      }, 1200),
    );
    // → at 2400ms, tokens take over
    t.push(
      setTimeout(() => {
        setPhase(3);
      }, 2400),
    );
    return () => t.forEach(clearTimeout);
  }, []);

  return { phase, sourceOn, shardsOn, shardsPhase };
}

/* ===========================================================
   Main screen
   =========================================================== */

export default function DeconstructionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string }>();
  const { colors } = useAppTheme();

  const { phase, sourceOn, shardsOn, shardsPhase } = useDeconstructionTimeline();
  const [detail, setDetail] = useState<TokenMeta | null>(null);

  // Orbit positions for 6 tokens
  const orbit = useOrbitLayout(TOKENS.length, ORBIT_RADIUS_BASE);

  // Shards: after they explode, fade them away so tokens can own the space
  const shardsFade = useSharedValue(1);
  useEffect(() => {
    if (phase >= 3) {
      shardsFade.value = withDelay(
        200,
        withTiming(0.15, { duration: 800, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      );
    }
  }, [phase]);
  const shardsStyle = useAnimatedStyle(() => ({ opacity: shardsFade.value }));

  // Source fade shared
  const sourceFade = useSharedValue(1);
  useEffect(() => {
    if (!sourceOn) sourceFade.value = withTiming(0, { duration: 240 });
  }, [sourceOn]);
  const sourceStyle = useAnimatedStyle(() => ({ opacity: sourceFade.value, transform: [{ scale: sourceOn ? 1 : 0.9 }] }));

  // Medallion appears in phase 3 — gentle pulse
  const medallionReveal = useSharedValue(0);
  const medallionPulse = useSharedValue(0);
  useEffect(() => {
    if (phase >= 3) {
      medallionReveal.value = withTiming(1, {
        duration: 700,
        easing: Easing.bezier(...motion.ease.entrance),
      });
      medallionPulse.value = withDelay(
        800,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 2600, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
            withTiming(0, { duration: 2600, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
          ),
          -1,
        ),
      );
    }
  }, [phase]);
  const medallionStyle = useAnimatedStyle(() => ({
    opacity: medallionReveal.value,
    transform: [
      { scale: 0.7 + 0.3 * medallionReveal.value + 0.02 * medallionPulse.value },
    ],
  }));

  // Bottom "Continue" bar: fade in during phase 3
  const continueReveal = useSharedValue(0);
  useEffect(() => {
    if (phase >= 3) {
      continueReveal.value = withDelay(
        TOKENS.length * 90 + 400,
        withTiming(1, { duration: 500, easing: Easing.bezier(...motion.ease.entrance) }),
      );
    }
  }, [phase]);
  const continueStyle = useAnimatedStyle(() => ({
    opacity: continueReveal.value,
    transform: [{ translateY: 14 * (1 - continueReveal.value) }],
  }));

  // Noctis — tilt head occasionally in phase 3
  const noctisTilt = useSharedValue(0);
  useEffect(() => {
    if (phase >= 3) {
      noctisTilt.value = withDelay(
        1600,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 260, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
            withDelay(500, withTiming(0, { duration: 320, easing: Easing.bezier(0.4, 0, 0.6, 1) })),
            withDelay(3200, withTiming(0, { duration: 10 })),
          ),
          -1,
        ),
      );
    }
  }, [phase]);
  const noctisStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${noctisTilt.value * -8}deg` }],
  }));

  // Haptic at shatter moment
  useEffect(() => {
    if (phase === 2 && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
  }, [phase]);

  const onContinue = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    const sourceId = (params.url as string) || 'mock';
    router.push(('/create/topic?sourceId=' + encodeURIComponent(sourceId)) as any);
  };

  const onBack = () => {
    router.back();
  };

  return (
    <Screen background="ink">
      {/* Grain overlay */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: palette.ink,
          opacity: 0.08,
        }}
      />

      {/* Back */}
      <View
        style={{
          position: 'absolute',
          top: spacing['3xl'],
          left: spacing.lg,
          zIndex: 5,
        }}
      >
        <IconButton onPress={onBack} size={40} variant="glass" accessibilityLabel="Back">
          <Feather name="chevron-left" size={20} color={palette.mist} />
        </IconButton>
      </View>

      {/* Noctis perched — upper right */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: spacing['3xl'] - 4,
            right: spacing.lg,
            zIndex: 5,
          },
          noctisStyle,
        ]}
      >
        <Noctis variant="perched" animated size={72} color={palette.mist} eyeColor={palette.sage} />
      </Animated.View>

      {/* Phase label — top center */}
      <View
        style={{
          position: 'absolute',
          top: spacing['4xl'] + 20,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 3,
        }}
      >
        <Overline muted style={{ letterSpacing: 2.6 }}>
          {phase === 1 ? 'SOURCE' : phase === 2 ? 'SHATTERING' : 'STYLE DNA'}
        </Overline>
      </View>

      {/* Hero stage */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* Phase 1 — source frame */}
        {sourceOn ? (
          <Animated.View style={sourceStyle}>
            <SourceFrame visible={sourceOn} />
            <View style={{ alignItems: 'center' }}>
              <AnalyzingCaption />
            </View>
          </Animated.View>
        ) : null}

        {/* Phase 2 — shards (kept during phase 3 but faded) */}
        {shardsOn ? (
          <Animated.View style={[{ position: 'absolute' }, shardsStyle]}>
            <Shards size={360} phase={shardsPhase} duration={1100} color={palette.sage} />
          </Animated.View>
        ) : null}
        {/* ignition beams */}
        {phase >= 2 ? <IgnitionBeams active /> : null}

        {/* Phase 3 — central medallion + orbit tokens */}
        {phase >= 3 ? (
          <>
            <Animated.View style={[{ position: 'absolute' }, medallionStyle]}>
              <StyleDNA
                tokens={DEFAULT_DNA}
                size={168}
                variant="medallion"
                spinning
                showLabels={false}
              />
            </Animated.View>
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              pointerEvents="box-none"
            >
              {TOKENS.map((t, i) => (
                <OrbitToken
                  key={t.key}
                  token={t}
                  index={i}
                  phase={phase}
                  pos={orbit[i]}
                  onPress={(k) => setDetail(TOKENS.find((x) => x.key === k) ?? null)}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>

      {/* Footer continue bar */}
      <Animated.View
        pointerEvents={phase >= 3 ? 'auto' : 'none'}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing['3xl'],
            backgroundColor: palette.ink + 'EE',
            borderTopWidth: 1,
            borderTopColor: colors.border as string,
            gap: 10,
          },
          continueStyle,
        ]}
      >
        <BodySm muted align="center">
          Tap a token to read how it'll shape your lesson.
        </BodySm>
        <Button title="Continue →" variant="shimmer" size="lg" fullWidth onPress={onContinue} />
      </Animated.View>

      <TokenDetailSheet token={detail} onClose={() => setDetail(null)} />
    </Screen>
  );
}
