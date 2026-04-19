import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Mono, Overline, Text } from '@/components/ui/Text';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing } from '@/constants/tokens';
import {
  listSfxWithUrls,
  selectSfx,
  type SfxItemWithUrl,
} from '@/services/api';
import { SaveTemplateModal } from '@/components/create/SaveTemplateModal';

/* ========================================================
   Helpers
   ======================================================== */

function formatTime(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/* ========================================================
   Row
   ======================================================== */

function SfxRow({
  item,
  selected,
  onToggle,
  isPlaying,
  onPlayToggle,
}: {
  item: SfxItemWithUrl;
  selected: boolean;
  onToggle: () => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
}) {
  const { colors } = useAppTheme();
  const dimmed = !selected;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`SFX at ${formatTime(item.video_time)}${selected ? ', kept' : ', dropped'}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: selected ? (colors.primary as string) : (colors.border as string),
        backgroundColor: dimmed ? 'transparent' : (colors.card as string),
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {/* Play/pause */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onPlayToggle();
        }}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause SFX preview' : 'Play SFX preview'}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isPlaying ? (colors.primary as string) : palette.inkElevated,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Feather
          name={isPlaying ? 'pause' : 'play'}
          size={18}
          color={isPlaying ? palette.ink : palette.mist}
        />
      </Pressable>

      {/* Metadata */}
      <View style={{ flex: 1, gap: 2 }}>
        <Mono color={palette.mist}>{formatTime(item.video_time)}</Mono>
        <Text variant="caption" color={colors.mutedText as string}>
          {item.duration ? `${item.duration.toFixed(2)}s` : '—'} · strength{' '}
          {item.strength ? item.strength.toFixed(2) : '—'}
          {typeof item.beat_offset === 'number'
            ? ` · beat ±${Math.abs(item.beat_offset).toFixed(2)}s`
            : ''}
        </Text>
      </View>

      {/* Checkbox */}
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: selected ? (colors.primary as string) : (colors.border as string),
          backgroundColor: selected ? (colors.primary as string) : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Feather name="check" size={16} color={palette.ink} /> : null}
      </View>
    </Pressable>
  );
}

/* ========================================================
   Screen
   ======================================================== */

export default function SfxReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ jobId?: string; clipId?: string; topic?: string }>();
  const { colors } = useAppTheme();
  const jobId = (params.jobId as string) || '';
  const clipId = (params.clipId as string) || '';
  const topic = (params.topic as string) || 'Your lesson';

  const [items, setItems] = useState<SfxItemWithUrl[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  // sfx-review with no clipId = pure deconstruction flow. In that mode we
  // surface "Save as template" as the natural completion; generation-mode
  // (clipId present) keeps the Confirm → player flow untouched.
  const isDeconstructionMode = !clipId;

  const soundRef = useRef<Audio.Sound | null>(null);

  // Load SFX items with signed URLs on mount.
  useEffect(() => {
    if (!jobId) {
      setLoadError('Missing jobId');
      return;
    }
    let cancelled = false;
    listSfxWithUrls(jobId)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setSelected(new Set(res.items.map((i) => i.id)));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message ?? 'Failed to load SFX');
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Unload any playing sound on unmount.
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  const toggle = (id: number) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const play = async (item: SfxItemWithUrl) => {
    if (!item.url) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    // Stop+unload whatever was playing before starting the next clip.
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: item.url },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setPlayingId(item.id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setPlayingId((cur) => (cur === item.id ? null : cur));
          sound.unloadAsync().catch(() => {});
          if (soundRef.current === sound) soundRef.current = null;
        }
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[sfx-review] play failed', err);
      setPlayingId(null);
    }
  };

  const stop = async () => {
    if (!soundRef.current) return;
    await soundRef.current.unloadAsync().catch(() => {});
    soundRef.current = null;
    setPlayingId(null);
  };

  const onPlayToggle = (item: SfxItemWithUrl) => {
    if (playingId === item.id) {
      stop();
    } else {
      play(item);
    }
  };

  const goToPlayer = () => {
    if (clipId) {
      router.replace(`/player/${clipId}` as any);
      return;
    }
    // Deconstruction flow pushes us here without a clipId — no player to
    // land on, so return to the screen that opened us. `feed` is hidden on
    // mobile (href:null), so replacing to it bounces the user to library.
    if (router.canGoBack?.()) router.back();
    else router.replace('/(tabs)/create' as any);
  };

  const onConfirm = async () => {
    if (!items || !jobId) return goToPlayer();
    setSaving(true);
    // The backend handler is atomic — once the POST leaves the device the
    // selection is saved regardless of whether we receive the ack. Some dev
    // network paths (docker bridge + Metro proxy) occasionally stall the
    // response body, which used to leave the button stuck on "Saving…".
    // Race the fetch against a short timeout so the UI always unlocks.
    const ack = selectSfx(jobId, Array.from(selected)).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[sfx-review] selectSfx failed', err);
    });
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
    try {
      await Promise.race([ack, timeout]);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    } finally {
      setSaving(false);
      goToPlayer();
    }
  };

  const onSkip = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    goToPlayer();
  };

  // In deconstruction mode we first lock in the SFX keepers (fire-and-forget,
  // same pattern as onConfirm), then open the Save-as-template sheet.
  const onSaveTemplate = async () => {
    if (!jobId) return;
    if (items && items.length > 0) {
      selectSfx(jobId, Array.from(selected)).catch(() => {});
    }
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setSaveTemplateOpen(true);
  };

  /* -------------- Render -------------- */
  return (
    <Screen background="ink">
      {/* Header */}
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing['3xl'],
          paddingBottom: spacing.lg,
          gap: spacing.xs,
        }}
      >
        <Overline style={{ letterSpacing: 2.6 }} color={palette.sage}>
          SOUND DESIGN
        </Overline>
        <Text variant="headline" weight="bold" color={palette.mist}>
          Pick the SFX to keep
        </Text>
        <Text variant="body" color={colors.mutedText as string}>
          {topic}
        </Text>
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: 160,
          gap: spacing.sm,
        }}
      >
        {loadError ? (
          <Text variant="body" color={palette.gold}>
            {loadError}
          </Text>
        ) : items === null ? (
          <Mono color={colors.mutedText as string}>Loading candidates…</Mono>
        ) : items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'], gap: spacing.xs }}>
            <Text variant="body" color={palette.mist}>
              No SFX detected — clean track.
            </Text>
            <Text variant="caption" color={colors.mutedText as string}>
              Continue to playback.
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <SfxRow
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
              isPlaying={playingId === item.id}
              onPlayToggle={() => onPlayToggle(item)}
            />
          ))
        )}
      </ScrollView>

      {/* Footer */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing['3xl'],
          backgroundColor: palette.ink + 'EE',
          borderTopWidth: 1,
          borderTopColor: colors.border as string,
          gap: spacing.sm,
        }}
      >
        {items && items.length > 0 ? (
          <Mono color={colors.mutedText as string}>
            {selected.size} of {items.length} kept · the rest will be hidden from this session
          </Mono>
        ) : null}
        {isDeconstructionMode ? (
          <View style={{ gap: spacing.sm }}>
            <Button
              title="Save as template"
              variant="shimmer"
              fullWidth
              disabled={saving || !jobId}
              onPress={onSaveTemplate}
              leading={<Feather name="bookmark" size={18} color={palette.ink} />}
            />
            <Button
              title="Skip — don't save"
              variant="tertiary"
              fullWidth
              onPress={onSkip}
              disabled={saving}
            />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              title="Skip"
              variant="secondary"
              onPress={onSkip}
              disabled={saving}
            />
            <View style={{ flex: 1 }}>
              <Button
                title={saving ? 'Saving…' : 'Confirm'}
                variant="shimmer"
                fullWidth
                disabled={saving || items === null}
                onPress={onConfirm}
                leading={<Feather name="check" size={18} color={palette.ink} />}
              />
            </View>
          </View>
        )}
      </View>

      <SaveTemplateModal
        open={saveTemplateOpen}
        jobId={jobId || null}
        defaultName={topic && topic !== 'Your lesson' ? topic : ''}
        onClose={() => setSaveTemplateOpen(false)}
        onSaved={() => {
          setSaveTemplateOpen(false);
          router.replace({
            pathname: '/(tabs)/create',
            params: { templateSaved: '1' },
          } as any);
        }}
      />
    </Screen>
  );
}
