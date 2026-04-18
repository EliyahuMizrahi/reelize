import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Platform,
  Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import {
  Headline,
  TitleSm,
  BodySm,
  MonoSm,
  Overline,
} from '@/components/ui/Text';
import { Surface, Divider } from '@/components/ui/Surface';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Noctis } from '@/components/brand/Noctis';
import {
  PALETTES,
  useAppTheme,
  type PaletteName,
} from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { palette, radii, spacing } from '@/constants/tokens';
import { ENTER } from '@/components/ui/motion';
import { seedDemoShelf } from '@/data/seed';

type TextSize = 'sm' | 'md' | 'lg';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme, palette: paletteName, setPalette } = useAppTheme();
  const { user, profile, logout } = useAuth();

  const [dailyReminder, setDailyReminder] = useState(true);
  const [streakAlerts, setStreakAlerts] = useState(true);
  const [newLessonReady, setNewLessonReady] = useState(false);
  const [textSize, setTextSize] = useState<TextSize>('md');

  const username =
    profile?.username ??
    profile?.display_name ??
    user?.email?.split('@')[0] ??
    'you';

  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const tap = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  }, []);

  const tapHeavy = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, []);

  const onToggleTheme = useCallback(() => {
    tap();
    toggleTheme();
  }, [tap, toggleTheme]);

  const onSeed = useCallback(async () => {
    if (seeding) return;
    tapHeavy();
    setSeeding(true);
    setSeedMsg(null);
    try {
      await seedDemoShelf();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setSeedMsg('Shelf seeded — pull to refresh on other tabs.');
    } catch (e) {
      setSeedMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  }, [seeding, tapHeavy]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing['7xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={ENTER.fade(20)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: spacing.lg,
          }}
        >
          <IconButton
            variant="ghost"
            size={40}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={22} color={colors.text as string} />
          </IconButton>
          <View style={{ flex: 1 }} />
        </Animated.View>

        <Animated.View entering={ENTER.fadeUp(40)} style={{ marginBottom: spacing['2xl'] }}>
          <Headline>Settings.</Headline>
          <BodySm italic family="serif" muted style={{ marginTop: 6 }}>
            Tune the shelf. Quiet things down.
          </BodySm>
        </Animated.View>

        {/* Account */}
        <Section title="Account" delay={80}>
          <ReadRow label="Username" value={username} />
          <Divider />
          <TapRow
            label="Change username"
            onPress={() => {
              tap();
            }}
          />
          <Divider />
          <TapRow
            label="Change password"
            onPress={() => {
              tap();
            }}
          />
          <Divider />
          <TapRow
            label="Delete account"
            danger
            onPress={() => {
              tapHeavy();
            }}
          />
        </Section>

        {/* Appearance */}
        <Section title="Appearance" delay={140}>
          <SwitchRow
            label="Dark mode"
            hint="currently Reelize defaults to dark"
            value={isDark}
            onValueChange={onToggleTheme}
          />
          <Divider />

          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
            <TitleSm>Palette</TitleSm>
            <MonoSm muted style={{ marginTop: 2 }}>
              choose your undertone
            </MonoSm>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
              {(Object.keys(PALETTES) as PaletteName[]).map((name) => (
                <PaletteChip
                  key={name}
                  name={name}
                  selected={paletteName === name}
                  onPress={() => {
                    tap();
                    setPalette(name);
                  }}
                />
              ))}
            </View>
          </View>
          <Divider />

          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
            <TitleSm>Text size</TitleSm>
            <MonoSm muted style={{ marginTop: 2 }}>stub</MonoSm>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              {(['sm', 'md', 'lg'] as TextSize[]).map((sz) => (
                <Chip
                  key={sz}
                  label={sz.toUpperCase()}
                  variant="outline"
                  selected={textSize === sz}
                  onPress={() => {
                    tap();
                    setTextSize(sz);
                  }}
                />
              ))}
            </View>
          </View>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" delay={200}>
          <SwitchRow
            label="Daily reminder"
            hint="one quiet nudge at 8pm"
            value={dailyReminder}
            onValueChange={(v) => {
              tap();
              setDailyReminder(v);
            }}
          />
          <Divider />
          <SwitchRow
            label="Streak alerts"
            hint="don’t let the lamp go out"
            value={streakAlerts}
            onValueChange={(v) => {
              tap();
              setStreakAlerts(v);
            }}
          />
          <Divider />
          <SwitchRow
            label="New lesson ready"
            hint="ping when a clip finishes generating"
            value={newLessonReady}
            onValueChange={(v) => {
              tap();
              setNewLessonReady(v);
            }}
          />
        </Section>

        {/* Data */}
        <Section title="Data" delay={260}>
          <TapRow label="Export library" trailing={<Feather name="download" size={16} color={colors.mutedText as string} />} onPress={tap} />
          <Divider />
          <TapRow label="Import" trailing={<Feather name="upload" size={16} color={colors.mutedText as string} />} onPress={tap} />
          <Divider />
          <TapRow
            label={seeding ? 'Seeding…' : 'Seed demo shelf'}
            trailing={<Feather name="zap" size={16} color={palette.sage} />}
            onPress={onSeed}
          />
          {seedMsg ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
              <MonoSm muted>{seedMsg}</MonoSm>
            </View>
          ) : null}
          <Divider />
          <TapRow label="Clear cache" onPress={tapHeavy} />
        </Section>

        {/* About */}
        <Section title="About" delay={320}>
          <ReadRow label="Version" value="0.1.0 (2026.04.17)" mono />
          <Divider />
          <TapRow label="Credits" onPress={tap} />
          <Divider />
          <TapRow label="Terms of use" onPress={tap} />
          <Divider />
          <TapRow label="Privacy" onPress={tap} />
        </Section>

        {/* Sign out */}
        <Animated.View
          entering={ENTER.fadeUp(380)}
          style={{ alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing['3xl'] }}
        >
          <Button variant="danger" size="sm" title="Sign out" onPress={() => {
            tapHeavy();
            logout();
          }} />
        </Animated.View>

        {/* Editorial kicker */}
        <Animated.View entering={ENTER.fadeUp(420)} style={{ alignItems: 'center', marginTop: spacing.md }}>
          <Noctis variant="scroll" size={70} color={colors.mutedText as string} eyeColor={palette.sage} />
          <BodySm italic family="serif" muted style={{ marginTop: 10, textAlign: 'center', maxWidth: 260 }}>
            He keeps the ledger. You keep showing up.
          </BodySm>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

