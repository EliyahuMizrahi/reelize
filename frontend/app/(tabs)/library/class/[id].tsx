import React, { useCallback } from 'react';
import {
  View,
  FlatList,
  Pressable,
  Platform,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import {
  Display2,
  Title,
  TitleSm,
  Mono,
  MonoSm,
  Overline,
  BodySm,
} from '@/components/ui/Text';
import { IconButton } from '@/components/ui/IconButton';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, spacing } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useClass, useTopicsForClass } from '@/data/hooks';
import type { TopicWithClipCount } from '@/data/queries';
import { Noctis } from '@/components/brand/Noctis';
import { Button } from '@/components/ui/Button';

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'new';
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

export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useAppTheme();

  const { data: cls, loading: clsLoading } = useClass(id);
  const { data: topics } = useTopicsForClass(id);
  const topicList = topics ?? [];
  const totalClips = topicList.reduce((a, t) => a + t.clip_count, 0);

  const openTopic = useCallback(
    (topicId: string) => {
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      router.push(`/library/topic/${topicId}` as any);
    },
    [router],
  );

  const onLongPress = useCallback((t: TopicWithClipCount) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    // Stubbed context menu hint — would open action sheet in production
    // (archive / rename)
    console.log('long-press', t.name);
  }, []);

  const onCreate = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    router.push('/(tabs)/create' as any);
  }, [router]);

  if (clsLoading && !cls) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <MonoSm muted>Opening the class…</MonoSm>
        </View>
      </Screen>
    );
  }

  if (!cls) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <TitleSm muted>Class not found.</TitleSm>
        </View>
      </Screen>
    );
  }

  const classColor = cls.color_hex;

  return (
    <Screen>
      {/* Hero strip */}
      <Animated.View entering={ENTER.fade(20)}>
        <View
          style={{
            height: 96,
            overflow: 'hidden',
            borderBottomWidth: 1,
            borderBottomColor: classColor + '55',
          }}
        >
          <LinearGradient
            colors={[classColor, classColor + 'AA', classColor + '55']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Scrim for text legibility */}
          <LinearGradient
            colors={['rgba(4,20,30,0)', 'rgba(4,20,30,0.55)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Back + settings */}
          <View
            style={{
              position: 'absolute',
              top: spacing.sm,
              left: spacing.md,
              right: spacing.md,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <IconButton
              variant="glass"
              size={38}
              onPress={() => router.back()}
              accessibilityLabel="Back"
            >
              <Feather name="chevron-left" size={20} color={palette.mist} />
            </IconButton>
            <IconButton
              variant="glass"
              size={38}
              onPress={() => {}}
              accessibilityLabel="Class settings"
            >
              <Feather name="more-horizontal" size={18} color={palette.mist} />
            </IconButton>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        entering={ENTER.fadeUp(120)}
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing.md,
        }}
      >
        <Overline color={classColor}>{cls.name}</Overline>
        <Display2 style={{ marginTop: 4 }}>{cls.name}.</Display2>
        {cls.description ? (
          <BodySm italic family="serif" muted style={{ marginTop: 6 }}>
            {cls.description}
          </BodySm>
        ) : null}
        <MonoSm muted style={{ marginTop: 10 }}>
          {`${topicList.length} topics \u00b7 ${totalClips} clips`}
        </MonoSm>
      </Animated.View>

      {topicList.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing['2xl'],
            gap: spacing.md,
          }}
        >
          <Noctis variant="perched" size={100} color={colors.text as string} eyeColor={classColor} animated />
          <Title
            align="center"
            family="serif"
            italic
            style={{ marginTop: spacing.md, maxWidth: 280 }}
          >
            This class has no topics.
          </Title>
          <BodySm
            align="center"
            family="serif"
            italic
            muted
            style={{ maxWidth: 260 }}
          >
            Name something to learn.
          </BodySm>
          <View style={{ marginTop: spacing.md }}>
            <Button
              variant="shimmer"
              size="md"
              title="Start a topic"
              onPress={onCreate}
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={topicList}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: 48, paddingTop: spacing.sm }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border as string, opacity: 0.4, marginHorizontal: spacing.xl }} />}
          renderItem={({ item, index }) => (
            <TopicRow
              topic={item}
              classColor={classColor}
              index={index}
              onPress={() => openTopic(item.id)}
              onLongPress={() => onLongPress(item)}
            />
          )}
        />
      )}
    </Screen>
  );
}

// -------------------- TopicRow --------------------

interface TopicRowProps {
  topic: TopicWithClipCount;
  classColor: string;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
}

function TopicRow({ topic, classColor, index, onPress, onLongPress }: TopicRowProps) {
  const { colors } = useAppTheme();
  // rough minute estimate: ~30s per clip, rounded up
  const estMinutes = Math.max(1, Math.ceil((topic.clip_count * 30) / 60));
  return (
    <Animated.View entering={ENTER.fadeUp(stagger(index, 44, 180))}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={340}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.xl,
          opacity: pressed ? 0.78 : 1,
          backgroundColor: pressed ? (colors.card as string) : 'transparent',
        })}
      >
        <ProgressRing size={52} progress={topic.progress} color={classColor} />
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Title numberOfLines={1}>{topic.name}</Title>
          <MonoSm muted style={{ marginTop: 2 }}>
            {`${topic.clip_count} clip${topic.clip_count === 1 ? '' : 's'} \u00b7 \u2248${estMinutes}m`}
          </MonoSm>
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
          <MonoSm muted>{formatRelative(topic.last_studied_at)}</MonoSm>
          <View style={{ height: 4 }} />
          <Feather name="chevron-right" size={18} color={colors.mutedText as string} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// -------------------- Progress ring --------------------

function ProgressRing({
  size,
  progress,
  color,
  stroke = 3,
}: {
  size: number;
  progress: number;
  color: string;
  stroke?: number;
}) {
  const { colors } = useAppTheme();
  const p = Math.max(0, Math.min(1, progress));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = `${p * c} ${c}`;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.border as string}
          strokeWidth={stroke}
          fill="none"
          opacity={0.6}
        />
        {/* progress arc — rotate -90 so 0 is up */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={dash}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute' }}>
        <Mono>
          {`${Math.round(p * 100)}`}
        </Mono>
      </View>
    </View>
  );
}
