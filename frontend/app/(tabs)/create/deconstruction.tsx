import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, ScrollView, Image, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Surface } from '@/components/ui/Surface';
import {
  Headline,
  Text,
  Mono,
  MonoSm,
  Overline,
} from '@/components/ui/Text';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing } from '@/constants/tokens';
import { analyze, cancelJob } from '@/services/api';
import { useJobStream } from '@/hooks/useJobStream';
import { SaveTemplateModal } from '@/components/create/SaveTemplateModal';
import { clearActiveJob, setActiveJob } from '@/lib/activeJob';

/* ===========================================================
   Style DNA card — one metric, fills in as real data arrives
   =========================================================== */

function DnaCard({
  label,
  value,
  hint,
  ready,
}: {
  label: string;
  value: string;
  hint?: string | null;
  ready: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Surface
      elevation="card"
      radius="lg"
      style={{
        padding: spacing.lg,
        gap: 4,
        opacity: ready ? 1 : 0.4,
        minWidth: 150,
        flex: 1,
      }}
    >
      <Overline style={{ letterSpacing: 1.6 }} color={colors.mutedText as string}>
        {label}
      </Overline>
      <Text variant="title" weight="bold" color={palette.mist}>
        {ready ? value : '—'}
      </Text>
      {hint ? <MonoSm muted>{hint}</MonoSm> : null}
    </Surface>
  );
}

/* ===========================================================
   Screen
   =========================================================== */

