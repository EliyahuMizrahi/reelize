import React from 'react';
import { View, ViewStyle, Platform } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette } from '@/constants/tokens';

type ScreenBackground =
  | 'primary'
  | 'card'
  | 'elevated'
  | 'paper'
  | 'ink'
  | 'inkGradient' // twilight: inkElevated → inkTint → ink (top to bottom)
  | string;

interface ScreenProps {
  children: React.ReactNode;
  edges?: Edge[];
  background?: ScreenBackground;
  style?: ViewStyle;
}

// Gradient stops — tweak here to adjust the onboarding/auth sky.
const INK_GRADIENT_COLORS = [
  palette.inkElevated, // #14404C — lit teal (top)
  palette.inkTint,     // #0A2B35 — deep teal-blue
  palette.ink,         // #04141E — current base (bottom)
] as const;
const INK_GRADIENT_LOCATIONS = [0, 0.55, 1] as const;

export function Screen({
  children,
  edges = ['top', 'bottom'],
  background = 'primary',
  style,
}: ScreenProps) {
  const { colors } = useAppTheme();

  if (background === 'inkGradient') {
    return (
      <View style={{ flex: 1, backgroundColor: palette.ink }}>
        <LinearGradient
          colors={INK_GRADIENT_COLORS as unknown as [string, string, ...string[]]}
          locations={INK_GRADIENT_LOCATIONS as unknown as [number, number, ...number[]]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <SafeAreaView edges={edges} style={[{ flex: 1 }, style]}>
          {children}
        </SafeAreaView>
      </View>
    );
  }

  const bg =
    background === 'primary' ? (colors.background as string) :
    background === 'card' ? (colors.card as string) :
    background === 'elevated' ? (colors.elevated as string) :
    background === 'paper' ? palette.paper :
    background === 'ink' ? palette.ink :
    background;

  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function ScreenContent({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean | number;
}) {
  const pad = typeof padded === 'number' ? padded : padded ? 20 : 0;
  return (
    <View style={[{ flex: 1, paddingHorizontal: pad }, style]}>{children}</View>
  );
}
