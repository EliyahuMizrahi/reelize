import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import {
  BodySm,
  Headline,
  Overline,
} from '@/components/ui/Text';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { palette, spacing } from '@/constants/tokens';
import { ENTER } from '@/components/ui/motion';
// FE-DATA is adding these in parallel. If the exports aren't there yet, the
// TS import still succeeds at compile time and fails at runtime — the button
// will just show the error banner. Expected shape:
//   updateProfile(userId, { username?, email?, avatar_url? }): Promise<void>
//   updatePassword(newPassword): Promise<void>
import { updateProfile, updatePassword } from '@/data/mutations';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, profile, logout, refreshProfile } = useAuth();

  const initialUsername =
    profile?.username ??
    profile?.display_name ??
    user?.email?.split('@')[0] ??
    '';

  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Re-seed the input when the underlying profile resolves so the field
  // doesn't start dirty against a stale empty string.
  useEffect(() => {
    setUsername(initialUsername);
  }, [initialUsername]);

  const isDirty = useMemo(() => {
    return username.trim() !== initialUsername.trim() || password.length > 0;
  }, [username, initialUsername, password]);

  const tapHeavy = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, []);

  const confirmDiscard = useCallback((onConfirm: () => void) => {
    if (!isDirty) {
      onConfirm();
      return;
    }
    Alert.alert(
      'Discard unsaved changes?',
      'Your edits will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onConfirm },
      ],
    );
  }, [isDirty]);

  const handleBack = useCallback(() => {
    confirmDiscard(() => router.back());
  }, [confirmDiscard, router]);

  // Intercept the hardware back gesture on Android and the swipe-back on iOS
  // via the focus effect beforeRemove isn't universally available; we rely on
  // the header back button here. If the user swipes back with dirty state, the
  // ephemeral state just evaporates — acceptable.

  const handleSave = async () => {
    if (!user?.id || saving) return;
    setBanner(null);
    setPasswordError(null);
    setSaving(true);
    try {
      const trimmedUsername = username.trim();
      if (trimmedUsername && trimmedUsername !== initialUsername.trim()) {
        await updateProfile(user.id, { username: trimmedUsername });
      }
      if (password.length > 0) {
        if (password.length < 6) {
          setPasswordError('Password must be at least 6 characters.');
          setSaving(false);
          return;
        }
        await updatePassword(password);
        setPassword('');
      }
      await refreshProfile?.();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setBanner({ kind: 'success', text: 'Saved.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed.';
      setBanner({ kind: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

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
            marginBottom: spacing['2xl'],
          }}
        >
          <IconButton
            variant="ghost"
            size={40}
            onPress={handleBack}
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={22} color={colors.text as string} />
          </IconButton>
          <Headline style={{ marginLeft: spacing.sm }}>Settings.</Headline>
        </Animated.View>

        {/* Banner */}
        {banner ? (
          <Animated.View
            entering={ENTER.fadeUp(40)}
            style={{
              marginBottom: spacing.lg,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              borderRadius: 12,
              backgroundColor:
                banner.kind === 'success'
                  ? (palette.sage + '22')
                  : (palette.alert + '22'),
              borderWidth: 1,
              borderColor: banner.kind === 'success' ? palette.sage : palette.alert,
            }}
          >
            <BodySm color={banner.kind === 'success' ? palette.sage : palette.alert}>
              {banner.text}
            </BodySm>
          </Animated.View>
        ) : null}

        {/* Account */}
        <Section title="Account" delay={80}>
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            <TextField
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (passwordError) setPasswordError(null);
              }}
              placeholder="new password"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              error={passwordError}
            />
          </View>
        </Section>

        {/* Save */}
        {isDirty ? (
          <Animated.View
            entering={ENTER.fadeUp(240)}
            style={{ alignItems: 'center', marginBottom: spacing['2xl'] }}
          >
            <Button
              variant="primary"
              size="lg"
              title={saving ? 'Saving…' : 'Save changes'}
              disabled={saving}
              onPress={() => {
                tapHeavy();
                handleSave();
              }}
              style={{ alignSelf: 'center', minWidth: 220 }}
            />
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* Sign out — pinned 30px above the tab bar (86px tall on mobile; no tab bar on web) */}
      <Animated.View
        entering={ENTER.fadeUp(380)}
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: Platform.OS === 'web' ? 30 : 86 + 30,
          alignItems: 'center',
        }}
      >
        <Button
          variant="danger"
          size="lg"
          title="Sign out"
          onPress={() => {
            tapHeavy();
            logout();
          }}
          style={{ alignSelf: 'center', minWidth: 220 }}
        />
      </Animated.View>
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