export default function DeconstructionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; jobId?: string }>();
  const { colors } = useAppTheme();
  const url = (params.url as string) || '';
  const resumeJobId = (params.jobId as string) || '';

  const [jobId, setJobId] = useState<string | null>(resumeJobId || null);
  const [startError, setStartError] = useState<string | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const cancelledRef = useRef(false);

  const stream = useJobStream(jobId);
  const {
    byType,
    progressPct,
    latestMessage,
    status,
    error: streamError,
    heroUrl,
    sfxItems,
  } = stream;

  // Kick off the real analyze on mount — unless we're resuming an existing
  // job (jobId was passed in params), in which case we just attach to the
  // stream. No clip_id — pure deconstruction; the save-as-clip flow comes later.
  useEffect(() => {
    if (resumeJobId) return;
    if (!url) {
      setStartError('No URL provided');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await analyze({ url });
        if (!cancelled && !cancelledRef.current) {
          setJobId(res.job_id);
          setActiveJob({ jobId: res.job_id, url, startedAt: Date.now() });
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setStartError((err as Error)?.message ?? 'Failed to start analyze');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, resumeJobId]);

  // Clear the persisted active-job pointer when the backend reaches any
  // terminal state. Leaving it set would make the next Create visit redirect
  // back into a finished job.
  useEffect(() => {
    if (status === 'done' || status === 'failed' || status === 'cancelled') {
      clearActiveJob();
    }
  }, [status]);

  // Live progress bar tween
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(progressPct / 100, {
      duration: 500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [progressPct]);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as `${number}%`,
  }));

  // ---- Extract real values from the event stream ----
  type DetectedSong = {
    song?: string | null;
    artist?: string | null;
    video_start?: number | null;
    video_end?: number | null;
    shazam_url?: string | null;
  };
  type AudioDoneData = {
    bpm?: number | null;
    num_speakers?: number | null;
    duration_s?: number | null;
    songs?: DetectedSong[];
  };
  type VideoDoneData = {
    segment_count?: number;
    game_detected?: string | null;
    has_caption_style?: boolean;
  };
  type StyleDnaPayload = {
    pacing?: { cuts_per_sec?: number | null; cut_count?: number };
    captions?: {
      present?: boolean;
      style_description?: string;
      font_feel?: string;
      position?: string;
    };
    beat_alignment?: { cuts_on_beat_pct?: number | null; beat_count?: number };
  };

  const audioData = byType['audio.done']?.data as AudioDoneData | undefined;
  const videoData = byType['video.done']?.data as VideoDoneData | undefined;
  const styleDna = (byType['artifacts.style_dna.done']?.data as
    | { style_dna?: StyleDnaPayload }
    | undefined)?.style_dna;

  const isDone = status === 'done';
  const isFailed = status === 'failed';
  const errorMessage = startError ?? streamError;

  // ---- Handlers ----
  const onCancel = () => {
    cancelledRef.current = true;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    if (jobId && !isDone) cancelJob(jobId).catch(() => {});
    clearActiveJob();
    router.back();
  };

  const onDone = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    // No save-as-clip flow yet — return to Create.
    router.replace('/(tabs)/create' as any);
  };

  const onReviewSfx = () => {
    if (!jobId) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    router.push({
      pathname: '/create/sfx-review',
      params: { jobId, topic: '' },
    } as any);
  };

  const onSaveTemplate = () => {
    if (!jobId) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setSaveTemplateOpen(true);
  };

  /* -------------- Render -------------- */
  return (
    <Screen background="ink">
      {/* Hero backdrop once available */}
      {heroUrl ? (
        <Animated.View
          entering={FadeIn.duration(600)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }}
        >
          <Image
            source={{ uri: heroUrl }}
            resizeMode="cover"
            style={{ width: '100%', height: '100%', opacity: isDone ? 0.3 : 0.16 }}
          />
        </Animated.View>
      ) : null}

      {/* Ink wash to ensure text legibility over the hero image */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: palette.ink,
          opacity: 0.55,
        }}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing['5xl'] + 20,
          paddingBottom: 200,
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ gap: 4 }}>
          <Overline style={{ letterSpacing: 2.6 }} color={palette.sage}>
            {isFailed ? 'FAILED' : isDone ? 'STYLE DNA' : 'DECONSTRUCTING'}
          </Overline>
          <Headline color={palette.mist}>
            {isFailed
              ? 'Deconstruction failed.'
              : isDone
                ? "Here's what makes it tick."
                : 'Reading the source…'}
          </Headline>
          <MonoSm muted numberOfLines={1}>
            {url}
          </MonoSm>
        </View>

        {/* Progress + stage message (while running) */}
        {!isDone && !isFailed ? (
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Mono color={palette.mist}>{latestMessage || 'Starting…'}</Mono>
              <MonoSm muted>{progressPct}%</MonoSm>
            </View>
            <View
              style={{
                height: 2,
                borderRadius: 1,
                backgroundColor: colors.border as string,
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={[
                  { height: '100%', backgroundColor: palette.sage },
                  progressStyle,
                ]}
              />
            </View>
          </View>
        ) : null}

        {/* Error — show a single-line summary up top; backend logs have the full trace. */}
        {errorMessage ? (
          <Surface elevation="card" radius="lg" style={{ padding: spacing.lg, gap: 6 }}>
            <Overline style={{ letterSpacing: 2.2 }} color={palette.gold}>
              ERROR
            </Overline>
            <Text variant="body" color={palette.mist} numberOfLines={3}>
              {errorMessage.split('\n')[0].slice(0, 240)}
            </Text>
            {__DEV__ ? (
              <MonoSm muted>See docker logs for the full trace.</MonoSm>
            ) : null}
          </Surface>
        ) : null}

        {/* Style DNA cards grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <DnaCard
            label="PACING"
            value={
              styleDna?.pacing?.cuts_per_sec != null
                ? `${styleDna.pacing.cuts_per_sec.toFixed(2)} cuts/s`
                : '—'
            }
            hint={
              styleDna?.pacing?.cut_count != null
                ? `${styleDna.pacing.cut_count} cuts total`
                : null
            }
            ready={styleDna?.pacing?.cuts_per_sec != null}
          />
          <DnaCard
            label="MUSIC"
            value={audioData?.bpm != null ? `${Math.round(audioData.bpm)} BPM` : '—'}
            hint={
              audioData?.duration_s != null
                ? `${audioData.duration_s.toFixed(1)}s source`
                : null
            }
            ready={audioData?.bpm != null}
          />
          <DnaCard
            label="VOICE"
            value={
              audioData?.num_speakers != null
                ? `${audioData.num_speakers} speaker${audioData.num_speakers === 1 ? '' : 's'}`
                : '—'
            }
            ready={audioData?.num_speakers != null}
          />
          <DnaCard
            label="SEGMENTS"
            value={
              videoData?.segment_count != null ? `${videoData.segment_count}` : '—'
            }
            hint={videoData?.game_detected ?? null}
            ready={videoData?.segment_count != null}
          />
          <DnaCard
            label="CAPTIONS"
            value={
              styleDna?.captions
                ? styleDna.captions.present
                  ? styleDna.captions.font_feel ?? 'Present'
                  : 'None detected'
                : '—'
            }
            hint={styleDna?.captions?.style_description ?? null}
            ready={!!styleDna?.captions}
          />
          <DnaCard
            label="SFX"
            value={
              byType['artifacts.sfx.done']
                ? `${sfxItems.length} candidate${sfxItems.length === 1 ? '' : 's'}`
                : '—'
            }
            hint={
              byType['artifacts.sfx.done'] && sfxItems.length > 0
                ? 'Tap Review below to pick keepers'
                : null
            }
            ready={!!byType['artifacts.sfx.done']}
          />
          <DnaCard
            label="BEAT SYNC"
            value={
              styleDna?.beat_alignment?.cuts_on_beat_pct != null
                ? `${Math.round(styleDna.beat_alignment.cuts_on_beat_pct * 100)}% on-beat`
                : '—'
            }
            hint={
              styleDna?.beat_alignment?.beat_count != null
                ? `${styleDna.beat_alignment.beat_count} beats`
                : null
            }
            ready={styleDna?.beat_alignment?.cuts_on_beat_pct != null}
          />
        </View>

        {/* Detected songs (from audio.done) */}
        {audioData?.songs && audioData.songs.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Overline style={{ letterSpacing: 2.2 }} color={palette.sage}>
              {`${audioData.songs.length} SONG${audioData.songs.length === 1 ? '' : 'S'} DETECTED`}
            </Overline>
            <View style={{ gap: spacing.xs }}>
              {audioData.songs.map((s, i) => {
                const start = typeof s.video_start === 'number' ? s.video_start : null;
                const end = typeof s.video_end === 'number' ? s.video_end : null;
                const range =
                  start != null && end != null
                    ? `${start.toFixed(1)}s → ${end.toFixed(1)}s`
                    : null;
                return (
                  <Surface
                    key={`${s.song ?? 'song'}-${i}`}
                    elevation="card"
                    radius="lg"
                    style={{
                      padding: spacing.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                    }}
                  >
                    <Feather name="music" size={16} color={palette.sage} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body" weight="semibold" color={palette.mist} numberOfLines={1}>
                        {s.song ?? 'Unknown track'}
                      </Text>
                      <MonoSm muted numberOfLines={1}>
                        {s.artist ?? '—'}
                        {range ? ` · ${range}` : ''}
                      </MonoSm>
                    </View>
                  </Surface>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Hero frame preview (when done) */}
        {heroUrl ? (
          <View style={{ alignItems: 'center', gap: spacing.xs }}>
            <Overline muted style={{ letterSpacing: 2.2 }}>
              HERO FRAME
            </Overline>
            <View
              style={{
                width: 180,
                aspectRatio: 9 / 16,
                borderRadius: radii.xl,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: colors.border as string,
                backgroundColor: palette.inkElevated,
              }}
            >
              <Image
                source={{ uri: heroUrl }}
                resizeMode="cover"
                style={{ width: '100%', height: '100%' }}
              />
            </View>
          </View>
        ) : null}

        {/* Event log (compact) — useful for debugging during testing. Dev-only. */}
        {__DEV__ && stream.events.length > 0 ? (
          <View style={{ gap: spacing.xs }}>
            <Overline muted style={{ letterSpacing: 2.2 }}>
              EVENT LOG
            </Overline>
            <Surface elevation="card" radius="lg" style={{ padding: spacing.md, gap: 4 }}>
              {stream.events.slice(-8).map((ev) => (
                <View
                  key={ev.id}
                  style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}
                >
                  <MonoSm
                    muted
                    style={{ minWidth: 38, textAlign: 'right' }}
                  >
                    {ev.progress_pct != null ? `${ev.progress_pct}%` : ''}
                  </MonoSm>
                  <MonoSm color={palette.mist} style={{ flex: 1 }}>
                    {ev.type}
                    {ev.message ? ` — ${ev.message}` : ''}
                  </MonoSm>
                </View>
              ))}
            </Surface>
          </View>
        ) : null}
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
        {isDone && sfxItems.length > 0 ? (
          <Button
            title="Review SFX"
            variant="secondary"
            size="lg"
            fullWidth
            onPress={onReviewSfx}
            leading={<Feather name="music" size={18} color={palette.mist} />}
          />
        ) : null}
        {isDone ? (
          <Button
            title="Save as template"
            variant="shimmer"
            size="lg"
            fullWidth
            onPress={onSaveTemplate}
            leading={<Feather name="bookmark" size={18} color={palette.ink} />}
          />
        ) : null}
        {isDone || isFailed ? (
          <Button
            title={isFailed ? 'Back to Create' : 'Done'}
            variant={isFailed ? 'secondary' : 'tertiary'}
            size="lg"
            fullWidth
            onPress={onDone}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              title="Cancel"
              variant="secondary"
              size="lg"
              onPress={onCancel}
            />
            <View style={{ flex: 1 }}>
              <Button
                title={`Deconstructing… ${progressPct}%`}
                variant="tertiary"
                size="lg"
                fullWidth
                disabled
                onPress={() => {}}
              />
            </View>
          </View>
        )}
      </View>

      <SaveTemplateModal
        open={saveTemplateOpen}
        jobId={jobId}
        defaultName={null}
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
