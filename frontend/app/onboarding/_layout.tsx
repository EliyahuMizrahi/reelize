import { Stack } from 'expo-router';
import React from 'react';
import { palette } from '@/constants/tokens';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: palette.ink },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="how-it-works" />
      <Stack.Screen name="first-class" />
    </Stack>
  );
}
