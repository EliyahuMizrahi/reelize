import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';

import { Screen, ScreenContent } from '@/components/ui/Screen';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import {
  BodySm,
  Display2,
  Mono,
  MonoSm,
  Text,
  Title,
} from '@/components/ui/Text';
import { ENTER } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing, motion } from '@/constants/tokens';
import { clearActiveJob, getActiveJob, setActiveJob } from '@/lib/activeJob';
import { setPendingUpload } from '@/lib/pendingUpload';
import { getJob, listJobs } from '@/services/api';

type Tab = 'url' | 'roll';

type SourcePlatform = 'TikTok' | 'Instagram' | 'YouTube';

type Preview = {
  handle: string;
  captionLine: string;
  duration: string;
  platform: SourcePlatform;
  thumbColor: string;
} | null;

function detectPlatform(url: string): SourcePlatform | null {
  const u = url.toLowerCase();
  if (!u) return null;
  if (u.includes('tiktok')) return 'TikTok';
  if (u.includes('instagram') || u.includes('/reel')) return 'Instagram';
  if (u.includes('youtube') || u.includes('youtu.be') || u.includes('/shorts')) return 'YouTube';
  // If it looks like a URL, guess TikTok by default
  if (u.startsWith('http') || u.includes('.')) return 'TikTok';
  return null;
}

/* --- small decorative pieces --- */

function ShimmerLine({ width = 120 }: { width?: number }) {
  const { colors } = useAppTheme();
  const shift = useSharedValue(0);
  useEffect(() => {
    shift.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      -1,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.55 * Math.abs(Math.sin(shift.value * Math.PI)),
  }));
  return (
    <Animated.View
      style={[
        { height: 2, width, borderRadius: 2, backgroundColor: colors.primary as string },
        style,
      ]}
    />
  );
}

function DotPulse() {
  const { colors } = useAppTheme();
  const s = useSharedValue(0.4);
  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 720, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(0.4, { duration: 720, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
    );
  }, []);
  const st = useAnimatedStyle(() => ({
    opacity: s.value,
    transform: [{ scale: 0.82 + 0.35 * s.value }],
  }));
  return (
    <Animated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary as string },
        st,
      ]}
    />
  );
}

/* --- Tab switcher --- */

function TabSwitcher({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  const { colors } = useAppTheme();
  const TABS: { id: Tab; label: string }[] = [
    { id: 'url', label: 'Paste URL' },
    { id: 'roll', label: 'Camera Roll' },
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        padding: 4,
        borderRadius: radii.pill,
        backgroundColor: colors.card as string,
        borderWidth: 1,
        borderColor: colors.border as string,
        alignSelf: 'stretch',
      }}
    >
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <Pressable
            key={t.id}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
              onChange(t.id);
            }}
            style={{
              flex: 1,
              paddingVertical: 10,
              alignItems: 'center',
              borderRadius: radii.pill,
              backgroundColor: active ? (colors.primary as string) : 'transparent',
            }}
          >
            <Text
              variant="caption"
              weight="semibold"
              upper
              color={active ? palette.ink : (colors.mutedText as string)}
              style={{ letterSpacing: 1.4 }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --- Preview card (shared by URL + Roll tabs) --- */

function PreviewCard({
  preview,
  loading,
}: {
  preview: Preview;
  loading: boolean;
}) {
  const { colors } = useAppTheme();
  if (!preview && !loading) return null;
  return (
    <Animated.View
      entering={ENTER.fadeUp(40)}
      style={{ marginTop: spacing.xl }}
    >
      <Surface
        elevation="card"
        radius="xl"
        style={{
          flexDirection: 'row',
          gap: spacing.lg,
          padding: spacing.lg,
        }}
      >
        {/* 9:16 thumb */}
        <View
          style={{
            width: 72,
            height: 128,
            borderRadius: radii.md,
            backgroundColor: preview?.thumbColor ?? (colors.elevated as string),
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border as string,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading && !preview ? (
            <ShimmerLine width={40} />
          ) : (
            <Svg width={28} height={28} viewBox="0 0 28 28">
              <Path d="M 10 8 L 22 14 L 10 20 Z" fill={palette.mist} opacity={0.92} />
            </Svg>
          )}
        </View>

        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View style={{ gap: 6 }}>
            {loading && !preview ? (
              <>
                <ShimmerLine width={140} />
                <ShimmerLine width={180} />
              </>
            ) : preview ? (
              <>
                <Text variant="bodySm" weight="semibold">
                  {preview.handle}
                </Text>
                <Text variant="bodySm" muted numberOfLines={2}>
                  {preview.captionLine}
                </Text>
              </>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {preview ? (
              <>
                <Mono muted>{preview.duration}</Mono>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: colors.border as string,
                  }}
                >
                  <Text variant="caption" weight="semibold" upper muted style={{ letterSpacing: 1.3 }}>
                    Detected · {preview.platform}
                  </Text>
                </View>
              </>
            ) : (
              <MonoSm muted>Reading metadata…</MonoSm>
            )}
          </View>
        </View>
      </Surface>
    </Animated.View>
  );
}

/* --- Paste URL Tab --- */

function PasteUrlTab({ onReady }: { onReady: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const platform = detectPlatform(url);

  useEffect(() => {
    onReady(url);
  }, [url, onReady]);

  return (
    <View style={{ marginTop: spacing['2xl'] }}>
      <TextField
        variant="editorial"
        font="serif"
        placeholder="paste a link…"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        helperText="TikTok, Instagram Reel, YouTube Short"
      />
      {platform ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md }}>
          <DotPulse />
          <MonoSm muted>Detected · {platform}</MonoSm>
        </View>
      ) : null}
    </View>
  );
}

