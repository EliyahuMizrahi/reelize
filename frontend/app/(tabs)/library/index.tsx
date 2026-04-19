import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  View,
  ScrollView,
  Pressable,
  Dimensions,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import {
  Display2,
  Title,
  TitleSm,
  Mono,
  MonoSm,
  BodySm,
  Overline,
  Text,
} from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import DraggableBottomSheet from '@/components/ui/DraggableBottomSheet';
import { Noctis } from '@/components/brand/Noctis';
import { Shards } from '@/components/brand/Shards';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing } from '@/constants/tokens';
import { ENTER } from '@/components/ui/motion';
import { formatRelative, summarizeTemplate } from '@/lib/format';

import {
  useClasses,
  useClipsForTopic,
  useTemplatesForUser,
  useTopicsForClass,
} from '@/data/hooks';
import {
  createClass,
  createTopic,
  deleteClass,
  deleteClip,
  deleteTemplate,
  deleteTopic,
  ensureTopicInClass,
  generateClipFromTemplate,
  updateClass,
  updateClip,
  updateTemplate,
  updateTopic,
} from '@/data/mutations';
import { getJobArtifact } from '@/services/api';
import { supabase } from '@/lib/supabase';
import type { ClassWithCounts, TopicWithClipCount } from '@/data/queries';
import type { Row } from '@/types/supabase';

const STORAGE_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_BUCKET ?? 'reelize-artifacts';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = spacing.xl;
const GRID_GAP = spacing.md;
const CLIP_COL_W = (SCREEN_W - H_PAD * 2 - GRID_GAP) / 2;
const CLIP_CARD_H = Math.round(CLIP_COL_W * (13 / 9));

// Course names shrink aggressively past 6 chars (2pt per extra char, floor
// 24pt). adjustsFontSizeToFit on the Display2 acts as a final safety net so
// the name is never truncated with "..." on narrow devices.
const COURSE_NAME_BASE = 44;
const COURSE_NAME_MIN = 24;
function courseNameSizeStyle(name?: string | null) {
  const len = name?.length ?? 0;
  if (len <= 6) return undefined;
  const size = Math.max(COURSE_NAME_MIN, COURSE_NAME_BASE - (len - 6) * 2);
  return { fontSize: size, lineHeight: size + 4 };
}

