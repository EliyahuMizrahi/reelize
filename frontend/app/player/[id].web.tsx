import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

import { Surface, Divider } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Chip } from '@/components/ui/Chip';
import { Title, TitleSm, Body, BodySm, Mono, MonoSm, Overline, Headline, Text } from '@/components/ui/Text';
import { Shards } from '@/components/brand/Shards';
import { Waveform } from '@/components/brand/Waveform';
import { palette, spacing, radii } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useClip, useFeed } from '@/data/hooks';
import { updateClip } from '@/data/mutations';
import { DEFAULT_DNA, type DNAToken } from '@/components/brand/StyleDNA';
import {
  creatorSummaryFromStyle,
  dnaTokensFromStyle,
  transcriptFromStyle,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { getJobArtifact } from '@/services/api';
import type { Row } from '@/types/supabase';

const STORAGE_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_BUCKET ?? 'reelize-artifacts';

// View-model for the web player — mirrors the native one.
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
  note: string;
  creator: {
    handle: string;
    avgCutsPerMin: number;
    captionStyle: string;
    voiceEnergy: string;
    signatureTransition: string;
  };
  transcript: { speaker: 0 | 1; t: string; text: string }[];
}

function fmtTime(s: number | null | undefined): string {
  const sec = Math.max(0, Math.round(s ?? 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function clipFromRow(row: Row<'clips'>): Clip {
  let seed = 7;
  for (let i = 0; i < row.id.length; i++) seed = (seed * 31 + row.id.charCodeAt(i)) % 9973;
  const cuts: number[] = [];
  const n = 5 + (seed % 3);
  for (let i = 1; i <= n; i++) {
    const base = i / (n + 1);
    const jitter = (((seed + i * 7) % 13) - 6) / 100;
    cuts.push(Math.max(0.04, Math.min(0.96, base + jitter)));
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
    sourceDuration: fmtTime(row.duration_s),
    thumbnailColor: row.thumbnail_color ?? palette.tealDeep,
    durationMs: Math.max(1, Math.round((row.duration_s ?? 30) * 1000)),
    cutPoints: cuts,
    tokens,
    note: row.note ?? '',
    creator,
    transcript,
  };
}

// ───────────────────────── Top bar ─────────────────────────
function TopBar({ clip }: { clip: Clip }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing['2xl'],
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        gap: spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton variant="filled" size={36} onPress={() => router.push('/(tabs)/library' as any)} accessibilityLabel="Back to library">
          <Feather name="arrow-left" size={14} color={colors.text as string} />
        </IconButton>
        <Mono muted>Library</Mono>
        <Mono muted>/</Mono>
        <Chip variant="class" classColor={clip.classColor} label={clip.className} size="sm" />
        <Title numberOfLines={1}>{clip.topic}</Title>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <IconButton variant="filled" size={36} accessibilityLabel="Share">
          <Feather name="share-2" size={14} color={colors.text as string} />
        </IconButton>
        <IconButton variant="filled" size={36} accessibilityLabel="More">
          <Feather name="more-horizontal" size={14} color={colors.text as string} />
        </IconButton>
      </View>
    </View>
  );
}

// ───────────────────────── Left sidebar: transcript ─────────────────────────
function LeftSidebar({ clip }: { clip: Clip }) {
  return (
    <View style={{ width: 320, gap: spacing.xl }}>
      <Surface padded={spacing.xl} radius="xl">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Overline muted>Transcript</Overline>
          <MonoSm muted>02 speakers</MonoSm>
        </View>
        <View style={{ gap: spacing.md }}>
          {clip.transcript.map((line, i) => (
            <Pressable
              key={i}
              style={({ hovered }: any) => ({
                flexDirection: 'row',
                gap: spacing.md,
                paddingVertical: 6,
                opacity: hovered ? 1 : 0.92,
              })}
            >
              <View style={{ width: 3, borderRadius: 2, backgroundColor: line.speaker === 0 ? palette.sage : palette.tealBright }} />
              <View style={{ flex: 1 }}>
                <Mono muted style={{ opacity: 0.6 }}>{line.t}</Mono>
                <Body style={{ marginTop: 2 }}>{line.text}</Body>
              </View>
            </Pressable>
          ))}
        </View>
      </Surface>
    </View>
  );
}

// ───────────────────────── Center player ─────────────────────────
function CenterPlayer({
  clip,
  videoUrl,
  thumbUrl,
  videoError,
  onRetry,
}: {
  clip: Clip;
  videoUrl: string | null;
  thumbUrl: string | null;
  videoError: string | null;
  onRetry: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentS, setCurrentS] = useState(0);
  const [durationS, setDurationS] = useState(clip.durationMs / 1000);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {
        /* user gesture may be required; swallow */
      });
    } else {
      v.pause();
    }
  }, []);

  // Reset local state when the video source changes.
  useEffect(() => {
    setCurrentS(0);
    setPlaying(false);
    setDurationS(clip.durationMs / 1000);
  }, [videoUrl, clip.durationMs]);

  const progress = durationS > 0 ? Math.min(1, currentS / durationS) : 0;

  const onScrubberPress = useCallback(
    (e: any) => {
      const v = videoRef.current;
      const dur = v?.duration ?? durationS;
      if (!v || !isFinite(dur) || dur <= 0) return;
      const nativeEvent = e?.nativeEvent ?? e;
      const targetRect =
        nativeEvent?.currentTarget?.getBoundingClientRect?.() ??
        (e?.currentTarget as any)?.getBoundingClientRect?.();
      const offsetX =
        typeof nativeEvent?.offsetX === 'number'
          ? nativeEvent.offsetX
          : targetRect
          ? (nativeEvent.clientX ?? 0) - targetRect.left
          : 0;
      const width = targetRect?.width ?? 340;
      const pct = Math.max(0, Math.min(1, offsetX / Math.max(1, width)));
      v.currentTime = pct * dur;
      setCurrentS(v.currentTime);
    },
    [durationS],
  );

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: spacing.xl, minWidth: 360 }}>
      {/* Video surface 9:16 */}
      <View
        style={{
          width: 340,
          aspectRatio: 9 / 16,
          borderRadius: radii['2xl'],
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: clip.classColor + '55',
          backgroundColor: palette.ink,
          position: 'relative',
        }}
      >
        {/* Fallback gradient shown until the video paints its first frame */}
        <LinearGradient
          colors={[palette.inkDeep, clip.thumbnailColor, palette.ink]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={thumbUrl ?? undefined}
            playsInline
            controls={false}
            preload="metadata"
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setCurrentS((e.target as HTMLVideoElement).currentTime)}
            onLoadedMetadata={(e) => {
              const d = (e.target as HTMLVideoElement).duration;
              if (isFinite(d) && d > 0) setDurationS(d);
            }}
            onEnded={() => setPlaying(false)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: 'black',
              cursor: 'pointer',
            } as any}
          />
        ) : (
          <View style={{ position: 'absolute', top: 60, left: 30, opacity: 0.22 }}>
            <Shards size={260} phase="assembled" color={clip.classColor} />
          </View>
        )}
        <LinearGradient
          colors={['rgba(4,20,30,0.3)', 'transparent', 'rgba(4,20,30,0.75)']}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {/* Center play overlay — only visible when paused */}
        {!playing && (
          <Pressable
            onPress={togglePlay}
            style={({ hovered }: any) => ({
              ...StyleSheet.absoluteFillObject,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: hovered ? 1 : 0.85,
            })}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: 'rgba(4,20,30,0.6)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="play" size={22} color={palette.mist} />
            </View>
          </Pressable>
        )}
        {/* Error banner */}
        {!videoUrl && videoError && (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 16,
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: 'rgba(4,20,30,0.75)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              gap: spacing.sm,
            }}
          >
            <MonoSm color={palette.mist}>{videoError}</MonoSm>
            <Pressable onPress={onRetry}>
              <MonoSm color={palette.gold}>Retry</MonoSm>
            </Pressable>
          </View>
        )}
        {/* Counter */}
        <View style={{ position: 'absolute', top: 16, left: 16 }} pointerEvents="none">
          <View style={{ backgroundColor: 'rgba(4,20,30,0.55)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <MonoSm color={palette.fog}>{fmtTime(currentS)} / {fmtTime(durationS)}</MonoSm>
          </View>
        </View>
      </View>

      {/* Scrubber */}
      <View style={{ width: 340, gap: spacing.md }}>
        <Pressable onPress={onScrubberPress} style={{ position: 'relative', height: 48 }}>
          <Waveform bars={60} height={44} progress={progress} color={clip.classColor} seed={9} />
          {/* Cut ticks */}
          {clip.cutPoints.map((p, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${p * 100}%`,
                width: 1,
                backgroundColor: palette.gold,
                opacity: 0.55,
              }}
              pointerEvents="none"
            />
          ))}
          {/* Playhead */}
          <View
            style={{
              position: 'absolute',
              top: -4,
              bottom: -4,
              left: `${progress * 100}%`,
              width: 2,
              backgroundColor: palette.mist,
            }}
            pointerEvents="none"
          />
        </Pressable>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Mono muted>{fmtTime(currentS)}</Mono>
          <Mono muted>{fmtTime(durationS)}</Mono>
        </View>
      </View>

      {/* Controls */}
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <IconButton
          variant="filled"
          size={40}
          accessibilityLabel="Back 5s"
          onPress={() => {
            const v = videoRef.current;
            if (v) v.currentTime = Math.max(0, v.currentTime - 5);
          }}
        >
          <Feather name="skip-back" size={16} color={palette.mist} />
        </IconButton>
        <IconButton variant="elevated" size={52} onPress={togglePlay} accessibilityLabel="Play">
          <Feather name={playing ? 'pause' : 'play'} size={20} color={palette.mist} />
        </IconButton>
        <IconButton
          variant="filled"
          size={40}
          accessibilityLabel="Forward 5s"
          onPress={() => {
            const v = videoRef.current;
            if (!v) return;
            const dur = isFinite(v.duration) ? v.duration : durationS;
            v.currentTime = Math.min(dur, v.currentTime + 5);
          }}
        >
          <Feather name="skip-forward" size={16} color={palette.mist} />
        </IconButton>
      </View>
    </View>
  );
}

// ───────────────────────── Right sidebar: Notes + Source + Related ─────────────────────────
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function RightSidebar({ clip }: { clip: Clip }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { data: feedRows } = useFeed(6);
  const [note, setNote] = useState(clip.note);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const lastSaved = useRef(clip.note);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the clip changes (e.g. navigating between clips), reset the draft.
  // Also absorb external updates to the same clip (e.g. another device) only
  // when the user isn't mid-edit.
  useEffect(() => {
    if (note === lastSaved.current) {
      setNote(clip.note);
    }
    lastSaved.current = clip.note;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, clip.note]);

  // Debounced save — 600ms of quiet typing writes to Supabase.
  useEffect(() => {
    if (note === lastSaved.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await updateClip(clip.id, { note: note.length ? note : null });
        lastSaved.current = note;
        setSaveState('saved');
      } catch (e) {
        console.warn('[player-web] failed to save note:', e);
        setSaveState('error');
      }
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [note, clip.id]);

  const related = useMemo(
    () => (feedRows ?? []).filter((c) => c.id !== clip.id).slice(0, 4),
    [feedRows, clip.id],
  );

  const saveLabel =
    saveState === 'saving' ? 'saving…' :
    saveState === 'saved' ? 'saved' :
    saveState === 'error' ? 'save failed' : '';

  return (
    <View style={{ width: 360, gap: spacing.xl }}>
      {/* Notes */}
      <Surface padded={spacing.xl} radius="xl">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Overline muted>Notes</Overline>
          {saveLabel ? (
            <MonoSm color={saveState === 'error' ? palette.gold : palette.sage}>{saveLabel}</MonoSm>
          ) : null}
        </View>
        <TextInput
          multiline
          placeholder="What stuck? Write a sentence."
          placeholderTextColor={(colors.mutedText as string) + 'CC'}
          value={note}
          onChangeText={setNote}
          style={{
            minHeight: 140,
            color: colors.text as string,
            fontFamily: 'Fraunces_400Regular',
            fontSize: 15,
            lineHeight: 22,
            outlineStyle: 'none' as any,
            textAlignVertical: 'top' as any,
          }}
        />
      </Surface>

      {/* Source */}
      <Surface padded={spacing.xl} radius="xl" style={{ gap: spacing.md }}>
        <Overline muted>Source</Overline>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <View
            style={{
              width: 60,
              height: 84,
              borderRadius: radii.md,
              overflow: 'hidden',
              backgroundColor: palette.ink,
            }}
          >
            <LinearGradient
              colors={[clip.thumbnailColor, palette.ink]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={{ position: 'absolute', top: 12, left: 12, opacity: 0.6 }}>
              <Shards size={48} phase="assembled" color={clip.classColor} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyLg" family="mono">{clip.sourceCreator}</Text>
            <BodySm muted style={{ marginTop: 2 }}>{clip.creator.voiceEnergy}</BodySm>
            <MonoSm muted style={{ marginTop: 2 }}>{clip.sourceDuration} reel</MonoSm>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <MonoSm muted>cuts / min</MonoSm>
            <Mono>{clip.creator.avgCutsPerMin}</Mono>
          </View>
          <View style={{ flex: 1 }}>
            <MonoSm muted>signature</MonoSm>
            <BodySm style={{ marginTop: 2 }}>{clip.creator.signatureTransition}</BodySm>
          </View>
        </View>
        <Button
          variant="ghost"
          size="sm"
          title="View original"
          haptic={false}
          trailing={<Feather name="external-link" size={12} color={colors.text as string} />}
          fullWidth
        />
      </Surface>

      {/* Related */}
      <Surface padded={spacing.xl} radius="xl" style={{ gap: spacing.md }}>
        <Overline muted>Related clips</Overline>
        <View style={{ gap: spacing.sm }}>
          {related.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/player/${r.id}` as any)}
              style={({ hovered }: any) => ({
                flexDirection: 'row',
                gap: spacing.md,
                padding: spacing.sm,
                borderRadius: radii.md,
                backgroundColor: hovered ? ((colors.elevated as string) + '') : 'transparent',
              })}
            >
              <View
                style={{
                  width: 38,
                  height: 54,
                  borderRadius: radii.sm,
                  overflow: 'hidden',
                  backgroundColor: palette.ink,
                }}
              >
                <LinearGradient
                  colors={[r.thumbnail_color ?? palette.tealDeep, palette.ink]}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={{ position: 'absolute', top: 10, left: 6, opacity: 0.5 }}>
                  <Shards size={26} phase="assembled" color={palette.sage} />
                </View>
              </View>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <BodySm weight="semibold" numberOfLines={1}>{r.title}</BodySm>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.sage }} />
                  <MonoSm muted>{r.source_creator ?? '@source'}</MonoSm>
                  <MonoSm muted>&middot; {fmtTime(r.duration_s)}</MonoSm>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </Surface>
    </View>
  );
}