/* --- Camera Roll Tab --- */

type PickedVideo = {
  uri: string;
  name: string;
  type: string;
  durationMs?: number | null;
};

function CameraRollTab({
  picked,
  onPicked,
}: {
  picked: PickedVideo | null;
  onPicked: (v: PickedVideo | null) => void;
}) {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = async () => {
    setErr(null);
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr('Camera roll permission is required.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: false,
        quality: 1,
        videoMaxDuration: 180,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const uri = a.uri;
      const nameFromAsset = (a as any).fileName as string | undefined;
      const guessed = (() => {
        const tail = uri.split('/').pop() ?? 'video.mp4';
        return tail.includes('.') ? tail : `${tail}.mp4`;
      })();
      const name = nameFromAsset || guessed;
      const mime = (a as any).mimeType as string | undefined;
      const extFromName = name.toLowerCase().split('.').pop() ?? 'mp4';
      const type =
        mime ||
        (extFromName === 'mov'
          ? 'video/quicktime'
          : extFromName === 'webm'
            ? 'video/webm'
            : 'video/mp4');
      onPicked({
        uri,
        name,
        type,
        durationMs: (a as any).duration ?? null,
      });
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const durationLabel = (() => {
    const ms = picked?.durationMs ?? 0;
    if (!ms) return null;
    const sec = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  })();

  return (
    <View style={{ marginTop: spacing['2xl'], gap: spacing.lg }}>
      <Button
        variant={picked ? 'tertiary' : 'shimmer'}
        size="lg"
        title={busy ? 'Opening…' : picked ? 'Pick a different video' : 'Choose video from library'}
        leading={<Feather name="film" size={16} color={picked ? (colors.text as string) : palette.ink} />}
        onPress={pick}
        disabled={busy}
        fullWidth
      />
      {picked ? (
        <Surface
          elevation="card"
          radius="xl"
          style={{ flexDirection: 'row', gap: spacing.lg, padding: spacing.lg, alignItems: 'center' }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: radii.md,
              backgroundColor: colors.elevated as string,
              borderWidth: 1,
              borderColor: colors.border as string,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="video" size={22} color={colors.primary as string} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="bodySm" weight="semibold" numberOfLines={1}>
              {picked.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MonoSm muted>{picked.type}</MonoSm>
              {durationLabel ? <Mono muted>· {durationLabel}</Mono> : null}
            </View>
          </View>
          <Pressable
            onPress={() => onPicked(null)}
            hitSlop={8}
            accessibilityLabel="Clear picked video"
            style={({ pressed }) => ({
              padding: 8,
              borderRadius: radii.md,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="x" size={16} color={colors.mutedText as string} />
          </Pressable>
        </Surface>
      ) : (
        <MonoSm muted>MP4, MOV, M4V, or WebM up to 3 minutes.</MonoSm>
      )}
      {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}
    </View>
  );
}

/* --- screen --- */

export default function CreateScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ templateSaved?: string }>();
  const [tab, setTab] = useState<Tab>('url');
  const [activeUrl, setActiveUrl] = useState('');
  const [pickedVideo, setPickedVideo] = useState<PickedVideo | null>(null);
  const [templateSavedOpen, setTemplateSavedOpen] = useState(false);

  useEffect(() => {
    if (params.templateSaved !== '1') return;
    setTemplateSavedOpen(true);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    }
    router.setParams({ templateSaved: undefined } as any);
  }, [params.templateSaved, router]);

  useEffect(() => {
    if (!templateSavedOpen) return;
    const t = setTimeout(() => setTemplateSavedOpen(false), 2400);
    return () => clearTimeout(t);
  }, [templateSavedOpen]);

  // If a deconstruction job is still running on the backend, hop back into
  // the deconstruction screen so the user picks up where they left off.
  // Strategy:
  //  1. Try the AsyncStorage pointer first (fast, no network).
  //  2. Fall back to `/jobs` so we also catch jobs started on other devices
  //     or before the pointer code was deployed.
  // In both paths we verify status via `/jobs/:id` so a stale/terminal job
  // never traps the user in a dead screen.
  useEffect(() => {
    let cancelled = false;
    const isTerminal = (s: string) =>
      s === 'done' || s === 'failed' || s === 'cancelled';

    // Guard against orphaned/dead jobs: if the DB row hasn't been touched in
    // STALE_MS, the worker almost certainly died without marking it terminal.
    // Don't auto-resume into a zombie.
    const STALE_MS = 5 * 60 * 1000;
    const isFresh = (updatedAt: string | undefined | null): boolean => {
      if (!updatedAt) return false;
      const t = Date.parse(updatedAt);
      if (!Number.isFinite(t)) return false;
      return Date.now() - t < STALE_MS;
    };

    (async () => {
      // Path 1 — local pointer
      const active = await getActiveJob();
      if (!active || cancelled) {
        // Path 2 — backend fallback
        try {
          const jobs = await listJobs(5);
          if (cancelled) return;
          const live = jobs.find(
            (j) =>
              !isTerminal(j.status as string) &&
              isFresh((j as any).updated_at),
          );
          if (!live) return;
          await setActiveJob({
            jobId: live.id,
            url: (live as any).source_url ?? '',
            startedAt: Date.now(),
          });
          router.replace({
            pathname: '/create/deconstruction',
            params: {
              jobId: live.id,
              url: (live as any).source_url ?? '',
            },
          } as any);
        } catch {
          // offline / auth blip — stay on Create
        }
        return;
      }
      try {
        const job = await getJob(active.jobId);
        if (cancelled) return;
        if (
          isTerminal(job.status as string) ||
          !isFresh((job as any).updated_at)
        ) {
          await clearActiveJob();
          return;
        }
        router.replace({
          pathname: '/create/deconstruction',
          params: { jobId: active.jobId, url: active.url },
        } as any);
      } catch {
        await clearActiveJob();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const urlReady =
    activeUrl.trim().length > 6 && detectPlatform(activeUrl) !== null;
  const uploadReady = !!pickedVideo;
  const ready = tab === 'url' ? urlReady : uploadReady;

  const onDeconstruct = () => {
    if (!ready) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    if (tab === 'roll' && pickedVideo) {
      setPendingUpload({
        uri: pickedVideo.uri,
        name: pickedVideo.name,
        type: pickedVideo.type,
      });
      router.push(
        (`/create/deconstruction?upload=1&uploadName=${encodeURIComponent(pickedVideo.name)}`) as any,
      );
      return;
    }
    router.push(('/create/deconstruction?url=' + encodeURIComponent(activeUrl)) as any);
  };

  return (
    <Screen background="primary">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenContent>
          <View style={{ marginTop: spacing['3xl'], marginBottom: spacing.xl, alignItems: 'center' }}>
            <Animated.View entering={ENTER.fadeUp(60)} style={{ maxWidth: 280 }}>
              <Display2 align="center">Start with a reel you love.</Display2>
            </Animated.View>
          </View>

          <Animated.View entering={ENTER.fadeUp(260)}>
            <TabSwitcher tab={tab} onChange={setTab} />
          </Animated.View>

          {/* Tab content */}
          {tab === 'url' && (
            <Animated.View key="url" entering={FadeIn.duration(motion.dur.normal)}>
              <PasteUrlTab onReady={setActiveUrl} />
            </Animated.View>
          )}
          {tab === 'roll' && (
            <Animated.View key="roll" entering={FadeIn.duration(motion.dur.normal)}>
              <CameraRollTab picked={pickedVideo} onPicked={setPickedVideo} />
            </Animated.View>
          )}
        </ScreenContent>
      </ScrollView>

      <Animated.View
        entering={ENTER.fadeUp(0)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing['3xl'],
          backgroundColor: (colors.background as string) + 'EE',
          borderTopWidth: 1,
          borderTopColor: colors.border as string,
        }}
      >
        <Button
          title="Deconstruct →"
          variant={ready ? 'shimmer' : 'tertiary'}
          size="lg"
          fullWidth
          disabled={!ready}
          onPress={onDeconstruct}
        />
      </Animated.View>

      <TemplateSavedModal
        open={templateSavedOpen}
        onClose={() => setTemplateSavedOpen(false)}
      />
    </Screen>
  );
}

function TemplateSavedModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
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
            maxWidth: 420,
            padding: spacing.xl,
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: (colors.primary as string) + '22',
              borderWidth: 1,
              borderColor: (colors.primary as string) + '55',
            }}
          >
            <Feather
              name="check"
              size={26}
              color={colors.primary as string}
            />
          </View>
          <Title family="serif" italic>
            Template saved.
          </Title>
          <BodySm muted style={{ textAlign: 'center' }}>
            Find it in your Library whenever you're ready to reuse it.
          </BodySm>
          <Button
            variant="shimmer"
            size="md"
            title="Got it"
            fullWidth
            onPress={onClose}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
