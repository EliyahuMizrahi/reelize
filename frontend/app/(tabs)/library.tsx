import React, { useMemo, useState, useCallback } from 'react';
import {
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
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import {
  Display2,
  Title,
  MonoSm,
  BodySm,
  Overline,
} from '@/components/ui/Text';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Noctis } from '@/components/brand/Noctis';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing, motion } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';

import { useClasses } from '@/data/hooks';
import { createClass } from '@/data/mutations';
import type { ClassWithCounts } from '@/data/queries';

type FilterKey = 'all' | 'recent' | 'active';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'recent', label: 'Recent' },
  { key: 'active', label: 'Active' },
];

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = spacing.xl;
const GAP = spacing.md + 2;
const COL_W = (SCREEN_W - H_PAD * 2 - GAP) / 2;
const CARD_H = Math.round(COL_W * 1.25); // 4:5

export default function LibraryScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [modalOpen, setModalOpen] = useState(false);

  const { data: rows, loading, refresh } = useClasses();

  const filtered = useMemo(() => {
    const base: ClassWithCounts[] = [...(rows ?? [])];
    if (filter === 'recent') {
      base.sort((a, b) => {
        const at = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
        const bt = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
        return bt - at;
      });
    } else if (filter === 'active') {
      return base.filter((c) => c.streak_days > 0);
    }
    return base;
  }, [filter, rows]);

  const openClass = useCallback(
    (id: string) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      router.push(`/library/class/${id}` as any);
    },
    [router],
  );

  const onCreate = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setModalOpen(true);
  }, []);

  const totalTopicCount = (rows ?? []).reduce((a, c) => a + c.topic_count, 0);
  const totalClipCount = (rows ?? []).reduce((a, c) => a + c.clip_count, 0);

  const handleCreated = useCallback(() => {
    setModalOpen(false);
    refresh();
  }, [refresh]);

  // Empty state — no classes yet
  if (!loading && (rows?.length ?? 0) === 0) {
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
          <Noctis variant="perched" size={140} color={colors.text as string} eyeColor={palette.sage} animated />
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
            A class is a room. Name yours.
          </BodySm>
          <View style={{ marginTop: spacing['2xl'] }}>
            <Button
              variant="shimmer"
              size="lg"
              title="Start a class"
              leading={<Feather name="plus" size={16} color={palette.ink} />}
              onPress={onCreate}
            />
          </View>
        </View>
        <NewClassModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          paddingBottom: spacing['7xl'],
          paddingTop: spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={ENTER.fadeUp(40)} style={{ marginBottom: spacing['2xl'] }}>
          <Display2>Your shelf.</Display2>
          <BodySm
            italic
            family="serif"
            muted
            style={{ marginTop: 6 }}
          >
            {(rows?.length ?? 0) === 3 ? 'Three classes' : `${rows?.length ?? 0} classes`}. {numberWord(totalTopicCount)} topics.
          </BodySm>
        </Animated.View>

        {/* Filter chips */}
        <Animated.View
          entering={ENTER.fadeUp(120)}
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            marginBottom: spacing.xl,
          }}
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              variant="outline"
              selected={filter === f.key}
              onPress={() => setFilter(f.key)}
            />
          ))}
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
            <MonoSm muted>{totalClipCount} clips total</MonoSm>
          </View>
        </Animated.View>

        {/* Grid */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: GAP,
          }}
        >
          {filtered.map((cls, i) => (
            <ClassCard
              key={cls.id}
              cls={cls}
              index={i}
              width={COL_W}
              height={CARD_H}
              onPress={() => openClass(cls.id)}
              dark={isDark}
            />
          ))}

          {/* Plus tile at grid end */}
          <Animated.View entering={ENTER.fadeUp(stagger(filtered.length, 80, 200))}>
            <Pressable
              onPress={onCreate}
              style={({ pressed }) => ({
                width: COL_W,
                height: CARD_H,
                borderRadius: radii['2xl'],
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.border as string,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                opacity: pressed ? 0.72 : 1,
                backgroundColor: isDark ? 'rgba(139,186,177,0.04)' : 'rgba(68,112,111,0.04)',
              })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.card as string,
                  borderWidth: 1,
                  borderColor: colors.border as string,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="plus" size={20} color={colors.text as string} />
              </View>
              <Title style={{ textAlign: 'center' }}>New class</Title>
              <MonoSm muted>start a shelf</MonoSm>
            </Pressable>
          </Animated.View>
        </View>

        {/* FAB row below the grid */}
        <View style={{ alignItems: 'flex-end', marginTop: spacing['2xl'] }}>
          <Button
            variant="shimmer"
            size="md"
            title="New class"
            leading={<Feather name="plus" size={16} color={palette.ink} />}
            onPress={onCreate}
          />
        </View>
      </ScrollView>
      <NewClassModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </Screen>
  );
}

