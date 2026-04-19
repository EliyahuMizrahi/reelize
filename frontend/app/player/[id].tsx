import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Dimensions,
  Image,
  Pressable,
  Platform,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';

import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';

import { Screen } from '@/components/ui/Screen';
import { Title, TitleSm, Body, BodySm, Mono, MonoSm, Overline, Label, Text } from '@/components/ui/Text';
import { IconButton } from '@/components/ui/IconButton';
import { Chip } from '@/components/ui/Chip';
import { Divider } from '@/components/ui/Surface';
import { Shards } from '@/components/brand/Shards';
import { StyleDNA } from '@/components/brand/StyleDNA';
import { Waveform } from '@/components/brand/Waveform';
import { palette, spacing, radii, motion } from '@/constants/tokens';
import { useClip } from '@/data/hooks';
import { supabase } from '@/lib/supabase';
import { getJobArtifact } from '@/services/api';
import { DEFAULT_DNA, type DNAToken } from '@/components/brand/StyleDNA';

const STORAGE_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_BUCKET ?? 'reelize-artifacts';
import {
  creatorSummaryFromStyle,
  dnaTokensFromStyle,
  transcriptFromStyle,
} from '@/lib/format';
import type { Row } from '@/types/supabase';
import type { ClipWithClass } from '@/data/queries';

// View-model shape expected by the player. We derive it from the real
// clip row on mount — some fields (tokens, transcript, cutPoints) are
// still procedurally generated until the pipeline writes them.
interface Clip {
  id: string;
  topic: string;
  className: string;
  classColor: string;
  sourceCreator: string;
  sourceDuration: string;
  thumbnailColor: string;
  durationMs: number;
  cutPoints: number[];
  tokens: DNAToken[];
  creator: {
    handle: string;
    avgCutsPerMin: number;
    captionStyle: string;
    voiceEnergy: string;
    signatureTransition: string;
  };
  transcript: { speaker: 0 | 1; t: string; text: string }[];
}

function fmtMonoTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function clipFromRow(row: ClipWithClass): Clip {
  const durationMs = Math.max(1, Math.round((row.duration_s ?? 30) * 1000));

  // Cut points: derive from real pacing data when we have it, else fall back
  // to a deterministic stand-in keyed off the clip id so the scrubber still
  // has tick marks for clips without pacing analysis.
  const cutPoints: number[] = [];
  const styleAny = (row.style_dna ?? {}) as {
    pacing?: { cut_count?: number };
    voice?: { turns?: Array<{ start?: number }> };
  };
  const voiceTurns = styleAny.voice?.turns ?? [];
  const realCutCount = styleAny.pacing?.cut_count ?? 0;
  const durationS = row.duration_s ?? 30;
  if (voiceTurns.length > 0 && durationS > 0) {
    // Use turn-start boundaries as cut ticks — those are the moments the
    // scrubber actually "cuts" to a new scene in the narration.
    for (const t of voiceTurns) {
      const s = typeof t.start === 'number' ? t.start : null;
      if (s === null) continue;
      const frac = s / durationS;
      if (frac > 0.02 && frac < 0.98) cutPoints.push(frac);
    }
  }
  if (cutPoints.length === 0) {
    // fallback: deterministic hash-based ticks (keeps old behavior).
    let seed = 7;
    for (let i = 0; i < row.id.length; i++) seed = (seed * 31 + row.id.charCodeAt(i)) % 9973;
    const soft = realCutCount > 0 ? Math.min(10, Math.max(4, Math.round(realCutCount / 4))) : 6;
    for (let i = 1; i <= soft; i++) {
      const base = i / (soft + 1);
      const jitter = (((seed + i * 7) % 13) - 6) / 100;
      cutPoints.push(Math.max(0.04, Math.min(0.96, base + jitter)));
    }
  }

  const creatorHandle = row.source_creator ?? '@source';
  const { tokens } = dnaTokensFromStyle(row.style_dna);
  const creator = creatorSummaryFromStyle(row.style_dna, creatorHandle);
  const realTranscript = transcriptFromStyle(row.style_dna);
  const transcript = realTranscript ?? [
    { speaker: 0, t: '0:00', text: 'Transcript unavailable.' },
  ];

  return {
    id: row.id,
    topic: row.title,
    className: row.className ?? 'Class',
    classColor: row.classColor ?? palette.sage,
    sourceCreator: creatorHandle,
    sourceDuration: fmtMonoTime(row.duration_s ?? 30),
    thumbnailColor: row.thumbnail_color ?? palette.tealDeep,
    durationMs,
    cutPoints,
    tokens,
    creator,
    transcript,
  };
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.7;
const OVERLAY_WIDTH = Math.min(SCREEN_W * 0.92, 420);

function hapticSelect() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}
function hapticImpact() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
function hapticLight() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function seedFromId(id: string): number {
  let n = 7;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 9973;
  return n || 7;
}

