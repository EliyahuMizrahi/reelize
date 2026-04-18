import React, { useCallback } from 'react';
import {
  Pressable,
  PressableProps,
  View,
  ViewStyle,
  StyleProp,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii } from '@/constants/tokens';
import { Text } from '@/components/ui/Text';
import { LinearGradient } from 'expo-linear-gradient';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tertiary' | 'danger' | 'shimmer';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<ButtonSize, { py: number; px: number; font: 'body' | 'bodyLg' | 'bodySm'; min: number }> = {
  sm: { py: 8, px: 14, font: 'bodySm', min: 36 },
  md: { py: 12, px: 18, font: 'body', min: 44 },
  lg: { py: 16, px: 22, font: 'bodyLg', min: 56 },
};

export function Button({
  title,
  children,
  variant = 'primary',
  size = 'md',
  fullWidth,
  leading,
  trailing,
  haptic = true,
  style,
  disabled,
  onPress,
  ...rest
}: ButtonProps) {
  const { colors, isDark } = useAppTheme();
  const s = SIZES[size];

  const handlePress = useCallback(
    (e: any) => {
      if (haptic && Platform.OS !== 'web' && !disabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      onPress?.(e);
    },
    [haptic, disabled, onPress],
  );

  const labelColor = (() => {
    if (disabled) return (colors.mutedText as string);
    switch (variant) {
      case 'primary':
        return isDark ? palette.ink : palette.mist;
      case 'secondary':
        return palette.ink;
      case 'ghost':
      case 'tertiary':
        return colors.text as string;
      case 'danger':
        return palette.mist;
      case 'shimmer':
        return palette.ink;
    }
  })();

  const renderBackground = (pressed: boolean) => {
    if (variant === 'shimmer') {
      return (
        <LinearGradient
          colors={[palette.sageSoft, palette.sage, palette.teal]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
      );
    }
    return null;
  };

  const bg = (() => {
    if (disabled) return (colors.inputBackground as string);
    switch (variant) {
      case 'primary':
        return colors.primary as string;
      case 'secondary':
        return palette.sage;
      case 'ghost':
        return 'transparent';
      case 'tertiary':
        return colors.card as string;
      case 'danger':
        return palette.alert;
      case 'shimmer':
        return 'transparent';
    }
  })();

  const borderColor = (() => {
    if (variant === 'ghost') return colors.border as string;
    if (variant === 'tertiary') return colors.border as string;
    return 'transparent';
  })();

  const borderWidth = variant === 'ghost' || variant === 'tertiary' ? 1 : 0;

  return (
    <Pressable
      {...rest}
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          paddingVertical: s.py,
          paddingHorizontal: s.px,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          backgroundColor: bg,
          borderColor,
          borderWidth,
          minHeight: s.min,
          opacity: disabled ? 0.55 : pressed ? 0.82 : 1,
          overflow: 'hidden',
          transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {({ pressed }) => (
        <>
          {renderBackground(pressed)}
          {leading ? <View style={{ marginRight: 8 }}>{leading}</View> : null}
          {title ? (
            <Text variant={s.font} family="sans" weight="semibold" color={labelColor}>
              {title}
            </Text>
          ) : null}
          {children}
          {trailing ? <View style={{ marginLeft: 8 }}>{trailing}</View> : null}
        </>
      )}
    </Pressable>
  );
}

export default Button;
