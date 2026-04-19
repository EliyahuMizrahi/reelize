import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  Image,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import {
  Title,
  TitleSm,
  BodySm,
  Mono,
  MonoSm,
  Overline,
  Text,
} from '@/components/ui/Text';
import {
  useActiveShelf,
  useActiveDisc,
} from '@/components/navigation/WebAppChrome';
import { Shards } from '@/components/brand/Shards';
import { StyleDNA } from '@/components/brand/StyleDNA';
import { supabase } from '@/lib/supabase';
import { palette, spacing, radii } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import {
  useClasses,
  useTopicsForClass,
  useClipsForTopic,
  useTemplatesForUser,
} from '@/data/hooks';
import {
  createClass,
  createTopic,
  deleteClass,
  deleteTopic,
  deleteTemplate,
  updateTemplate,
} from '@/data/mutations';
import type { ClassWithCounts, TopicWithClipCount } from '@/data/queries';
import type { Row } from '@/types/supabase';
import { formatRelative, summarizeTemplate } from '@/lib/format';

const STORAGE_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_BUCKET ?? 'reelize-artifacts';

// ───────────────────────── New shelf modal ─────────────────────────
function NewShelfModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (shelfId: string) => void;
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
          <Overline muted>NEW SHELF</Overline>
          <Title>Name your shelf.</Title>
          <BodySm muted>
            A shelf groups discs and their clips. Pick a subject — you can add discs and clips next.
          </BodySm>
          <TextField
            variant="boxed"
            placeholder="e.g. Algebra 1, Biology, Statistics"
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
              title={busy ? 'Creating…' : 'Create shelf'}
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

// ───────────────────────── New disc modal ─────────────────────────
function NewDiscModal({
  open,
  shelfId,
  onClose,
  onCreated,
}: {
  open: boolean;
  shelfId: string | null;
  onClose: () => void;
  onCreated: (discId: string) => void;
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
    if (!shelfId || clean.length < 2 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await createTopic({ classId: shelfId, name: clean });
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
          <Overline muted>NEW DISC</Overline>
          <Title>Name your disc.</Title>
          <BodySm muted>
            Discs are the topics inside a shelf. A disc holds related clips — think one per concept.
          </BodySm>
          <TextField
            variant="boxed"
            placeholder="e.g. Linear equations, Mitosis, Bayes' rule"
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
              title={busy ? 'Creating…' : 'Create disc'}
              disabled={busy || !shelfId || name.trim().length < 2}
              onPress={submit}
              haptic={false}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ───────────────────────── Templates sheet ─────────────────────────
// Templates aren't scoped to a shelf — any template can spin up a clip in any
// disc at generation time.
function WebTemplatesSheet({
  open,
  onClose,
  shelfColor,
}: {
  open: boolean;
  onClose: () => void;
  shelfColor: string;
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
            <IconButton variant="ghost" size={32} onPress={onClose} accessibilityLabel="Close">
              <Feather name="x" size={14} color={colors.text as string} />
            </IconButton>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
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
                  Deconstruct a reel in Create to save its SFX, cuts, and styling as a reusable template.
                </BodySm>
              </Surface>
            ) : (
              list.map((tpl) => (
                <TemplateRowWeb
                  key={tpl.id}
                  template={tpl}
                  shelfColor={shelfColor}
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
  shelfColor,
  onPress,
}: {
  template: Row<'templates'>;
  shelfColor: string;
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
        borderColor: hovered ? shelfColor + 'AA' : (colors.border as string),
        backgroundColor: colors.card as string,
        gap: 8,
        opacity: pressed ? 0.92 : 1,
        transitionProperty: 'border-color' as any,
        transitionDuration: '140ms' as any,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: shelfColor }} />
        <Title numberOfLines={1} style={{ flexShrink: 1 }}>
          {template.name}
        </Title>
      </View>
      {template.description ? (
        <BodySm muted numberOfLines={2}>
          {template.description}
        </BodySm>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <MonoSm muted numberOfLines={1} style={{ flex: 1 }}>
          {summarizeTemplate(template)}
        </MonoSm>
        <MonoSm muted>{formatRelative(template.created_at)}</MonoSm>
      </View>
    </Pressable>
  );
}

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
    <Modal visible={!!template} transparent animationType="fade" onRequestClose={onClose}>
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
            <TextField variant="boxed" placeholder="Template name" value={name} onChangeText={setName} />
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
          {template ? <MonoSm muted>{summarizeTemplate(template)}</MonoSm> : null}
          {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }}>
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
function ClipGridCard({
  clip,
  shelfColor,
  index,
}: {
  clip: Row<'clips'>;
  shelfColor: string;
  index: number;
}) {
  const router = useRouter();
  const durationLabel = (() => {
    const sec = Math.max(0, Math.round(clip.duration_s ?? 0));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  })();
  const tint = clip.thumbnail_color ?? palette.tealDeep;

  // Sign a short-lived URL for the thumbnail artifact, same pattern as mobile.
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
            borderColor: shelfColor + '55',
          }}
        >
          {/* Base tint — shows until the image loads or if the clip has no
              thumbnail artifact. */}
          <LinearGradient
            colors={[tint, shelfColor + '33', palette.ink]}
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
            <>
              <View style={{ position: 'absolute', top: 30, left: 20, opacity: 0.22 }}>
                <Shards size={120} phase="assembled" color={shelfColor} />
              </View>
              <View style={{ position: 'absolute', top: 10, right: 10 }}>
                <StyleDNA variant="icon" size={32} showLabels={false} color={shelfColor} />
              </View>
            </>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(4,20,30,0.9)']}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
            <TitleSm color={palette.mist} numberOfLines={2}>
              {clip.title}
            </TitleSm>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <MonoSm color={palette.fog} style={{ opacity: 0.8 }}>
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

// ───────────────────────── Loading / empty states ─────────────────────────
function LoadingCard({ compact = false }: { compact?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: compact ? spacing.xl : spacing['4xl'],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: colors.border as string,
          backgroundColor: colors.card as string,
        }}
      >
        <Feather name="loader" size={14} color={colors.mutedText as string} />
        <MonoSm muted>Loading…</MonoSm>
      </View>
    </View>
  );
}

function EmptyCard({
  icon,
  overline,
  title,
  body,
  cta,
  onCta,
}: {
  icon: keyof typeof Feather.glyphMap;
  overline: string;
  title: string;
  body: string;
  cta?: string;
  onCta?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}>
      <Surface padded={spacing['3xl']} radius="xl" bordered style={{ maxWidth: 560, alignItems: 'flex-start', gap: spacing.md }}>
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
          <Feather name={icon} size={20} color={colors.primary as string} />
        </View>
        <Overline muted>{overline}</Overline>
        <Title>{title}</Title>
        <BodySm muted>{body}</BodySm>
        {cta && onCta ? (
          <Pressable
            onPress={onCta}
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
              {cta}
            </Text>
          </Pressable>
        ) : null}
      </Surface>
    </View>
  );
}

