import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { Surface, Divider } from '@/components/ui/Surface';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Title, Body, BodySm, Mono, MonoSm, Overline, Headline } from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { palette, spacing, radii } from '@/constants/tokens';
import { ENTER } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
// FE-DATA owns these exports; their arrival unblocks profile persistence.
// Shape (optimistic):
//   updateProfile(userId, { username?, email?, avatar_url? }): Promise<void>
import { updateProfile } from '@/data/mutations';

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
  const { logout, user, profile, session, refreshProfile } = useAuth();

  const identityLabel =
    profile?.username ??
    profile?.display_name ??
    session?.user?.email ??
    '—';

  const initialEmail = user?.email ?? '';
  const initialUsername =
    profile?.username ??
    profile?.display_name ??
    '';

  const [email, setEmail] = useState(initialEmail);
  const [username, setUsername] = useState(initialUsername);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const isDirty = useMemo(() => {
    return email.trim() !== initialEmail.trim() || username.trim() !== initialUsername.trim();
  }, [email, username, initialEmail, initialUsername]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id || saving || !isDirty) return;
    setBanner(null);
    setSaving(true);
    try {
      const patch: { username?: string; email?: string } = {};
      if (username.trim() !== initialUsername.trim()) patch.username = username.trim();
      if (email.trim() !== initialEmail.trim()) patch.email = email.trim();
      await updateProfile(user.id, patch);
      await refreshProfile?.();
      setBanner({ kind: 'success', text: 'Saved.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      setBanner({ kind: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    // Frontend can't actually delete the account — that needs a service-role
    // key or a trusted backend endpoint. TODO: wire to a backend
    // /account/delete endpoint when one exists. For now, funnel users to
    // support via mailto: so they're not stranded staring at a dead button.
    const ok = typeof window !== 'undefined'
      ? window.confirm('Account deletion is handled by support. Open your email client to contact us?')
      : true;
    if (!ok) return;
    const href = 'mailto:support@reelize.app?subject=Delete%20my%20account';
    if (typeof window !== 'undefined') {
      window.location.href = href;
    } else {
      Linking.openURL(href).catch(() => {});
    }
  };

  return (
    <View style={{ gap: spacing['2xl'] }}>
      <Headline>Account</Headline>

      {banner ? (
        <View
          style={{
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            borderRadius: 12,
            backgroundColor: banner.kind === 'success' ? (palette.sage + '22') : (palette.alert + '22'),
            borderWidth: 1,
            borderColor: banner.kind === 'success' ? palette.sage : palette.alert,
          }}
        >
          <BodySm color={banner.kind === 'success' ? palette.sage : palette.alert}>
            {banner.text}
          </BodySm>
        </View>
      ) : null}

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
            <Title>{identityLabel}</Title>
            <BodySm muted>{session?.user?.email ?? 'no email on file'}</BodySm>
          </View>
        </View>
        <Divider />
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          <TextField label="Username" value={username} onChangeText={setUsername} />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Button
              title={saving ? 'Saving…' : 'Save changes'}
              variant="primary"
              disabled={!isDirty || saving}
              onPress={handleSave}
            />
          </View>
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
          hint="contact support — we can't do this from the browser yet"
          onPress={handleDeleteAccount}
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
