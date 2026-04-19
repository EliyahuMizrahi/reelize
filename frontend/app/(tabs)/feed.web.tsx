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

import { Divider } from '@/components/ui/Surface';
import {
  Display2,
  Title,
  TitleSm,
  BodySm,
  MonoSm,
  Overline,
  Text,
} from '@/components/ui/Text';
import { palette, spacing, radii } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useClasses, useFeed } from '@/data/hooks';
import {
  useActiveShelf,
  useActiveDisc,
} from '@/components/navigation/WebAppChrome';
import type { ClassWithCounts } from '@/data/queries';
import type { Row } from '@/types/supabase';
import { formatDuration, formatRelative } from '@/lib/format';

// ───────────────────────── helpers ─────────────────────────
function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

function formatDateLine(d: Date): string {
  return d
    .toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    .toUpperCase();
}

// ───────────────────────── featured hero ─────────────────────────
function FeaturedCard({
  clip,
  classColor,
  className,
}: {
  clip: Row<'clips'>;
  classColor: string;
  className: string;
}) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const tint = clip.thumbnail_color ?? classColor;
  return (
    <Animated.View entering={ENTER.fadeUp(40)}>
      <Pressable
        onPress={() => router.push(`/player/${clip.id}` as any)}
        style={({ pressed, hovered }: any) => ({
          width: '100%',
          borderRadius: radii.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: hovered
            ? (classColor + 'AA')
            : (colors.border as string),
          opacity: pressed ? 0.95 : 1,
          transform: [{ translateY: hovered ? -2 : 0 }],
          transitionProperty: 'transform, border-color' as any,
          transitionDuration: '220ms' as any,
          cursor: 'pointer' as any,
        })}
      >
        <View
          style={{
            height: 280,
            flexDirection: 'row',
            alignItems: 'stretch',
          }}
        >
          {/* Left: color band */}
          <View
            style={{
              width: 260,
              backgroundColor: tint,
              position: 'relative',
              justifyContent: 'space-between',
              padding: spacing.xl,
            }}
          >
            <LinearGradient
              colors={['transparent', 'rgba(2,6,15,0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: classColor,
                }}
              />
              <Text
                variant="overline"
                weight="semibold"
                color={palette.mist}
                style={{ opacity: 0.8 }}
              >
                {className}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="play-circle" size={16} color={palette.mist} />
              <MonoSm color={palette.mist}>
                resume · {formatDuration(clip.duration_s)}
              </MonoSm>
            </View>
          </View>

          {/* Right: content */}
          <View
            style={{
              flex: 1,
              backgroundColor: colors.card as string,
              padding: spacing['2xl'],
              justifyContent: 'space-between',
            }}
          >
            <View style={{ gap: spacing.md }}>
              <Overline muted>Continue</Overline>
              <Title style={{ marginTop: 2 }}>{clip.title}</Title>
              {clip.source_creator ? (
                <BodySm muted italic family="serif">
                  from {clip.source_creator}
                </BodySm>
              ) : null}
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              <MonoSm muted>{formatRelative(clip.created_at)}</MonoSm>
              <View
                style={{
                  flex: 1,
                  height: 1,
                  backgroundColor: colors.border as string,
                }}
              />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Text
                  variant="bodySm"
                  weight="medium"
                  color={colors.text as string}
                >
                  open
                </Text>
                <Feather
                  name="arrow-right"
                  size={12}
                  color={colors.text as string}
                />
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────── lesson tile ─────────────────────────
function LessonTile({
  clip,
  index,
  classColor,
  className,
}: {
  clip: Row<'clips'>;
  index: number;
  classColor: string;
  className: string;
}) {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <Animated.View
      entering={ENTER.fadeUp(stagger(index, 50, 60))}
      style={{ flex: 1, minWidth: 240, maxWidth: 360 }}
    >
      <Pressable
        onPress={() => router.push(`/player/${clip.id}` as any)}
        style={({ pressed, hovered }: any) => ({
          backgroundColor: colors.card as string,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: hovered ? classColor + '55' : (colors.border as string),
          padding: spacing.lg,
          gap: spacing.md,
          minHeight: 148,
          opacity: pressed ? 0.92 : 1,
          transform: [{ translateY: hovered ? -2 : 0 }],
          transitionProperty: 'transform, border-color' as any,
          transitionDuration: '180ms' as any,
          cursor: 'pointer' as any,
        })}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              backgroundColor: classColor,
            }}
          />
          <Text
            variant="overline"
            weight="semibold"
            muted
            style={{ fontSize: 9, letterSpacing: 1.6 }}
          >
            {className}
          </Text>
          <View style={{ flex: 1 }} />
          <MonoSm muted style={{ opacity: 0.55, fontSize: 10 }}>
            {formatDuration(clip.duration_s)}
          </MonoSm>
        </View>

        <TitleSm numberOfLines={2} style={{ flex: 1 }}>
          {clip.title}
        </TitleSm>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <MonoSm muted style={{ fontSize: 10, opacity: 0.6 }}>
            {formatRelative(clip.created_at)}
          </MonoSm>
          <Feather
            name="arrow-up-right"
            size={12}
            color={colors.mutedText as string}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────── shelf row ─────────────────────────
