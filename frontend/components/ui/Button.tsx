import React from 'react';
import { Pressable, PressableProps, Text, ViewStyle } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';

export type ButtonProps = PressableProps & {
  title: string;
  variant?: 'solid' | 'outline' | 'ghost';
  rounded?: number;
  style?: ViewStyle | ViewStyle[];
};

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'solid',
  rounded = 12,
  style,
  disabled,
  ...pressableProps
}) => {
  const { colors } = useAppTheme();
  const primary = colors.primary as string;
  const onPrimary = colors.onPrimary as string;

  const backgroundColor = variant === 'solid' ? primary : 'transparent';
  const textColor = variant === 'solid' ? onPrimary : primary;

  const buttonStyle: ViewStyle = {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: rounded,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: variant === 'outline' ? 1 : 0,
    borderColor: variant === 'outline' ? primary : 'transparent',
    backgroundColor: backgroundColor,
    minHeight: 56,
    opacity: disabled ? 0.5 : 1,
    ...(Array.isArray(style) ? Object.assign({}, ...style) : style),
  };

  return (
    <Pressable
      {...pressableProps}
      disabled={disabled}
      style={buttonStyle}
      className="active:opacity-70"
    >
      <Text style={{ color: textColor, fontWeight: '700', fontSize: 17 }}>
        {title}
      </Text>
    </Pressable>
  );
};

export default Button;
