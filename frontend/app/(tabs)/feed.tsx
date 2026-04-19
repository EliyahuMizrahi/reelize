import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Dimensions,
  FlatList,
  Pressable,
  Platform,
  StyleSheet,
  ViewToken,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Headline, Title, BodySm, Mono, MonoSm, Overline } from '@/components/ui/Text';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { Shards } from '@/components/brand/Shards';
import { StyleDNA, DEFAULT_DNA } from '@/components/brand/StyleDNA';
import { ShimmerBadge } from '@/components/brand/Shimmer';
import { ENTER, stagger } from '@/components/ui/motion';
import { palette, spacing, radii, motion } from '@/constants/tokens';

import { useFeed } from '@/data/hooks';
import type { Row } from '@/types/supabase';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// View-model — derived from the raw `clips` row for the player surface.
type FeedClip = {
  id: string;
  topic: string;
  className: string;
  classColor: string;
  sourceCreator: string;
  sourceDuration: string;
  thumbnailColor: string;
  tokens: typeof DEFAULT_DNA;
  cutPoints: number[];
};

function fmtDuration(s: number | null | undefined): string {
  const sec = Math.max(0, Math.round(s ?? 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function seedFromId(id: string): number {
  let n = 7;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 9973;
  return n || 7;
}

function toFeedClip(row: Row<'clips'>): FeedClip {
  const seed = seedFromId(row.id);
  const cuts: number[] = [];
  const count = 5 + (seed % 3);
  for (let i = 1; i <= count; i++) {
    const base = i / (count + 1);
    const jitter = (((seed + i * 7) % 13) - 6) / 100;
    cuts.push(Math.max(0.04, Math.min(0.96, base + jitter)));
  }
  return {
    id: row.id,
    topic: row.title,
    className: 'Shelf',
    classColor: palette.sage,
    sourceCreator: row.source_creator ?? '@source',
    sourceDuration: fmtDuration(row.duration_s),
    thumbnailColor: row.thumbnail_color ?? palette.tealDeep,
    tokens: DEFAULT_DNA,
    cutPoints: cuts,
  };
}

function triggerHaptic(type: 'light' | 'select' = 'select') {
  if (Platform.OS === 'web') return;
  if (type === 'light') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } else {
    Haptics.selectionAsync().catch(() => {});
  }
}

// ─── Action Rail ────────────────────────────────────────────────────────────

interface RailActionProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active?: boolean;
  count?: string;
  onPress?: () => void;
  color: string;
}

function RailAction({ icon, label, active, count, onPress, color }: RailActionProps) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  const handle = useCallback(() => {
    scale.value = withSequence(
      withTiming(0.86, { duration: 90, easing: Easing.bezier(0.7, 0, 0.84, 0) }),
      withTiming(1, { duration: 260, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
    if (icon === 'heart' || icon === 'bookmark') {
      rotate.value = withSequence(
        withTiming(-8, { duration: 100 }),
        withTiming(0, { duration: 260, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
      );
    }
    triggerHaptic('light');
    onPress?.();
  }, [icon, onPress]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Pressable
      onPress={handle}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{ alignItems: 'center', gap: 4 }}
    >
      <Animated.View
        style={[
          {
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? color + '22' : 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            borderColor: active ? color + '88' : 'rgba(255,255,255,0.12)',
          },
          animStyle,
        ]}
      >
        <Feather name={icon} size={18} color={active ? color : palette.mist} />
      </Animated.View>
      <MonoSm color={palette.fog} style={{ opacity: 0.72 }}>
        {count ?? label}
      </MonoSm>
    </Pressable>
  );
}

// ─── Clip Item ──────────────────────────────────────────────────────────────

interface ClipItemProps {
  clip: FeedClip;
  index: number;
  total: number;
  active: boolean;
  height: number;
  onOpenPlayer: (id: string) => void;
}

function ClipItem({ clip, index, total, active, height, onOpenPlayer }: ClipItemProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [railVisible, setRailVisible] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  // focus entrance
  const focusProgress = useSharedValue(active ? 1 : 0);
  const pausePulse = useSharedValue(0);
  const noctisOpacity = useSharedValue(0);
  const noctisSlide = useSharedValue(-8);

  React.useEffect(() => {
    if (active) {
      focusProgress.value = withTiming(1, {
        duration: motion.dur.slow,
        easing: Easing.bezier(...motion.ease.entrance),
      });
      noctisOpacity.value = withDelay(
        motion.dur.slow,
        withTiming(0.55, { duration: motion.dur.slow, easing: Easing.bezier(...motion.ease.entrance) }),
      );
      noctisSlide.value = withDelay(
        motion.dur.slow,
        withTiming(0, { duration: motion.dur.slow, easing: Easing.bezier(...motion.ease.entrance) }),
      );
    } else {
      focusProgress.value = withTiming(0, { duration: motion.dur.fast });
      noctisOpacity.value = withTiming(0, { duration: motion.dur.fast });
      noctisSlide.value = -8;
    }
  }, [active]);

  const onTapCenter = useCallback(() => {
    triggerHaptic('light');
    setIsPaused((p) => !p);
    pausePulse.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 420, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [pausePulse]);

  const onTapRail = useCallback(() => {
    triggerHaptic('select');
    setRailVisible((v) => !v);
  }, []);

  const railStyle = useAnimatedStyle(() => ({
    opacity: withTiming(railVisible ? 1 : 0, { duration: 220 }),
    transform: [{ translateX: withTiming(railVisible ? 0 : 24, { duration: 240 }) }],
  }));

  const pauseStyle = useAnimatedStyle(() => ({
    opacity: pausePulse.value,
    transform: [{ scale: 0.8 + pausePulse.value * 0.4 }],
  }));

  const noctisStyle = useAnimatedStyle(() => ({
    opacity: noctisOpacity.value,
    transform: [{ translateX: noctisSlide.value }, { translateY: noctisSlide.value }],
  }));

  // video surface gradient
  const tint = clip.thumbnailColor;

  return (
    <View style={{ width: SCREEN_W, height, backgroundColor: palette.ink }}>
      {/* ── Video placeholder ─────────────────────────── */}
      <LinearGradient
        colors={[palette.inkDeep, tint, palette.ink]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* subtle shards backdrop */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: height * 0.18,
          left: SCREEN_W * 0.1,
          opacity: 0.16,
        }}
      >
        <Shards
          size={Math.min(SCREEN_W * 0.9, 360)}
          phase="assembled"
          color={clip.classColor}
        />
      </View>

      {/* film grain-ish vignette via overlay gradient */}
      <LinearGradient
        colors={['rgba(4,20,30,0.75)', 'rgba(4,20,30,0.1)', 'rgba(4,20,30,0.88)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* ── Center pause/play tap zone ───────────────── */}
      <Pressable onPress={onTapCenter} style={styles.tapCenter} />
      <Animated.View pointerEvents="none" style={[styles.pauseBadge, pauseStyle]}>
        <View style={styles.pausePill}>
          <Feather
            name={isPaused ? 'play' : 'pause'}
            size={22}
            color={palette.mist}
          />
        </View>
      </Animated.View>

      {/* ── Top bar counter ──────────────────────────── */}
      {active && (
        <Animated.View
          entering={ENTER.fade(stagger(0, 40))}
          style={styles.topBar}
          pointerEvents="none"
        >
          <View style={styles.counterPill}>
            <MonoSm color={palette.fog}>
              {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </MonoSm>
          </View>
        </Animated.View>
      )}

      {/* ── Top-right medallion ────────────────────── */}
      {active && (
        <Animated.View
          entering={ENTER.zoomIn(stagger(1, 80, 120))}
          style={styles.medallion}
        >
          <Pressable onPress={() => onOpenPlayer(clip.id)}>
            <StyleDNA
              variant="medallion"
              size={48}
              tokens={clip.tokens}
              showLabels={false}
              spinning
              color={clip.classColor}
            />
          </Pressable>
        </Animated.View>
      )}

      {/* ── Bottom overlay content ─────────────────── */}
      {active && (
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: spacing.lg }}>
              <Animated.View entering={ENTER.fadeUp(stagger(0, 80, 80))}>
                <Chip
                  variant="class"
                  classColor={clip.classColor}
                  label={clip.className}
                  size="sm"
                />
              </Animated.View>

              <Animated.View
                entering={ENTER.fadeUpSlow(stagger(1, 80, 80))}
                style={{ marginTop: spacing.sm }}
              >
                <Headline
                  color={palette.mist}
                  numberOfLines={2}
                  style={{ letterSpacing: -0.6 }}
                >
                  {clip.topic}
                </Headline>
              </Animated.View>

              <Animated.View
                entering={ENTER.fadeUp(stagger(2, 80, 80))}
                style={styles.attribution}
              >
                <View
                  style={[
                    styles.avatar,
                    { alignItems: 'center', justifyContent: 'center' },
                  ]}
                >
                  <Mono
                    color={clip.classColor}
                    style={{ fontSize: 11, letterSpacing: 0.5 }}
                  >
                    {(clip.sourceCreator ?? '?')
                      .replace(/^@/, '')
                      .charAt(0)
                      .toUpperCase()}
                  </Mono>
                </View>
                <Mono color={palette.fog} style={{ opacity: 0.85 }}>
                  {clip.sourceCreator}
                </Mono>
                <View style={styles.dot} />
                <Mono color={palette.fog} style={{ opacity: 0.55 }}>
                  from their reel · {clip.sourceDuration}
                </Mono>
              </Animated.View>

              <Animated.View entering={ENTER.fadeUp(stagger(3, 80, 80))} style={{ marginTop: spacing.md }}>
                <ShimmerBadge label="AI LESSON" compact />
              </Animated.View>
            </View>
          </View>
        </View>
      )}

      {/* ── Right rail ─────────────────────────────── */}
      {active && (
        <Animated.View style={[styles.rail, railStyle]} entering={ENTER.fadeUp(stagger(2, 90, 140))}>
          <RailAction
            icon="heart"
            label="like"
            color={palette.alertSoft}
            active={liked}
            count={liked ? '1.2k' : '1.1k'}
            onPress={() => setLiked((v) => !v)}
          />
          <RailAction
            icon="bookmark"
            label="save"
            color={palette.sage}
            active={saved}
            count={saved ? 'saved' : 'save'}
            onPress={() => setSaved((v) => !v)}
          />
          <RailAction
            icon="share-2"
            label="share"
            color={palette.sageSoft}
            onPress={() => {}}
          />
          <RailAction
            icon="info"
            label="info"
            color={palette.fog}
            onPress={() => onOpenPlayer(clip.id)}
          />
        </Animated.View>
      )}

      {/* ── Rail toggle tap strip ──────────────────── */}
      <Pressable onPress={onTapRail} style={styles.railTapStrip} />
    </View>
  );
}

// ─── Feed Screen ────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const router = useRouter();
  const { data: rows, loading } = useFeed();
  const clips = useMemo<FeedClip[]>(
    () => (rows ?? []).map(toFeedClip),
    [rows],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [libraryHintShown, setLibraryHintShown] = useState(false);
  const listRef = useRef<FlatList<FeedClip>>(null);

  // Adjust list item height for tab bar area
  const itemHeight = SCREEN_H;

  const onViewable = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) {
        setActiveIndex(first.index);
        triggerHaptic('select');
      }
    },
  ).current;

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 70 }),
    [],
  );

  const openPlayer = useCallback(
    (id: string) => {
      triggerHaptic('light');
      router.push(`/player/${id}` as any);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: FeedClip; index: number }) => (
      <ClipItem
        clip={item}
        index={index}
        total={clips.length}
        active={index === activeIndex}
        height={itemHeight}
        onOpenPlayer={openPlayer}
      />
    ),
    [activeIndex, itemHeight, openPlayer, clips.length],
  );

  // Library handle hint — shown briefly on mount then on overscroll
  const hintOpacity = useSharedValue(0);
  React.useEffect(() => {
    hintOpacity.value = withDelay(
      1200,
      withSequence(
        withTiming(1, { duration: 420, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        withDelay(2000, withTiming(0, { duration: 420 })),
      ),
    );
    const t = setTimeout(() => setLibraryHintShown(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
    transform: [{ translateY: (1 - hintOpacity.value) * -6 }],
  }));

  if (!loading && clips.length === 0) {
    return (
      <Screen edges={[]} background="ink">
        <View style={styles.emptyWrap}>
          <Title
            align="center"
            family="serif"
            italic
            color={palette.mist}
            style={{ marginTop: spacing.xl, maxWidth: 280 }}
          >
            Your shelf is empty.
          </Title>
          <View style={{ marginTop: spacing['2xl'] }}>
            <Button
              variant="shimmer"
              size="lg"
              title="Paste a reel →"
              onPress={() => router.push('/(tabs)/create' as any)}
            />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]} background="ink">
      <FlatList
        ref={listRef}
        data={clips}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={itemHeight}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, i) => ({ length: itemHeight, offset: itemHeight * i, index: i })}
        removeClippedSubviews={Platform.OS !== 'web'}
        initialNumToRender={2}
        windowSize={3}
        maxToRenderPerBatch={2}
      />

      {/* Library handle hint */}
      {libraryHintShown && (
        <Animated.View pointerEvents="none" style={[styles.libraryHint, hintStyle]}>
          <View style={styles.hintHandle} />
          <Overline color={palette.fog} style={{ opacity: 0.72, marginTop: 6 }}>
            Your library
          </Overline>
        </Animated.View>
      )}
    </Screen>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tapCenter: {
    position: 'absolute',
    top: '30%',
    left: '20%',
    right: '20%',
    bottom: '30%',
  },
  pauseBadge: {
    position: 'absolute',
    top: '48%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pausePill: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(4,20,30,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(4,20,30,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  noctisPeek: {
    position: 'absolute',
    top: 96,
    left: spacing.lg,
  },
  medallion: {
    position: 'absolute',
    top: 52,
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  bottomOverlay: {
    position: 'absolute',
    left: spacing.xl,
    right: 84,
    bottom: 110,
  },
  attribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.mist,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.fog,
    opacity: 0.5,
  },
  rail: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 140,
    gap: spacing.lg,
    alignItems: 'center',
  },
  railTapStrip: {
    position: 'absolute',
    right: 0,
    top: '25%',
    bottom: '25%',
    width: 16,
  },
  libraryHint: {
    position: 'absolute',
    top: 22,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.fog,
    opacity: 0.55,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
});