// ───────────────────────── Screen ─────────────────────────
export default function LibraryScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  // Params let the Create flow drop the user here with a specific course
  // selected after saving a template (or deep-link the templates sheet open).
  // Consume once then clear.
  const params = useLocalSearchParams<{ tab?: string; course?: string }>();

  const { data: classes, loading, refresh } = useClasses();
  const classList = classes ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [newClipOpen, setNewClipOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Disc (topic) selection lives below the shelf (class) selection.
  // `activeTopicId === null` means "All discs" — show every clip in the shelf.
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [newDiscOpen, setNewDiscOpen] = useState(false);

  const { data: topics, loading: topicsLoading, refresh: refreshTopics } =
    useTopicsForClass(activeId ?? undefined);
  const topicList = topics ?? [];

  // Apply inbound params once classes are loaded.
  useEffect(() => {
    const tabParam = params.tab as string | undefined;
    const courseParam = params.course as string | undefined;
    if (!tabParam && !courseParam) return;
    if (classList.length === 0) return;
    if (tabParam === 'templates') setTemplatesOpen(true);
    if (courseParam && classList.find((c) => c.id === courseParam)) {
      setActiveId(courseParam);
    }
    router.replace('/(tabs)/library' as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab, params.course, classList.length]);

  // Default active course to the first (most recent) once classes load.
  useEffect(() => {
    if (!activeId && classList.length > 0) {
      setActiveId(classList[0].id);
    } else if (activeId && !classList.find((c) => c.id === activeId)) {
      setActiveId(classList[0]?.id ?? null);
    }
  }, [activeId, classList]);

  const activeClass = useMemo(
    () => classList.find((c) => c.id === activeId) ?? null,
    [classList, activeId],
  );

  // Auto-select a disc whenever the topic list loads or the current selection
  // disappears. Null is only valid for shelves with zero discs — otherwise we
  // always land on a real disc so clips below are never unexpectedly empty.
  //
  // Note: we don't reset activeTopicId on shelf change. The stale topic id
  // simply fails the `find` below on the next topicList refresh and gets
  // swapped for the first disc of the new shelf. The lenient `activeTopic`
  // memo bridges the 1-frame gap so the UI never sees a null topic while a
  // valid one exists.
  //
  // When this effect changes activeTopicId, flag the next fade trigger to
  // suppress — the shelf switch already ran its own fade, and re-running on
  // the system-driven topic reconciliation produces a visible second pulse.
  const suppressTopicFadeRef = useRef(false);
  useEffect(() => {
    if (topicList.length === 0) {
      if (activeTopicId !== null) {
        suppressTopicFadeRef.current = true;
        setActiveTopicId(null);
      }
      return;
    }
    if (!activeTopicId || !topicList.find((t) => t.id === activeTopicId)) {
      suppressTopicFadeRef.current = true;
      setActiveTopicId(topicList[0].id);
    }
  }, [topicList, activeTopicId]);

  // Lenient lookup — if the selection is stale against the current topic
  // list (mid-transition), fall back to the first disc instead of null so
  // ClipsTab doesn't flash its "No disc selected" empty state.
  const activeTopic = useMemo(() => {
    if (topicList.length === 0) return null;
    return topicList.find((t) => t.id === activeTopicId) ?? topicList[0];
  }, [topicList, activeTopicId]);

  // ── Cross-fade on shelf change only ────────────────────────────────────
  // Shelf switches are a big context change — fade the whole screen so the
  // stale clips don't flash under the new shelf's header. Disc switches stay
  // inline: ClipsTab swaps its grid for skeletons while the query reloads.
  const contentOpacity = useSharedValue(1);
  const firstRender = useRef(true);
  const prevActiveIdRef = useRef(activeId);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      prevActiveIdRef.current = activeId;
      return;
    }
    const shelfChanged = prevActiveIdRef.current !== activeId;
    prevActiveIdRef.current = activeId;
    // Reset the suppress flag if it was set — no longer used but keep the
    // ref clean in case something else wires back into it.
    if (suppressTopicFadeRef.current) suppressTopicFadeRef.current = false;
    if (!shelfChanged) return;
    contentOpacity.value = withSequence(
      withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) }),
      withDelay(
        220,
        withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      ),
    );
  }, [activeId, contentOpacity]);
  const contentAnim = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  // ── Empty-state delay gate ─────────────────────────────────────────────
  // `useClasses` returns { loading:false, data:null } while auth is still
  // warming up, which would flash the "Start a shelf" screen before the real
  // class list arrives. Only show the empty state after it's been steady for
  // a short moment.
  const [emptyConfirmed, setEmptyConfirmed] = useState(false);
  useEffect(() => {
    if (loading || classList.length > 0) {
      setEmptyConfirmed(false);
      return;
    }
    const t = setTimeout(() => setEmptyConfirmed(true), 450);
    return () => clearTimeout(t);
  }, [loading, classList.length]);

  const onCreateCourse = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setNewCourseOpen(true);
  }, []);

  const onCourseCreated = useCallback(
    (id: string) => {
      setNewCourseOpen(false);
      setActiveId(id);
      refresh();
    },
    [refresh],
  );

  const onCreateDisc = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setNewDiscOpen(true);
  }, []);

  const onDiscCreated = useCallback(
    (id: string) => {
      setNewDiscOpen(false);
      setActiveTopicId(id);
      refreshTopics();
    },
    [refreshTopics],
  );

  // Empty state — no courses yet. Gated by `emptyConfirmed` so it doesn't
  // flash during the initial auth/data warm-up.
  if (emptyConfirmed) {
    return (
      <Screen>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing['2xl'],
          }}
        >
          <Noctis
            variant="perched"
            size={140}
            color={colors.text as string}
            eyeColor={palette.sage}
            animated
          />
          <Title
            align="center"
            family="serif"
            italic
            style={{ marginTop: spacing.xl, maxWidth: 280 }}
          >
            No shelves yet.
          </Title>
          <BodySm
            align="center"
            family="serif"
            italic
            muted
            style={{ marginTop: 8, maxWidth: 280 }}
          >
            A shelf is a room. Name yours.
          </BodySm>
          <View style={{ marginTop: spacing['2xl'] }}>
            <Button
              variant="shimmer"
              size="lg"
              title="Start a shelf"
              leading={<Feather name="plus" size={16} color={palette.ink} />}
              onPress={onCreateCourse}
            />
          </View>
        </View>
        <NewCourseModal
          open={newCourseOpen}
          onClose={() => setNewCourseOpen(false)}
          onCreated={onCourseCreated}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Everything that depends on the active shelf/disc fades as a unit so
          the transition hides the stale-data window while the new fetch runs. */}
      <Animated.View style={[{ flex: 1 }, contentAnim]}>
        {/* Header bar: course picker + Templates chip */}
        <CourseHeaderBar
          activeClass={activeClass}
          onOpenPicker={() => setPickerOpen(true)}
          onOpenTemplates={() => setTemplatesOpen(true)}
        />

        {/* Disc strip: tap to switch, long-press to open picker (rename/delete). */}
        <DiscPillsRow
          activeClass={activeClass}
          topics={topicList}
          activeTopicId={activeTopicId}
          onPick={setActiveTopicId}
          onCreate={onCreateDisc}
          onOpenPicker={() => setTopicPickerOpen(true)}
        />

        {/* Clips — always filtered to the active disc. */}
        <ClipsTab
          activeClass={activeClass}
          activeTopic={activeTopic}
          topicsLoading={topicsLoading}
          onCreateClip={() => setNewClipOpen(true)}
        />
      </Animated.View>

      {/* Disc picker modal */}
      <TopicPickerModal
        open={topicPickerOpen}
        topics={topicList}
        activeId={activeTopicId}
        activeClass={activeClass}
        onPick={(id) => {
          setActiveTopicId(id);
          setTopicPickerOpen(false);
        }}
        onNewDisc={() => {
          setTopicPickerOpen(false);
          onCreateDisc();
        }}
        onDeleted={(id) => {
          if (activeTopicId === id) setActiveTopicId(null);
          refreshTopics();
        }}
        onRefreshNeeded={() => {
          refreshTopics();
        }}
        onClose={() => setTopicPickerOpen(false)}
      />

      {/* Course picker modal */}
      <CoursePickerModal
        open={pickerOpen}
        classes={classList}
        activeId={activeId}
        onPick={(id) => {
          setActiveId(id);
          setPickerOpen(false);
        }}
        onNewCourse={() => {
          setPickerOpen(false);
          onCreateCourse();
        }}
        onDeleted={(id) => {
          if (activeId === id) {
            const next = classList.find((c) => c.id !== id);
            setActiveId(next?.id ?? null);
          }
          refresh();
        }}
        onRenamed={() => refresh()}
        onClose={() => setPickerOpen(false)}
      />

      {/* New course modal */}
      <NewCourseModal
        open={newCourseOpen}
        onClose={() => setNewCourseOpen(false)}
        onCreated={onCourseCreated}
      />

      {/* New disc modal */}
      <NewDiscModal
        open={newDiscOpen}
        activeClass={activeClass}
        onClose={() => setNewDiscOpen(false)}
        onCreated={onDiscCreated}
      />

      {/* New clip modal (universal template picker) */}
      <NewClipModal
        open={newClipOpen}
        activeClass={activeClass}
        onClose={() => setNewClipOpen(false)}
      />

      {/* Universal templates sheet */}
      <TemplatesSheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
      />
    </Screen>
  );
}