// -------------------- New Class Modal --------------------

function NewClassModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const clean = name.trim();
    if (clean.length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      await createClass({ name: clean });
      setName('');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
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
          justifyContent: 'center',
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
          <Overline muted>New class</Overline>
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

function numberWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  if (n < words.length) return cap(words[n]);
  return String(n);
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// -------------------- ClassCard --------------------

interface ClassCardProps {
  cls: ClassWithCounts;
  index: number;
  width: number;
  height: number;
  onPress: () => void;
  dark: boolean;
}

function ClassCard({ cls, index, width, height, onPress, dark }: ClassCardProps) {
  const rotX = useSharedValue(0);
  const rotY = useSharedValue(0);
  const scale = useSharedValue(1);
  const pressShadow = useSharedValue(0);

  const onIn = useCallback(
    (e: { nativeEvent: { locationX: number; locationY: number } }) => {
      const { locationX, locationY } = e.nativeEvent;
      // Normalize -1..1
      const nx = (locationX / width) * 2 - 1;
      const ny = (locationY / height) * 2 - 1;
      rotY.value = withTiming(nx * 4, { duration: 160, easing: Easing.bezier(...motion.ease.entrance) });
      rotX.value = withTiming(-ny * 3, { duration: 160, easing: Easing.bezier(...motion.ease.entrance) });
      scale.value = withSpring(0.97, { mass: 0.5, stiffness: 180, damping: 16 });
      pressShadow.value = withTiming(1, { duration: 200 });
    },
    [height, rotX, rotY, scale, pressShadow, width],
  );

  const onOut = useCallback(() => {
    rotX.value = withTiming(0, { duration: 280, easing: Easing.bezier(...motion.ease.standard) });
    rotY.value = withTiming(0, { duration: 280, easing: Easing.bezier(...motion.ease.standard) });
    scale.value = withSpring(1, { mass: 0.5, stiffness: 160, damping: 14 });
    pressShadow.value = withTiming(0, { duration: 260 });
  }, [rotX, rotY, scale, pressShadow]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateX: `${rotX.value}deg` },
      { rotateY: `${rotY.value}deg` },
      { scale: scale.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + pressShadow.value * 0.35,
  }));

  // Palette variations for the mosaic — derived from class color
  const mosaic = [
    cls.color_hex,
    mix(cls.color_hex, '#000', 0.3),
    mix(cls.color_hex, '#000', 0.1),
    mix(cls.color_hex, '#fff', 0.08),
  ];

  // Overlay darkening for legibility
  const overlayTop = dark ? 'rgba(4,20,30,0.0)' : 'rgba(245,248,247,0.0)';
  const overlayBottom = dark ? 'rgba(4,20,30,0.82)' : 'rgba(4,20,30,0.72)';

  return (
    <Animated.View
      entering={ENTER.fadeUp(stagger(index, 80, 160))}
      style={[{ width, height }, animStyle]}
    >
      <Pressable
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open ${cls.name} class`}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Soft shadow glow behind card */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: -6,
              right: -6,
              top: 4,
              bottom: -8,
              borderRadius: radii['3xl'],
              backgroundColor: cls.color_hex,
            },
            glowStyle,
          ]}
        />

        <View
          style={{
            flex: 1,
            borderRadius: radii['2xl'],
            overflow: 'hidden',
            backgroundColor: cls.color_hex + (dark ? '33' : '22'),
            borderWidth: 1,
            borderColor: cls.color_hex + '55',
          }}
        >
          {/* full-bleed class color wash */}
          <LinearGradient
            colors={[cls.color_hex + 'CC', cls.color_hex + '66', cls.color_hex + '22']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          {/* mosaic 2x2 */}
          <View
            style={{
              marginTop: spacing.md,
              marginHorizontal: spacing.md,
              aspectRatio: 1,
              borderRadius: radii.md,
              overflow: 'hidden',
              flexDirection: 'row',
              flexWrap: 'wrap',
              borderWidth: 1,
              borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            }}
          >
            {mosaic.slice(0, 4).map((c, idx) => (
              <MosaicTile key={idx} color={c} accent={cls.color_hex} corner={idx} />
            ))}
          </View>

          {/* bottom legibility gradient */}
          <LinearGradient
            colors={[overlayTop, overlayBottom]}
            locations={[0.35, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* bottom label */}
          <View
            style={{
              position: 'absolute',
              left: spacing.md,
              right: spacing.md,
              bottom: spacing.md,
            }}
          >
            <Overline color={cls.color_hex} style={{ opacity: 0.9 }}>
              {cls.streak_days > 0 ? `${cls.streak_days}-day streak` : 'resting'}
            </Overline>
            <Title color={palette.mist} style={{ marginTop: 4 }} numberOfLines={1}>
              {cls.name}
            </Title>
            <MonoSm color={palette.fog} style={{ marginTop: 2, opacity: 0.85 }}>
              {`${cls.topic_count} topics \u00b7 ${cls.clip_count} clips`}
            </MonoSm>
          </View>

          {/* subtle texture: tiny mono index in top-right */}
          <View
            style={{
              position: 'absolute',
              top: spacing.sm,
              right: spacing.md,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: radii.xs,
              backgroundColor: 'rgba(4,20,30,0.45)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
            }}
          >
            <MonoSm color={palette.fog}>
              {String(index + 1).padStart(2, '0')}
            </MonoSm>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function MosaicTile({ color, accent, corner }: { color: string; accent: string; corner: number }) {
  // Different subtle internal composition per tile for tactile variety
  const content = (() => {
    if (corner === 0) {
      return (
        <LinearGradient
          colors={[color, mix(color, '#000', 0.25)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      );
    }
    if (corner === 1) {
      return (
        <>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: color }]} />
          <View
            style={{
              position: 'absolute',
              left: '20%',
              right: '20%',
              top: '35%',
              height: 1,
              backgroundColor: accent,
              opacity: 0.45,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: '35%',
              right: '10%',
              top: '55%',
              height: 1,
              backgroundColor: accent,
              opacity: 0.3,
            }}
          />
        </>
      );
    }
    if (corner === 2) {
      return (
        <>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: color }]} />
          <View
            style={{
              position: 'absolute',
              left: '45%',
              top: '45%',
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: accent,
              opacity: 0.7,
            }}
          />
        </>
      );
    }
    return (
      <LinearGradient
        colors={[mix(color, '#fff', 0.05), color]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    );
  })();

  return (
    <View
      style={{
        width: '50%',
        height: '50%',
        borderRightWidth: corner % 2 === 0 ? 0.5 : 0,
        borderLeftWidth: corner % 2 === 1 ? 0.5 : 0,
        borderBottomWidth: corner < 2 ? 0.5 : 0,
        borderTopWidth: corner >= 2 ? 0.5 : 0,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
      }}
    >
      {content}
    </View>
  );
}

// Simple hex mixer (assumes #RRGGBB input)
function mix(hex: string, with_: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(with_);
  if (!a || !b) return hex;
  const r = Math.round(a.r * (1 - amount) + b.r * amount);
  const g = Math.round(a.g * (1 - amount) + b.g * amount);
  const bl = Math.round(a.b * (1 - amount) + b.b * amount);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '');
  if (m.length !== 6) return null;
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}
function toHex(n: number) {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}