function formatMmSs(totalMs: number): string {
  const s = Math.max(0, Math.floor(totalMs / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

// ─── Scrubber with haptic cuts + tap/pan seek ─────────────────────────────

interface ScrubberProps {
  clip: Clip;
  progress: SharedValue<number>;
  // Called when the user taps or drags the track. fraction is clamped to
  // [0,1]. The parent should update its shared `progress` and call
  // videoRef.setPositionAsync(fraction * durationMs).
  onSeek?: (fraction: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

function Scrubber({ clip, progress, onSeek, onScrubStart, onScrubEnd }: ScrubberProps) {
  const seed = useMemo(() => seedFromId(clip.id), [clip.id]);
  const [barIndex, setBarIndex] = useState(0);
  const lastBarIndex = useSharedValue(-1);
  const [trackWidth, setTrackWidth] = useState(0);

  const WAVEFORM_BARS = 80;

  // Only push to React state when the played-bar count changes (≤ WAVEFORM_BARS updates per clip)
  useDerivedValue(() => {
    const idx = Math.floor(Math.max(0, Math.min(1, progress.value)) * WAVEFORM_BARS);
    if (idx !== lastBarIndex.value) {
      lastBarIndex.value = idx;
      runOnJS(setBarIndex)(idx);
    }
  }, [progress]);

  const barProgress = barIndex / WAVEFORM_BARS;

  // Haptic tick at cut crossings
  const lastIdx = useSharedValue(-1);
  useDerivedValue(() => {
    const p = progress.value;
    let idx = -1;
    for (let i = 0; i < clip.cutPoints.length; i++) {
      if (p >= clip.cutPoints[i]) idx = i;
      else break;
    }
    if (idx !== lastIdx.value) {
      lastIdx.value = idx;
      if (idx >= 0 && Platform.OS !== 'web') {
        runOnJS(hapticSelect)();
      }
    }
  }, [progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
  }));

  // Tap-to-seek. Pan gesture covers drag-to-scrub. We build them here (UI
  // thread), then call the JS-side onSeek via runOnJS.
  const fireSeek = useCallback(
    (x: number) => {
      if (trackWidth <= 0) return;
      const frac = Math.max(0, Math.min(1, x / trackWidth));
      onSeek?.(frac);
    },
    [trackWidth, onSeek],
  );
  const fireStart = useCallback(() => onScrubStart?.(), [onScrubStart]);
  const fireEnd = useCallback(() => onScrubEnd?.(), [onScrubEnd]);

  const scrubTap = Gesture.Tap()
    .maxDuration(400)
    .onEnd((e, success) => {
      if (!success) return;
      runOnJS(fireSeek)(e.x);
    });
  const scrubPan = Gesture.Pan()
    .minDistance(0)
    .activeOffsetX([-1, 1])
    .onStart((e) => {
      runOnJS(fireStart)();
      runOnJS(fireSeek)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(fireSeek)(e.x);
    })
    .onEnd(() => {
      runOnJS(fireEnd)();
    });
  const scrubGesture = Gesture.Simultaneous(scrubPan, scrubTap);

  return (
    <GestureDetector gesture={scrubGesture}>
      <View
        style={{ width: '100%', paddingVertical: 6 }}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        collapsable={false}
      >
        {/* Waveform overlay */}
        <View style={{ paddingHorizontal: 2, height: 36, justifyContent: 'center' }}>
          <Waveform
            bars={WAVEFORM_BARS}
            height={28}
            barWidth={2}
            barGap={1}
            seed={seed}
            progress={barProgress}
            color={palette.sage}
          />
        </View>

        {/* Line + fill */}
        <View style={styles.scrubTrack}>
          <Animated.View style={[styles.scrubFill, fillStyle]} />
        </View>

        {/* Cut point ticks */}
        <View style={styles.cutTickLayer} pointerEvents="none">
          {clip.cutPoints.map((p, i) => (
            <View
              key={i}
              style={[
                styles.cutTick,
                { left: `${p * 100}%` },
              ]}
            />
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

// ─── Transcript Drawer ──────────────────────────────────────────────────────

interface TranscriptDrawerProps {
  clip: Clip;
  open: boolean;
  onClose: () => void;
}

function TranscriptDrawer({ clip, open, onClose }: TranscriptDrawerProps) {
  const translateY = useSharedValue(DRAWER_HEIGHT);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (open) {
      translateY.value = withTiming(0, { duration: motion.dur.slow, easing: Easing.bezier(...motion.ease.entrance) });
      backdrop.value = withTiming(1, { duration: motion.dur.normal });
    } else {
      translateY.value = withTiming(DRAWER_HEIGHT, { duration: motion.dur.fast, easing: Easing.bezier(...motion.ease.exit) });
      backdrop.value = withTiming(0, { duration: motion.dur.fast });
    }
  }, [open]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.6,
  }));

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) {
        translateY.value = withTiming(DRAWER_HEIGHT, { duration: motion.dur.fast });
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: motion.dur.fast });
      }
    });

  return (
    <>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[styles.drawer, drawerStyle]}
        >
          {/* handle */}
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
            <View style={styles.drawerHandle} />
          </View>

          <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
            <Overline muted>Transcript</Overline>
            <TitleSm style={{ marginTop: 4 }}>{clip.topic}</TitleSm>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.lg,
              gap: spacing.lg,
            }}
            showsVerticalScrollIndicator={false}
          >
            {clip.transcript.map((line, i) => (
              <View
                key={i}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}
              >
                <View
                  style={[
                    styles.speakerBar,
                    {
                      backgroundColor:
                        line.speaker === 0 ? palette.sage : palette.tealBright,
                    },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <MonoSm muted>
                    {line.t} · speaker {line.speaker + 1}
                  </MonoSm>
                  <Body style={{ marginTop: 4 }} family="serif">
                    {line.text}
                  </Body>
                </View>
              </View>
            ))}

            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

// ─── Style DNA Overlay (right-side panel) ──────────────────────────────────

interface DNAOverlayProps {
  clip: Clip;
  open: boolean;
  onClose: () => void;
}

function DNAOverlay({ clip, open, onClose }: DNAOverlayProps) {
  const translateX = useSharedValue(OVERLAY_WIDTH);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (open) {
      translateX.value = withTiming(0, { duration: motion.dur.slow, easing: Easing.bezier(...motion.ease.entrance) });
      backdrop.value = withTiming(1, { duration: motion.dur.normal });
    } else {
      translateX.value = withTiming(OVERLAY_WIDTH, { duration: motion.dur.fast, easing: Easing.bezier(...motion.ease.exit) });
      backdrop.value = withTiming(0, { duration: motion.dur.fast });
    }
  }, [open]);

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.55,
  }));

  return (
    <>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.dnaOverlay, overlayStyle]}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: spacing['4xl'] }}
          showsVerticalScrollIndicator={false}
        >
          {/* Close + header */}
          <View style={styles.overlayHeader}>
            <View>
              <Overline muted>Style DNA</Overline>
              <TitleSm style={{ marginTop: 4 }}>{clip.topic}</TitleSm>
            </View>
            <IconButton
              variant="glass"
              size={38}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={18} color={palette.mist} />
            </IconButton>
          </View>

          {/* Full DNA */}
          <View style={styles.dnaFullWrap}>
            <StyleDNA
              variant="full"
              size={280}
              tokens={clip.tokens}
              spinning
              color={clip.classColor}
            />
          </View>

          {/* Token intensities list */}
          <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm, marginTop: spacing.md }}>
            {clip.tokens.map((tk) => (
              <View key={tk.id} style={styles.intensityRow}>
                <Overline muted style={{ width: 80 }}>
                  {tk.label}
                </Overline>
                <View style={styles.intensityTrack}>
                  <View
                    style={[
                      styles.intensityFill,
                      {
                        width: `${tk.intensity * 100}%`,
                        backgroundColor: clip.classColor,
                      },
                    ]}
                  />
                </View>
                <Mono muted style={{ width: 36, textAlign: 'right' }}>
                  {Math.round(tk.intensity * 100)}
                </Mono>
              </View>
            ))}
          </View>

          <View style={{ height: spacing['2xl'] }} />
          <Divider style={{ marginHorizontal: spacing.xl }} />
          <View style={{ height: spacing['2xl'] }} />

          {/* Source creator fingerprint */}
          <View style={{ paddingHorizontal: spacing.xl }}>
            <Overline muted>Source creator fingerprint</Overline>

            <View style={styles.creatorRow}>
              <View style={[styles.creatorAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text variant="title" weight="semibold" color={clip.classColor}>
                  {(clip.creator.handle ?? '?').replace(/^@/, '').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Title color={palette.mist}>{clip.creator.handle}</Title>
                <Mono muted style={{ marginTop: 2 }}>
                  {clip.className.toLowerCase()} · short-form
                </Mono>
              </View>
            </View>

            <View style={styles.statGrid}>
              <StatCell
                label="Avg cuts / min"
                value={String(clip.creator.avgCutsPerMin)}
                unit="cuts"
              />
              <StatCell
                label="Voice energy"
                value={clip.creator.voiceEnergy}
              />
              <StatCell
                label="Caption style"
                value={clip.creator.captionStyle}
              />
              <StatCell
                label="Signature transition"
                value={clip.creator.signatureTransition}
              />
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}

function StatCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View style={styles.statCell}>
      <Overline muted>{label}</Overline>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
        <Body color={palette.mist} family="serif">
          {value}
        </Body>
        {unit ? (
          <MonoSm muted style={{ opacity: 0.7 }}>
            {unit}
          </MonoSm>
        ) : null}
      </View>
    </View>
  );
}

