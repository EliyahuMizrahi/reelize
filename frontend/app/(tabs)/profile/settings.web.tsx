import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { Surface, Divider } from '@/components/ui/Surface';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { Title, Body, BodySm, Mono, MonoSm, Overline, Headline, Text } from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { palette, spacing, radii } from '@/constants/tokens';
import { ENTER } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

type SectionKey = 'account' | 'data';

interface SectionNavItem {
  key: SectionKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  hint: string;
}

const NAV: SectionNavItem[] = [
  { key: 'account', label: 'Account', icon: 'user', hint: 'who you are' },
  { key: 'data', label: 'Data', icon: 'database', hint: 'what we store' },
];

// ───────────────────────── Row helpers ─────────────────────────
function Row({
  title,
  hint,
  right,
  onPress,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const Container: any = onPress ? Pressable : View;
  return (
    <Container
      onPress={onPress}
      style={({ hovered }: any) => ({
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.lg,
        backgroundColor: hovered && onPress ? ((colors.elevated as string) + '') : 'transparent',
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="semibold">{title}</Body>
        {hint ? <BodySm muted>{hint}</BodySm> : null}
      </View>
      {right}
    </Container>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Overline muted style={{ marginBottom: spacing.md, marginLeft: spacing.xl }}>{title}</Overline>
      <Surface padded={0} radius="xl" bordered style={{ overflow: 'hidden' }}>
        {children}
      </Surface>
    </View>
  );
}

// ───────────────────────── Account ─────────────────────────
function AccountSection() {
  const { colors } = useAppTheme();
  const { logout, user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <View style={{ gap: spacing['2xl'] }}>
      <Headline>Account</Headline>

      <SectionBlock title="IDENTITY">
        <View style={{ padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: palette.ink,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border as string,
            }}
          >
            <Noctis variant="head" size={44} color={palette.mist} eyeColor={palette.sage} />
          </View>
          <View style={{ flex: 1 }}>
            <Title>isaac.s</Title>
            <BodySm muted>joined march 2026 &middot; 56 lessons generated</BodySm>
          </View>
        </View>
        <Divider />
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          <TextField label="Email" value={email} onChangeText={setEmail} />
          <TextField label="Username" value="isaac.s" />
        </View>
      </SectionBlock>

      <SectionBlock title="DANGER">
        <Row
          title={isSigningOut ? 'Signing out…' : 'Sign out'}
          hint="you can come back any time"
          onPress={handleSignOut}
          right={<Feather name="log-out" size={14} color={palette.teal} />}
        />
        <Divider />
        <Row
          title="Delete account"
          hint="permanent. your courses go with it."
          onPress={() => {}}
          right={<Feather name="trash-2" size={14} color={palette.alert} />}
        />
      </SectionBlock>
    </View>
  );
}

// ───────────────────────── Data ─────────────────────────
function DataSection() {
  return (
    <View style={{ gap: spacing['2xl'] }}>
      <Headline>Data</Headline>

      <SectionBlock title="STORAGE">
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Body weight="semibold">Local library</Body>
              <BodySm muted>lessons, transcripts, notes</BodySm>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Mono>124 MB</Mono>
              <MonoSm muted>of 5 GB</MonoSm>
            </View>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.inkBorder, overflow: 'hidden' }}>
            <View style={{ width: '2.5%', height: '100%', backgroundColor: palette.sage }} />
          </View>
        </View>
      </SectionBlock>

      <SectionBlock title="EXPORT">
        <Row title="Export library" hint="zip of lessons, notes, and metadata" onPress={() => {}} right={<Feather name="download" size={14} color={palette.teal} />} />
        <Divider />
        <Row title="Export transcripts only" hint="plain markdown, per course" onPress={() => {}} right={<Feather name="file-text" size={14} color={palette.teal} />} />
      </SectionBlock>
    </View>
  );
}

// ───────────────────────── Layout ─────────────────────────
function NavRail({ active, setActive }: { active: SectionKey; setActive: (k: SectionKey) => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ width: 260, gap: spacing.lg }}>
      <View>
        <Mono muted>Settings</Mono>
        <Title style={{ marginTop: 4 }}>Preferences.</Title>
        <BodySm italic family="serif" muted style={{ marginTop: 4 }}>
          small choices, quietly kept.
        </BodySm>
      </View>
      <View style={{ gap: 4 }}>
        {NAV.map((n) => {
          const isActive = active === n.key;
          return (
            <Pressable
              key={n.key}
              onPress={() => setActive(n.key)}
              style={({ hovered }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: radii.pill,
                backgroundColor: isActive ? ((colors.primary as string) + '22') : hovered ? (colors.elevated as string) : 'transparent',
              })}
            >
              <Feather name={n.icon} size={14} color={isActive ? (colors.primary as string) : (colors.mutedText as string)} />
              <View style={{ flex: 1 }}>
                <BodySm weight={isActive ? 'semibold' : 'medium'} color={isActive ? (colors.primary as string) : (colors.text as string)}>
                  {n.label}
                </BodySm>
                <MonoSm muted style={{ marginTop: 1 }}>{n.hint}</MonoSm>
              </View>
              {isActive ? <Feather name="chevron-right" size={12} color={colors.primary as string} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ───────────────────────── Settings (web) ─────────────────────────
export default function SettingsWebScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [active, setActive] = useState<SectionKey>('account');

  const content = (() => {
    switch (active) {
      case 'account':
        return <AccountSection />;
      case 'data':
        return <DataSection />;
    }
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background as string }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing['2xl'],
          borderBottomWidth: 1,
          borderBottomColor: colors.border as string,
        }}
      >
        <View>
          <Overline muted>SETTINGS</Overline>
          <Title style={{ marginTop: 4 }}>Preferences</Title>
        </View>
        <IconButton variant="filled" size={36} onPress={() => router.back()} accessibilityLabel="Close settings">
          <Feather name="x" size={14} color={colors.text as string} />
        </IconButton>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: spacing['5xl'] }}>
        <View style={{ flexDirection: 'row', gap: spacing['3xl'], alignItems: 'flex-start', maxWidth: 1080, alignSelf: 'center', width: '100%' }}>
          <Animated.View entering={ENTER.fadeUp(40)}>
            <NavRail active={active} setActive={setActive} />
          </Animated.View>
          <Animated.View entering={ENTER.fadeUp(120)} style={{ flex: 1, minWidth: 0 }}>
            {content}
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}
