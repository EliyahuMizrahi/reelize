import React, { useEffect, useState } from 'react';
import { View, Pressable, ScrollView, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

import { Screen, ScreenContent } from '@/components/ui/Screen';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import {
  Display2,
  BodyLg,
  Mono,
  MonoSm,
  Overline,
  Text,
  TitleSm,
} from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { ENTER, stagger } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing, motion } from '@/constants/tokens';
import { useFeed } from '@/data/hooks';
import type { Row } from '@/types/supabase';

type Tab = 'url' | 'roll' | 'recents';

type SourcePlatform = 'TikTok' | 'Instagram' | 'YouTube';

type Preview = {
  handle: string;
  captionLine: string;
  duration: string;
  platform: SourcePlatform;
  thumbColor: string;
} | null;

function detectPlatform(url: string): SourcePlatform | null {
  const u = url.toLowerCase();
  if (!u) return null;
  if (u.includes('tiktok')) return 'TikTok';
  if (u.includes('instagram') || u.includes('/reel')) return 'Instagram';
  if (u.includes('youtube') || u.includes('youtu.be') || u.includes('/shorts')) return 'YouTube';
  // If it looks like a URL, guess TikTok by default
  if (u.startsWith('http') || u.includes('.')) return 'TikTok';
  return null;
}

/* --- small decorative pieces --- */

function ShimmerLine({ width = 120 }: { width?: number }) {
  const { colors } = useAppTheme();
  const shift = useSharedValue(0);
  useEffect(() => {
    shift.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      -1,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.55 * Math.abs(Math.sin(shift.value * Math.PI)),
  }));
  return (
    <Animated.View
      style={[
        { height: 2, width, borderRadius: 2, backgroundColor: colors.primary as string },
        style,
      ]}
    />
  );
}

function DotPulse() {
  const { colors } = useAppTheme();
  const s = useSharedValue(0.4);
  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 720, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(0.4, { duration: 720, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
    );
  }, []);
  const st = useAnimatedStyle(() => ({
    opacity: s.value,
    transform: [{ scale: 0.82 + 0.35 * s.value }],
  }));
  return (
    <Animated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary as string },
        st,
      ]}
    />
  );
}

/* --- Tab switcher --- */

function TabSwitcher({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  const { colors } = useAppTheme();
  const TABS: { id: Tab; label: string }[] = [
    { id: 'url', label: 'Paste URL' },
    { id: 'roll', label: 'Camera Roll' },
    { id: 'recents', label: 'Recents' },
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        padding: 4,
        borderRadius: radii.pill,
        backgroundColor: colors.card as string,
        borderWidth: 1,
        borderColor: colors.border as string,
        alignSelf: 'stretch',
      }}
    >
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <Pressable
            key={t.id}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
              onChange(t.id);
            }}
            style={{
              flex: 1,
              paddingVertical: 10,
              alignItems: 'center',
              borderRadius: radii.pill,
              backgroundColor: active ? (colors.primary as string) : 'transparent',
            }}
          >
            <Text
              variant="caption"
              weight="semibold"
              upper
              color={active ? palette.ink : (colors.mutedText as string)}
              style={{ letterSpacing: 1.4 }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --- Preview card (shared by URL + Roll tabs) --- */

function PreviewCard({
  preview,
  loading,
}: {
  preview: Preview;
  loading: boolean;
}) {
  const { colors } = useAppTheme();
  if (!preview && !loading) return null;
  return (
    <Animated.View
      entering={ENTER.fadeUp(40)}
      style={{ marginTop: spacing.xl }}
    >
      <Surface
        elevation="card"
        radius="xl"
        style={{
          flexDirection: 'row',
          gap: spacing.lg,
          padding: spacing.lg,
        }}
      >
        {/* 9:16 thumb */}
        <View
          style={{
            width: 72,
            height: 128,
            borderRadius: radii.md,
            backgroundColor: preview?.thumbColor ?? (colors.elevated as string),
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border as string,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading && !preview ? (
            <ShimmerLine width={40} />
          ) : (
            <Svg width={28} height={28} viewBox="0 0 28 28">
              <Path d="M 10 8 L 22 14 L 10 20 Z" fill={palette.mist} opacity={0.92} />
            </Svg>
          )}
        </View>

        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View style={{ gap: 6 }}>
            {loading && !preview ? (
              <>
                <ShimmerLine width={140} />
                <ShimmerLine width={180} />
              </>
            ) : preview ? (
              <>
                <Text variant="bodySm" weight="semibold">
                  {preview.handle}
                </Text>
                <Text variant="bodySm" muted numberOfLines={2}>
                  {preview.captionLine}
                </Text>
              </>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {preview ? (
              <>
                <Mono muted>{preview.duration}</Mono>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: colors.border as string,
                  }}
                >
                  <Text variant="caption" weight="semibold" upper muted style={{ letterSpacing: 1.3 }}>
                    Detected · {preview.platform}
                  </Text>
                </View>
              </>
            ) : (
              <MonoSm muted>Reading metadata…</MonoSm>
            )}
          </View>
        </View>
      </Surface>
    </Animated.View>
  );
}

/* --- Paste URL Tab --- */

function PasteUrlTab({ onReady }: { onReady: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const platform = detectPlatform(url);

  useEffect(() => {
    onReady(url);
  }, [url, onReady]);

  return (
    <View style={{ marginTop: spacing['2xl'] }}>
      <TextField
        variant="editorial"
        font="serif"
        placeholder="paste a link…"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        helperText="TikTok, Instagram Reel, YouTube Short"
      />
      {platform ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md }}>
          <DotPulse />
          <MonoSm muted>Detected · {platform}</MonoSm>
        </View>
      ) : null}
    </View>
  );
}

