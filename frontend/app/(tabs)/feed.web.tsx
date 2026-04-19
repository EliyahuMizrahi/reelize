import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

import { Surface } from '@/components/ui/Surface';
import { Chip } from '@/components/ui/Chip';
import { Headline, Title, TitleSm, BodySm, Mono, MonoSm, Overline, Text } from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { Shards } from '@/components/brand/Shards';
import { StyleDNA, DEFAULT_DNA, type DNAToken } from '@/components/brand/StyleDNA';
import { palette, spacing, radii } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useClasses, useFeed, useProfileStats } from '@/data/hooks';
import type { Row } from '@/types/supabase';
import { formatDuration, formatRelative } from '@/lib/format';

// ───────────────────────── Stat tile ─────────────────────────
interface StatProps {
  label: string;
  value: string;
  delta?: string;
  chart: 'spark' | 'bars' | 'ring';
  accent: string;
  index: number;
}

function StatTile({ label, value, delta, chart, accent, index }: StatProps) {
  const { colors } = useAppTheme();
  return (
    <Animated.View entering={ENTER.fadeUp(stagger(index, 80, 40))} style={{ flex: 1, minWidth: 200 }}>
      <Surface padded={spacing.xl} radius="xl" bordered style={{ gap: spacing.lg, minHeight: 140 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Overline muted>{label}</Overline>
          <StatGlyph kind={chart} color={accent} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          <Text variant="display2" family="mono" weight="medium" style={{ letterSpacing: -1 }}>
            {value}
          </Text>
          {delta ? (
            <View style={{ paddingBottom: 10 }}>
              <MonoSm color={accent}>{delta}</MonoSm>
            </View>
          ) : null}
        </View>
      </Surface>
    </Animated.View>
  );
}

function StatGlyph({ kind, color }: { kind: 'spark' | 'bars' | 'ring'; color: string }) {
  if (kind === 'bars') {
    const heights = [10, 16, 12, 22, 18, 28, 20];
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 30 }}>
        {heights.map((h, i) => (
          <View key={i} style={{ width: 3, height: h, borderRadius: 1.5, backgroundColor: color, opacity: 0.55 + (i / heights.length) * 0.45 }} />
        ))}
      </View>
    );
  }
  if (kind === 'spark') {
    const pts = [0.5, 0.62, 0.48, 0.72, 0.68, 0.84, 0.78, 0.94];
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 30, width: 72 }}>
        {pts.map((p, i) => (
          <View key={i} style={{ width: 6, height: p * 28, borderRadius: 1.5, backgroundColor: color, opacity: 0.35 + p * 0.6 }} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: color, opacity: 0.65 }} />
  );
}

