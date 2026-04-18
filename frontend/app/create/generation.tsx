import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Platform, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Mono, Overline, Text } from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { Shards } from '@/components/brand/Shards';
import { ShimmerBadge, ShimmerRing } from '@/components/brand/Shimmer';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing } from '@/constants/tokens';
import {
  createClip,
  deleteClip,
  deleteJob,
  ensureUnsortedTopic,
  logActivity,
} from '@/data/mutations';
import { analyze, cancelJob } from '@/services/api';
import { useJobStream } from '@/hooks/useJobStream';

/* ========================================================
   Status timeline
   ======================================================== */

const STATUSES = [
  'Reading your topic…',
  'Mapping pacing…',
  'Writing script…',
  'Generating voice…',
  'Cutting frames…',
  'Layering captions…',
  'Finishing touches…',
];

const TOKEN_LABELS = ['PACING', 'HOOK', 'CAPTIONS', 'VOICE', 'MUSIC', 'VISUAL'];

// Maps each orbit token to the backend event that "unlocks" it. When the
// matching event arrives on the job stream, the token lights up as applied.
const TOKEN_EVENT_TYPES: Record<string, string> = {
  PACING: 'audio.done',
  HOOK: 'video.done',
  CAPTIONS: 'artifacts.video_analysis.done',
  VOICE: 'artifacts.voices.done',
  MUSIC: 'artifacts.music.done',
  VISUAL: 'artifacts.hero.done',
};

/* ========================================================
   Orbiting "APPLIED" token — lights up on stagger
   ======================================================== */

function AppliedToken({
  label,
  pos,
  index,
  applied,
}: {
  label: string;
  pos: { x: number; y: number };
  index: number;
  applied: boolean;
}) {
  const { colors } = useAppTheme();
  const reveal = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    reveal.value = withDelay(
      index * 90 + 300,
      withTiming(1, { duration: 520, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, []);
  useEffect(() => {
    if (applied) {
      glow.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    }
  }, [applied]);

  const style = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateX: pos.x * reveal.value },
      { translateY: pos.y * reveal.value },
      { scale: 0.6 + 0.4 * reveal.value },
    ],
  }));

  const badgeStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: '50%',
          top: '50%',
          marginLeft: -58,
          marginTop: -14,
          width: 116,
          alignItems: 'center',
          gap: 4,
        },
        style,
      ]}
      pointerEvents="none"
    >
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radii.pill,
          backgroundColor: applied ? (colors.primary as string) : (colors.card as string),
          borderWidth: 1,
          borderColor: applied ? (colors.primary as string) : (colors.border as string),
        }}
      >
        <Text
          variant="caption"
          weight="semibold"
          upper
          color={applied ? palette.ink : (colors.mutedText as string)}
          style={{ letterSpacing: 1.6 }}
        >
          {label}
        </Text>
      </View>
      <Animated.View style={badgeStyle}>
        <ShimmerBadge label="APPLIED" compact />
      </Animated.View>
    </Animated.View>
  );
}

/* ========================================================
   Rotating shimmer ring halo (uses ShimmerRing component with
   a rotation transform on an outer wrapper).
   ======================================================== */

