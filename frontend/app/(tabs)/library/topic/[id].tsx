import React, { useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Dimensions,
  Platform,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import {
  Headline,
  Title,
  TitleSm,
  MonoSm,
  BodySm,
} from '@/components/ui/Text';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Noctis } from '@/components/brand/Noctis';
import { StyleDNA } from '@/components/brand/StyleDNA';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useTopic, useClipsForTopic, useClass } from '@/data/hooks';
import { DEFAULT_DNA, type DNAToken } from '@/components/brand/StyleDNA';
import type { Row } from '@/types/supabase';

// Local alias for the real Supabase clip row.
type ClipRow = Row<'clips'>;

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = spacing.xl;
const GAP = spacing.md;
const COL_W = (SCREEN_W - H_PAD * 2 - GAP) / 2;

export default function TopicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();

  const { data: topic, loading: topicLoading } = useTopic(id);
  const { data: cls } = useClass(topic?.class_id);
  const { data: clipsRaw } = useClipsForTopic(id);
  const clips = clipsRaw ?? [];

  const openClip = useCallback(
    (clipId: string) => {
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      router.push(`/player/${clipId}` as any);
    },
    [router],
  );

  const onCreate = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    router.push('/(tabs)/create' as any);
  }, [router]);

  if (topicLoading && !topic) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <MonoSm muted>Loading disc…</MonoSm>
        </View>
      </Screen>
    );
  }

  if (!topic) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <TitleSm muted>Disc not found.</TitleSm>
        </View>
      </Screen>
    );
  }

  const classColor = cls?.color_hex ?? palette.sage;
  const className = cls?.name ?? 'Shelf';

  // Mention counts
  const mentionByCreator = new Map<string, number>();
  clips.forEach((c) => {
    const key = c.source_creator ?? '@source';
    mentionByCreator.set(key, (mentionByCreator.get(key) ?? 0) + 1);
  });
  const topCreator = Array.from(mentionByCreator.entries()).sort((a, b) => b[1] - a[1])[0];

  const totalSeconds = clips.reduce(
    (acc, c) => acc + Math.max(0, Math.round(c.duration_s ?? 0)),
    0,
  );
  const totalMin = Math.floor(totalSeconds / 60);
  const totalSecRem = totalSeconds % 60;
  const durationLabel = `${totalMin}m ${totalSecRem.toString().padStart(2, '0')}s`;

  // Stagger heights for masonry feel
  const heightFor = (idx: number) => {
    const ratios = [1.55, 1.72, 1.48, 1.62, 1.78, 1.54];
    return Math.round(COL_W * ratios[idx % ratios.length]);
  };

  // Split into two columns masonry-style
  const left: ClipRow[] = [];
  const right: ClipRow[] = [];
  const leftIdx: number[] = [];
  const rightIdx: number[] = [];
  let leftH = 0;
  let rightH = 0;
  clips.forEach((clip, i) => {
    const h = heightFor(i);
    if (leftH <= rightH) {
      left.push(clip);
      leftIdx.push(i);
      leftH += h + GAP;
    } else {
      right.push(clip);
      rightIdx.push(i);
      rightH += h + GAP;
    }
  });

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          paddingTop: spacing.md,
          paddingBottom: spacing['7xl'] + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header chrome */}
        <Animated.View
          entering={ENTER.fade(20)}
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}
        >
          <IconButton
            variant="ghost"
            size={40}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={22} color={colors.text as string} />
          </IconButton>
          <View style={{ flex: 1 }} />
          <IconButton
            variant="ghost"
            size={40}
            onPress={() => {}}
            accessibilityLabel="More"
          >
            <Feather name="more-horizontal" size={18} color={colors.text as string} />
          </IconButton>
        </Animated.View>

        {/* Title block */}
        <Animated.View entering={ENTER.fadeUp(80)} style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Chip label={className} variant="class" classColor={classColor} size="sm" />
          </View>
          <Headline>{topic.name}</Headline>
          {topic.description ? (
            <BodySm italic family="serif" muted style={{ marginTop: 6 }}>
              {topic.description}
            </BodySm>
          ) : null}
          <MonoSm muted style={{ marginTop: 10 }}>
            {`${clips.length} clip${clips.length === 1 ? '' : 's'}${
              topCreator ? ` \u00b7 ${topCreator[1]} from ${topCreator[0]}` : ''
            } \u00b7 ${durationLabel} total`}
          </MonoSm>
        </Animated.View>

        {/* Empty state */}
        {clips.length === 0 ? (
          <Animated.View
            entering={ENTER.fadeUp(180)}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: spacing['6xl'],
              gap: spacing.md,
            }}
          >
            <Noctis variant="scroll" size={110} animated />
            <Title align="center" italic family="serif" style={{ maxWidth: 280 }}>
              No clips yet. Paste a reel to teach yourself.
            </Title>
            <View style={{ height: 6 }} />
            <Button variant="shimmer" title="Create first clip" onPress={onCreate} />
          </Animated.View>
        ) : (
          <View style={{ flexDirection: 'row', gap: GAP }}>
            <View style={{ width: COL_W, gap: GAP }}>
              {left.map((clip, i) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  height={heightFor(leftIdx[i])}
                  width={COL_W}
                  index={leftIdx[i]}
                  accent={classColor}
                  onPress={() => openClip(clip.id)}
                />
              ))}
            </View>
            <View style={{ width: COL_W, gap: GAP, marginTop: 24 }}>
              {right.map((clip, i) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  height={heightFor(rightIdx[i])}
                  width={COL_W}
                  index={rightIdx[i]}
                  accent={classColor}
                  onPress={() => openClip(clip.id)}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Floating CTA */}
      {clips.length > 0 ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: spacing.xl,
            alignItems: 'center',
          }}
        >
          <Button
            variant="shimmer"
            size="lg"
            title="New clip for this disc"
            leading={<Feather name="plus" size={16} color={palette.ink} />}
            onPress={onCreate}
          />
        </View>
      ) : null}
    </Screen>
  );
}

