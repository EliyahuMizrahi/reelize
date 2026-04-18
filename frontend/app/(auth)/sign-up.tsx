import React, { useState, useMemo } from 'react';
import { View, Platform, KeyboardAvoidingView, ScrollView, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { Link, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Headline, Body, BodySm, Mono, Overline } from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { ENTER } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { palette, spacing } from '@/constants/tokens';

export default function SignUpScreen() {
  const { isDark } = useAppTheme();
  const { signUp } = useAuth();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [touchedConfirm, setTouchedConfirm] = useState(false);
  const [checkInbox, setCheckInbox] = useState(false);

  const mismatch = touchedConfirm && confirm.length > 0 && confirm !== password;

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 3 &&
      email.includes('@') &&
      password.length >= 6 &&
      confirm.length >= 6 &&
      password === confirm &&
      !isLoading
    );
  }, [email, password, confirm, isLoading]);

  const handleSignUp = async () => {
    setServerError(null);
    setTouchedConfirm(true);
    if (!email.trim() || !password.trim()) {
      setServerError('Enter an email and password.');
      return;
    }
    if (password.length < 6) {
      setServerError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      return;
    }
    if (!isWeb) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setIsLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, username.trim() || undefined);
      // If email confirmation is required (prod), session won't exist yet — show inbox state.
      // In dev (confirmations off), AuthContext will flip isAuthenticated and index.tsx redirects.
      setCheckInbox(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setServerError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const textColor = isDark ? palette.mist : palette.ink;
  const subColor = isDark ? palette.fog : palette.teal;

  if (checkInbox) {
    return (
      <Screen background={isDark ? 'ink' : 'paper'} edges={['top', 'bottom']}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing['2xl'],
            gap: spacing.xl,
          }}
        >
          <Noctis variant="scroll" size={120} color={textColor} eyeColor={palette.sage} />
          <Animated.View entering={ENTER.fadeUp(120)} style={{ alignItems: 'center', gap: spacing.md }}>
            <Overline color={palette.sage}>Check your inbox</Overline>
            <Headline color={textColor} align="center">A note has left the nest.</Headline>
            <Body color={subColor} italic family="serif" align="center" style={{ maxWidth: 340 }}>
              Confirm your email to open the shelf. If you don&apos;t see it in a minute, check spam.
            </Body>
          </Animated.View>
          <Animated.View entering={ENTER.fadeUp(260)}>
            <Button title="Back to sign in" variant="ghost" onPress={() => router.replace('/(auth)/sign-in' as any)} />
          </Animated.View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen background={isDark ? 'ink' : 'paper'} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View
          entering={ENTER.fadeSlow(200)}
          style={{
            position: 'absolute',
            top: spacing['4xl'],
            right: spacing.xl,
            zIndex: 2,
          }}
        >
          <Noctis
            variant="perched"
            size={64}
            color={textColor}
            eyeColor={palette.sage}
            animated
          />
        </Animated.View>

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing['2xl'],
            paddingTop: spacing['6xl'],
            paddingBottom: spacing['3xl'],
            justifyContent: 'space-between',
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ maxWidth: 480 }}>
            <Animated.View entering={ENTER.fadeUp(100)}>
              <Overline color={palette.sage}>Reelize · Create account</Overline>
            </Animated.View>

            <Animated.View entering={ENTER.fadeUpSlow(240)} style={{ marginTop: spacing.lg }}>
              <Headline color={textColor}>Start your shelf.</Headline>
            </Animated.View>

            <Animated.View entering={ENTER.fadeUp(420)} style={{ marginTop: spacing.sm }}>
              <Body color={subColor} italic family="serif">
                A quiet library of lessons, pulled from the feed and made yours.
              </Body>
            </Animated.View>

            <Animated.View entering={ENTER.fadeUp(600)} style={{ marginTop: spacing['3xl'], gap: spacing.lg }}>
              <TextField
                label="Email"
                placeholder="you@somewhere.com"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (serverError) setServerError(null);
                }}
                variant="boxed"
                error={serverError}
                returnKeyType="next"
              />
              <TextField
                label="Display name (optional)"
                placeholder="How should we greet you?"
                autoCapitalize="words"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                variant="boxed"
                returnKeyType="next"
              />
              <TextField
                label="Password"
                placeholder="At least 6 characters"
                secureTextEntry
                autoComplete="new-password"
                value={password}
                onChangeText={setPassword}
                variant="boxed"
                returnKeyType="next"
              />
              <TextField
                label="Confirm password"
                placeholder="Say it again"
                secureTextEntry
                autoComplete="new-password"
                value={confirm}
                onChangeText={(t) => {
                  setConfirm(t);
                  setTouchedConfirm(true);
                }}
                onBlur={() => setTouchedConfirm(true)}
                variant="boxed"
                error={mismatch ? 'Passwords don\u2019t match.' : null}
                returnKeyType="go"
                onSubmitEditing={handleSignUp}
              />
            </Animated.View>
          </View>

          <View style={{ marginTop: spacing['3xl'] }}>
            <Animated.View entering={ENTER.fadeUp(760)}>
              <Button
                title={isLoading ? 'Creating account…' : 'Create account'}
                variant="primary"
                size="lg"
                fullWidth
                disabled={!canSubmit}
                onPress={handleSignUp}
              />
            </Animated.View>

            <Animated.View
              entering={ENTER.fadeUp(880)}
              style={{
                marginTop: spacing.xl,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <BodySm color={subColor}>Already have a shelf?</BodySm>
              <Link href="/(auth)/sign-in" asChild>
                <Pressable>
                  <BodySm color={palette.sage} weight="semibold">
                    Sign in →
                  </BodySm>
                </Pressable>
              </Link>
            </Animated.View>

            <Animated.View
              entering={ENTER.fade(1000)}
              style={{ marginTop: spacing['2xl'], alignItems: 'center' }}
            >
              <Mono color={isDark ? palette.teal : palette.fog} align="center">
                by creating an account you agree to the terms · v1
              </Mono>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