function RingHalo({ size }: { size: number }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(
      withTiming(1, { duration: 12000, easing: Easing.linear }),
      -1,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value * 360}deg` }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          opacity: 0.28,
        },
        style,
      ]}
    >
      <ShimmerRing size={size} strokeWidth={2} />
    </Animated.View>
  );
}

/* ========================================================
   Final resolved card (revealed at ~95% progress)
   ======================================================== */

function ResolvedCard({
  topic,
  onPlay,
  heroUrl,
}: {
  topic: string;
  onPlay: () => void;
  heroUrl: string | null;
}) {
  const { colors } = useAppTheme();
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 720, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.88 + 0.12 * enter.value }, { translateY: 10 * (1 - enter.value) }],
  }));
  return (
    <Animated.View style={[{ alignItems: 'center', gap: spacing.xl }, style]}>
      <View
        style={{
          width: 176,
          height: 312,
          borderRadius: radii.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border as string,
          backgroundColor: palette.inkElevated,
        }}
      >
        {heroUrl ? (
          <Image
            source={{ uri: heroUrl }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <Svg width={176} height={312} viewBox="0 0 176 312">
            <Rect x={0} y={0} width={176} height={312} fill={palette.inkElevated} />
            <Path d="M 0 210 L 60 170 L 120 194 L 176 150 L 176 312 L 0 312 Z" fill={palette.ink} opacity={0.55} />
            <Circle cx={88} cy={120} r={34} fill={palette.sage} opacity={0.35} />
            <Path d="M 80 110 L 102 122 L 80 134 Z" fill={palette.mist} />
          </Svg>
        )}
        <View style={{ position: 'absolute', left: 12, top: 12 }}>
          <ShimmerBadge label="NEW · 0:30" compact />
        </View>
        <View
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 14,
            gap: 2,
          }}
        >
          <Overline style={{ letterSpacing: 1.8 }} color={palette.sage}>
            BIOLOGY
          </Overline>
          <Text variant="bodyLg" family="serif" weight="bold" color={palette.mist}>
            {topic}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Mono muted>READY · 0:30 · IN SOURCE STYLE</Mono>
      </View>
    </Animated.View>
  );
}

/* ========================================================
   Main screen
   ======================================================== */

const ORBIT_RADIUS = 138;

export default function GenerationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    topic?: string;
    sourceId?: string;
    url?: string;
    topicId?: string;
    creator?: string;
  }>();
  const { colors } = useAppTheme();
  const topic = (params.topic as string) || 'Your lesson';
  const sourceUrl = (params.url as string) || '';
  const sourceCreator = (params.creator as string) || '@source';
  const incomingTopicId = (params.topicId as string) || '';

  const [statusIdx, setStatusIdx] = useState(0);
  const [appliedCount, setAppliedCount] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  // If we have a sourceUrl we'll call analyze() and stream real progress.
  // Without one (demo taps / local-only), we fall back to the mock timeline.
  const willStreamRef = useRef(!!sourceUrl);

  const stream = useJobStream(jobId);
  const {
    byType,
    progressPct,
    latestMessage,
    status: streamStatus,
    error: streamError,
    heroUrl,
    sfxItems,
  } = stream;

  // Track the in-flight job + resulting clip so Cancel can clean up
  // and Play can route to the created clip.
  const jobIdRef = useRef<string | null>(null);
  const clipIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  // Shards primitive — starts exploded, tweens to assembled
  const [shardsPhase, setShardsPhase] = useState<'exploded' | 'assembled'>('exploded');

  useEffect(() => {
    // kick off assembly after a small beat
    const t = setTimeout(() => setShardsPhase('assembled'), 350);
    return () => clearTimeout(t);
  }, []);

  // Status rotator — every 900ms (mock mode only).
  useEffect(() => {
    if (willStreamRef.current) return;
    const id = setInterval(() => {
      setStatusIdx((i) => {
        const n = i + 1;
        if (n >= STATUSES.length) {
          clearInterval(id);
          return STATUSES.length - 1;
        }
        return n;
      });
    }, 900);
    return () => clearInterval(id);
  }, []);

  // Applied-token reveal staggered ~420ms apart (mock mode only). In stream
  // mode the tokens light up driven by real event types — see render below.
  useEffect(() => {
    if (willStreamRef.current) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 6; i++) {
      timers.push(
        setTimeout(
          () => {
            setAppliedCount((c) => Math.max(c, i + 1));
            if (Platform.OS !== 'web') {
              Haptics.selectionAsync().catch(() => {});
            }
          },
          600 + i * 460,
        ),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  // Light haptic when each token gets applied in stream mode.
  const lastHapticTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!willStreamRef.current) return;
    for (const label of TOKEN_LABELS) {
      const evType = TOKEN_EVENT_TYPES[label];
      if (byType[evType] && lastHapticTokenRef.current !== label) {
        lastHapticTokenRef.current = label;
        if (Platform.OS !== 'web') {
          Haptics.selectionAsync().catch(() => {});
        }
      }
    }
  }, [byType]);

  // Progress bar shared value. In mock mode it ramps to 95% then 100%; in
  // stream mode it follows progress_pct from the latest event.
  const progress = useSharedValue(0);
  const lastProgressTargetRef = useRef(0);

  useEffect(() => {
    if (willStreamRef.current) return;
    progress.value = withTiming(0.95, {
      duration: 3800,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, []);

  // Drive progress from real events (never regress — discrete events arrive
  // in order but defensively clamp against the prior target).
  useEffect(() => {
    if (!willStreamRef.current || !jobId) return;
    const target = Math.max(lastProgressTargetRef.current, progressPct / 100);
    lastProgressTargetRef.current = target;
    progress.value = withTiming(target, {
      duration: 700,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [jobId, progressPct]);

  // On mount: create the clip row (status='generating'), then POST to the
  // backend /analyze endpoint which stamps user_id + clip_id on the jobs
  // row and kicks the background Gemini/audio pipeline. The worker flips
  // this clip's status to 'ready' when it finishes (minutes, not seconds).
  // We don't wait for real completion — the visual timeline is theatre,
  // and the player handles a 'generating' status gracefully.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { topicId } = incomingTopicId
          ? { topicId: incomingTopicId }
          : await ensureUnsortedTopic(topic);

        const clip = await createClip({
          topic_id: topicId,
          title: topic,
          duration_s: 30,
          source_url: sourceUrl || null,
          source_creator: sourceCreator || null,
          thumbnail_color: palette.tealDeep,
          status: 'generating',
        });
        if (cancelled || cancelledRef.current) {
          await deleteClip(clip.id).catch(() => {});
          return;
        }
        clipIdRef.current = clip.id;

        // Kick the real pipeline. If no URL (demo taps), skip the backend
        // hop and leave the clip in 'generating' — it still routes to the
        // player which will render the placeholder surface.
        if (sourceUrl) {
          try {
            const res = await analyze({
              url: sourceUrl,
              clipContext: topic,
              clipId: clip.id,
            });
            if (!cancelled && !cancelledRef.current) {
              jobIdRef.current = res.job_id;
              setJobId(res.job_id);
            }
          } catch (err) {
            // Backend may be down in dev — not fatal; keep the clip around.
            // eslint-disable-next-line no-console
            console.warn('[generation] analyze failed', err);
          }
        }

        await logActivity('generated', clip.id, `Generated ${topic}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[generation] clip write failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [incomingTopicId, topic, sourceUrl, sourceCreator]);

  // Mock mode: resolve the visual timeline at ~4200ms regardless of real
  // job state. Stream mode resolves on the real `job.done` event below.
  useEffect(() => {
    if (willStreamRef.current) return;
    const t = setTimeout(() => {
      progress.value = withTiming(1, { duration: 500, easing: Easing.bezier(0.22, 1, 0.36, 1) });
      if (cancelledRef.current) return;
      setResolved(true);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    }, 4200);
    return () => clearTimeout(t);
  }, []);

  // Stream mode: resolve when `job.done` arrives.
  useEffect(() => {
    if (!willStreamRef.current) return;
    if (!byType['job.done']) return;
    if (cancelledRef.current || resolved) return;
    progress.value = withTiming(1, { duration: 500, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    setResolved(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, [byType, resolved]);

  // Zoom-in when resolving — shrink the token/shards cluster
  const clusterFade = useSharedValue(1);
  useEffect(() => {
    if (resolved) {
      clusterFade.value = withTiming(0, {
        duration: 560,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
    }
  }, [resolved]);
  const clusterStyle = useAnimatedStyle(() => ({
    opacity: clusterFade.value,
    transform: [{ scale: 0.6 + 0.4 * clusterFade.value }],
  }));

  const orbit = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(a) * ORBIT_RADIUS, y: Math.sin(a) * ORBIT_RADIUS };
      }),
    [],
  );

  const onCancel = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    cancelledRef.current = true;
    const cid = clipIdRef.current;
    const jid = jobIdRef.current;
    // Ask the worker to stop at its next checkpoint, then clean up the rows.
    // All three calls are fire-and-forget — navigation shouldn't block on them.
    if (jid) {
      cancelJob(jid).catch(() => {});
      deleteJob(jid).catch(() => {});
    }
    if (cid) deleteClip(cid).catch(() => {});
    router.replace('/create/topic' as any);
  };

  const onPlay = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
    const cid = clipIdRef.current;
    if (cid) {
      router.replace(`/player/${cid}` as any);
    } else {
      // Fallback: no clip row exists (write failed). Return to feed.
      router.replace('/(tabs)/feed' as any);
    }
  };

  // Auto-navigate after resolve. If we have SFX candidates, route to the
  // review step first so the user can keep/drop them before playback.
  useEffect(() => {
    if (!resolved) return;
    const t = setTimeout(() => {
      if (cancelledRef.current) return;
      const cid = clipIdRef.current;
      const jid = jobIdRef.current;
      if (!cid) return;
      if (jid && sfxItems.length > 0) {
        router.replace({
          pathname: '/create/sfx-review',
          params: { jobId: jid, clipId: cid, topic },
        } as any);
      } else {
        router.replace(`/player/${cid}` as any);
      }
    }, 1400);
    return () => clearTimeout(t);
  }, [resolved, router, sfxItems.length, topic]);

  return (
    <Screen background="ink">
      {/* Hero frame as a dim backdrop once it arrives. Sits below the grain so
          the ink wash tones it down to a hint. */}
      {heroUrl && !resolved ? (
        <Image
          source={{ uri: heroUrl }}
          resizeMode="cover"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            opacity: 0.18,
          }}
        />
      ) : null}

      {/* grain */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: palette.ink,
          opacity: 0.08,
        }}
      />

      {/* Cancel */}
      <View style={{ position: 'absolute', top: spacing['3xl'], left: spacing.lg, zIndex: 5 }}>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: radii.pill,
            opacity: pressed ? 0.72 : 1,
            borderWidth: 1,
            borderColor: colors.border as string,
          })}
        >
          <Text variant="caption" weight="semibold" upper color={palette.mist} style={{ letterSpacing: 1.4 }}>
            Cancel
          </Text>
        </Pressable>
      </View>

      {/* Noctis watching, eye progress */}
      <View style={{ position: 'absolute', top: spacing['3xl'], right: spacing.lg, zIndex: 5 }}>
        <Noctis variant="watching" animated size={64} color={palette.mist} eyeColor={palette.sage} />
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {!resolved ? (
          <Animated.View style={[{ width: 380, height: 380, alignItems: 'center', justifyContent: 'center' }, clusterStyle]}>
            {/* Decorative shimmer ring (rotating) */}
            <RingHalo size={220} />

            {/* Shards — assembling inward */}
            <Shards size={180} phase={shardsPhase} duration={3500} color={palette.sage} />

            {/* Orbit of applied tokens — in stream mode each lights up when
                its mapped event arrives; in mock mode they stagger on a timer. */}
            {TOKEN_LABELS.map((label, i) => (
              <AppliedToken
                key={label}
                label={label}
                pos={orbit[i]}
                index={i}
                applied={
                  willStreamRef.current
                    ? !!byType[TOKEN_EVENT_TYPES[label]]
                    : i < appliedCount
                }
              />
            ))}
          </Animated.View>
        ) : (
          <ResolvedCard topic={topic} onPlay={onPlay} heroUrl={heroUrl} />
        )}
      </View>

      {/* Status / footer */}
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
        {!resolved ? (
          <>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Overline
                style={{ letterSpacing: 2.6 }}
                color={streamStatus === 'failed' ? palette.gold : palette.sage}
              >
                {streamStatus === 'failed' ? 'FAILED' : 'COMPOSING'}
              </Overline>
              <Mono color={palette.mist}>
                {willStreamRef.current
                  ? streamStatus === 'failed'
                    ? (streamError ?? 'Job failed')
                    : jobId
                      ? (latestMessage || 'Connecting…')
                      : 'Starting…'
                  : STATUSES[statusIdx]}
              </Mono>
            </View>
            <ProgressBar progress={progress} />
          </>
        ) : (
          <Button
            title="Play lesson"
            variant="shimmer"
            size="lg"
            fullWidth
            onPress={onPlay}
            leading={<Feather name="play" size={18} color={palette.ink} />}
          />
        )}
      </View>
    </Screen>
  );
}

function ProgressBar({ progress }: { progress: SharedValue<number> }) {
  const { colors } = useAppTheme();
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as `${number}%` }));
  return (
    <View
      style={{
        height: 2,
        borderRadius: 1,
        backgroundColor: colors.border as string,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[{ height: '100%', backgroundColor: palette.sage }, style]} />
    </View>
  );
}
