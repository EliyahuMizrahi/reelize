import React, { useState } from 'react';
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

export default function SignInScreen() {
  const { isDark } = useAppTheme();
  const { login } = useAuth();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldFocus, setFieldFocus] = useState<'email' | 'password' | null>(null);
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
      router.replace('/(tabs)/feed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const textColor = isDark ? palette.mist : palette.ink;
  const subColor = isDark ? palette.fog : palette.teal;

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
            variant="watching"
            size={54}
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
              <Overline color={palette.sage}>Reelize · Sign in</Overline>
            </Animated.View>

            <Animated.View entering={ENTER.fadeUpSlow(240)} style={{ marginTop: spacing.lg }}>
              <Headline color={textColor}>Welcome back.</Headline>
            </Animated.View>

            <Animated.View entering={ENTER.fadeUp(420)} style={{ marginTop: spacing.sm }}>
              <Body color={subColor} italic family="serif">
                Your private study shelf awaits.
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
                  if (error) setError(null);
                }}
                onFocus={() => setFieldFocus('email')}
                onBlur={() => setFieldFocus(null)}
                variant="boxed"
                error={error && fieldFocus !== 'password' ? error : null}
                returnKeyType="next"
              />
              <TextField
                label="Password"
                placeholder="Your password"
                secureTextEntry
                autoComplete="current-password"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError(null);
                }}
                onFocus={() => setFieldFocus('password')}
                onBlur={() => setFieldFocus(null)}
                variant="boxed"
                returnKeyType="go"
                onSubmitEditing={handleSignIn}
              />
            </Animated.View>
          </View>

          <View style={{ marginTop: spacing['3xl'] }}>
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

            <Animated.View
              entering={ENTER.fade(1000)}
              style={{ marginTop: spacing['2xl'], alignItems: 'center' }}
            >
              <Mono color={isDark ? palette.teal : palette.fog}>
                no feed · no followers · just your shelf
              </Mono>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
