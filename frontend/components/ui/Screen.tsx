import React from 'react';
import { View, ViewStyle, Platform } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette } from '@/constants/tokens';

interface ScreenProps {
  children: React.ReactNode;
  edges?: Edge[];
  background?: 'primary' | 'card' | 'elevated' | 'paper' | 'ink' | string;
  style?: ViewStyle;
  dense?: boolean;
}

export function Screen({
  children,
  edges = ['top', 'bottom'],
  background = 'primary',
  style,
}: ScreenProps) {
  const { colors } = useAppTheme();
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
