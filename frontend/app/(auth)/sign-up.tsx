import React, { useState, useMemo } from 'react';
import { View, Platform, KeyboardAvoidingView, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { Link, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Headline, Body, BodySm, Overline } from '@/components/ui/Text';
import { Noctis } from '@/components/brand/Noctis';
import { NoctisSprite } from '@/components/brand/NoctisSprite';
import { ENTER } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, spacing, radii } from '@/constants/tokens';
import { supabase } from '@/lib/supabase';

// Reject obviously malformed addresses before round-tripping to Supabase.
// Matches "local@domain.tld" with no whitespace in any segment — good enough
// for a client-side gate, the server does the real RFC validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Noctis sprite sizing ──────────────────────────────────────────────
// Tweak these two numbers to resize the pixel-art crow on the sign-up page.
const NOCTIS_SIZE_MOBILE = 104; // mobile: sits above the headline, inline with scroll
const NOCTIS_SIZE_WEB = 72;     // web:    floats in the top-right corner

// ── Form typography ───────────────────────────────────────────────────
// Larger field labels for auth — the default Overline (10pt) reads as cramped
// on the sign-up form. Bump size/spacing here.
const FIELD_LABEL_STYLE = {
  fontSize: 13,
  lineHeight: 16,
  letterSpacing: 2.4,
  marginBottom: 12,
} as const;

export default function SignUpScreen() {
  const { isDark } = useAppTheme();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';
  const { height: windowHeight } = useWindowDimensions();
  // Button floats ~6% of screen height above the bottom edge — scales with device.
  const BOTTOM_OFFSET = Math.round(windowHeight * 0.06);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [checkInbox, setCheckInbox] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendToast, setResendToast] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      username.trim().length >= 2 &&
      EMAIL_RE.test(email.trim()) &&
      password.length >= 6 &&
      !isLoading
    );
  }, [username, email, password, isLoading]);

  const handleSignUp = async () => {
    setServerError(null);
    if (!username.trim()) {
      setServerError('Choose a display name.');
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      setServerError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setServerError('Password must be at least 6 characters.');
      return;
    }
    if (!isWeb) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setIsLoading(true);
    try {
      const trimmedUsername = username.trim();
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { username: trimmedUsername, display_name: trimmedUsername } },
      });
      if (error) throw error;
      // Supabase returns a session inline when email confirmation is off.
      // When it's on, data.session is null and the user must confirm via
      // the email link. Branch accordingly — the auth listener in
      // AuthContext will pick up the session and index.tsx redirects.
      if (data.session) {
        router.replace('/(tabs)/library');
      } else {
        setCheckInbox(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setServerError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendBusy) return;
    setResendBusy(true);
    setResendToast(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
      });
      if (error) throw error;
      setResendToast('Sent!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not resend.';
      setResendToast(msg);
    } finally {
      setResendBusy(false);
    }
  };

  const textColor = isDark ? palette.mist : palette.ink;
  const subColor = isDark ? palette.fog : palette.teal;

  if (checkInbox) {
    return (
      <Screen background={isDark ? 'inkGradient' : 'paper'} edges={['top', 'bottom']}>
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
          <Animated.View entering={ENTER.fadeUp(220)} style={{ alignItems: 'center', gap: spacing.sm }}>
            <Button
              title={resendBusy ? 'Resending…' : 'Resend confirmation email'}
              variant="secondary"
              disabled={resendBusy || !email.trim()}
              onPress={handleResend}
            />
            {resendToast ? (
              <BodySm color={resendToast === 'Sent!' ? palette.sage : palette.alert}>
                {resendToast}
              </BodySm>
            ) : null}
          </Animated.View>
          <Animated.View entering={ENTER.fadeUp(260)}>
            <Button title="Back to sign in" variant="ghost" onPress={() => router.replace('/(auth)/sign-in' as any)} />
          </Animated.View>
        </View>
      </Screen>
    );
  }

  // Reserve enough room on mobile so fields can scroll clear of the
  // absolutely-pinned button cluster at the bottom. Not needed on web.
  const BOTTOM_CLUSTER_RESERVE = isWeb ? spacing['3xl'] : BOTTOM_OFFSET + 140;

  const headerRow = (
    <Animated.View
      entering={ENTER.fadeUpSlow(240)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
      }}
    >
      <View style={{ flex: 1 }}>
        <Headline color={textColor}>
          {isWeb ? 'From scroll to study.' : 'From scroll\nto study.'}
        </Headline>
      </View>
      <NoctisSprite size={isWeb ? NOCTIS_SIZE_WEB : NOCTIS_SIZE_MOBILE} />
    </Animated.View>
  );

  const fields = (
    <Animated.View
      entering={ENTER.fadeUp(600)}
      style={{ gap: spacing.xl }}
    >
      <TextField
        label="Display name"
        labelStyle={FIELD_LABEL_STYLE}
        placeholder="How should we greet you?"
        autoCapitalize="words"
        autoCorrect={false}
        value={username}
        onChangeText={(t) => {
          setUsername(t);
          if (serverError) setServerError(null);
        }}
        variant="boxed"
        returnKeyType="next"
      />
      <TextField
        label="Email"
        labelStyle={FIELD_LABEL_STYLE}
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
        label="Password"
        labelStyle={FIELD_LABEL_STYLE}
        placeholder="At least 6 characters"
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
        variant="boxed"
        returnKeyType="go"
        onSubmitEditing={handleSignUp}
      />
    </Animated.View>
  );

  const bottomCluster = (
    <>
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
    </>
  );

  // ── Web: boxed layout ──
  // Headline + crow sit above a card containing fields + button + link.
  if (isWeb) {
    return (
      <Screen background={isDark ? 'inkGradient' : 'paper'} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing['2xl'],
            paddingVertical: spacing['4xl'],
            alignItems: 'center',
            justifyContent: 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: '100%', maxWidth: 440 }}>
            {headerRow}

            <View
              style={{
                marginTop: spacing['2xl'],
                padding: spacing['3xl'],
                borderRadius: radii.xl,
                backgroundColor: isDark ? palette.inkTint : palette.paperDeep,
                borderWidth: 1,
                borderColor: isDark ? palette.inkBorder : palette.fogBorder,
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
              }}
            >
              {fields}
              <View style={{ marginTop: spacing['2xl'] }}>{bottomCluster}</View>
            </View>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  // ── Mobile: scroll + absolute bottom cluster ──
  return (
    <Screen background={isDark ? 'inkGradient' : 'paper'} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing['2xl'],
            paddingTop: spacing.xl,
            paddingBottom: BOTTOM_CLUSTER_RESERVE,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: '100%', maxWidth: 440 }}>
            {headerRow}
            <View style={{ marginTop: spacing['3xl'] }}>{fields}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom cluster pinned to the screen — lives OUTSIDE KeyboardAvoidingView
          so the keyboard opening/closing does not reflow it. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: BOTTOM_OFFSET,
          paddingHorizontal: spacing['2xl'],
          alignItems: 'center',
        }}
      >
        <View style={{ width: '100%', maxWidth: 440 }}>{bottomCluster}</View>
      </View>
    </Screen>
  );
}
