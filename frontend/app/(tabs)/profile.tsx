import React, { useCallback, useMemo } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import {
  Title,
  TitleSm,
  Mono,
  MonoSm,
  Overline,
  BodySm,
} from '@/components/ui/Text';
import { Surface, Divider } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { Noctis } from '@/components/brand/Noctis';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { palette, radii, spacing } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useProfileStats, useActivity, useStreakGrid } from '@/data/hooks';
import type { StreakDay } from '@/data/queries';
import type { Row } from '@/types/supabase';

const STREAK_WEEKS = 16;
const STREAK_DAYS_PER_WEEK = 7;

type ActivityRow = Row<'activity'>;

function joinedFormatted(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  return `joined ${month} ${d.getUTCFullYear()}`;
}

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

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const { user, profile, logout } = useAuth();

  const { data: stats } = useProfileStats();
  const { data: activity } = useActivity();
  const { data: streak } = useStreakGrid(STREAK_WEEKS);

  const username =
    profile?.username ??
    profile?.display_name ??
    user?.email?.split('@')[0] ??
    'you';

  const clipCount = stats?.clipCount ?? 0;
  const classCount = stats?.classCount ?? 0;
  const streakDays = stats?.streakDays ?? 0;
  const activityRows = activity ?? [];
  const streakDays16 = streak ?? [];

  const onSettings = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    router.push('/settings' as any);
  }, [router]);

  const onSignOut = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    logout();
  }, [logout]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing['7xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + name block */}
        <Animated.View
          entering={ENTER.fadeUp(40)}
          style={{ alignItems: 'center', marginBottom: spacing['3xl'] }}
        >
          <View
            style={{
              width: 112,
              height: 112,
              borderRadius: 56,
              borderWidth: 2,
              borderColor: palette.sage,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? palette.inkTint : palette.mist,
            }}
          >
            <Noctis variant="head" size={80} color={isDark ? palette.mist : palette.ink} eyeColor={palette.sage} animated />
          </View>
          <Title style={{ marginTop: spacing.md }}>{username}</Title>
          <MonoSm muted style={{ marginTop: 4 }}>
            {joinedFormatted(profile?.joined_at)}
          </MonoSm>
        </Animated.View>

        {/* Stats row */}
        <Animated.View entering={ENTER.fadeUp(120)} style={{ marginBottom: spacing['2xl'] }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile label="Clips" value={clipCount} hint="generated" />
            <StatTile label="Classes" value={classCount} hint="on the shelf" />
            <StatTile
              label="Streak"
              value={streakDays}
              hint="days in a row"
              glyph={<FlameGlyph size={14} />}
            />
          </View>
        </Animated.View>

        {/* Streak calendar */}
        <Animated.View
          entering={ENTER.fadeUp(180)}
          style={{ marginBottom: spacing['2xl'] }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.md }}>
            <Overline muted>Study calendar</Overline>
            <View style={{ flex: 1 }} />
            <MonoSm muted>last 16 weeks</MonoSm>
          </View>
          <Surface radius="lg" padded={16}>
            <StreakGrid days={streakDays16} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: spacing.md,
                gap: 6,
              }}
            >
              <MonoSm muted>less</MonoSm>
              {[0, 1, 2, 3, 4].map((lvl) => (
                <View
                  key={lvl}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    backgroundColor: intensityColor(lvl as StreakDay['intensity'], isDark),
                  }}
                />
              ))}
              <MonoSm muted>more</MonoSm>
            </View>
          </Surface>
        </Animated.View>

        {/* Recent activity */}
        <Animated.View
          entering={ENTER.fadeUp(240)}
          style={{ marginBottom: spacing['2xl'] }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.md }}>
            <Overline muted>Recent activity</Overline>
          </View>
          <Surface radius="lg" padded={0}>
            {activityRows.length === 0 ? (
              <View style={{ paddingVertical: spacing.xl, paddingHorizontal: spacing.lg }}>
                <MonoSm muted>no activity yet — the lamp is quiet.</MonoSm>
              </View>
            ) : (
              activityRows.map((a, i) => (
                <ActivityRowView
                  key={a.id}
                  entry={a}
                  index={i}
                  last={i === activityRows.length - 1}
                />
              ))
            )}
          </Surface>
        </Animated.View>

        {/* Settings + sign out */}
        <Animated.View entering={ENTER.fadeUp(300)}>
          <Pressable
            onPress={onSettings}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing.lg,
              paddingHorizontal: spacing.lg,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.border as string,
              opacity: pressed ? 0.7 : 1,
              marginBottom: spacing['2xl'],
            })}
          >
            <Feather name="settings" size={18} color={colors.text as string} />
            <View style={{ width: 12 }} />
            <TitleSm style={{ flex: 1 }}>Settings</TitleSm>
            <Feather name="arrow-right" size={18} color={colors.mutedText as string} />
          </Pressable>

          <View style={{ alignItems: 'center', marginTop: spacing.md }}>
            <Button
              variant="danger"
              size="sm"
              title="Sign out"
              onPress={onSignOut}
            />
            <MonoSm muted style={{ marginTop: spacing.md, opacity: 0.6 }}>
              reelize v0.1 · built for quiet study
            </MonoSm>
          </View>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

