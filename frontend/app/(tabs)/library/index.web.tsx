import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

import { Surface, Divider } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { Display2, Headline, Title, TitleSm, Body, BodySm, Mono, MonoSm, Overline, Text } from '@/components/ui/Text';
import { useActiveCourse } from '@/components/navigation/WebAppChrome';
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
  useTemplatesForUser,
} from '@/data/hooks';
import { createClass, deleteClass, deleteTemplate, updateTemplate } from '@/data/mutations';
import type { ClassWithCounts, TopicWithClipCount } from '@/data/queries';
import type { Row } from '@/types/supabase';
import { formatRelative, summarizeTemplate } from '@/lib/format';

// ───────────────────────── Page header ─────────────────────────
function PageHeader({
  counts,
  courseCount,
  onNewCourse,
  onOpenTemplates,
}: {
  counts: { topic: number; clip: number };
  courseCount: number;
  onNewCourse: () => void;
  onOpenTemplates: () => void;
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.lg }}>
        <View>
          <Headline>Your courses.</Headline>
          <BodySm italic family="serif" muted style={{ marginTop: 2 }}>
            {courseCount} courses. {counts.clip} lessons.
          </BodySm>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Pressable
            onPress={onOpenTemplates}
            style={({ hovered, pressed }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 36,
              paddingHorizontal: 14,
              borderRadius: radii.sm,
              borderWidth: 1,
              borderColor: (colors.primary as string) + (hovered || pressed ? 'AA' : '66'),
              backgroundColor: hovered || pressed
                ? (colors.primary as string) + '22'
                : (colors.primary as string) + '14',
              transitionProperty: 'background-color, border-color' as any,
              transitionDuration: '140ms' as any,
            })}
          >
            <Feather name="layers" size={14} color={colors.primary as string} />
            <Text variant="bodySm" weight="bold" color={colors.primary as string}>
              Templates
            </Text>
          </Pressable>
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
        </View>
      </View>
    </View>
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
  onCreated: (courseId: string) => void;
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

  const submit = async () => {
    const clean = name.trim();
    if (clean.length < 2 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await createClass({ name: clean });
      onCreated(created.id);
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
          backgroundColor: 'rgba(2,6,15,0.72)',
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
            padding: spacing['2xl'],
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            gap: spacing.md,
          }}
        >
          <Overline muted>NEW COURSE</Overline>
          <Title>Name your course.</Title>
          <BodySm muted>
            Courses are where your lessons live. Pick a subject — you can add topics and lessons next.
          </BodySm>
          <TextField
            variant="boxed"
            placeholder="e.g. Biology, Krebs Cycle, Statistics"
            value={name}
            onChangeText={setName}
            autoFocus
            onSubmitEditing={submit}
          />
          {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, justifyContent: 'flex-end' }}>
            <Button variant="tertiary" size="sm" title="Cancel" onPress={onClose} haptic={false} />
            <Button
              variant="primary"
              size="sm"
              title={busy ? 'Creating…' : 'Create course'}
              disabled={busy || name.trim().length < 2}
              onPress={submit}
              haptic={false}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ───────────────────────── Empty state ─────────────────────────
function LibraryEmptyState({ onNewCourse }: { onNewCourse: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing['5xl'] }}>
      <Surface
        padded={spacing['3xl']}
        radius="xl"
        bordered
        style={{ maxWidth: 560, alignItems: 'flex-start', gap: spacing.md }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.elevated as string,
            borderWidth: 1,
            borderColor: colors.border as string,
          }}
        >
          <Feather name="book-open" size={20} color={colors.primary as string} />
        </View>
        <Overline muted>YOUR LIBRARY IS EMPTY</Overline>
        <Title>Start your first course.</Title>
        <BodySm muted>
          Courses organize your lessons by subject. Create one to start — then add lessons to it by analyzing reels.
        </BodySm>
        <Pressable
          onPress={onNewCourse}
          style={({ hovered, pressed }: any) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: 40,
            paddingHorizontal: 16,
            borderRadius: radii.sm,
            marginTop: spacing.sm,
            backgroundColor: pressed || hovered ? (colors.primary as string) : (colors.primary as string) + 'DD',
          })}
        >
          <Feather name="plus" size={14} color={colors.onPrimary as string} />
          <Text variant="bodySm" weight="semibold" color={colors.onPrimary as string}>
            Create your first course
          </Text>
        </Pressable>
      </Surface>
    </View>
  );
}

