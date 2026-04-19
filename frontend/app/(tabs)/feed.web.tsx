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
import { useAuth } from '@/contexts/AuthContext';
import { useClasses, useFeed } from '@/data/hooks';
import { useActiveShelf } from '@/components/navigation/WebAppChrome';
import type { ClassWithCounts } from '@/data/queries';
import type { Row } from '@/types/supabase';
import { formatDuration, formatRelative } from '@/lib/format';

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

// ───────────────────────── Shelf card ─────────────────────────
function ShelfCard({
  shelf,
  index,
  onPress,
}: {
  shelf: ClassWithCounts;
  index: number;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const accent = shelf.color_hex ?? palette.sage;
  return (
    <Animated.View entering={ENTER.fadeUp(stagger(index, 70, 40))} style={{ flex: 1, minWidth: 220 }}>
      <Pressable
        onPress={onPress}
        style={({ pressed, hovered }: any) => ({
          width: '100%',
          minHeight: 132,
          borderRadius: radii.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: hovered ? accent + '88' : (colors.border as string),
          backgroundColor: colors.card as string,
          padding: spacing.xl,
          transform: [{ translateY: hovered ? -3 : 0 }],
          opacity: pressed ? 0.9 : 1,
          transitionProperty: 'transform, border-color' as any,
          transitionDuration: '200ms' as any,
          cursor: 'pointer' as any,
        })}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: accent,
            opacity: 0.7,
          }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Overline muted>Shelf</Overline>
            <TitleSm numberOfLines={2}>{shelf.name}</TitleSm>
          </View>
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              backgroundColor: accent,
              marginTop: 4,
              marginLeft: spacing.md,
            }}
          />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
          <MonoSm muted>{shelf.clip_count} lessons</MonoSm>
          <MonoSm muted style={{ opacity: 0.6 }}>·</MonoSm>
          <MonoSm muted>{shelf.topic_count} discs</MonoSm>
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
      <Title>{hasCourses ? 'Make your first lesson.' : 'Start your first shelf.'}</Title>
      <BodySm muted style={{ maxWidth: 520 }}>
        {hasCourses
          ? 'Pick a reel you love, we\u2019ll pull its Style DNA and turn it into a short lesson for you.'
          : 'Shelves hold discs and lessons. Create one from the library, then add lessons to it.'}
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
              cursor: 'pointer' as any,
            })}
          >
            <Feather name="plus" size={14} color={colors.onPrimary as string} />
            <Text variant="bodySm" weight="semibold" color={colors.onPrimary as string}>
              New shelf
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
            cursor: 'pointer' as any,
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

// ───────────────────────── Section heading ─────────────────────────
function SectionHeader({
  overline,
  title,
  action,
}: {
  overline: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Overline muted>{overline}</Overline>
        <Title style={{ marginTop: 4 }}>{title}</Title>
      </View>
      {action}
    </View>
  );
}

function ViewAllLink({ onPress, label = 'view all' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        paddingVertical: 4,
        opacity: hovered ? 1 : 0.75,
        cursor: 'pointer' as any,
        transitionProperty: 'opacity' as any,
        transitionDuration: '140ms' as any,
      })}
    >
      <Mono color={palette.teal}>{label} &rarr;</Mono>
    </Pressable>
  );
}