// -------------------- StatTile --------------------

function StatTile({
  label,
  value,
  hint,
  glyph,
}: {
  label: string;
  value: number;
  hint: string;
  glyph?: React.ReactNode;
}) {
  return (
    <Surface radius="lg" padded={spacing.md} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Overline muted>{label}</Overline>
        {glyph ? <View style={{ marginLeft: 6 }}>{glyph}</View> : null}
      </View>
      <Mono
        variant="display2"
        family="mono"
        weight="medium"
        style={{ marginTop: 6 }}
      >
        {String(value).padStart(2, '0')}
      </Mono>
      <BodySm muted italic family="serif" style={{ marginTop: 2 }}>
        {hint}
      </BodySm>
    </Surface>
  );
}

// -------------------- Streak grid --------------------

function intensityColor(level: StreakDay['intensity'], dark: boolean): string {
  if (level === 0) return dark ? palette.inkTint : palette.fogBorder;
  if (level === 1) return palette.fog;
  if (level === 2) return palette.sageSoft;
  if (level === 3) return palette.sage;
  return palette.teal;
}

function StreakGrid({ days }: { days: StreakDay[] }) {
  const { isDark } = useAppTheme();

  // days are ordered oldest -> newest
  const weeks: StreakDay[][] = useMemo(() => {
    const cols: StreakDay[][] = [];
    for (let c = 0; c < STREAK_WEEKS; c++) {
      const col: StreakDay[] = [];
      for (let r = 0; r < STREAK_DAYS_PER_WEEK; r++) {
        const idx = c * STREAK_DAYS_PER_WEEK + r;
        if (idx < days.length) col.push(days[idx]);
      }
      cols.push(col);
    }
    return cols;
  }, [days]);

  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {weeks.map((col, i) => (
        <View key={i} style={{ gap: 4 }}>
          {col.map((d) => (
            <View
              key={d.date}
              style={{
                width: 13,
                height: 13,
                borderRadius: 3,
                backgroundColor: intensityColor(d.intensity, isDark),
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// -------------------- ActivityRow --------------------

function ActivityRowView({
  entry,
  index,
  last,
}: {
  entry: ActivityRow;
  index: number;
  last: boolean;
}) {
  const { colors } = useAppTheme();
  const icon = (() => {
    switch (entry.kind) {
      case 'studied':
        return <Feather name="book-open" size={14} color={colors.mutedText as string} />;
      case 'generated':
        return <Feather name="zap" size={14} color={palette.sage} />;
      case 'saved':
        return <Feather name="bookmark" size={14} color={palette.gold} />;
      case 'created_class':
      case 'created_topic':
        return <Feather name="plus" size={14} color={palette.tealBright} />;
      default:
        return <FlameGlyph size={14} />;
    }
  })();

  const label =
    entry.message ??
    (entry.kind === 'studied'
      ? 'Studied a clip'
      : entry.kind === 'generated'
        ? 'Generated a clip'
        : entry.kind === 'saved'
          ? 'Saved a clip'
          : entry.kind === 'created_class'
            ? 'Created a class'
            : entry.kind === 'created_topic'
              ? 'Created a topic'
              : 'Activity');

  return (
    <View>
      <Animated.View entering={ENTER.fadeUp(stagger(index, 36, 260))}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.elevated as string,
              borderWidth: 1,
              borderColor: colors.border as string,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <TitleSm numberOfLines={1}>{label}</TitleSm>
          </View>
          <MonoSm muted style={{ marginLeft: 10 }}>
            {formatRelative(entry.occurred_at)}
          </MonoSm>
        </View>
      </Animated.View>
      {!last ? <Divider style={{ marginHorizontal: spacing.lg }} /> : null}
    </View>
  );
}

// -------------------- FlameGlyph (SVG, editorial) --------------------

function FlameGlyph({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 16 20">
      <Path
        d="M 8 1 C 10 5 13 6 13 11 C 13 15 11 18 8 18 C 5 18 3 15 3 11.5 C 3 9 5 8.5 5.5 7 C 6 5.5 7 4 8 1 Z"
        fill={palette.alert}
      />
      <Path
        d="M 8 7 C 9 9 10.5 9 10.5 12 C 10.5 15 9.5 16.5 8 16.5 C 6.5 16.5 5.5 15 5.5 13 C 5.5 11 6.5 10.5 7 9.5 C 7.25 9 7.5 8.5 8 7 Z"
        fill={palette.gold}
      />
    </Svg>
  );
}