// ───────────────────────── Disc header ─────────────────────────
function DiscHeader({
  shelf,
  disc,
  clipCount,
  onNewClip,
  onOpenTemplates,
  onDeleteDisc,
}: {
  shelf: ClassWithCounts;
  disc: TopicWithClipCount;
  clipCount: number;
  onNewClip: () => void;
  onOpenTemplates: () => void;
  onDeleteDisc: () => void;
}) {
  const { colors } = useAppTheme();
  const progressPct = Math.round((disc.progress ?? 0) * 100);
  return (
    <View
      style={{
        paddingVertical: spacing.xl,
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.lg }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Overline color={shelf.color_hex}>DISC</Overline>
          <Title style={{ marginTop: 4 }} numberOfLines={2}>
            {disc.name}
          </Title>
          {disc.description ? (
            <BodySm italic family="serif" muted style={{ marginTop: 4, maxWidth: 640 }}>
              {disc.description}
            </BodySm>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Mono>{clipCount}</Mono>
              <MonoSm muted>clips</MonoSm>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Mono color={palette.gold}>{progressPct}%</Mono>
              <MonoSm muted>studied</MonoSm>
            </View>
            <MonoSm muted>{formatRelative(disc.last_studied_at) || 'new'}</MonoSm>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Pressable
            onPress={onOpenTemplates}
            style={({ hovered, pressed }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 34,
              paddingHorizontal: 12,
              borderRadius: radii.sm,
              borderWidth: 1,
              borderColor: (colors.primary as string) + (hovered || pressed ? 'AA' : '66'),
              backgroundColor: hovered || pressed ? (colors.primary as string) + '22' : (colors.primary as string) + '14',
              transitionProperty: 'background-color, border-color' as any,
              transitionDuration: '140ms' as any,
            })}
          >
            <Feather name="layers" size={13} color={colors.primary as string} />
            <Text variant="bodySm" weight="bold" color={colors.primary as string}>
              Templates
            </Text>
          </Pressable>
          <Pressable
            onPress={onNewClip}
            style={({ hovered, pressed }: any) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 34,
              paddingHorizontal: 12,
              borderRadius: radii.sm,
              backgroundColor: pressed || hovered ? (colors.primary as string) : (colors.primary as string) + 'DD',
            })}
          >
            <Feather name="plus" size={13} color={colors.onPrimary as string} />
            <Text variant="bodySm" weight="semibold" color={colors.onPrimary as string}>
              New clip
            </Text>
          </Pressable>
          <IconButton
            variant="ghost"
            size={34}
            onPress={onDeleteDisc}
            accessibilityLabel={`Delete disc ${disc.name}`}
          >
            <Feather name="trash-2" size={13} color={palette.alert} />
          </IconButton>
        </View>
      </View>
      {/* Progress bar */}
      <View
        style={{
          height: 3,
          borderRadius: 2,
          overflow: 'hidden',
          backgroundColor: (colors.border as string),
        }}
      >
        <View
          style={{
            width: `${progressPct}%`,
            height: '100%',
            backgroundColor: shelf.color_hex,
          }}
        />
      </View>
    </View>
  );
}

