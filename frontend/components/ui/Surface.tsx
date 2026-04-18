import React from 'react';
import { View, ViewProps, ViewStyle } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';
import { radii } from '@/constants/tokens';

interface SurfaceProps extends ViewProps {
  elevation?: 'flat' | 'card' | 'raised' | 'input';
  radius?: keyof typeof radii;
  padded?: boolean | number;
  bordered?: boolean;
  children?: React.ReactNode;
}

export function Surface({
  elevation = 'card',
  radius = 'lg',
  padded,
  bordered = true,
  style,
  children,
  ...rest
}: SurfaceProps) {
  const { colors } = useAppTheme();
  const bg =
    elevation === 'raised' ? (colors.elevated as string) :
    elevation === 'flat' ? 'transparent' :
    elevation === 'input' ? (colors.inputBackground as string) :
    (colors.card as string);
  const pad = typeof padded === 'number' ? padded : padded ? 16 : 0;

  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radii[radius],
    padding: pad,
    borderWidth: bordered ? 1 : 0,
    borderColor: colors.border as string,
  };

  return (
    <View style={[base, style]} {...rest}>
      {children}
    </View>
  );
}

export function Divider({ style, orientation = 'horizontal' }: { style?: ViewStyle; orientation?: 'horizontal' | 'vertical' }) {
  const { colors } = useAppTheme();
  const base: ViewStyle = orientation === 'horizontal'
    ? { height: 1, alignSelf: 'stretch', backgroundColor: colors.border as string, opacity: 0.7 }
    : { width: 1, alignSelf: 'stretch', backgroundColor: colors.border as string, opacity: 0.7 };
  return <View style={[base, style]} />;
}
