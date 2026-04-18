import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import {
  Headline,
  Overline,
} from '@/components/ui/Text';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { spacing } from '@/constants/tokens';
import { ENTER } from '@/components/ui/motion';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, profile, logout } = useAuth();

  const initialUsername =
    profile?.username ??
    profile?.display_name ??
    user?.email?.split('@')[0] ??
    '';

  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');

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
            marginBottom: spacing['2xl'],
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
          <Headline style={{ marginLeft: spacing.sm }}>Settings.</Headline>
        </Animated.View>

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
              onChangeText={setPassword}
              placeholder="new password"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>
        </Section>

        {/* Sign out */}
        <Animated.View
          entering={ENTER.fadeUp(380)}
          style={{ alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing['3xl'] }}
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