// ───────────────────────── Feed (web) ─────────────────────────
export default function FeedWebScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, profile } = useAuth();
  const { setActiveShelfId } = useActiveShelf();

  const { data: feedRows } = useFeed(18);
  const { data: classes } = useClasses();

  const allClips = feedRows ?? [];
  const classList = classes ?? [];
  const hasLessons = allClips.length > 0;
  const hasCourses = classList.length > 0;
  const recentClips = useMemo<Row<'clips'>[]>(() => allClips.slice(0, 8), [allClips]);
  const resumeClips = useMemo<Row<'clips'>[]>(() => allClips.slice(0, 4), [allClips]);
  const topShelves = useMemo(() => classList.slice(0, 6), [classList]);

  const firstName =
    profile?.display_name?.split(' ')[0] ??
    profile?.username ??
    user?.email?.split('@')[0] ??
    null;

  const openShelf = (shelfId: string) => {
    setActiveShelfId(shelfId);
    router.push('/(tabs)/library' as any);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background as string }}
      contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: spacing['5xl'] }}
    >
      <View style={{ gap: spacing['3xl'] }}>
        {/* Greeting hero */}
        <Animated.View entering={ENTER.fadeUp(20)} style={{ gap: 6 }}>
          <Overline muted>Home</Overline>
          <Headline>
            {firstName ? `Welcome back, ${firstName}.` : 'Welcome back.'}
          </Headline>
          {hasLessons ? (
            <BodySm italic family="serif" muted style={{ maxWidth: 560 }}>
              {allClips.length} lesson{allClips.length === 1 ? '' : 's'} in your library — pick up where you left off or start something new.
            </BodySm>
          ) : null}
        </Animated.View>

        {!hasLessons ? (
          <EmptyState
            hasCourses={hasCourses}
            onNewCourse={() => router.push('/(tabs)/library' as any)}
            onNewLesson={() => router.push('/(tabs)/create' as any)}
          />
        ) : (
          <>
            {/* Continue — promoted to top since it's the most actionable row */}
            <View>
              <SectionHeader
                overline="Continue"
                title="Pick up where you left off."
                action={
                  <Noctis
                    variant="head"
                    size={26}
                    color={colors.mutedText as string}
                    eyeColor={palette.sage}
                  />
                }
              />
              <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
                {resumeClips.map((c, i) => (
                  <Animated.View
                    key={c.id}
                    entering={ENTER.fadeUp(stagger(i, 70, 40))}
                    style={{ flex: 1, minWidth: 260 }}
                  >
                    <Pressable
                      onPress={() => router.push(`/player/${c.id}` as any)}
                      style={({ hovered, pressed }: any) => ({
                        opacity: pressed ? 0.9 : 1,
                        transform: [{ translateY: hovered ? -3 : 0 }],
                        transitionProperty: 'transform' as any,
                        transitionDuration: '200ms' as any,
                        cursor: 'pointer' as any,
                      })}
                    >
                      <Surface padded={spacing.xl} radius="xl" style={{ gap: spacing.md, minHeight: 160 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Chip label="Lesson" variant="class" classColor={palette.sage} size="sm" />
                          <MonoSm muted>{formatRelative(c.created_at)}</MonoSm>
                        </View>
                        <TitleSm numberOfLines={2}>{c.title}</TitleSm>
                        <View style={{ flex: 1 }} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="play-circle" size={14} color={palette.sage} />
                          <MonoSm color={palette.sage}>resume · {formatDuration(c.duration_s)}</MonoSm>
                        </View>
                      </Surface>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </View>

            {/* Recent lessons */}
            <View>
              <SectionHeader
                overline="Recent lessons"
                title="Fresh from the lab."
                action={<ViewAllLink onPress={() => router.push('/(tabs)/library' as any)} />}
              />
              <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
                {recentClips.map((c, i) => (
                  <ClipCard
                    key={c.id}
                    id={c.id}
                    index={i}
                    tokens={DEFAULT_DNA}
                    title={c.title}
                    className="Lesson"
                    classColor={palette.sage}
                    tint={c.thumbnail_color ?? palette.tealDeep}
                    duration={formatDuration(c.duration_s)}
                    creator={c.source_creator ?? '@source'}
                  />
                ))}
              </View>
            </View>

            {/* Your shelves */}
            {hasCourses ? (
              <View>
                <SectionHeader
                  overline="Your shelves"
                  title="Jump into a topic."
                  action={<ViewAllLink onPress={() => router.push('/(tabs)/library' as any)} label="all shelves" />}
                />
                <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
                  {topShelves.map((s, i) => (
                    <ShelfCard
                      key={s.id}
                      shelf={s}
                      index={i}
                      onPress={() => openShelf(s.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}
