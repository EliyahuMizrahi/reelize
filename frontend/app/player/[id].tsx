import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Dimensions,
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

import { Screen } from '@/components/ui/Screen';
import { Title, TitleSm, Body, BodySm, Mono, MonoSm, Overline, Label } from '@/components/ui/Text';
import { IconButton } from '@/components/ui/IconButton';
import { Chip } from '@/components/ui/Chip';
import { Divider } from '@/components/ui/Surface';
import { Noctis } from '@/components/brand/Noctis';
import { Shards } from '@/components/brand/Shards';
import { StyleDNA } from '@/components/brand/StyleDNA';
import { Waveform } from '@/components/brand/Waveform';
import { palette, spacing, radii, motion } from '@/constants/tokens';
import { useClip } from '@/data/hooks';
import { DEFAULT_DNA, type DNAToken } from '@/components/brand/StyleDNA';
import {
  creatorSummaryFromStyle,
  dnaTokensFromStyle,
  transcriptFromStyle,
} from '@/lib/format';
import type { Row } from '@/types/supabase';

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

function clipFromRow(row: Row<'clips'>): Clip {
  const durationMs = Math.max(1, Math.round((row.duration_s ?? 30) * 1000));
  // Build deterministic cut points from id.
  const cutPoints: number[] = [];
  let seed = 7;
  for (let i = 0; i < row.id.length; i++) seed = (seed * 31 + row.id.charCodeAt(i)) % 9973;
  const n = 5 + (seed % 3);
  for (let i = 1; i <= n; i++) {
    const base = i / (n + 1);
    const jitter = (((seed + i * 7) % 13) - 6) / 100;
    cutPoints.push(Math.max(0.04, Math.min(0.96, base + jitter)));
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
    className: 'Class',
    classColor: palette.sage,
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

// ─── Scrubber with haptic cuts ─────────────────────────────────────────────

interface ScrubberProps {
  clip: Clip;
  progress: SharedValue<number>;
}

function Scrubber({ clip, progress }: ScrubberProps) {
  const seed = useMemo(() => seedFromId(clip.id), [clip.id]);
  const [barProgress, setBarProgress] = useState(0);

  // Sample SharedValue -> React state for Waveform prop (simple, performant enough for 80 bars)
  useDerivedValue(() => {
    const v = progress.value;
    runOnJS(setBarProgress)(v);
  }, [progress]);

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

  const trackWidth = SCREEN_W - spacing.xl * 2 - 110; // rough width for cut tick positioning
  return (
    <View style={{ width: '100%' }}>
      {/* Waveform overlay */}
      <View style={{ paddingHorizontal: 2, height: 36, justifyContent: 'center' }}>
        <Waveform
          bars={80}
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

  if (!open && translateY.value >= DRAWER_HEIGHT - 1) {
    // nothing to render
  }

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
              <View style={styles.creatorAvatar}>
                <Noctis
                  variant="head"
                  size={58}
                  color={palette.ink}
                  eyeColor={clip.classColor}
                />
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

  // fake timeline progress 0..1 over clip.durationMs
  const progress = useSharedValue(0);

  useEffect(() => {
    // reset on clip change
    cancelAnimation(progress);
    progress.value = 0;
    if (clip && isPlaying) {
      progress.value = withTiming(1, {
        duration: clip.durationMs,
        easing: Easing.linear,
      });
    }
    return () => cancelAnimation(progress);
  }, [clip?.id, clip?.durationMs, isPlaying]);

  // Screen entrance — for swipe-up transition effect
  const screenOpacity = useSharedValue(1);
  const screenTranslate = useSharedValue(0);

  // Long-press to open DNA overlay
  const longPress = Gesture.LongPress()
    .minDuration(600)
    .onStart(() => {
      runOnJS(hapticImpact)();
      runOnJS(setDnaOpen)(true);
    });

  // Tap for transcript
  const tap = Gesture.Tap()
    .maxDuration(220)
    .onEnd((_e, success) => {
      if (success) {
        runOnJS(hapticLight)();
        runOnJS(setTranscriptOpen)(true);
      }
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

  // Combine gestures: swipe takes priority, then long-press, then tap
  const composed = Gesture.Simultaneous(swipe, Gesture.Exclusive(longPress, tap));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ translateY: screenTranslate.value }],
  }));

  // progress-driven time display
  const [timeMs, setTimeMs] = useState(0);
  const durationMs = clip?.durationMs ?? 30_000;
  useDerivedValue(() => {
    const v = progress.value;
    runOnJS(setTimeMs)(Math.round(v * durationMs));
  }, [progress, durationMs]);

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
          {/* Video surface */}
          <View style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={[palette.inkDeep, clip.thumbnailColor, palette.ink]}
              locations={[0, 0.55, 1]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
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
                <Scrubber clip={clip} progress={progress} />
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginLeft: spacing.sm }}>
                <IconButton variant="glass" size={32}>
                  <Feather name="maximize" size={14} color={palette.mist} />
                </IconButton>
                <IconButton variant="glass" size={32}>
                  <Feather name="minimize-2" size={14} color={palette.mist} />
                </IconButton>
              </View>
            </View>

            <View style={styles.scrubFooter}>
              <MonoSm color={palette.fog} style={{ opacity: 0.55 }}>
                {clip.cutPoints.length} detected cuts · tap to read · long-press for DNA
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