// ─── Player Screen ──────────────────────────────────────────────────────────

export default function PlayerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: row, loading, error } = useClip(id);

  const clip: Clip | null = useMemo(
    () => (row ? clipFromRow(row) : null),
    [row],
  );

  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [dnaOpen, setDnaOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);

  // Resolve a short-lived signed URL for the rendered mp4. Try the Supabase
  // JS client first (no backend dependency — works even when the FastAPI
  // devtunnel is cold); fall back to the /jobs/{jobId}/artifacts endpoint
  // if the client-side sign is blocked by storage RLS.
  //
  // Invariants:
  //  - only refetch when the clip id or storage key actually change (the
  //    row object reference churns on every useClip realtime tick; if we
  //    reset on row-ref changes, we'd flicker the video away and race the
  //    async call against the cleanup).
  //  - the old `videoUrl` is kept visible while we fetch a new one.
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0); // manual retry trigger
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const videoRef = useRef<Video | null>(null);
  const lastFetchedKey = useRef<string | null>(null);

  const videoStorageKey =
    typeof (row as any)?.artifacts?.video === 'string'
      ? ((row as any).artifacts.video as string)
      : null;
  const videoJobId = row?.generation_job_id ?? row?.job_id ?? null;
  const thumbStorageKey =
    typeof (row as any)?.artifacts?.thumbnail === 'string'
      ? ((row as any).artifacts.thumbnail as string)
      : null;

  // Sign the thumbnail URL — shown under the <Video> while it buffers the
  // first frame, so the user never sees the gradient "mock" fallback.
  useEffect(() => {
    if (!thumbStorageKey) {
      setThumbUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(thumbStorageKey, 3600);
        if (!cancelled && !error && data?.signedUrl) setThumbUrl(data.signedUrl);
      } catch {
        /* fallback gradient stays */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thumbStorageKey]);

  useEffect(() => {
    // Nothing to do until we know at least one of (storage key, job id).
    if (!videoStorageKey && !videoJobId) return;
    // Avoid duplicate work when React rerenders but the target didn't change.
    const cacheKey = `${videoStorageKey ?? ''}|${videoJobId ?? ''}|${fetchTick}`;
    if (lastFetchedKey.current === cacheKey) return;
    lastFetchedKey.current = cacheKey;

    let cancelled = false;

    (async () => {
      setVideoError(null);
      // 1. Client-side sign via Supabase Storage. This is the fastest path
      //    and works without any FastAPI backend running.
      if (videoStorageKey) {
        try {
          const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(videoStorageKey, 3600);
          if (cancelled) return;
          if (!error && data?.signedUrl) {
            setVideoUrl(data.signedUrl);
            return;
          }
          if (error) {
            // Storage RLS likely blocks non-owner-prefixed keys. Fall through
            // to the backend path; keep the message for the UI if that
            // also fails.
            console.warn('[player] supabase.createSignedUrl failed:', error.message);
          }
        } catch (e) {
          console.warn('[player] supabase.createSignedUrl threw:', e);
        }
      }
      // 2. Fallback: ask the backend to sign it for us. Only works when the
      //    EXPO_PUBLIC_API_BASE_URL backend is reachable.
      if (videoJobId) {
        try {
          const res = await getJobArtifact(videoJobId, 'video');
          if (cancelled) return;
          const url = typeof res.url === 'string' ? res.url : null;
          if (url) {
            setVideoUrl(url);
            return;
          }
          setVideoError('Rendered video is still processing.');
        } catch (e) {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : String(e);
          console.warn('[player] getJobArtifact failed:', msg);
          setVideoError(msg);
        }
      } else if (!videoUrl) {
        setVideoError('No video available for this clip.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoStorageKey, videoJobId, fetchTick]);

  // progress 0..1 — driven by the <Video> when we have one, else a fake
  // linear ramp so the scrubber still animates for rows without rendered
  // video yet.
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    // Skip the fake ramp when we're about to play a real video — the
    // playback status callback will drive `progress` instead.
    if (clip && isPlaying && !videoUrl) {
      progress.value = withTiming(1, {
        duration: clip.durationMs,
        easing: Easing.linear,
      });
    }
    return () => cancelAnimation(progress);
  }, [clip?.id, clip?.durationMs, isPlaying, videoUrl]);

  // While the user is actively dragging the scrubber, the video's own
  // position reports lag the finger — ignore those updates so the thumb
  // stays glued to the touch.
  const isScrubbing = useRef(false);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        if (isVideoLoaded) setIsVideoLoaded(false);
        return;
      }
      if (!isVideoLoaded) setIsVideoLoaded(true);
      if (isScrubbing.current) return;
      const dur = status.durationMillis ?? 0;
      if (dur > 0) {
        progress.value = Math.min(1, status.positionMillis / dur);
      }
      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    },
    [progress, isVideoLoaded],
  );

  // Play/pause is driven by the `shouldPlay={isPlaying}` prop on <Video>.
  // We used to also call playAsync/pauseAsync imperatively, which raced
  // the native playback state during taps and could crash on iOS.

  // Seek handler: called from the Scrubber on tap + pan. Updates the
  // Reanimated shared value immediately (no fake-ramp lag), then jumps the
  // Video to the matching millisecond. We don't await the setPosition so
  // rapid drag frames don't queue up on the UI thread.
  const seekToFraction = useCallback(
    (fraction: number) => {
      const clipDurMs = clip?.durationMs ?? 30_000;
      const f = Math.max(0, Math.min(1, fraction));
      progress.value = f;
      lastSeekAt.current = Date.now();
      // Only call setPositionAsync once the Video is fully loaded; hitting
      // it during the buffering window throws a native NSInternalInconsistency
      // on iOS.
      const v = videoRef.current;
      if (v && videoUrl && isVideoLoaded) {
        v.setPositionAsync(Math.round(f * clipDurMs)).catch(() => {});
      }
    },
    [clip?.durationMs, progress, videoUrl, isVideoLoaded],
  );

  // Stamp of the most recent seek — kept for debugging + potential future
  // gesture coordination. No longer used to suppress a screen tap (that
  // full-screen tap gesture was removed).
  const lastSeekAt = useRef(0);
  const onScrubStart = useCallback(() => {
    isScrubbing.current = true;
    lastSeekAt.current = Date.now();
    hapticLight();
  }, []);
  const onScrubEnd = useCallback(() => {
    isScrubbing.current = false;
    lastSeekAt.current = Date.now();
  }, []);

  // Screen entrance — for swipe-up transition effect
  const screenOpacity = useSharedValue(1);
  const screenTranslate = useSharedValue(0);

  // Long-press to open DNA overlay. The full-screen tap-to-open-transcript
  // gesture used to live here too, but it raced with the native <Video>
  // surface and could crash on taps during playback — we've moved the
  // transcript trigger to an explicit IconButton in the top bar.
  const longPress = Gesture.LongPress()
    .minDuration(600)
    .onStart(() => {
      runOnJS(hapticImpact)();
      runOnJS(setDnaOpen)(true);
    });

  // Swipe up for next clip
  const swipe = Gesture.Pan()
    .activeOffsetY([-30, 30])
    .onEnd((e) => {
      if (e.translationY < -120 || e.velocityY < -900) {
        runOnJS(hapticImpact)();
        screenTranslate.value = withTiming(-SCREEN_H * 0.4, {
          duration: motion.dur.slow,
          easing: Easing.bezier(...motion.ease.exit),
        });
        screenOpacity.value = withTiming(0, { duration: motion.dur.slow });
        runOnJS(goNext)();
      }
    });

  const goNext = useCallback(() => {
    // With real data we don't yet have an ordered feed at the player
    // level; pop back into the feed and let the user pick next.
    setTimeout(() => {
      router.replace('/(tabs)/feed' as any);
    }, 220);
  }, [router]);

  // Swipe-up-for-next runs in parallel with long-press-for-DNA.
  const composed = Gesture.Simultaneous(swipe, longPress);

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ translateY: screenTranslate.value }],
  }));

  // progress-driven time display — only updates when the displayed second changes (~1 Hz)
  const [timeSec, setTimeSec] = useState(0);
  const durationMs = clip?.durationMs ?? 30_000;
  const lastSec = useSharedValue(-1);
  useDerivedValue(() => {
    const sec = Math.floor((progress.value * durationMs) / 1000);
    if (sec !== lastSec.value) {
      lastSec.value = sec;
      runOnJS(setTimeSec)(sec);
    }
  }, [progress, durationMs]);
  const timeMs = timeSec * 1000;

  // Shards sit still behind the clip — the waveform and cut ticks
  // already carry motion on this screen. No ambient drift.
  const shardStyle = { opacity: 0.24 } as const;

  if (loading && !clip) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.ink }}>
        <Screen edges={[]} background="ink">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Mono color={palette.fog}>loading clip…</Mono>
          </View>
        </Screen>
      </GestureHandlerRootView>
    );
  }

  if (!clip) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.ink }}>
        <Screen edges={[]} background="ink">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md }}>
            <TitleSm color={palette.mist}>Clip not found.</TitleSm>
            <Mono color={palette.fog}>{error ? error.message : 'It may have been deleted.'}</Mono>
            <IconButton variant="glass" size={40} onPress={() => router.back()} accessibilityLabel="Back">
              <Feather name="chevron-left" size={20} color={palette.mist} />
            </IconButton>
          </View>
        </Screen>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.ink }}>
      <Screen edges={[]} background="ink">
        <Animated.View style={[{ flex: 1 }, screenStyle]}>
          {/* Video surface — real mp4 when we have a signed URL, else the
              branded gradient fallback. */}
          <View style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={[palette.inkDeep, clip.thumbnailColor, palette.ink]}
              locations={[0, 0.55, 1]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Thumbnail poster: renders under the <Video> so the user never
                sees the gradient "mock" fallback during the ~500ms the
                Video takes to buffer the first frame. Fades out the first
                time the Video reports isLoaded. */}
            {thumbUrl && !isVideoLoaded ? (
              <Image
                source={{ uri: thumbUrl }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            ) : null}
            {videoUrl ? (
              <Video
                // Stable key tied to the URL — forces a clean remount only
                // when a *new* signed URL is issued (retry / TTL refresh).
                key={videoUrl}
                ref={videoRef}
                source={{ uri: videoUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode={ResizeMode.COVER}
                shouldPlay={isPlaying}
                isLooping={false}
                onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                onError={(e) => {
                  const msg = typeof e === 'string' ? e : 'Playback error';
                  console.warn('[player] <Video> onError:', msg);
                  // Surface the error but DON'T drop videoUrl — unmounting
                  // the Video mid-playback (e.g. after a transient network
                  // blip) caused a native dispose crash on tap.
                  setVideoError(msg);
                }}
                useNativeControls={false}
              />
            ) : null}
            {!videoUrl && !thumbUrl ? (
              <View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    top: SCREEN_H * 0.18,
                    left: (SCREEN_W - Math.min(SCREEN_W * 0.9, 380)) / 2,
                  },
                  shardStyle,
                ]}
              >
                <Shards
                  size={Math.min(SCREEN_W * 0.9, 380)}
                  phase="assembled"
                  color={clip.classColor}
                />
              </View>
            ) : null}
            {videoError && !videoUrl ? (
              <View
                style={{
                  position: 'absolute',
                  bottom: SCREEN_H * 0.28,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                  gap: spacing.sm,
                }}
              >
                <Mono color={palette.fog}>{videoError}</Mono>
                <Pressable
                  onPress={() => {
                    hapticLight();
                    setVideoError(null);
                    setFetchTick((n) => n + 1);
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: radii.pill,
                    backgroundColor: 'rgba(4,20,30,0.65)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.18)',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <MonoSm color={palette.mist}>Retry</MonoSm>
                </Pressable>
              </View>
            ) : null}
            <LinearGradient
              colors={['rgba(4,20,30,0.55)', 'rgba(4,20,30,0)', 'rgba(4,20,30,0.92)']}
              locations={[0, 0.35, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>

          {/* Gesture area — full video */}
          <GestureDetector gesture={composed}>
            <View style={StyleSheet.absoluteFill} collapsable={false} />
          </GestureDetector>

          {/* ── Top bar ───────────────────────────── */}
          <View style={styles.playerTopBar} pointerEvents="box-none">
            <IconButton
              variant="glass"
              size={40}
              onPress={() => router.back()}
              accessibilityLabel="Back"
            >
              <Feather name="chevron-left" size={20} color={palette.mist} />
            </IconButton>

            <View style={styles.topCenterTag}>
              <Mono color={palette.fog}>from {clip.sourceCreator}</Mono>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <IconButton
                variant="glass"
                size={40}
                onPress={() => {
                  hapticLight();
                  setTranscriptOpen(true);
                }}
                accessibilityLabel="Open transcript"
              >
                <Feather name="align-left" size={18} color={palette.mist} />
              </IconButton>
              <Pressable onPress={() => setDnaOpen(true)}>
                <StyleDNA
                  variant="medallion"
                  size={52}
                  tokens={clip.tokens}
                  showLabels={false}
                  spinning
                  color={clip.classColor}
                />
              </Pressable>
            </View>
          </View>

          {/* ── Class + topic anchor, bottom ───────── */}
          <View style={styles.playerTopicBlock} pointerEvents="none">
            <Chip
              variant="class"
              classColor={clip.classColor}
              label={clip.className}
              size="sm"
            />
            <Title color={palette.mist} style={{ marginTop: spacing.sm, letterSpacing: -0.4 }}>
              {clip.topic}
            </Title>
          </View>

          {/* ── Scrubber + controls ────────────────── */}
          <View style={styles.scrubWrap} pointerEvents="box-none">
            <View style={styles.scrubRow}>
              <Mono color={palette.fog} style={{ width: 54 }}>
                {formatMmSs(timeMs)}
              </Mono>

              <View style={{ flex: 1 }}>
                <Scrubber
                  clip={clip}
                  progress={progress}
                  onSeek={seekToFraction}
                  onScrubStart={onScrubStart}
                  onScrubEnd={onScrubEnd}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginLeft: spacing.sm }}>
                <IconButton
                  variant="glass"
                  size={32}
                  onPress={() => {
                    hapticLight();
                    setIsPlaying((p) => !p);
                  }}
                  accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                >
                  <Feather name={isPlaying ? 'pause' : 'play'} size={14} color={palette.mist} />
                </IconButton>
                <IconButton
                  variant="glass"
                  size={32}
                  onPress={() => {
                    hapticLight();
                    progress.value = 0;
                    lastSeekAt.current = Date.now();
                    // Guard the native seek; setIsPlaying flips the
                    // shouldPlay prop so the Video resumes from 0 on its own.
                    if (videoRef.current && videoUrl && isVideoLoaded) {
                      videoRef.current.setPositionAsync(0).catch(() => {});
                    }
                    setIsPlaying(true);
                  }}
                  accessibilityLabel="Restart"
                >
                  <Feather name="rotate-ccw" size={14} color={palette.mist} />
                </IconButton>
              </View>
            </View>

            <View style={styles.scrubFooter}>
              <MonoSm color={palette.fog} style={{ opacity: 0.55 }}>
                {clip.cutPoints.length} detected cuts · long-press for DNA
              </MonoSm>
              <MonoSm color={palette.fog} style={{ opacity: 0.55 }}>
                {formatMmSs(clip.durationMs)}
              </MonoSm>
            </View>
          </View>
        </Animated.View>

        {/* Overlays */}
        <TranscriptDrawer
          clip={clip}
          open={transcriptOpen}
          onClose={() => setTranscriptOpen(false)}
        />
        <DNAOverlay clip={clip} open={dnaOpen} onClose={() => setDnaOpen(false)} />
      </Screen>
    </GestureHandlerRootView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  playerTopBar: {
    position: 'absolute',
    top: 52,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topCenterTag: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(4,20,30,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  playerTopicBlock: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: 190,
  },
  scrubWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 60,
  },
  scrubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrubTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: 6,
    overflow: 'hidden',
  },
  scrubFill: {
    height: '100%',
    backgroundColor: palette.sage,
  },
  cutTickLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 36,
    height: 10,
  },
  cutTick: {
    position: 'absolute',
    width: 1.5,
    height: 10,
    backgroundColor: palette.sageSoft,
    opacity: 0.72,
    marginTop: 2,
  },
  scrubFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: palette.inkTint,
    borderTopLeftRadius: radii['3xl'],
    borderTopRightRadius: radii['3xl'],
    borderTopWidth: 1,
    borderColor: palette.inkBorder,
  },
  drawerHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.fog,
    opacity: 0.4,
  },
  speakerBar: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 28,
    borderRadius: 1.5,
    marginTop: 4,
  },
  dnaOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: OVERLAY_WIDTH,
    backgroundColor: palette.inkTint,
    borderLeftWidth: 1,
    borderColor: palette.inkBorder,
    paddingTop: 58,
  },
  overlayHeader: {
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  dnaFullWrap: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  intensityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  intensityTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  intensityFill: {
    height: '100%',
    borderRadius: 2,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  creatorAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.mist,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  statCell: {
    width: '47%',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: palette.inkBorder,
  },
});
