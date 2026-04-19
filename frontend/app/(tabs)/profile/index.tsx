import React, { useCallback } from 'react';
import { View, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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
import { IconButton } from '@/components/ui/IconButton';
import { Noctis } from '@/components/brand/Noctis';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { palette, spacing } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useProfileStats, useActivity } from '@/data/hooks';
import type { Row } from '@/types/supabase';
import { formatRelative } from '@/lib/format';

type ActivityRow = Row<'activity'>;

function joinedFormatted(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  return `joined ${month} ${d.getUTCFullYear()}`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const { user, profile } = useAuth();

  const { data: stats } = useProfileStats();
  const { data: activity } = useActivity();

  const username =
    profile?.username ??
    profile?.display_name ??
    user?.email?.split('@')[0] ??
    'you';

  const clipCount = stats?.clipCount ?? 0;
  const classCount = stats?.classCount ?? 0;
  const topicCount = stats?.topicCount ?? 0;
  const activityRows = activity ?? [];

  const onSettings = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    router.push('/profile/settings' as any);
  }, [router]);

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
        {/* Top bar: profile on the left, settings cog on the right */}
        <Animated.View
          entering={ENTER.fadeUp(40)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: spacing['2xl'],
            gap: spacing.md,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 2,
              borderColor: palette.sage,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? palette.inkTint : palette.mist,
            }}
          >
            <Noctis
              variant="head"
              size={40}
              color={isDark ? palette.mist : palette.ink}
              eyeColor={palette.sage}
              animated
            />
          </View>
          <View style={{ flex: 1 }}>
            <Title numberOfLines={1}>{username}</Title>
            <MonoSm muted style={{ marginTop: 2 }}>
              {joinedFormatted(profile?.joined_at)}
            </MonoSm>
          </View>
          <IconButton
            variant="ghost"
            size={40}
            onPress={onSettings}
            accessibilityLabel="Open settings"
          >
            <Feather name="settings" size={20} color={colors.text as string} />
          </IconButton>
        </Animated.View>

        {/* Dashboard headline */}
        <Animated.View entering={ENTER.fadeUp(80)} style={{ marginBottom: spacing['2xl'] }}>
          <Overline muted>Dashboard</Overline>
          <BodySm italic family="serif" muted style={{ marginTop: 4 }}>
            a quiet look at what you've built.
          </BodySm>
        </Animated.View>

        {/* Stats row */}
        <Animated.View entering={ENTER.fadeUp(120)} style={{ marginBottom: spacing['2xl'] }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile label="Clips" value={clipCount} hint="generated" />
            <StatTile label="Classes" value={classCount} hint="on the shelf" />
            <StatTile label="Topics" value={topicCount} hint="in rotation" />
          </View>
        </Animated.View>

        {/* Recent activity */}
        <Animated.View
          entering={ENTER.fadeUp(180)}
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

      </ScrollView>
    </Screen>
  );
}

// -------------------- StatTile --------------------

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Surface radius="lg" padded={spacing.md} style={{ flex: 1 }}>
      <Overline muted>{label}</Overline>
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
        return <Feather name="activity" size={14} color={colors.mutedText as string} />;
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
