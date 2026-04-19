import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  ScrollView,
  Pressable,
  Dimensions,
  Platform,
  StyleSheet,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
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
  useClipsForClass,
  useTemplatesForUser,
} from '@/data/hooks';
import {
  createClass,
  deleteClass,
  deleteTemplate,
  ensureTopicInClass,
  generateClipFromTemplate,
  updateTemplate,
} from '@/data/mutations';
import type { ClassWithCounts } from '@/data/queries';
import type { Row } from '@/types/supabase';

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

  // Empty state — no courses yet.
  if (!loading && classList.length === 0) {
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
            A course is a room. Name yours.
          </BodySm>
          <View style={{ marginTop: spacing['2xl'] }}>
            <Button
              variant="shimmer"
              size="lg"
              title="Start a course"
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
      {/* Header bar: course picker + Templates chip */}
      <CourseHeaderBar
        activeClass={activeClass}
        onOpenPicker={() => setPickerOpen(true)}
        onOpenTemplates={() => setTemplatesOpen(true)}
      />

      {/* Clips — the only content in the shelf now. Templates live in a
          universal sheet opened from the header chip. */}
      <ClipsTab
        activeClass={activeClass}
        onCreateClip={() => setNewClipOpen(true)}
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
        onClose={() => setPickerOpen(false)}
      />

      {/* New course modal */}
      <NewCourseModal
        open={newCourseOpen}
        onClose={() => setNewCourseOpen(false)}
        onCreated={onCourseCreated}
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
          accessibilityLabel="Change course"
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
            {activeClass?.name ?? 'Pick a course'}
          </Display2>
          <Feather
            name="chevron-down"
            size={18}
            color={colors.mutedText as string}
          />
        </Pressable>

        <TemplatesChip onPress={onOpenTemplates} />
      </View>

      {activeClass ? (
        <MonoSm muted style={{ marginTop: 4 }}>
          {activeClass.topic_count} topics · {activeClass.clip_count} clips
        </MonoSm>
      ) : null}
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
  onCreateClip,
}: {
  activeClass: ClassWithCounts | null;
  onCreateClip: () => void;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { data: clips, loading } = useClipsForClass(activeClass?.id);
  const list = clips ?? [];

  return (
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

      {loading ? (
        <MonoSm muted>Loading clips…</MonoSm>
      ) : list.length === 0 ? (
        <EmptyPanel
          icon="film"
          title="No clips yet."
          body="Pick a template and spin up your first clip. Generation is wired up soon."
        />
      ) : (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: GRID_GAP,
          }}
        >
          {list.map((clip, i) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={i}
              classColor={activeClass?.color_hex ?? palette.teal}
              onPress={() => router.push(`/player/${clip.id}` as any)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ClipCard({
  clip,
  index,
  classColor,
  onPress,
}: {
  clip: Row<'clips'>;
  index: number;
  classColor: string;
  onPress: () => void;
}) {
  const tint = clip.thumbnail_color ?? palette.tealDeep;
  const durationLabel = (() => {
    const sec = Math.max(0, Math.round(clip.duration_s ?? 0));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  })();
  return (
    <Animated.View
      entering={ENTER.fadeUp(80 + index * 40)}
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
          <LinearGradient
            colors={[tint, classColor + '33', palette.ink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={{ position: 'absolute', top: 20, left: 12, opacity: 0.22 }}>
            <Shards size={110} phase="assembled" color={classColor} />
          </View>
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
      </Pressable>
    </Animated.View>
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
  onClose,
}: {
  open: boolean;
  classes: ClassWithCounts[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNewCourse: () => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
          Alert.alert("Couldn't delete course", msg);
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
            <Overline muted>COURSES</Overline>
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
                  <IconButton
                    variant="ghost"
                    size={32}
                    onPress={() => confirmDelete(c)}
                    disabled={deleting}
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
                New course
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
          <Overline muted>New course</Overline>
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset picker when modal re-opens or the active class changes.
  useEffect(() => {
    if (!open) return;
    setPickedId(null);
    setBusy(false);
    setErr(null);
  }, [open, activeClass?.id]);

  const picked = list.find((t) => t.id === pickedId) ?? null;

  const onGenerate = async () => {
    if (!activeClass || !picked) return;
    setBusy(true);
    setErr(null);
    try {
      const { topicId } = await ensureTopicInClass(activeClass.id);
      const clip = await generateClipFromTemplate({
        templateId: picked.id,
        topicId,
        title: picked.name,
      });
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      onClose();
      // Real video generation is not wired up yet — we hand off to the
      // player, which renders the 'generating' status gracefully so the
      // user sees the clip they just queued.
      router.push(`/player/${clip.id}` as any);
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
              : 'Pick a course first.'}{' '}
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

          {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}

          {picked ? (
            <MonoSm muted>
              Generation isn't wired to video synthesis yet — the clip will sit
              in 'generating' until the backend pipeline lands.
            </MonoSm>
          ) : null}

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
              disabled={!picked || busy}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