// ───────────────────────── Header bar ─────────────────────────
function CourseHeaderBar({
  activeClass,
  onOpenPicker,
  onOpenTemplates,
}: {
  activeClass: ClassWithCounts | null;
  onOpenPicker: () => void;
  onOpenTemplates: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        paddingHorizontal: H_PAD,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <Pressable
          onPress={onOpenPicker}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel="Change shelf"
        >
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              backgroundColor:
                activeClass?.color_hex ?? (palette.teal as string),
            }}
          />
          <Display2
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
            style={[{ flexShrink: 1 }, courseNameSizeStyle(activeClass?.name)]}
          >
            {activeClass?.name ?? 'Pick a shelf'}
          </Display2>
          <Feather
            name="chevron-down"
            size={18}
            color={colors.mutedText as string}
          />
        </Pressable>

        <TemplatesChip onPress={onOpenTemplates} />
      </View>
    </View>
  );
}

// ───────────────────────── Disc pills row ─────────────────────────
// Compact horizontal strip of discs under the active shelf. Tap = switch;
// long-press = open the picker modal (rename/delete). Replaces the previous
// DiscHeaderBar entirely — active state reads from the filled pill.
function DiscPillsRow({
  activeClass,
  topics,
  activeTopicId,
  onPick,
  onCreate,
  onOpenPicker,
}: {
  activeClass: ClassWithCounts | null;
  topics: TopicWithClipCount[];
  activeTopicId: string | null;
  onPick: (id: string) => void;
  onCreate: () => void;
  onOpenPicker: () => void;
}) {
  const { colors } = useAppTheme();
  if (!activeClass) return null;
  const accent = activeClass.color_hex ?? (palette.teal as string);
  const PILL_PV = 4;
  const PILL_PH = 10;
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        paddingBottom: spacing.sm,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          paddingTop: spacing.xs,
          gap: 6,
          alignItems: 'center',
        }}
      >
        {topics.map((t) => {
          const isActive = t.id === activeTopicId;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.selectionAsync().catch(() => {});
                }
                onPick(t.id);
              }}
              onLongPress={onOpenPicker}
              delayLongPress={320}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: PILL_PH,
                paddingVertical: PILL_PV,
                borderRadius: 999,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isActive ? accent : (colors.border as string),
                backgroundColor: isActive ? accent : 'transparent',
                opacity: pressed ? 0.75 : 1,
              })}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${t.name}`}
            >
              <MonoSm
                style={{
                  color: isActive
                    ? (palette.ink as string)
                    : (colors.mutedText as string),
                  fontWeight: isActive ? '700' : '500',
                  fontSize: 12,
                  lineHeight: 16,
                }}
              >
                {t.name}
              </MonoSm>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onCreate}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: PILL_PH,
            paddingVertical: PILL_PV,
            borderRadius: 999,
            borderWidth: StyleSheet.hairlineWidth,
            borderStyle: 'dashed',
            borderColor: colors.mutedText as string,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel="Create a new disc"
        >
          <Feather name="plus" size={11} color={colors.mutedText as string} />
          <MonoSm
            muted
            style={{ fontSize: 12, lineHeight: 16 }}
          >
            New
          </MonoSm>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function TemplatesChip({ onPress }: { onPress: () => void }) {
  const { colors } = useAppTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={style}>
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            Haptics.selectionAsync().catch(() => {});
          }
          onPress();
        }}
        onPressIn={() => {
          scale.value = withTiming(0.94, { duration: 120 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 180 });
        }}
        accessibilityRole="button"
        accessibilityLabel="Open templates"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor: (colors.primary as string) + '66',
          backgroundColor: (colors.primary as string) + '14',
        }}
      >
        <Feather
          name="layers"
          size={14}
          color={colors.primary as string}
        />
        <Text
          variant="bodySm"
          weight="bold"
          color={colors.primary as string}
        >
          Templates
        </Text>
      </Pressable>
    </Animated.View>
  );
}


// ───────────────────────── Clips tab ─────────────────────────
function ClipsTab({
  activeClass,
  activeTopic,
  topicsLoading,
  onCreateClip,
}: {
  activeClass: ClassWithCounts | null;
  activeTopic: TopicWithClipCount | null;
  topicsLoading: boolean;
  onCreateClip: () => void;
}) {
  const router = useRouter();
  // Clips are always scoped to the active disc. When no disc is selected
  // (shelf has none yet), the hook is passed undefined and returns an empty
  // list — UI below shows the "no disc" empty state.
  const { data: clips, loading, refresh } = useClipsForTopic(activeTopic?.id);
  const list = clips ?? [];
  const [menuClip, setMenuClip] = useState<Row<'clips'> | null>(null);

  // Only the clips belonging to the currently-active disc are "visible".
  // useAsync keeps the previous disc's data around during a refetch, which
  // would otherwise flash the wrong clips right after a disc switch.
  const visibleList = activeTopic
    ? list.filter((c) => c.topic_id === activeTopic.id)
    : [];

  // Show "No disc selected" only once the topics fetch has settled for the
  // current shelf. While `topicsLoading` is true the stale topic list may be
  // empty (e.g. switching away from an empty shelf), and surfacing the panel
  // mid-fetch produced the flash we're avoiding.
  const showNoDiscPanel = !activeTopic && !topicsLoading && !!activeClass;

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          paddingTop: spacing.lg,
          paddingBottom: spacing['7xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Create clip CTA */}
        <View style={{ marginBottom: spacing.lg }}>
          <Button
            variant="shimmer"
            size="md"
            title="New clip from template"
            leading={<Feather name="plus" size={14} color={palette.ink} />}
            onPress={onCreateClip}
            fullWidth
          />
        </View>

        {!activeTopic ? (
          showNoDiscPanel ? (
            <EmptyPanel
              icon="disc"
              title="No disc selected."
              body="Create a disc from the picker above to start filling it with clips."
            />
          ) : null
        ) : visibleList.length === 0 ? (
          // Quiet during the fetch; only surface the empty panel once
          // loading has settled and we know the disc really has no clips.
          loading ? null : (
            <EmptyPanel
              icon="film"
              title="No clips yet."
              body="Pick a template and spin up your first clip. Generation is wired up soon."
            />
          )
        ) : (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: GRID_GAP,
            }}
          >
            {visibleList.map((clip, i) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                index={i}
                classColor={activeClass?.color_hex ?? palette.teal}
                onPress={() => router.push(`/player/${clip.id}` as any)}
                onMenu={() => setMenuClip(clip)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ClipActionsMenu
        clip={menuClip}
        onClose={() => setMenuClip(null)}
        onDeleted={() => {
          setMenuClip(null);
          refresh();
        }}
      />
    </>
  );
}

function ClipCard({
  clip,
  index,
  classColor,
  onPress,
  onMenu,
}: {
  clip: Row<'clips'>;
  index: number;
  classColor: string;
  onPress: () => void;
  onMenu: () => void;
}) {
  const tint = clip.thumbnail_color ?? palette.tealDeep;
  const durationLabel = (() => {
    const sec = Math.max(0, Math.round(clip.duration_s ?? 0));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  })();

  // Sign a short-lived URL for the poster frame if the clip has one. Cached
  // per clip id so we don't re-sign on every render.
  const thumbKey =
    typeof (clip.artifacts as any)?.thumbnail === 'string'
      ? ((clip.artifacts as any).thumbnail as string)
      : null;
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!thumbKey) {
      setThumbUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(thumbKey, 3600);
        if (cancelled) return;
        if (!error && data?.signedUrl) setThumbUrl(data.signedUrl);
      } catch {
        /* swallow — gradient fallback stays visible */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thumbKey]);

  return (
    <Animated.View
      entering={ENTER.fade(index * 40)}
      style={{ width: CLIP_COL_W, height: CLIP_CARD_H }}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          width: '100%',
          height: '100%',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            flex: 1,
            borderRadius: radii.xl,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: classColor + '55',
          }}
        >
          {/* base tint — shows until the image loads OR if the clip has no
              thumbnail artifact. */}
          <LinearGradient
            colors={[tint, classColor + '33', palette.ink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {thumbUrl ? (
            <Image
              source={{ uri: thumbUrl }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : (
            <View style={{ position: 'absolute', top: 20, left: 12, opacity: 0.22 }}>
              <Shards size={110} phase="assembled" color={classColor} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(4,20,30,0.9)']}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}>
            <TitleSm color={palette.mist} numberOfLines={2}>
              {clip.title}
            </TitleSm>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 4,
              }}
            >
              <MonoSm color={palette.fog} style={{ opacity: 0.75 }}>
                {clip.source_creator ?? '@source'}
              </MonoSm>
              <MonoSm color={palette.fog} style={{ opacity: 0.55 }}>
                {durationLabel}
              </MonoSm>
            </View>
          </View>
        </View>

        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            if (Platform.OS !== 'web') {
              Haptics.selectionAsync().catch(() => {});
            }
            onMenu();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Clip actions for ${clip.title}`}
          style={({ pressed }) => ({
            position: 'absolute',
            top: 8,
            right: 8,
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(4,20,30,0.55)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="more-vertical" size={16} color={palette.mist} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────── Clip actions sheet (Rename / Download / Delete) ─────────────────────────
function ClipActionsMenu({
  clip,
  onClose,
  onDeleted,
}: {
  clip: Row<'clips'> | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { colors } = useAppTheme();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<'rename' | 'download' | 'delete' | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (clip) {
      setTitle(clip.title ?? '');
      setBusy(null);
      setErr(null);
    }
  }, [clip]);

  const trimmed = title.trim();
  const nameDirty = !!clip && trimmed.length >= 2 && trimmed !== (clip.title ?? '');

  const onRename = async () => {
    if (!clip || !nameDirty || busy !== null) return;
    setBusy('rename');
    setErr(null);
    try {
      await updateClip(clip.id, { title: trimmed });
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async () => {
    if (!clip) return;
    setErr(null);
    const jobId = clip.generation_job_id ?? clip.job_id;
    if (!jobId) {
      setErr('This clip has no rendered video yet.');
      return;
    }
    setBusy('download');
    try {
      const res = await getJobArtifact(jobId, 'video');
      const url = typeof res.url === 'string' ? res.url : null;
      if (!url) {
        setErr('Rendered video is still processing.');
        setBusy(null);
        return;
      }
      const opened = await Linking.canOpenURL(url);
      if (!opened) throw new Error('Cannot open signed URL on this device.');
      await Linking.openURL(url);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onDeletePress = () => {
    if (!clip) return;
    const run = async () => {
      setBusy('delete');
      setErr(null);
      try {
        await deleteClip(clip.id);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
        }
        onDeleted();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setBusy(null);
      }
    };

    const alertTitle = `Delete "${clip.title}"?`;
    const body = 'This removes the clip from your shelf. Cannot be undone.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${alertTitle}\n\n${body}`)) run();
      return;
    }
    Alert.alert(alertTitle, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  };

  const headerTitle = clip?.title ?? '';
  const TitleComponent = headerTitle.length > 28 ? TitleSm : Title;
  const stickyHeader = (
    <View
      style={{
        paddingHorizontal: H_PAD,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Feather name="film" size={18} color={colors.primary as string} />
      <View style={{ flex: 1 }}>
        <TitleComponent numberOfLines={2}>{headerTitle}</TitleComponent>
      </View>
    </View>
  );

  return (
    <DraggableBottomSheet
      visible={!!clip}
      onClose={onClose}
      heightRatio={0.55}
      keyboardOffsetRatio={1}
      backgroundColor={colors.background as string}
      accentColor={colors.primary as string}
      backdropOpacity={0.6}
      stickyHeader={stickyHeader}
    >
      <View
        style={{
          paddingHorizontal: H_PAD,
          paddingTop: spacing.lg,
          gap: spacing.lg,
        }}
      >
        <View style={{ gap: 6 }}>
          <Overline muted>NAME</Overline>
          <TextField
            variant="boxed"
            placeholder="Clip name"
            value={title}
            onChangeText={setTitle}
            onBlur={onRename}
            onSubmitEditing={onRename}
            returnKeyType="done"
            blurOnSubmit
          />
        </View>

        <View
          style={{
            height: 1,
            backgroundColor: colors.border as string,
            opacity: 0.6,
          }}
        />

        <View style={{ gap: spacing.sm }}>
          <Button
            variant="tertiary"
            size="md"
            title={busy === 'download' ? 'Opening download…' : 'Download'}
            onPress={onDownload}
            disabled={busy !== null}
            leading={
              <Feather
                name="download"
                size={14}
                color={colors.text as string}
              />
            }
            fullWidth
          />
          <Button
            variant="tertiary"
            size="md"
            title={busy === 'delete' ? 'Deleting…' : 'Delete clip'}
            onPress={onDeletePress}
            disabled={busy !== null}
            leading={
              <Feather name="trash-2" size={14} color={palette.alert} />
            }
            fullWidth
          />
        </View>

        {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}
      </View>
    </DraggableBottomSheet>
  );
}

// ───────────────────────── Templates sheet (universal) ─────────────────────────
// Drag-to-close bottom sheet listing every template across every course. Opened
// from the header chip — templates aren't scoped to the active course. Tap the
// scrim or drag the handle down to dismiss.
function TemplatesSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { data: templates, loading } = useTemplatesForUser();
  const list = templates ?? [];

  const stickyHeader = (
    <View
      style={{
        paddingHorizontal: H_PAD,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Feather name="layers" size={18} color={colors.primary as string} />
      <Title>Templates</Title>
    </View>
  );

  return (
    <DraggableBottomSheet
      visible={open}
      onClose={onClose}
      heightRatio={0.5}
      backgroundColor={colors.background as string}
      accentColor={colors.primary as string}
      backdropOpacity={0.6}
      stickyHeader={stickyHeader}
    >
      <View
        style={{
          paddingHorizontal: H_PAD,
          paddingTop: spacing.lg,
          gap: spacing.md,
        }}
      >
        {loading && list.length === 0 ? (
          <MonoSm muted>Loading templates…</MonoSm>
        ) : list.length === 0 ? (
          <EmptyPanel
            icon="layers"
            title="No templates yet."
            body="Deconstruct a reel in Create to save its SFX, cuts, and styling as a reusable template."
          />
        ) : (
          list.map((tpl, i) => (
            <TemplateRow
              key={tpl.id}
              template={tpl}
              index={i}
              classColor={palette.teal}
            />
          ))
        )}
      </View>
    </DraggableBottomSheet>
  );
}

// ───── Template row (summary card) ─────
// Only the trash button is interactive; the card itself is a passive display.
function TemplateRow({
  template,
  index,
  classColor,
}: {
  template: Row<'templates'>;
  index: number;
  classColor: string;
}) {
  const { colors } = useAppTheme();
  const summary = summarizeTemplate(template);
  const created = formatRelative(template.created_at);

  const onDeletePress = () => {
    Alert.alert(
      'Delete template?',
      `"${template.name}" will be removed from every course. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTemplate(template.id);
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                ).catch(() => {});
              }
            } catch (e) {
              Alert.alert(
                'Delete failed',
                e instanceof Error ? e.message : String(e),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Animated.View entering={ENTER.fadeUp(80 + index * 40)}>
      <View
        style={{
          padding: spacing.lg,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: colors.border as string,
          backgroundColor: colors.card as string,
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: 8, justifyContent: 'space-between' }}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: classColor,
                }}
              />
              <Title numberOfLines={1} style={{ flexShrink: 1 }}>
                {template.name}
              </Title>
            </View>
            {template.description ? (
              <BodySm muted numberOfLines={2}>
                {template.description}
              </BodySm>
            ) : null}
          </View>
          <MonoSm muted numberOfLines={1} style={{ marginTop: 4 }}>
            {summary}
          </MonoSm>
        </View>
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
          }}
        >
          <Pressable
            onPress={onDeletePress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Delete template ${template.name}`}
            style={({ pressed }) => ({
              padding: 10,
              borderRadius: radii.md,
              backgroundColor:
                (palette.alert as string) + (pressed ? '33' : '1a'),
            })}
          >
            <Feather
              name="trash-2"
              size={18}
              color={palette.alert as string}
            />
          </Pressable>
          <MonoSm muted>{created}</MonoSm>
        </View>
      </View>
    </Animated.View>
  );
}

// ───── Template detail sheet (edit name/description, delete) ─────
function TemplateDetailSheet({
  template,
  onClose,
}: {
  template: Row<'templates'> | null;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setDescription(template.description ?? '');
    setErr(null);
    setBusy(null);
  }, [template]);

  const onSave = async () => {
    if (!template) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    setBusy('save');
    setErr(null);
    try {
      await updateTemplate(template.id, {
        name: trimmed,
        description: description.trim() || null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const onDelete = async () => {
    if (!template) return;
    setBusy('delete');
    setErr(null);
    try {
      await deleteTemplate(template.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <Modal
      visible={!!template}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(4,20,30,0.72)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 460,
            padding: spacing.xl,
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            gap: spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Overline muted>TEMPLATE</Overline>
            <IconButton
              variant="ghost"
              size={32}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={14} color={colors.text as string} />
            </IconButton>
          </View>
          <View style={{ gap: 6 }}>
            <Overline muted>NAME</Overline>
            <TextField
              variant="boxed"
              placeholder="Template name"
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Overline muted>DESCRIPTION</Overline>
            <TextField
              variant="boxed"
              placeholder="Optional"
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>
          {template ? (
            <MonoSm muted>{summarizeTemplate(template)}</MonoSm>
          ) : null}
          {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              marginTop: spacing.sm,
              justifyContent: 'space-between',
            }}
          >
            <Button
              variant="tertiary"
              size="md"
              title={busy === 'delete' ? 'Deleting…' : 'Delete'}
              onPress={onDelete}
              disabled={busy !== null}
              leading={
                <Feather name="trash-2" size={14} color={palette.alert} />
              }
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                variant="tertiary"
                size="md"
                title="Cancel"
                onPress={onClose}
                disabled={busy !== null}
              />
              <Button
                variant="shimmer"
                size="md"
                title={busy === 'save' ? 'Saving…' : 'Save'}
                onPress={onSave}
                disabled={busy !== null || name.trim().length < 2}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ───────────────────────── Empty panel ─────────────────────────
function EmptyPanel({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        alignItems: 'flex-start',
        padding: spacing['2xl'],
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: colors.border as string,
        backgroundColor: colors.card as string,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.elevated as string,
          borderWidth: 1,
          borderColor: colors.border as string,
        }}
      >
        <Feather name={icon} size={18} color={colors.primary as string} />
      </View>
      <Title>{title}</Title>
      <BodySm muted>{body}</BodySm>
    </View>
  );
}

// ───────────────────────── Course picker modal ─────────────────────────
function CoursePickerModal({
  open,
  classes,
  activeId,
  onPick,
  onNewCourse,
  onDeleted,
  onRenamed,
  onClose,
}: {
  open: boolean;
  classes: ClassWithCounts[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNewCourse: () => void;
  onDeleted: (id: string) => void;
  onRenamed?: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setEditValue('');
      setSavingId(null);
    }
  }, [open]);

  const beginEdit = (c: ClassWithCounts) => {
    setEditingId(c.id);
    setEditValue(c.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };
  const commitEdit = async (c: ClassWithCounts) => {
    if (savingId) return;
    const next = editValue.trim();
    if (next.length < 2 || next === c.name) {
      cancelEdit();
      return;
    }
    setSavingId(c.id);
    try {
      await updateClass(c.id, { name: next });
      onRenamed?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        window.alert(`Couldn't rename shelf: ${msg}`);
      } else {
        Alert.alert("Couldn't rename shelf", msg);
      }
    } finally {
      setSavingId(null);
      setEditingId(null);
      setEditValue('');
    }
  };

  const confirmDelete = (c: ClassWithCounts) => {
    // Web doesn't support Alert.alert buttons cleanly — fall back to window.confirm.
    const runDelete = async () => {
      setDeletingId(c.id);
      try {
        await deleteClass(c.id);
        onDeleted(c.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (Platform.OS === 'web') {
          // eslint-disable-next-line no-alert
          window.alert(`Couldn't delete course: ${msg}`);
        } else {
          Alert.alert("Couldn't delete shelf", msg);
        }
      } finally {
        setDeletingId(null);
      }
    };

    const body = `This removes "${c.name}" and its ${c.topic_count} topic${c.topic_count === 1 ? '' : 's'} and ${c.clip_count} clip${c.clip_count === 1 ? '' : 's'}. Can't undo.`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Delete "${c.name}"?\n\n${body}`)) runDelete();
      return;
    }
    Alert.alert(`Delete "${c.name}"?`, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: runDelete },
    ]);
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(4,20,30,0.72)',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          paddingTop: spacing['5xl'],
          paddingHorizontal: spacing.lg,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: colors.border as string,
            }}
          >
            <Overline muted>SHELVES</Overline>
            <IconButton
              variant="ghost"
              size={32}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={14} color={colors.text as string} />
            </IconButton>
          </View>
          <ScrollView style={{ maxHeight: 360 }}>
            {classes.map((c) => {
              const active = c.id === activeId;
              const deleting = deletingId === c.id;
              const editing = editingId === c.id;
              const saving = savingId === c.id;
              return (
                <View
                  key={c.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingRight: spacing.sm,
                    opacity: deleting ? 0.5 : 1,
                  }}
                >
                  {editing ? (
                    <View
                      style={{
                        flex: 1,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.sm,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                      }}
                    >
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          backgroundColor: c.color_hex,
                        }}
                      />
                      <TextField
                        variant="boxed"
                        value={editValue}
                        onChangeText={setEditValue}
                        onBlur={() => commitEdit(c)}
                        onSubmitEditing={() => commitEdit(c)}
                        returnKeyType="done"
                        autoFocus
                        editable={!saving}
                        blurOnSubmit
                        containerStyle={{ flex: 1 }}
                      />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => onPick(c.id)}
                      disabled={deleting}
                      style={({ pressed }) => ({
                        flex: 1,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        backgroundColor: pressed
                          ? (colors.elevated as string)
                          : 'transparent',
                      })}
                    >
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          backgroundColor: c.color_hex,
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text variant="body" weight="medium">
                          {c.name}
                        </Text>
                        <MonoSm muted>{c.clip_count} clips</MonoSm>
                      </View>
                      {active ? (
                        <Feather
                          name="check"
                          size={14}
                          color={colors.primary as string}
                        />
                      ) : null}
                    </Pressable>
                  )}
                  {!editing ? (
                    <IconButton
                      variant="ghost"
                      size={32}
                      onPress={() => beginEdit(c)}
                      disabled={deleting}
                      accessibilityLabel={`Rename ${c.name}`}
                    >
                      <Feather
                        name="edit-2"
                        size={13}
                        color={colors.mutedText as string}
                      />
                    </IconButton>
                  ) : null}
                  <IconButton
                    variant="ghost"
                    size={32}
                    onPress={() => confirmDelete(c)}
                    disabled={deleting || editing}
                    accessibilityLabel={`Delete ${c.name}`}
                  >
                    <Feather
                      name="trash-2"
                      size={14}
                      color={palette.alert}
                    />
                  </IconButton>
                </View>
              );
            })}
          </ScrollView>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border as string,
            }}
          >
            <Pressable
              onPress={onNewCourse}
              style={({ pressed }) => ({
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                backgroundColor: pressed
                  ? (colors.elevated as string)
                  : 'transparent',
              })}
            >
              <Feather
                name="plus"
                size={14}
                color={colors.primary as string}
              />
              <Text
                variant="body"
                weight="semibold"
                color={colors.primary as string}
              >
                New shelf
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ───────────────────────── Disc (topic) picker modal ─────────────────────────
// Mirrors CoursePickerModal one level deeper. A disc is always selected as
// long as the shelf has at least one — there is no "All discs" view.
function TopicPickerModal({
  open,
  topics,
  activeId,
  activeClass,
  onPick,
  onNewDisc,
  onDeleted,
  onRefreshNeeded,
  onClose,
}: {
  open: boolean;
  topics: TopicWithClipCount[];
  activeId: string | null;
  activeClass: ClassWithCounts | null;
  onPick: (id: string) => void;
  onNewDisc: () => void;
  onDeleted: (id: string) => void;
  onRefreshNeeded: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setEditValue('');
      setSavingId(null);
    }
  }, [open]);

  const shelfColor = activeClass?.color_hex ?? palette.teal;

  const beginEdit = (t: TopicWithClipCount) => {
    setEditingId(t.id);
    setEditValue(t.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };
  const commitEdit = async (t: TopicWithClipCount) => {
    if (savingId) return;
    const next = editValue.trim();
    if (next.length < 2 || next === t.name) {
      cancelEdit();
      return;
    }
    setSavingId(t.id);
    try {
      await updateTopic(t.id, { name: next });
      onRefreshNeeded();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        window.alert(`Couldn't rename disc: ${msg}`);
      } else {
        Alert.alert("Couldn't rename disc", msg);
      }
    } finally {
      setSavingId(null);
      setEditingId(null);
      setEditValue('');
    }
  };

  const confirmDelete = (t: TopicWithClipCount) => {
    const runDelete = async () => {
      setDeletingId(t.id);
      try {
        await deleteTopic(t.id);
        onDeleted(t.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (Platform.OS === 'web') {
          // eslint-disable-next-line no-alert
          window.alert(`Couldn't delete disc: ${msg}`);
        } else {
          Alert.alert("Couldn't delete disc", msg);
        }
      } finally {
        setDeletingId(null);
      }
    };

    const body = `This removes "${t.name}" and its ${t.clip_count} clip${t.clip_count === 1 ? '' : 's'}. Can't undo.`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Delete "${t.name}"?\n\n${body}`)) runDelete();
      return;
    }
    Alert.alert(`Delete "${t.name}"?`, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: runDelete },
    ]);
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(4,20,30,0.72)',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          paddingTop: spacing['5xl'],
          paddingHorizontal: spacing.lg,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: colors.border as string,
            }}
          >
            <Overline muted>
              {activeClass ? `DISCS · ${activeClass.name}` : 'DISCS'}
            </Overline>
            <IconButton
              variant="ghost"
              size={32}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={14} color={colors.text as string} />
            </IconButton>
          </View>
          <ScrollView style={{ maxHeight: 360 }}>
            {topics.length === 0 ? (
              <View
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.lg,
                }}
              >
                <MonoSm muted>No discs yet. Create one below.</MonoSm>
              </View>
            ) : null}
            {topics.map((t) => {
              const active = t.id === activeId;
              const deleting = deletingId === t.id;
              const editing = editingId === t.id;
              const saving = savingId === t.id;
              return (
                <View
                  key={t.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingRight: spacing.sm,
                    opacity: deleting ? 0.5 : 1,
                  }}
                >
                  {editing ? (
                    <View
                      style={{
                        flex: 1,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.sm,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          backgroundColor: shelfColor,
                        }}
                      />
                      <TextField
                        variant="boxed"
                        value={editValue}
                        onChangeText={setEditValue}
                        onBlur={() => commitEdit(t)}
                        onSubmitEditing={() => commitEdit(t)}
                        returnKeyType="done"
                        autoFocus
                        editable={!saving}
                        blurOnSubmit
                        containerStyle={{ flex: 1 }}
                      />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => onPick(t.id)}
                      disabled={deleting}
                      style={({ pressed }) => ({
                        flex: 1,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        backgroundColor: pressed
                          ? (colors.elevated as string)
                          : 'transparent',
                      })}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          backgroundColor: shelfColor,
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text variant="body" weight="medium">
                          {t.name}
                        </Text>
                        <MonoSm muted>
                          {t.clip_count} clip{t.clip_count === 1 ? '' : 's'}
                        </MonoSm>
                      </View>
                      {active ? (
                        <Feather
                          name="check"
                          size={14}
                          color={colors.primary as string}
                        />
                      ) : null}
                    </Pressable>
                  )}
                  {!editing ? (
                    <IconButton
                      variant="ghost"
                      size={32}
                      onPress={() => beginEdit(t)}
                      disabled={deleting}
                      accessibilityLabel={`Rename ${t.name}`}
                    >
                      <Feather
                        name="edit-2"
                        size={13}
                        color={colors.mutedText as string}
                      />
                    </IconButton>
                  ) : null}
                  <IconButton
                    variant="ghost"
                    size={32}
                    onPress={() => confirmDelete(t)}
                    disabled={deleting || editing}
                    accessibilityLabel={`Delete ${t.name}`}
                  >
                    <Feather
                      name="trash-2"
                      size={14}
                      color={palette.alert}
                    />
                  </IconButton>
                </View>
              );
            })}
          </ScrollView>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border as string,
            }}
          >
            <Pressable
              onPress={onNewDisc}
              disabled={!activeClass}
              style={({ pressed }) => ({
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                opacity: !activeClass ? 0.4 : 1,
                backgroundColor: pressed
                  ? (colors.elevated as string)
                  : 'transparent',
              })}
            >
              <Feather
                name="plus"
                size={14}
                color={colors.primary as string}
              />
              <Text
                variant="body"
                weight="semibold"
                color={colors.primary as string}
              >
                New disc
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ───────────────────────── New course modal ─────────────────────────
function NewCourseModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  const submit = useCallback(async () => {
    const clean = name.trim();
    if (clean.length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await createClass({ name: clean });
      onCreated(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, [name, onCreated]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(4,20,30,0.72)',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: spacing['6xl'],
          paddingHorizontal: spacing.xl,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            padding: spacing.xl,
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            gap: spacing.md,
          }}
        >
          <Overline muted>New shelf</Overline>
          <Title family="serif" italic>
            Name the shelf.
          </Title>
          <TextField
            variant="editorial"
            font="serif"
            placeholder="e.g. Biology"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                variant="tertiary"
                size="md"
                title="Cancel"
                onPress={onClose}
                fullWidth
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                variant="shimmer"
                size="md"
                title={busy ? 'Creating…' : 'Create'}
                disabled={busy || name.trim().length < 2}
                onPress={submit}
                fullWidth
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ───────────────────────── New disc modal ─────────────────────────
function NewDiscModal({
  open,
  activeClass,
  onClose,
  onCreated,
}: {
  open: boolean;
  activeClass: ClassWithCounts | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  const submit = useCallback(async () => {
    if (!activeClass) return;
    const clean = name.trim();
    if (clean.length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await createTopic({ classId: activeClass.id, name: clean });
      onCreated(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, [name, activeClass, onCreated]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(4,20,30,0.72)',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: spacing['6xl'],
          paddingHorizontal: spacing.xl,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            padding: spacing.xl,
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            gap: spacing.md,
          }}
        >
          <Overline muted>
            {activeClass ? `NEW DISC · ${activeClass.name}` : 'NEW DISC'}
          </Overline>
          <Title family="serif" italic>
            Name the disc.
          </Title>
          <TextField
            variant="editorial"
            font="serif"
            placeholder="e.g. Pythagorean theorem"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                variant="tertiary"
                size="md"
                title="Cancel"
                onPress={onClose}
                fullWidth
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                variant="shimmer"
                size="md"
                title={busy ? 'Creating…' : 'Create'}
                disabled={!activeClass || busy || name.trim().length < 2}
                onPress={submit}
                fullWidth
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ───────────────────────── New clip modal ─────────────────────────
function NewClipModal({
  open,
  activeClass,
  onClose,
}: {
  open: boolean;
  activeClass: ClassWithCounts | null;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  // Templates are universal — any template can seed a clip in any course.
  const { data: templates, loading } = useTemplatesForUser();
  const list = templates ?? [];

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset picker when modal re-opens or the active class changes.
  useEffect(() => {
    if (!open) return;
    setPickedId(null);
    setTopic('');
    setBusy(false);
    setErr(null);
  }, [open, activeClass?.id]);

  const picked = list.find((t) => t.id === pickedId) ?? null;
  const topicTrimmed = topic.trim();
  const canGenerate = !!activeClass && !!picked && topicTrimmed.length >= 2;

  const onGenerate = async () => {
    if (!activeClass || !picked || topicTrimmed.length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const { topicId } = await ensureTopicInClass(activeClass.id);
      const title = topicTrimmed;
      const { clipId, jobId } = await generateClipFromTemplate({
        templateId: picked.id,
        topicId,
        classId: activeClass.id,
        title,
        topic: topicTrimmed,
      });
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      onClose();
      router.push({
        pathname: '/create/generation',
        params: {
          clipId,
          jobId,
          topic: topicTrimmed,
          fromTemplate: '1',
        },
      } as any);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(4,20,30,0.72)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 440,
            padding: spacing.xl,
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            gap: spacing.md,
          }}
        >
          <Overline muted>NEW CLIP</Overline>
          <Title>Pick a template.</Title>
          <BodySm muted>
            {activeClass
              ? `Creating in ${activeClass.name}.`
              : 'Pick a shelf first.'}{' '}
            Templates come from videos you deconstruct in Create.
          </BodySm>

          {loading && list.length === 0 ? (
            <MonoSm muted>Loading templates…</MonoSm>
          ) : list.length === 0 ? (
            <View
              style={{
                padding: spacing.lg,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.border as string,
                alignItems: 'flex-start',
                gap: 6,
              }}
            >
              <MonoSm muted>NO TEMPLATES YET</MonoSm>
              <BodySm muted>
                Deconstruct a reel in Create to save its SFX, cuts, and styling
                as a template.
              </BodySm>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: 300 }}
              contentContainerStyle={{ gap: spacing.sm }}
              showsVerticalScrollIndicator={false}
            >
              {list.map((t) => {
                const active = t.id === pickedId;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setPickedId(t.id)}
                    style={({ pressed }) => ({
                      padding: spacing.md,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: active
                        ? (colors.primary as string)
                        : (colors.border as string),
                      backgroundColor: active
                        ? (colors.primary as string) + '14'
                        : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                      gap: 4,
                    })}
                  >
                    <Text
                      variant="body"
                      weight={active ? 'semibold' : 'medium'}
                      numberOfLines={1}
                    >
                      {t.name}
                    </Text>
                    <MonoSm muted>{summarizeTemplate(t)}</MonoSm>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {picked ? (
            <View style={{ gap: 6 }}>
              <Overline muted>SUBJECT</Overline>
              <TextField
                font="serif"
                placeholder="e.g. Pythagorean theorem"
                value={topic}
                onChangeText={setTopic}
                autoFocus
              />
            </View>
          ) : null}

          {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}

          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              marginTop: spacing.sm,
              justifyContent: 'flex-end',
            }}
          >
            <Button
              variant="tertiary"
              size="md"
              title="Close"
              onPress={onClose}
              disabled={busy}
            />
            <Button
              variant="shimmer"
              size="md"
              title={busy ? 'Queuing…' : 'Generate'}
              onPress={onGenerate}
              disabled={!canGenerate || busy}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