// -------------------- Section --------------------

function Section({
  title,
  children,
  delay = 0,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Animated.View entering={ENTER.fadeUp(delay)} style={{ marginBottom: spacing['2xl'] }}>
      <Overline muted style={{ marginBottom: spacing.sm, marginLeft: 4 }}>
        {title}
      </Overline>
      <Surface radius="lg" padded={0}>
        {children}
      </Surface>
    </Animated.View>
  );
}

// -------------------- Rows --------------------

function RowWrap({
  children,
  onPress,
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  if (onPress) {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.lg,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
          backgroundColor: pressed ? (colors.elevated as string) : 'transparent',
        })}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
      }}
    >
      {children}
    </View>
  );
}

function TapRow({
  label,
  trailing,
  onPress,
  danger,
}: {
  label: string;
  trailing?: React.ReactNode;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <RowWrap onPress={onPress}>
      <TitleSm color={danger ? (palette.alert as string) : (colors.text as string)} style={{ flex: 1 }}>
        {label}
      </TitleSm>
      {trailing ?? <Feather name="chevron-right" size={16} color={colors.mutedText as string} />}
    </RowWrap>
  );
}

function ReadRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <RowWrap>
      <TitleSm style={{ flex: 1 }}>{label}</TitleSm>
      {mono ? (
        <MonoSm color={colors.mutedText as string}>{value}</MonoSm>
      ) : (
        <BodySm muted>{value}</BodySm>
      )}
    </RowWrap>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { colors, isDark } = useAppTheme();
  return (
    <RowWrap>
      <View style={{ flex: 1 }}>
        <TitleSm>{label}</TitleSm>
        {hint ? (
          <MonoSm muted style={{ marginTop: 2 }}>
            {hint}
          </MonoSm>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border as string, true: palette.sage }}
        thumbColor={value ? palette.paper : isDark ? palette.fog : palette.mist}
        ios_backgroundColor={colors.border as string}
      />
    </RowWrap>
  );
}

// -------------------- PaletteChip --------------------

function PaletteChip({
  name,
  selected,
  onPress,
}: {
  name: PaletteName;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const def = PALETTES[name];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: selected ? (colors.primary as string) : (colors.border as string),
        backgroundColor: selected ? (colors.card as string) : 'transparent',
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', marginRight: 8 }}>
        {def.swatches.slice(1, 5).map((sw, i) => (
          <View
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: sw,
              marginLeft: i === 0 ? 0 : -4,
              borderWidth: 1,
              borderColor: colors.card as string,
            }}
          />
        ))}
      </View>
      <BodySm weight="semibold">{def.label}</BodySm>
    </Pressable>
  );
}