// ───────────────────────── Clip card ─────────────────────────
function ClipCard({ id, index, tokens, title, className, classColor, tint, duration, creator }: {
  id: string;
  index: number;
  tokens: DNAToken[];
  title: string;
  className: string;
  classColor: string;
  tint: string;
  duration: string;
  creator: string;
}) {
  const router = useRouter();
  return (
    <Animated.View entering={ENTER.fadeUp(stagger(index, 70, 40))} style={{ flex: 1, minWidth: 220 }}>
      <Pressable
        onPress={() => router.push(`/player/${id}` as any)}
        style={({ pressed, hovered }: any) => ({
          width: '100%',
          aspectRatio: 9 / 13,
          borderRadius: radii.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: classColor + '55',
          transform: [{ translateY: hovered ? -4 : 0 }],
          opacity: pressed ? 0.9 : 1,
          transitionProperty: 'transform' as any,
          transitionDuration: '220ms' as any,
        })}
      >
        <LinearGradient
          colors={[tint, classColor + '33', palette.ink]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={{ position: 'absolute', top: 32, left: 24, opacity: 0.26 }}>
          <Shards size={120} phase="assembled" color={classColor} />
        </View>
        <LinearGradient
          colors={['transparent', 'rgba(4,20,30,0.92)']}
          locations={[0.4, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={{ position: 'absolute', top: 10, right: 10 }}>
          <StyleDNA variant="icon" size={32} showLabels={false} tokens={tokens} color={classColor} />
        </View>
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
          <Chip variant="class" classColor={classColor} label={className} size="sm" />
          <TitleSm color={palette.mist} style={{ marginTop: 8 }} numberOfLines={2}>
            {title}
          </TitleSm>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <MonoSm color={palette.fog} style={{ opacity: 0.8 }}>{creator}</MonoSm>
            <MonoSm color={palette.fog} style={{ opacity: 0.55 }}>{duration}</MonoSm>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────── Empty state ─────────────────────────
function EmptyState({
  hasCourses,
  onNewCourse,
  onNewLesson,
}: {
  hasCourses: boolean;
  onNewCourse: () => void;
  onNewLesson: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Surface
      padded={spacing['3xl']}
      radius="xl"
      bordered
      style={{ gap: spacing.lg, alignItems: 'flex-start' }}
    >
      <Overline muted>GET STARTED</Overline>
      <Title>{hasCourses ? 'Make your first lesson.' : 'Start your first course.'}</Title>
      <BodySm muted style={{ maxWidth: 520 }}>
        {hasCourses
          ? 'Pick a reel you love, we\u2019ll pull its Style DNA and turn it into a short lesson for you.'
          : 'Courses hold topics and lessons. Create one from the library, then add lessons to it.'}
      </BodySm>
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' }}>
        {!hasCourses ? (
          <Pressable
            onPress={onNewCourse}
            style={({ hovered, pressed }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 36,
              paddingHorizontal: 14,
              borderRadius: radii.sm,
              backgroundColor: pressed || hovered ? (colors.primary as string) : (colors.primary as string) + 'DD',
            })}
          >
            <Feather name="plus" size={14} color={colors.onPrimary as string} />
            <Text variant="bodySm" weight="semibold" color={colors.onPrimary as string}>
              New course
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={hasCourses ? onNewLesson : onNewCourse}
          style={({ hovered, pressed }: any) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: 36,
            paddingHorizontal: 14,
            borderRadius: radii.sm,
            borderWidth: 1,
            borderColor: colors.border as string,
            backgroundColor: pressed || hovered ? (colors.elevated as string) : (colors.inputBackground as string),
          })}
        >
          <Feather
            name={hasCourses ? 'plus' : 'book-open'}
            size={14}
            color={colors.text as string}
          />
          <Text variant="bodySm" weight="medium" color={colors.text as string}>
            {hasCourses ? 'New lesson' : 'Go to library'}
          </Text>
        </Pressable>
      </View>
    </Surface>
  );
}

// ───────────────────────── Feed (web) ─────────────────────────
export default function FeedWebScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

  const { data: feedRows } = useFeed(12);
  const { data: classes } = useClasses();
  const { data: stats } = useProfileStats();

  const allClips = feedRows ?? [];
  const classList = classes ?? [];
  const hasLessons = allClips.length > 0;
  const hasCourses = classList.length > 0;
  const recentClips = useMemo<Row<'clips'>[]>(() => allClips.slice(0, 6), [allClips]);
  const resumeClips = useMemo<Row<'clips'>[]>(() => allClips.slice(0, 4), [allClips]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background as string }}
      contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: spacing['5xl'] }}
    >
      <View style={{ gap: spacing['3xl'] }}>
        {/* Stats band */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            <Headline>Dashboard</Headline>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
            <StatTile index={0} label="Lessons generated" value={String(stats?.clipCount ?? 0)} chart="bars" accent={palette.sage} />
            <StatTile index={1} label="Courses" value={String(stats?.classCount ?? 0)} chart="ring" accent={palette.tealBright} />
            <StatTile index={2} label="Topics" value={String(stats?.topicCount ?? 0)} chart="spark" accent={palette.gold} />
          </View>
        </View>

        {!hasLessons ? (
          <EmptyState
            hasCourses={hasCourses}
            onNewCourse={() => router.push('/(tabs)/library' as any)}
            onNewLesson={() => router.push('/(tabs)/create' as any)}
          />
        ) : (
          <>
            {/* Recent lessons rail */}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.lg }}>
                <View>
                  <Overline muted>Recent lessons</Overline>
                  <Title style={{ marginTop: 4 }}>Fresh from the lab.</Title>
                </View>
                <Pressable onPress={() => router.push('/(tabs)/library' as any)}>
                  <Mono color={palette.teal}>view all &rarr;</Mono>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
                {recentClips.map((c, i) => (
                  <ClipCard
                    key={c.id}
                    id={c.id}
                    index={i}
                    tokens={DEFAULT_DNA}
                    title={c.title}
                    className="Course"
                    classColor={palette.sage}
                    tint={c.thumbnail_color ?? palette.tealDeep}
                    duration={formatDuration(c.duration_s)}
                    creator={c.source_creator ?? '@source'}
                  />
                ))}
              </View>
            </View>

            {/* Resume row */}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.lg }}>
                <View>
                  <Overline muted>Continue</Overline>
                  <Title style={{ marginTop: 4 }}>Pick up where you left off.</Title>
                </View>
                <Noctis variant="head" size={28} color={colors.mutedText as string} eyeColor={palette.sage} />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
                {resumeClips.map((c, i) => (
                  <Animated.View key={c.id} entering={ENTER.fadeUp(stagger(i, 70, 40))} style={{ flex: 1, minWidth: 240 }}>
                    <Pressable onPress={() => router.push(`/player/${c.id}` as any)}>
                      <Surface padded={spacing.xl} radius="xl" style={{ gap: spacing.md, minHeight: 160 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Chip label="Course" variant="class" classColor={palette.sage} size="sm" />
                          <MonoSm muted>{formatRelative(c.created_at)}</MonoSm>
                        </View>
                        <TitleSm numberOfLines={2}>{c.title}</TitleSm>
                      </Surface>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