// -------------------- ClipCard --------------------

interface ClipCardProps {
  clip: ClipRow;
  width: number;
  height: number;
  index: number;
  accent: string;
  onPress: () => void;
}

function ClipCard({ clip, width, height, index, accent, onPress }: ClipCardProps) {
  const color = clip.thumbnail_color ?? palette.tealDeep;
  const durationLabel = (() => {
    const s = Math.max(0, Math.round(clip.duration_s ?? 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  })();
  const styleDNA: DNAToken[] = DEFAULT_DNA;

  return (
    <Animated.View entering={ENTER.fadeUp(stagger(index, 60, 140))} style={{ width, height }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          width: '100%',
          height: '100%',
          borderRadius: radii.xl,
          overflow: 'hidden',
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        {/* Background gradient */}
        <LinearGradient
          colors={[color, mix(color, '#000', 0.4)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Subtle angled brush over thumbnail */}
        <LinearGradient
          colors={[accent + '00', accent + '33', accent + '00']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 0.8 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Creator mention top-left */}
        <View
          style={{
            position: 'absolute',
            top: spacing.sm,
            left: spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 7,
            paddingVertical: 3,
            borderRadius: radii.xs,
            backgroundColor: 'rgba(4,20,30,0.55)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
          }}
        >
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: accent,
              marginRight: 5,
            }}
          />
          <MonoSm color={palette.fog}>{clip.source_creator ?? '@source'}</MonoSm>
        </View>

        {/* Style DNA icon in corner */}
        <View
          style={{
            position: 'absolute',
            top: spacing.sm,
            right: spacing.sm,
          }}
        >
          <StyleDNA
            tokens={styleDNA}
            size={32}
            variant="icon"
            showLabels={false}
            color={accent}
          />
        </View>

        {/* Hairline accent ring — still, not pulsing. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            top: 6,
            bottom: 6,
            borderRadius: radii.xl - 4,
            borderWidth: 1,
            borderColor: accent,
            opacity: 0.28,
          }}
        />

        {/* Bottom scrim for legibility */}
        <LinearGradient
          colors={['rgba(4,20,30,0)', 'rgba(4,20,30,0.85)']}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Play indicator middle */}
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
          pointerEvents="none"
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(4,20,30,0.45)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="play" size={16} color={palette.mist} style={{ marginLeft: 2 }} />
          </View>
        </View>

        {/* Caption bottom */}
        <View
          style={{
            position: 'absolute',
            left: spacing.sm + 2,
            right: spacing.sm + 2,
            bottom: spacing.sm,
          }}
        >
          <TitleSm color={palette.mist} numberOfLines={2}>
            {clip.title}
          </TitleSm>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 4,
            }}
          >
            <MonoSm color={palette.fog} style={{ opacity: 0.85 }}>
              {durationLabel}
            </MonoSm>
            <MonoSm color={accent} style={{ opacity: 0.9 }}>
              {`#${String(index + 1).padStart(2, '0')}`}
            </MonoSm>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// -------- hex mix util (local copy; no cross-file dependency) --------
function mix(hex: string, with_: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(with_);
  if (!a || !b) return hex;
  const r = Math.round(a.r * (1 - amount) + b.r * amount);
  const g = Math.round(a.g * (1 - amount) + b.g * amount);
  const bl = Math.round(a.b * (1 - amount) + b.b * amount);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '');
  if (m.length !== 6) return null;
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}
function toHex(n: number) {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}
