import React from 'react';
import { Pressable, View, ViewStyle, StyleProp } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { palette, radii } from '@/constants/tokens';
import { webStyle } from '@/lib/web';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  variant?: 'neutral' | 'accent' | 'paper' | 'outline' | 'class';
  classColor?: string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  selected,
  onPress,
  leading,
  trailing,
  variant = 'neutral',
  classColor,
  size = 'md',
  style,
}: ChipProps) {
  const { colors, isDark } = useAppTheme();

  const bg = (() => {
    if (selected) return colors.primary as string;
    switch (variant) {
      case 'accent':
        return isDark ? palette.inkElevated : palette.fog;
      case 'paper':
        return palette.paper;
      case 'outline':
        return 'transparent';
      case 'class':
        return classColor ? classColor + '22' : (colors.card as string);
      default:
        return colors.card as string;
    }
  })();

  const labelColor = (() => {
    if (selected) return isDark ? palette.ink : palette.mist;
    if (variant === 'paper') return palette.ink;
    if (variant === 'class' && classColor) return classColor;
    return colors.text as string;
  })();

  const borderColor = (() => {
    if (selected) return colors.primary as string;
    if (variant === 'outline') return colors.border as string;
    if (variant === 'class' && classColor) return classColor + '55';
    return 'transparent';
  })();

  const py = size === 'sm' ? 5 : 8;
  const px = size === 'sm' ? 10 : 14;

  const Container: any = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      style={({ pressed, hovered, focused }: any) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: py,
          paddingHorizontal: px,
          borderRadius: radii.pill,
          backgroundColor: bg,
          borderWidth: variant === 'outline' || variant === 'class' ? 1 : 0,
          borderColor,
          opacity: pressed ? 0.82 : hovered ? 0.92 : 1,
          alignSelf: 'flex-start',
        },
        onPress ? webStyle.pointer : null,
        onPress ? webStyle.transition() : null,
        onPress && focused ? webStyle.focusRing(colors.primary as string) : null,
        style,
      ]}
    >
      {leading ? <View style={{ marginRight: 6 }}>{leading}</View> : null}
      <Text variant={size === 'sm' ? 'caption' : 'bodySm'} weight="semibold" color={labelColor}>
        {label}
      </Text>
      {trailing ? <View style={{ marginLeft: 6 }}>{trailing}</View> : null}
    </Container>
  );
}
