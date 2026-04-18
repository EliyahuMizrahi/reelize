import React, { useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Platform,
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
  Overline,
} from '@/components/ui/Text';
import { Surface, Divider } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Noctis } from '@/components/brand/Noctis';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { palette, spacing } from '@/constants/tokens';
import { ENTER } from '@/components/ui/motion';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, profile, logout } = useAuth();

  const username =
    profile?.username ??
    profile?.display_name ??
    user?.email?.split('@')[0] ??
    'you';

  const tap = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  }, []);

  const tapHeavy = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, []);

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

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <RowWrap>
      <TitleSm style={{ flex: 1 }}>{label}</TitleSm>
      <BodySm muted>{value}</BodySm>
    </RowWrap>
  );
}

