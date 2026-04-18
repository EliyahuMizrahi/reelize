import React, { useMemo, useState } from 'react';
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
import { Display2, Headline, Title, TitleSm, Body, BodySm, Mono, MonoSm, Overline, Text } from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { Shards } from '@/components/brand/Shards';
import { StyleDNA } from '@/components/brand/StyleDNA';
import { palette, spacing, radii } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import {
  useClasses,
  useTopicsForClass,
  useClipsForTopic,
  useProfileStats,
} from '@/data/hooks';
import type { ClassWithCounts, TopicWithClipCount } from '@/data/queries';
import type { Row } from '@/types/supabase';

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

type Sort = 'recent' | 'alpha' | 'most-clips';

// ───────────────────────── Top bar ─────────────────────────
function TopBar({
  sort,
  setSort,
  classFilter,
  setClassFilter,
  classes,
  counts,
}: {
  sort: Sort;
  setSort: (s: Sort) => void;
  classFilter: string | null;
  setClassFilter: (c: string | null) => void;
  classes: ClassWithCounts[];
  counts: { topic: number; clip: number };
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        paddingVertical: spacing['2xl'],
        paddingHorizontal: spacing['2xl'],
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        gap: spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <View>
          <Mono muted>Shelf</Mono>
          <Headline style={{ marginTop: spacing.xs }}>Your shelf.</Headline>
          <BodySm italic family="serif" muted style={{ marginTop: 2 }}>
            {classes.length} classes. {counts.topic} topics. {counts.clip} clips.
          </BodySm>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <View style={{ width: 240 }}>
            <TextField
              placeholder="Search topics & clips"
              variant="boxed"
              leading={<Feather name="search" size={14} color={colors.mutedText as string} />}
            />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        <Overline muted style={{ marginRight: spacing.sm }}>SORT</Overline>
        <Chip label="Recent" variant="outline" selected={sort === 'recent'} onPress={() => setSort('recent')} size="sm" />
        <Chip label="A–Z" variant="outline" selected={sort === 'alpha'} onPress={() => setSort('alpha')} size="sm" />
        <Chip label="Most clips" variant="outline" selected={sort === 'most-clips'} onPress={() => setSort('most-clips')} size="sm" />
        <View style={{ width: 1, height: 20, backgroundColor: colors.border as string, marginHorizontal: spacing.sm }} />
        <Overline muted style={{ marginRight: spacing.sm }}>CLASS</Overline>
        <Chip label="All" variant="outline" selected={classFilter === null} onPress={() => setClassFilter(null)} size="sm" />
        {classes.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            variant="class"
            classColor={c.color_hex}
            selected={classFilter === c.id}
            onPress={() => setClassFilter(classFilter === c.id ? null : c.id)}
            size="sm"
          />
        ))}
      </View>
    </View>
  );
}