// ───────────────────────── Player (web) ─────────────────────────
export default function PlayerWebScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: row, loading } = useClip(id);
  const clip = useMemo(() => (row ? clipFromRow(row) : null), [row]);
  const { colors } = useAppTheme();

  // Resolve signed URLs for the rendered mp4 + poster. Mirrors the native
  // player: try a Supabase client-side sign first, fall back to the backend
  // /jobs/{id}/artifacts endpoint if RLS blocks it.
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const videoStorageKey =
    typeof (row as any)?.artifacts?.video === 'string'
      ? ((row as any).artifacts.video as string)
      : null;
  const videoJobId = row?.generation_job_id ?? row?.job_id ?? null;
  const thumbStorageKey =
    typeof (row as any)?.artifacts?.thumbnail === 'string'
      ? ((row as any).artifacts.thumbnail as string)
      : null;

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
        /* gradient fallback stays */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thumbStorageKey]);

  useEffect(() => {
    if (!videoStorageKey && !videoJobId) {
      setVideoUrl(null);
      setVideoError('No video available for this clip.');
      return;
    }
    let cancelled = false;
    setVideoError(null);
    (async () => {
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
            console.warn('[player-web] supabase.createSignedUrl failed:', error.message);
          }
        } catch (e) {
          console.warn('[player-web] supabase.createSignedUrl threw:', e);
        }
      }
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
          console.warn('[player-web] getJobArtifact failed:', msg);
          setVideoError(msg);
        }
      } else {
        setVideoError('No video available for this clip.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoStorageKey, videoJobId, fetchTick]);

  if (loading && !clip) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background as string }}>
        <Mono muted>loading clip…</Mono>
      </View>
    );
  }

  if (!clip) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background as string, gap: spacing.md }}>
        <Title>Clip not found.</Title>
        <Mono muted>It may have been deleted.</Mono>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background as string }}>
      <TopBar clip={clip} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['2xl'] }}
      >
        <View style={{ flexDirection: 'row', gap: spacing['2xl'], alignItems: 'flex-start' }}>
          <Animated.View entering={ENTER.fadeUp(60)}>
            <LeftSidebar clip={clip} />
          </Animated.View>
          <Animated.View entering={ENTER.fadeUp(140)} style={{ flex: 1, minWidth: 0 }}>
            <CenterPlayer
              clip={clip}
              videoUrl={videoUrl}
              thumbUrl={thumbUrl}
              videoError={videoError}
              onRetry={() => setFetchTick((t) => t + 1)}
            />
          </Animated.View>
          <Animated.View entering={ENTER.fadeUp(220)}>
            <RightSidebar clip={clip} />
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}
