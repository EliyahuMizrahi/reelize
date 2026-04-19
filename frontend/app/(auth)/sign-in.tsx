import React, { useState } from 'react';
import { View, Platform, KeyboardAvoidingView, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { Link, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Headline, BodySm } from '@/components/ui/Text';
import { ENTER } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { palette, spacing, radii } from '@/constants/tokens';

// ── Form typography ───────────────────────────────────────────────────
const FIELD_LABEL_STYLE = {
  fontSize: 13,
  lineHeight: 16,
  letterSpacing: 2.4,
  marginBottom: 12,
} as const;


export default function SignInScreen() {
  const { isDark } = useAppTheme();
  const { login } = useAuth();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';
  const { height: windowHeight } = useWindowDimensions();
  // Button floats ~6% of screen height above the bottom edge — scales with device.
  const BOTTOM_OFFSET = Math.round(windowHeight * 0.06);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isLoading;

  const handleSignIn = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password.');
      return;
    }
    if (!isWeb) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setIsLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // `feed` is hidden on mobile (href:null), library is the real home.
      router.replace('/(tabs)/library');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const textColor = isDark ? palette.mist : palette.ink;
  const subColor = isDark ? palette.fog : palette.teal;

  const BOTTOM_CLUSTER_RESERVE = isWeb ? spacing['3xl'] : BOTTOM_OFFSET + 140;

  const headerRow = (
    <Animated.View entering={ENTER.fadeUpSlow(240)}>
      <Headline
        color={textColor}
        align="center"
        style={isWeb ? { fontSize: 33, lineHeight: 39 } : { fontSize: 38, lineHeight: 44 }}
      >
        Back where you left off.
      </Headline>
    </Animated.View>
  );

  const fields = (
    <Animated.View entering={ENTER.fadeUp(600)} style={{ gap: spacing.xl }}>
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
          if (error) setError(null);
        }}
        variant="boxed"
        // Surface the error on the email field whenever one is set — prior
        // behavior only showed it when the password field wasn't focused,
        // which meant typing-and-retrying silently swallowed the message.
        error={error}
        returnKeyType="next"
      />
      <TextField
        label="Password"
        labelStyle={FIELD_LABEL_STYLE}
        placeholder="Your password"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (error) setError(null);
        }}
        variant="boxed"
        returnKeyType="go"
        onSubmitEditing={handleSignIn}
      />
    </Animated.View>
  );

  const bottomCluster = (
    <>
      <Animated.View entering={ENTER.fadeUp(760)}>
        <Button
          title={isLoading ? 'Signing in…' : 'Sign in'}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canSubmit}
          onPress={handleSignIn}
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
        <BodySm color={subColor}>New here?</BodySm>
        <Link href="/(auth)/sign-up" asChild>
          <Pressable>
            <BodySm color={palette.sage} weight="semibold">
              Start your shelf →
            </BodySm>
          </Pressable>
        </Link>
      </Animated.View>
    </>
  );

  // ── Web: boxed layout ──
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