/* --- Camera Roll Tab --- */

// Muted tints drawn from the palette so camera-roll placeholders never
// clash with the shelf's undertone.
const ROLL_SWATCHES = [
  palette.tealDeep,
  palette.inkTint,
  palette.inkElevated,
  palette.teal,
  palette.ink,
  palette.inkDeep,
  palette.tealDeep,
  palette.inkElevated,
  palette.inkTint,
];

function RollThumb({
  color,
  index,
  onPress,
  selected,
}: {
  color: string;
  index: number;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Animated.View
      entering={ENTER.fadeUp(stagger(index, 40))}
      style={{ flexBasis: '31%', flexGrow: 0, aspectRatio: 9 / 16 }}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          width: '100%',
          height: '100%',
          borderRadius: radii.md,
          backgroundColor: color,
          overflow: 'hidden',
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? (colors.primary as string) : (colors.border as string),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        })}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Rect x={3} y={5} width={18} height={14} rx={2} stroke={palette.mist} strokeWidth={1.2} fill="transparent" opacity={0.8} />
          <Circle cx={8} cy={10} r={1.6} fill={palette.mist} opacity={0.8} />
          <Path d="M 4 17 L 10 12 L 14 15 L 20 9" stroke={palette.mist} strokeWidth={1.2} fill="transparent" opacity={0.8} />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}

function CameraRollTab({ onReady }: { onReady: (url: string) => void }) {
  // Not wired yet — will be replaced with an expo-image-picker flow once
  // we add upload support to /analyze on the frontend. Parent gets an empty
  // URL so the Deconstruct button stays disabled while this tab is active.
  useEffect(() => {
    onReady('');
  }, [onReady]);
  return (
    <View style={{ marginTop: spacing['2xl'], alignItems: 'center', gap: spacing.md }}>
      <MonoSm muted>Camera roll upload isn't wired up yet.</MonoSm>
      <MonoSm muted>Paste a URL for now.</MonoSm>
    </View>
  );
}

/* --- Recents Tab --- */

function RecentCard({
  topic,
  className,
  classColor,
  creator,
  duration,
  index,
  onPress,
}: {
  topic: string;
  className: string;
  classColor: string;
  creator: string;
  duration: string;
  index: number;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Animated.View entering={ENTER.fadeUp(stagger(index, 60))}>
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <Surface elevation="card" radius="lg" style={{ padding: spacing.lg, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: classColor,
                }}
              />
              <Text variant="caption" weight="semibold" upper color={classColor} style={{ letterSpacing: 1.4 }}>
                {className}
              </Text>
            </View>
            <Mono muted>{duration}</Mono>
          </View>
          <TitleSm>{topic}</TitleSm>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <MonoSm muted>{creator}</MonoSm>
            <Text variant="caption" muted style={{ letterSpacing: 0.8 }}>
              tap to re-deconstruct →
            </Text>
          </View>
        </Surface>
      </Pressable>
    </Animated.View>
  );
}