function ShelfRow({
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
    <Animated.View entering={ENTER.fadeUp(stagger(index, 35, 80))}>
      <Pressable
        onPress={onPress}
        style={({ pressed, hovered }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          borderRadius: radii.md,
          backgroundColor: hovered
            ? (colors.elevated as string)
            : 'transparent',
          opacity: pressed ? 0.8 : 1,
          cursor: 'pointer' as any,
          transitionProperty: 'background-color' as any,
          transitionDuration: '140ms' as any,
        })}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: accent,
          }}
        />
        <Text variant="body" weight="semibold" style={{ flex: 1 }}>
          {shelf.name}
        </Text>
        <MonoSm muted style={{ opacity: 0.65 }}>
          {shelf.clip_count} lessons
        </MonoSm>
        <Feather
          name="chevron-right"
          size={14}
          color={colors.mutedText as string}
        />
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────── empty state ─────────────────────────
function EmptyState({ hasCourses }: { hasCourses: boolean }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <Animated.View
      entering={ENTER.fadeUp(60)}
      style={{
        paddingVertical: spacing['4xl'],
        paddingHorizontal: spacing['2xl'],
        borderRadius: radii.xl,
        backgroundColor: colors.card as string,
        borderWidth: 1,
        borderColor: colors.border as string,
        gap: spacing.lg,
        alignItems: 'flex-start',
      }}
    >
      <Overline muted>Get started</Overline>
      <Title>
        {hasCourses
          ? 'Make your first lesson.'
          : 'Start your first shelf.'}
      </Title>
      <BodySm muted italic family="serif" style={{ maxWidth: 520 }}>
        {hasCourses
          ? 'Pick a reel, we’ll pull its style and turn it into a short lesson.'
          : 'Shelves hold discs and lessons. Create one, then add lessons to it.'}
      </BodySm>
      <Pressable
        onPress={() =>
          router.push(
            (hasCourses ? '/(tabs)/create' : '/(tabs)/library?new=1') as any,
          )
        }
        style={({ pressed, hovered }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          height: 40,
          borderRadius: radii.sm,
          backgroundColor: pressed || hovered
            ? (colors.primary as string)
            : (colors.primary as string) + 'DD',
          cursor: 'pointer' as any,
          transitionProperty: 'background-color' as any,
          transitionDuration: '140ms' as any,
        })}
      >
        <Feather name="plus" size={14} color={colors.onPrimary as string} />
        <Text
          variant="bodySm"
          weight="semibold"
          color={colors.onPrimary as string}
        >
          {hasCourses ? 'New lesson' : 'New shelf'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────── home ─────────────────────────
export default function FeedWebScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, profile } = useAuth();
  const { activeShelfId, setActiveShelfId } = useActiveShelf();
  const { setActiveDiscId } = useActiveDisc();

  const { data: feedRows } = useFeed(18);
  const { data: classes } = useClasses();

  const allClips = feedRows ?? [];
  const classList = classes ?? [];
  const hasLessons = allClips.length > 0;
  const hasCourses = classList.length > 0;

  const activeShelf = useMemo(
    () => classList.find((c) => c.id === activeShelfId) ?? null,
    [classList, activeShelfId],
  );

  // Featured = most-recent clip. Grid = the rest (up to 6).
  const [featured, ...rest] = allClips;
  const grid = useMemo(() => rest.slice(0, 6), [rest]);
  const topShelves = useMemo(() => classList.slice(0, 5), [classList]);

  const firstName =
    profile?.display_name?.split(' ')[0] ??
    profile?.username ??
    user?.email?.split('@')[0] ??
    null;

  const now = new Date();
  const greeting = greetingFor(now);
  const dateLine = formatDateLine(now);

  const accentFor = (_clip: Row<'clips'>) =>
    activeShelf?.color_hex ?? palette.sage;
  const classNameFor = (_clip: Row<'clips'>) => activeShelf?.name ?? 'Lesson';

  const openShelf = (id: string) => {
    setActiveShelfId(id);
    setActiveDiscId(null);
    router.push('/(tabs)/library' as any);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background as string }}
      contentContainerStyle={{
        paddingTop: spacing['2xl'],
        paddingHorizontal: spacing['3xl'],
        paddingBottom: spacing['6xl'],
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: spacing['3xl'], maxWidth: 1120 }}>
        {/* Editorial header */}
        <Animated.View entering={ENTER.fadeUp(20)} style={{ gap: 8 }}>
          <Overline muted style={{ letterSpacing: 2.4 }}>
            {dateLine}
          </Overline>
          <Display2 style={{ letterSpacing: -1.1 }}>
            {firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}
          </Display2>
        </Animated.View>

        <Divider style={{ opacity: 0.5 }} />

        {!hasLessons ? (
          <EmptyState hasCourses={hasCourses} />
        ) : (
          <>
            {/* Featured continue card */}
            {featured ? (
              <FeaturedCard
                clip={featured}
                classColor={accentFor(featured)}
                className={classNameFor(featured)}
              />
            ) : null}

            {/* Two-column split: latest lessons grid + shelves list */}
            <View
              style={{
                flexDirection: 'row',
                gap: spacing['3xl'],
                alignItems: 'flex-start',
                flexWrap: 'wrap',
              }}
            >
              {/* Latest grid */}
              <View style={{ flex: 2, minWidth: 520, gap: spacing.lg }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <Overline muted>Latest lessons</Overline>
                  <Pressable
                    onPress={() => router.push('/(tabs)/library' as any)}
                    style={({ hovered }: any) => ({
                      opacity: hovered ? 1 : 0.7,
                      cursor: 'pointer' as any,
                      transitionProperty: 'opacity' as any,
                      transitionDuration: '120ms' as any,
                    })}
                  >
                    <MonoSm color={palette.teal}>all lessons →</MonoSm>
                  </Pressable>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: spacing.lg,
                  }}
                >
                  {grid.map((c, i) => (
                    <LessonTile
                      key={c.id}
                      clip={c}
                      index={i}
                      classColor={accentFor(c)}
                      className={classNameFor(c)}
                    />
                  ))}
                </View>
              </View>

              {/* Shelves list */}
              {hasCourses ? (
                <View style={{ flex: 1, minWidth: 260, gap: spacing.lg }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Overline muted>Your shelves</Overline>
                    <Pressable
                      onPress={() => router.push('/(tabs)/library' as any)}
                      style={({ hovered }: any) => ({
                        opacity: hovered ? 1 : 0.7,
                        cursor: 'pointer' as any,
                        transitionProperty: 'opacity' as any,
                        transitionDuration: '120ms' as any,
                      })}
                    >
                      <MonoSm color={palette.teal}>all →</MonoSm>
                    </Pressable>
                  </View>
                  <View>
                    {topShelves.map((s, i) => (
                      <ShelfRow
                        key={s.id}
                        shelf={s}
                        index={i}
                        onPress={() => openShelf(s.id)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