// ───────────────────────── Class card ─────────────────────────
function ClassCardLarge({
  cls,
  index,
  onPress,
  onDelete,
}: {
  cls: ClassWithCounts;
  index: number;
  onPress: () => void;
  onDelete: () => void;
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
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              accessibilityLabel={`Delete ${cls.name}`}
              style={({ hovered, pressed }: any) => ({
                width: 28,
                height: 28,
                borderRadius: radii.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: hovered || pressed
                  ? palette.alert + '33'
                  : 'rgba(4,20,30,0.55)',
                borderWidth: 1,
                borderColor: hovered || pressed
                  ? palette.alert + '88'
                  : 'rgba(255,255,255,0.12)',
              })}
            >
              <Feather name="trash-2" size={12} color={palette.alert} />
            </Pressable>
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.xs, backgroundColor: 'rgba(4,20,30,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
              <MonoSm color={palette.fog}>{String(index + 1).padStart(2, '0')}</MonoSm>
            </View>
          </View>
          <View style={{ position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xl }}>
            <Overline color={cls.color_hex}>{`${cls.clip_count} ${cls.clip_count === 1 ? 'lesson' : 'lessons'}`}</Overline>
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
              <MonoSm color={palette.fog} style={{ opacity: 0.6 }}>{cls.clip_count} lessons</MonoSm>
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
            <Overline color={cls.color_hex}>COURSE</Overline>
            <IconButton variant="ghost" size={32} onPress={onClose} accessibilityLabel="Back to courses">
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
              <MonoSm muted>lessons</MonoSm>
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
                <MonoSm muted>{topic.clip_count} lessons · {formatRelative(topic.last_studied_at) || 'new'}</MonoSm>
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

// ───────────────────────── Templates sheet (web, universal) ─────────────────────────
// Modal opened from the page header. Templates aren't scoped to a course —
// any template can be used to spin up a clip in any course at generation time.
function WebTemplatesSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { data: templates, loading } = useTemplatesForUser();
  const list = templates ?? [];
  const [editing, setEditing] = useState<Row<'templates'> | null>(null);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(2,6,15,0.72)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 640,
            maxHeight: '85%',
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.lg,
              borderBottomWidth: 1,
              borderBottomColor: colors.border as string,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="layers" size={18} color={colors.primary as string} />
              <Title>Templates</Title>
            </View>
            <IconButton
              variant="ghost"
              size={32}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={14} color={colors.text as string} />
            </IconButton>
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: spacing.xl,
              gap: spacing.md,
            }}
            showsVerticalScrollIndicator={false}
          >
            {loading && list.length === 0 ? (
              <MonoSm muted>Loading templates…</MonoSm>
            ) : list.length === 0 ? (
              <Surface padded={spacing.xl} radius="xl" bordered style={{ gap: spacing.md, alignItems: 'flex-start' }}>
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
                  <Feather name="layers" size={18} color={colors.primary as string} />
                </View>
                <Title>No templates yet.</Title>
                <BodySm muted>
                  Deconstruct a reel in Create to save its SFX, cuts, and styling as a
                  reusable template.
                </BodySm>
              </Surface>
            ) : (
              list.map((tpl) => (
                <TemplateRowWeb
                  key={tpl.id}
                  template={tpl}
                  classColor={palette.teal}
                  onPress={() => setEditing(tpl)}
                />
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
      <TemplateDetailSheet template={editing} onClose={() => setEditing(null)} />
    </Modal>
  );
}

function TemplateRowWeb({
  template,
  classColor,
  onPress,
}: {
  template: Row<'templates'>;
  classColor: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }: any) => ({
        padding: spacing.lg,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: hovered ? classColor + 'AA' : (colors.border as string),
        backgroundColor: colors.card as string,
        gap: 8,
        opacity: pressed ? 0.92 : 1,
        transitionProperty: 'border-color' as any,
        transitionDuration: '140ms' as any,
      })}
    >
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
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <MonoSm muted numberOfLines={1} style={{ flex: 1 }}>
          {summarizeTemplate(template)}
        </MonoSm>
        <MonoSm muted>{formatRelative(template.created_at)}</MonoSm>
      </View>
    </Pressable>
  );
}