// ───────────────────────── Class card ─────────────────────────
function ClassCardLarge({
  cls,
  index,
  onPress,
}: {
  cls: ClassWithCounts;
  index: number;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={ENTER.fadeUp(stagger(index, 80, 40))} style={{ flex: 1, minWidth: 260, maxWidth: 400 }}>
      <Pressable
        onPress={onPress}
        style={({ pressed, hovered }: any) => ({
          transform: [{ translateY: hovered ? -4 : 0 }],
          opacity: pressed ? 0.9 : 1,
          transitionProperty: 'transform' as any,
          transitionDuration: '220ms' as any,
        })}
      >
        <View
          style={{
            aspectRatio: 4 / 5,
            borderRadius: radii['2xl'],
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: cls.color_hex + '55',
          }}
        >
          <LinearGradient
            colors={[cls.color_hex + 'CC', cls.color_hex + '44', palette.ink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={{ position: 'absolute', top: 60, left: 40, opacity: 0.2 }}>
            <Shards size={200} phase="assembled" color={cls.color_hex} />
          </View>
          <LinearGradient
            colors={['transparent', 'rgba(4,20,30,0.9)']}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View
            style={{
              position: 'absolute',
              top: spacing.lg,
              right: spacing.lg,
              flexDirection: 'row',
              gap: spacing.sm,
            }}
          >
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.xs, backgroundColor: 'rgba(4,20,30,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
              <MonoSm color={palette.fog}>{String(index + 1).padStart(2, '0')}</MonoSm>
            </View>
          </View>
          <View style={{ position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xl }}>
            <Overline color={cls.color_hex}>{cls.streak_days > 0 ? `${cls.streak_days}-day streak` : 'resting'}</Overline>
            <Title color={palette.mist} style={{ marginTop: spacing.xs }} numberOfLines={1}>
              {cls.name}
            </Title>
            {cls.description ? (
              <BodySm italic family="serif" color={palette.fog} style={{ marginTop: 4, opacity: 0.85 }}>
                {cls.description}
              </BodySm>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
              <MonoSm color={palette.fog} style={{ opacity: 0.8 }}>{cls.topic_count} topics</MonoSm>
              <MonoSm color={palette.fog} style={{ opacity: 0.6 }}>{cls.clip_count} clips</MonoSm>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────── Class drill-down view ─────────────────────────
function ClassDetailView({
  cls,
  onClose,
}: {
  cls: ClassWithCounts;
  onClose: () => void;
}) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { data: topicsRaw } = useTopicsForClass(cls.id);
  const topics = topicsRaw ?? [];
  const [topicId, setTopicId] = useState<string | undefined>(undefined);
  // Seed topicId once topics load
  React.useEffect(() => {
    if (!topicId && topics.length > 0) setTopicId(topics[0].id);
  }, [topics, topicId]);
  const { data: clipsRaw } = useClipsForTopic(topicId);
  const clips: Row<'clips'>[] = clipsRaw ?? [];
  const topic = topics.find((t) => t.id === topicId);

  return (
    <View style={{ flexDirection: 'row', gap: spacing['2xl'], alignItems: 'flex-start' }}>
      {/* Left: class header + topic list */}
      <View style={{ width: 320 }}>
        <Surface padded={spacing.xl} radius="xl" bordered style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Overline color={cls.color_hex}>CLASS</Overline>
            <IconButton variant="ghost" size={32} onPress={onClose} accessibilityLabel="Back to shelf">
              <Feather name="arrow-left" size={14} color={colors.text as string} />
            </IconButton>
          </View>
          <View>
            <Title>{cls.name}</Title>
            {cls.description ? (
              <BodySm italic family="serif" muted style={{ marginTop: 4 }}>
                {cls.description}
              </BodySm>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm }}>
            <View>
              <Mono>{cls.topic_count}</Mono>
              <MonoSm muted>topics</MonoSm>
            </View>
            <View>
              <Mono>{cls.clip_count}</Mono>
              <MonoSm muted>clips</MonoSm>
            </View>
            <View>
              <Mono color={cls.streak_days > 0 ? palette.gold : palette.teal}>{cls.streak_days}d</Mono>
              <MonoSm muted>streak</MonoSm>
            </View>
          </View>
        </Surface>

        <View style={{ marginTop: spacing.xl, gap: 4 }}>
          <Overline muted style={{ marginBottom: spacing.sm, paddingHorizontal: 4 }}>Topics</Overline>
          {topics.map((t) => {
            const active = t.id === topicId;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTopicId(t.id)}
                style={({ hovered }: any) => ({
                  position: 'relative',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: radii.md,
                  backgroundColor: active ? cls.color_hex + '22' : hovered ? (colors.elevated as string) : 'transparent',
                  gap: 2,
                })}
              >
                {active ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: -10,
                      top: 10,
                      bottom: 10,
                      width: 2,
                      borderRadius: 1,
                      backgroundColor: cls.color_hex,
                    }}
                  />
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <BodySm weight={active ? 'semibold' : 'medium'} color={active ? (palette.mist) : (colors.text as string)}>
                    {t.name}
                  </BodySm>
                  <MonoSm muted>{t.clip_count}</MonoSm>
                </View>
                <View style={{ height: 2, backgroundColor: palette.inkBorder, borderRadius: 1, overflow: 'hidden', marginTop: 6 }}>
                  <View style={{ width: `${t.progress * 100}%`, height: '100%', backgroundColor: cls.color_hex }} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Right: clips grid for selected topic */}
      <View style={{ flex: 1, gap: spacing.lg, minWidth: 0 }}>
        {topic ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Overline color={cls.color_hex}>TOPIC</Overline>
                <Title style={{ marginTop: 4 }}>{topic.name}</Title>
                {topic.description ? (
                  <BodySm italic family="serif" muted style={{ marginTop: 4, maxWidth: 520 }}>
                    {topic.description}
                  </BodySm>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Mono color={palette.gold}>{Math.round(topic.progress * 100)}%</Mono>
                <MonoSm muted>{topic.clip_count} clips · {formatRelative(topic.last_studied_at)}</MonoSm>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
              {clips.map((c, i) => (
                <ClipGridCard key={c.id} clip={c} classColor={cls.color_hex} className={cls.name} index={i} />
              ))}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

// ───────────────────────── Clip grid card ─────────────────────────
function ClipGridCard({ clip, classColor, className, index }: { clip: Row<'clips'>; classColor: string; className: string; index: number }) {
  const router = useRouter();
  const durationLabel = (() => {
    const sec = Math.max(0, Math.round(clip.duration_s ?? 0));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  })();
  const tint = clip.thumbnail_color ?? palette.tealDeep;
  return (
    <Animated.View entering={ENTER.fadeUp(stagger(index, 60, 40))} style={{ width: 220 }}>
      <Pressable
        onPress={() => router.push(`/player/${clip.id}` as any)}
        style={({ pressed, hovered }: any) => ({
          transform: [{ translateY: hovered ? -3 : 0 }],
          opacity: pressed ? 0.9 : 1,
          transitionProperty: 'transform' as any,
          transitionDuration: '180ms' as any,
        })}
      >
        <View
          style={{
            aspectRatio: 9 / 13,
            borderRadius: radii.xl,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: classColor + '55',
          }}
        >
          <LinearGradient
            colors={[tint, classColor + '33', palette.ink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={{ position: 'absolute', top: 30, left: 20, opacity: 0.22 }}>
            <Shards size={120} phase="assembled" color={classColor} />
          </View>
          <LinearGradient
            colors={['transparent', 'rgba(4,20,30,0.9)']}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={{ position: 'absolute', top: 10, right: 10 }}>
            <StyleDNA variant="icon" size={32} showLabels={false} color={classColor} />
          </View>
          <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
            <TitleSm color={palette.mist} numberOfLines={2}>
              {clip.title}
            </TitleSm>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <MonoSm color={palette.fog} style={{ opacity: 0.8 }}>{clip.source_creator ?? '@source'}</MonoSm>
              <MonoSm color={palette.fog} style={{ opacity: 0.55 }}>{durationLabel}</MonoSm>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────── Library (web) ─────────────────────────
export default function LibraryWebScreen() {
  const { colors } = useAppTheme();
  useWindowDimensions();
  const [sort, setSort] = useState<Sort>('recent');
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);

  const { data: classes } = useClasses();
  const { data: stats } = useProfileStats();
  const classList = classes ?? [];

  const sorted = useMemo(() => {
    let list = [...classList];
    if (classFilter) list = list.filter((c) => c.id === classFilter);
    if (sort === 'recent') {
      list.sort((a, b) => {
        const at = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
        const bt = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
        return bt - at;
      });
    } else if (sort === 'alpha') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => b.clip_count - a.clip_count);
    }
    return list;
  }, [sort, classFilter, classList]);

  const activeClass = activeClassId ? classList.find((c) => c.id === activeClassId) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background as string }}>
      <TopBar
        sort={sort}
        setSort={setSort}
        classFilter={classFilter}
        setClassFilter={setClassFilter}
        classes={classList}
        counts={{ topic: stats?.topicCount ?? 0, clip: stats?.clipCount ?? 0 }}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: spacing['5xl'] }}
      >
        {activeClass ? (
          <ClassDetailView cls={activeClass} onClose={() => setActiveClassId(null)} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl }}>
            {sorted.map((cls, i) => (
              <ClassCardLarge
                key={cls.id}
                cls={cls}
                index={i}
                onPress={() => setActiveClassId(cls.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
