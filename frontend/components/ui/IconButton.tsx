import React, { useCallback } from 'react';
import { Pressable, ViewStyle, StyleProp, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii } from '@/constants/tokens';

export interface IconButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  size?: number;
  variant?: 'ghost' | 'filled' | 'elevated' | 'glass';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
}

export function IconButton({
  children,
  onPress,
  size = 44,
  variant = 'ghost',
  style,
  disabled,
  haptic = true,
  accessibilityLabel,
}: IconButtonProps) {
  const { colors } = useAppTheme();
  const handle = useCallback(() => {
    if (haptic && Platform.OS !== 'web' && !disabled) {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress?.();
  }, [haptic, disabled, onPress]);

  const bg =
    variant === 'filled' ? (colors.card as string) :
    variant === 'elevated' ? (colors.elevated as string) :
    variant === 'glass' ? 'rgba(255,255,255,0.08)' :
    'transparent';

  return (
    <Pressable
      onPress={handle}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
          borderWidth: variant === 'filled' || variant === 'elevated' ? 1 : 0,
          borderColor: colors.border as string,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
