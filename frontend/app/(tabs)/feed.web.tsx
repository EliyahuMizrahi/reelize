import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

import { Surface, Divider } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { IconButton } from '@/components/ui/IconButton';
import { Chip } from '@/components/ui/Chip';
import { Headline, Title, TitleSm, BodySm, Mono, MonoSm, Overline, Text } from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { Shards } from '@/components/brand/Shards';
import { StyleDNA, DEFAULT_DNA, type DNAToken } from '@/components/brand/StyleDNA';
import { palette, spacing, radii, layout } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useClasses, useFeed, useProfileStats, useStreakGrid } from '@/data/hooks';
import type { StreakDay } from '@/data/queries';
import type { Row } from '@/types/supabase';

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

const WIDE_BREAK = 1280;

// ───────────────────────── Top bar ─────────────────────────
function TopBar() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing['2xl'],
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        gap: spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Mono muted>Shelf</Mono>
        <Mono muted>/</Mono>
        <Mono>Dashboard</Mono>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, justifyContent: 'flex-end' }}>
        <View style={{ maxWidth: 280, flex: 1 }}>
          <TextField
            placeholder="Search your shelf"
            variant="boxed"
            leading={<Feather name="search" size={14} color={colors.mutedText as string} />}
          />
        </View>
        <IconButton variant="filled" size={40} accessibilityLabel="Filter">
          <Feather name="sliders" size={16} color={colors.text as string} />
        </IconButton>
        <Button
          variant="shimmer"
          size="md"
          title="New lesson"
          haptic={false}
          leading={<Feather name="plus" size={14} color={palette.ink} />}
          onPress={() => router.push('/(tabs)/create' as any)}
        />
      </View>
    </View>
  );
}

// ───────────────────────── Stat tile ─────────────────────────
interface StatProps {
  label: string;
  value: string;
  delta?: string;
  chart: 'spark' | 'bars' | 'flame' | 'ring';
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

function StatGlyph({ kind, color }: { kind: 'spark' | 'bars' | 'flame' | 'ring'; color: string }) {
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
  if (kind === 'flame') {
    return (
      <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="zap" size={18} color={color} />
      </View>
    );
  }
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: color, opacity: 0.65 }} />
  );
}

// ───────────────────────── Clip card ─────────────────────────
function ClipCard({ index, tokens, title, className, classColor, tint, duration, creator }: {
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
        onPress={() => router.push('/player/krebs-cycle-01' as any)}
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

// ───────────────────────── Streak calendar ─────────────────────────
function StreakCalendar() {
  const { colors } = useAppTheme();
  const { data: days } = useStreakGrid(16);
  const intensityColor = (v: number) => {
    if (v === 0) return colors.inputBackground as string;
    if (v === 1) return palette.teal + '66';
    if (v === 2) return palette.teal + 'AA';
    if (v === 3) return palette.sage;
    return palette.sageSoft;
  };

  const streakDays: StreakDay[] = days ?? [];
  // Build 16 columns × 7 rows
  const cols: StreakDay[][] = [];
  for (let w = 0; w < 16; w++) {
    const col: StreakDay[] = [];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      if (idx < streakDays.length) col.push(streakDays[idx]);
    }
    cols.push(col);
  }

  return (
    <Surface padded={spacing.xl} radius="xl" style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Overline muted>Streak calendar</Overline>
          <TitleSm style={{ marginTop: 4 }}>16 weeks, quietly kept.</TitleSm>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MonoSm muted>less</MonoSm>
          {[0, 1, 2, 3, 4].map((v) => (
            <View key={v} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: intensityColor(v) }} />
          ))}
          <MonoSm muted>more</MonoSm>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {cols.map((col, ci) => (
          <View key={ci} style={{ gap: 3 }}>
            {col.map((day, di) => (
              <View
                key={di}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  backgroundColor: intensityColor(day.intensity),
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <Divider />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Mono>04 days</Mono>
          <MonoSm muted>current streak</MonoSm>
        </View>
        <View>
          <Mono>11 days</Mono>
          <MonoSm muted>longest run</MonoSm>
        </View>
      </View>
    </Surface>
  );
}

// ───────────────────────── Class progress ─────────────────────────
function ClassProgress() {
  const { data: classes } = useClasses();
  const list = classes ?? [];
  return (
    <Surface padded={spacing.xl} radius="xl" style={{ gap: spacing.lg }}>
      <Overline muted>Class progress</Overline>
      <View style={{ gap: spacing.lg }}>
        {list.map((cls) => {
          const avgDone = Math.min(1, 0.1 + cls.clip_count / 20);
          return (
            <View key={cls.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cls.color_hex }} />
                  <BodySm weight="semibold">{cls.name}</BodySm>
                </View>
                <MonoSm muted>{`${cls.clip_count} clips`}</MonoSm>
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.inkBorder, overflow: 'hidden' }}>
                <View
                  style={{
                    width: `${avgDone * 100}%`,
                    height: '100%',
                    backgroundColor: cls.color_hex,
                    opacity: 0.85,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    </Surface>
  );
}

// ───────────────────────── Feed (web) ─────────────────────────
export default function FeedWebScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAK;

  const { data: feedRows } = useFeed(12);
  const { data: classes } = useClasses();
  const { data: stats } = useProfileStats();

  const allClips = feedRows ?? [];
  const classList = classes ?? [];
  const recentClips = useMemo<Row<'clips'>[]>(() => allClips.slice(0, 6), [allClips]);
  const resumeClips = useMemo<Row<'clips'>[]>(() => allClips.slice(0, 4), [allClips]);

  function fmtDur(s: number | null | undefined): string {
    const sec = Math.max(0, Math.round(s ?? 0));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  const primaryColumn = (
    <View style={{ gap: spacing['3xl'] }}>
      {/* Stats band */}
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <Headline>Dashboard</Headline>
          <BodySm italic family="serif" muted>
            tuesday afternoon, quiet shelf.
          </BodySm>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
          <StatTile index={0} label="Clips generated" value={String(stats?.clipCount ?? 0)} chart="bars" accent={palette.sage} />
          <StatTile index={1} label="Classes" value={String(stats?.classCount ?? 0)} chart="ring" accent={palette.tealBright} />
          <StatTile index={2} label="Topics" value={String(stats?.topicCount ?? 0)} chart="spark" accent={palette.gold} />
          <StatTile index={3} label="Current streak" value={String(stats?.streakDays ?? 0).padStart(2, '0')} delta="days" chart="flame" accent={palette.alertSoft} />
        </View>
      </View>

      {/* Recent clips rail */}
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <View>
            <Overline muted>Recent clips</Overline>
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
              index={i}
              tokens={DEFAULT_DNA}
              title={c.title}
              className="Class"
              classColor={palette.sage}
              tint={c.thumbnail_color ?? palette.tealDeep}
              duration={fmtDur(c.duration_s)}
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
                    <Chip label="Class" variant="class" classColor={palette.sage} size="sm" />
                    <MonoSm muted>{formatRelative(c.created_at)}</MonoSm>
                  </View>
                  <TitleSm numberOfLines={2}>{c.title}</TitleSm>
                </Surface>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </View>
    </View>
  );

  const sideColumn = (
    <View style={{ gap: spacing.xl, width: 320 }}>
      <StreakCalendar />
      <ClassProgress />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background as string }}>
      <TopBar />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: spacing['5xl'] }}>
        <View style={{ flexDirection: 'row', gap: spacing['2xl'], alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{primaryColumn}</View>
          {wide ? sideColumn : null}
        </View>
      </ScrollView>
    </View>
  );
}