// ───────────────────────── Library (web) ─────────────────────────
export default function LibraryWebScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  useWindowDimensions();
  const { activeShelfId, setActiveShelfId } = useActiveShelf();
  const { activeDiscId, setActiveDiscId } = useActiveDisc();

  const params = useLocalSearchParams<{
    new?: string;
    newDisc?: string;
    shelf?: string;
    tab?: string;
  }>();

  const [newShelfOpen, setNewShelfOpen] = useState(false);
  const [newDiscOpen, setNewDiscOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const { data: classes, loading: shelvesLoading, refresh: refreshShelves } = useClasses();
  const { data: topics, loading: discsLoading, refresh: refreshDiscs } = useTopicsForClass(
    activeShelfId ?? undefined,
  );
  const { data: clips, loading: clipsLoading } = useClipsForTopic(activeDiscId ?? undefined);

  // Distinguish "still fetching" from "confirmed empty". Until the query
  // resolves (data !== null), we must not show a "you have nothing" CTA —
  // that would flash misleading empty-state copy on refresh.
  const shelvesHydrated = classes !== null && !shelvesLoading;
  const discsHydrated = topics !== null && !discsLoading;
  const clipsHydrated = clips !== null && !clipsLoading;

  const shelfList = useMemo(() => classes ?? [], [classes]);
  const discList = useMemo<TopicWithClipCount[]>(
    () => (topics ?? []).filter((t) => (t as any).class_id === activeShelfId),
    [topics, activeShelfId],
  );
  const clipList = clips ?? [];

  const activeShelf = useMemo(
    () => shelfList.find((c) => c.id === activeShelfId) ?? null,
    [shelfList, activeShelfId],
  );
  const activeDisc = useMemo(
    () => discList.find((t) => t.id === activeDiscId) ?? null,
    [discList, activeDiscId],
  );
  const shelfColor = activeShelf?.color_hex ?? palette.sage;

  // Handle deep-link params from TopBar switchers and Create flow.
  useEffect(() => {
    let consumed = false;
    if (params.new === '1') {
      setNewShelfOpen(true);
      consumed = true;
    }
    if (params.newDisc === '1') {
      if (params.shelf) setActiveShelfId(params.shelf);
      setNewDiscOpen(true);
      consumed = true;
    }
    if (params.tab === 'templates') {
      setTemplatesOpen(true);
      consumed = true;
    }
    if (consumed) {
      router.replace('/(tabs)/library' as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.new, params.newDisc, params.shelf, params.tab]);

  const onDeleteShelf = () => {
    if (!activeShelf) return;
    const msg = `Delete "${activeShelf.name}"?\n\nThis removes ${activeShelf.topic_count} disc${activeShelf.topic_count === 1 ? '' : 's'} and ${activeShelf.clip_count} clip${activeShelf.clip_count === 1 ? '' : 's'}. Templates filed here become unfiled. Can't undo.`;
    if (!window.confirm(msg)) return;
    deleteClass(activeShelf.id)
      .then(() => {
        setActiveShelfId(null);
        setActiveDiscId(null);
        refreshShelves();
      })
      .catch((err) => {
        window.alert(`Couldn't delete shelf: ${err instanceof Error ? err.message : String(err)}`);
      });
  };

  const onDeleteDisc = () => {
    if (!activeDisc) return;
    const msg = `Delete disc "${activeDisc.name}"?\n\nThis removes ${activeDisc.clip_count} clip${activeDisc.clip_count === 1 ? '' : 's'} inside it. Can't undo.`;
    if (!window.confirm(msg)) return;
    deleteTopic(activeDisc.id)
      .then(() => {
        setActiveDiscId(null);
        refreshDiscs();
        refreshShelves();
      })
      .catch((err) => {
        window.alert(`Couldn't delete disc: ${err instanceof Error ? err.message : String(err)}`);
      });
  };

  const gotoCreate = () => router.push('/(tabs)/create' as any);

  // ─── Render branches ───
  const body = (() => {
    // Haven't confirmed whether the user has shelves yet — hold off on any
    // empty-state CTA so we don't flash "Start your first shelf" to a user
    // who in fact has a full library.
    if (!shelvesHydrated) {
      return <LoadingCard />;
    }
    // Confirmed no shelves → empty library.
    if (shelfList.length === 0) {
      return (
        <EmptyCard
          icon="book-open"
          overline="YOUR LIBRARY IS EMPTY"
          title="Start your first shelf."
          body="Shelves hold discs, and discs hold clips. Create one to start — then add clips by analyzing reels in Create."
          cta="Create your first shelf"
          onCta={() => setNewShelfOpen(true)}
        />
      );
    }
    // Shelves exist but the TopBar's auto-pick hasn't landed yet, or the user
    // explicitly cleared it. Show a neutral "pick" nudge.
    if (!activeShelf) {
      return (
        <EmptyCard
          icon="arrow-up"
          overline="PICK A SHELF"
          title="Select a shelf up top."
          body="Use the shelf pill in the top bar to jump into one of your shelves."
        />
      );
    }
    // Discs for the active shelf haven't hydrated yet.
    if (!discsHydrated) {
      return <LoadingCard />;
    }
    // Confirmed shelf has no discs.
    if (discList.length === 0) {
      return (
        <EmptyCard
          icon="disc"
          overline={`SHELF · ${activeShelf.name.toUpperCase()}`}
          title="No discs in this shelf yet."
          body="Discs group clips by topic. Create one to start filling it with clips."
          cta="Create a disc"
          onCta={() => setNewDiscOpen(true)}
        />
      );
    }
    // Discs exist but none is active yet.
    if (!activeDisc) {
      return (
        <EmptyCard
          icon="arrow-up"
          overline="PICK A DISC"
          title="Select a disc up top."
          body="Use the disc pill in the top bar to open one of your discs."
        />
      );
    }
    // Full view: disc header + clips grid.
    return (
      <View style={{ gap: spacing.xl }}>
        <DiscHeader
          shelf={activeShelf}
          disc={activeDisc}
          clipCount={clipList.length}
          onNewClip={gotoCreate}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onDeleteDisc={onDeleteDisc}
        />
        {!clipsHydrated ? (
          <LoadingCard compact />
        ) : clipList.length === 0 ? (
          <EmptyCard
            icon="film"
            overline="EMPTY DISC"
            title="No clips here yet."
            body="Clips are what you study — short reels broken down into their ideas. Spin one up from Create."
            cta="Create a clip"
            onCta={gotoCreate}
          />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
            {clipList.map((c, i) => (
              <ClipGridCard key={c.id} clip={c} shelfColor={shelfColor} index={i} />
            ))}
          </View>
        )}
      </View>
    );
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background as string }}>
      {/* Optional shelf action strip — only when a shelf is active. Shelf
          identity already lives in the TopBar, so this row is just actions. */}
      {activeShelf ? (
        <View
          style={{
            paddingVertical: spacing.md,
            paddingHorizontal: spacing['2xl'],
            borderBottomWidth: 1,
            borderBottomColor: colors.border as string,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0, flex: 1 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: shelfColor }} />
            <Overline numberOfLines={1}>
              SHELF · {activeShelf.topic_count} discs · {activeShelf.clip_count} clips
            </Overline>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable
              onPress={() => setNewDiscOpen(true)}
              style={({ hovered, pressed }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 30,
                paddingHorizontal: 12,
                borderRadius: radii.sm,
                borderWidth: 1,
                borderColor: (colors.border as string),
                backgroundColor: hovered || pressed ? (colors.elevated as string) : 'transparent',
                transitionProperty: 'background-color' as any,
                transitionDuration: '140ms' as any,
              })}
            >
              <Feather name="plus" size={12} color={colors.text as string} />
              <Text variant="bodySm" weight="medium" color={colors.text as string}>
                New disc
              </Text>
            </Pressable>
            <IconButton variant="ghost" size={30} onPress={onDeleteShelf} accessibilityLabel="Delete shelf">
              <Feather name="trash-2" size={12} color={palette.alert} />
            </IconButton>
          </View>
        </View>
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: spacing['5xl'] }}
      >
        {body}
      </ScrollView>
      <NewShelfModal
        open={newShelfOpen}
        onClose={() => setNewShelfOpen(false)}
        onCreated={(id) => {
          setNewShelfOpen(false);
          setActiveShelfId(id);
          setActiveDiscId(null);
          refreshShelves();
        }}
      />
      <NewDiscModal
        open={newDiscOpen}
        shelfId={activeShelfId}
        onClose={() => setNewDiscOpen(false)}
        onCreated={(id) => {
          setNewDiscOpen(false);
          setActiveDiscId(id);
          refreshDiscs();
          refreshShelves();
        }}
      />
      <WebTemplatesSheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        shelfColor={shelfColor}
      />
    </View>
  );
}