// Web template edit sheet — mirrors the mobile one but uses Modal with web
// styling tokens.
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
          backgroundColor: 'rgba(2,6,15,0.72)',
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
            padding: spacing['2xl'],
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            gap: spacing.md,
          }}
        >
          <Overline muted>TEMPLATE</Overline>
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
              justifyContent: 'space-between',
              marginTop: spacing.sm,
            }}
          >
            <Button
              variant="tertiary"
              size="sm"
              title={busy === 'delete' ? 'Deleting…' : 'Delete'}
              onPress={onDelete}
              disabled={busy !== null}
              haptic={false}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                variant="tertiary"
                size="sm"
                title="Cancel"
                onPress={onClose}
                disabled={busy !== null}
                haptic={false}
              />
              <Button
                variant="primary"
                size="sm"
                title={busy === 'save' ? 'Saving…' : 'Save'}
                onPress={onSave}
                disabled={busy !== null || name.trim().length < 2}
                haptic={false}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  const router = useRouter();
  const { colors } = useAppTheme();
  useWindowDimensions();
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const { activeCourseId, setActiveCourseId } = useActiveCourse();
  const params = useLocalSearchParams<{
    new?: string;
    tab?: string;
    course?: string;
  }>();

  const { data: classes, refresh: refreshClasses } = useClasses();
  const { data: stats } = useProfileStats();
  const classList = classes ?? [];

  const confirmDeleteClass = (cls: ClassWithCounts) => {
    const msg = `Delete "${cls.name}"?\n\nThis removes ${cls.topic_count} topic${cls.topic_count === 1 ? '' : 's'} and ${cls.clip_count} clip${cls.clip_count === 1 ? '' : 's'}. Templates filed here become unfiled. Can't undo.`;
    // eslint-disable-next-line no-alert
    if (!window.confirm(msg)) return;
    deleteClass(cls.id)
      .then(() => {
        if (activeCourseId === cls.id) setActiveCourseId(null);
        refreshClasses();
      })
      .catch((err) => {
        // eslint-disable-next-line no-alert
        window.alert(
          `Couldn't delete course: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  };

  useEffect(() => {
    if (params.new === '1') {
      setNewCourseOpen(true);
      router.replace('/(tabs)/library' as any);
      return;
    }
    const tabParam = params.tab as string | undefined;
    const courseParam = params.course as string | undefined;
    if (!tabParam && !courseParam) return;
    if (classList.length === 0) return;
    if (courseParam && classList.find((c) => c.id === courseParam)) {
      setActiveCourseId(courseParam);
    }
    if (tabParam === 'templates') {
      setTemplatesOpen(true);
    }
    router.replace('/(tabs)/library' as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.new, params.tab, params.course, classList.length]);

  // fetchClasses already orders by last_active_at desc then created_at desc,
  // so we just reuse the fetched order.
  const sorted = classList;

  const activeClass = activeCourseId ? classList.find((c) => c.id === activeCourseId) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background as string }}>
      <PageHeader
        courseCount={classList.length}
        counts={{ topic: stats?.topicCount ?? 0, clip: stats?.clipCount ?? 0 }}
        onNewCourse={() => setNewCourseOpen(true)}
        onOpenTemplates={() => setTemplatesOpen(true)}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: spacing['5xl'] }}
      >
        {activeClass ? (
          <ClassDetailView
            cls={activeClass}
            onClose={() => setActiveCourseId(null)}
          />
        ) : classList.length === 0 ? (
          <LibraryEmptyState onNewCourse={() => setNewCourseOpen(true)} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl }}>
            {sorted.map((cls, i) => (
              <ClassCardLarge
                key={cls.id}
                cls={cls}
                index={i}
                onPress={() => setActiveCourseId(cls.id)}
                onDelete={() => confirmDeleteClass(cls)}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <NewCourseModal
        open={newCourseOpen}
        onClose={() => setNewCourseOpen(false)}
        onCreated={(id) => {
          setNewCourseOpen(false);
          setActiveCourseId(id);
        }}
      />
      <WebTemplatesSheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
      />
    </View>
  );
}