function RecentsTab({ onPick }: { onPick: (url: string) => void }) {
  const { data } = useFeed(5);
  const items = (data ?? []) as Row<'clips'>[];

  if (items.length === 0) {
    return (
      <View style={{ marginTop: spacing['2xl'], gap: spacing.md }}>
        <Overline muted>Last 5 sources</Overline>
        <MonoSm muted>nothing here yet — paste your first reel.</MonoSm>
      </View>
    );
  }

  function fmt(s: number | null | undefined): string {
    const sec = Math.max(0, Math.round(s ?? 0));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  return (
    <View style={{ marginTop: spacing['2xl'], gap: spacing.md }}>
      <Overline muted>Last 5 sources</Overline>
      {items.map((c, i) => (
        <RecentCard
          key={c.id}
          index={i}
          topic={c.title}
          className="Class"
          classColor={palette.sage}
          creator={c.source_creator ?? '@source'}
          duration={fmt(c.duration_s)}
          onPress={() => onPick('recent://' + c.id)}
        />
      ))}
    </View>
  );
}

/* --- screen --- */

export default function CreateScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [tab, setTab] = useState<Tab>('url');
  const [activeUrl, setActiveUrl] = useState('');

  const noctisFloat = useSharedValue(0);
  useEffect(() => {
    noctisFloat.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 2400, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(0, { duration: 2400, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
    );
  }, []);
  const noctisStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: noctisFloat.value }],
  }));

  const ready = activeUrl.trim().length > 6 && detectPlatform(activeUrl) !== null;

  const onDeconstruct = () => {
    if (!ready) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    router.push(('/create/deconstruction?url=' + encodeURIComponent(activeUrl)) as any);
  };

  const handleRecentPick = (url: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    router.push(('/create/deconstruction?url=' + encodeURIComponent(url)) as any);
  };

  return (
    <Screen background="primary">
      {/* Noctis — watching, top-right */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: spacing['3xl'],
            right: spacing.xl,
            zIndex: 2,
          },
          noctisStyle,
        ]}
        entering={ENTER.fadeSlow(160)}
      >
        <Noctis variant="watching" animated size={64} color={colors.primary as string} eyeColor={palette.sage} />
      </Animated.View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenContent>
          <View style={{ marginTop: spacing['3xl'], marginBottom: spacing.xl, maxWidth: 280 }}>
            <Animated.View entering={ENTER.fadeUp(60)}>
              <Display2>Start with a reel you love.</Display2>
            </Animated.View>
          </View>

          <Animated.View entering={ENTER.fadeUp(260)}>
            <TabSwitcher tab={tab} onChange={setTab} />
          </Animated.View>

          {/* Tab content */}
          {tab === 'url' && (
            <Animated.View key="url" entering={FadeIn.duration(motion.dur.normal)}>
              <PasteUrlTab onReady={setActiveUrl} />
            </Animated.View>
          )}
          {tab === 'roll' && (
            <Animated.View key="roll" entering={FadeIn.duration(motion.dur.normal)}>
              <CameraRollTab onReady={setActiveUrl} />
            </Animated.View>
          )}
          {tab === 'recents' && (
            <Animated.View key="recents" entering={FadeIn.duration(motion.dur.normal)}>
              <RecentsTab onPick={handleRecentPick} />
            </Animated.View>
          )}
        </ScreenContent>
      </ScrollView>

      {/* Primary Deconstruct bar — only visible on url/roll tabs */}
      {tab !== 'recents' ? (
        <Animated.View
          entering={ENTER.fadeUp(0)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing['3xl'],
            backgroundColor: (colors.background as string) + 'EE',
            borderTopWidth: 1,
            borderTopColor: colors.border as string,
          }}
        >
          <Button
            title="Deconstruct →"
            variant={ready ? 'shimmer' : 'tertiary'}
            size="lg"
            fullWidth
            disabled={!ready}
            onPress={onDeconstruct}
          />
        </Animated.View>
      ) : null}
    </Screen>
  );
}
