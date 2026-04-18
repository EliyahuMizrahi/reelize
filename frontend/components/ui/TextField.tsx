import React, { useState } from 'react';
import {
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
  StyleProp,
  Pressable,
  Platform,
} from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';
import { Text, Overline } from '@/components/ui/Text';
import { radii, palette } from '@/constants/tokens';
import { type as fontType } from '@/constants/tokens';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  helperText?: string;
  error?: string | null;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  variant?: 'boxed' | 'underline' | 'editorial';
  font?: 'sans' | 'serif' | 'mono';
}

export function TextField({
  label,
  helperText,
  error,
  leading,
  trailing,
  containerStyle,
  labelStyle,
  style,
  variant = 'boxed',
  font = 'sans',
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const { colors, isDark } = useAppTheme();
  const [focused, setFocused] = useState(false);

  const fontFamily =
    font === 'serif' ? fontType.serifBook :
    font === 'mono' ? fontType.mono :
    fontType.sansRegular;

  const borderColor = error
    ? palette.alert
    : focused
    ? (colors.primary as string)
    : (colors.border as string);

  const baseInput: any = {
    flex: 1,
    paddingVertical: variant === 'editorial' ? 10 : 14,
    paddingHorizontal: variant === 'underline' ? 0 : leading ? 4 : 0,
    color: colors.text as string,
    fontFamily,
    fontSize: variant === 'editorial' ? 22 : 15,
    letterSpacing: variant === 'editorial' ? -0.3 : -0.05,
    ...(Platform.OS === 'web'
      ? { outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' }
      : {}),
  };

  return (
    <View style={[{ width: '100%' }, containerStyle]}>
      {label ? (
        <Overline muted style={[{ marginBottom: 8 }, labelStyle]}>
          {label}
        </Overline>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor:
            variant === 'underline' || variant === 'editorial'
              ? 'transparent'
              : (colors.inputBackground as string),
          borderRadius: variant === 'underline' || variant === 'editorial' ? 0 : radii.md,
          ...(variant === 'underline' || variant === 'editorial'
            ? { borderBottomWidth: 1 }
            : { borderWidth: 1 }),
          borderColor,
          paddingHorizontal: variant === 'underline' || variant === 'editorial' ? 0 : 14,
        }}
      >
        {leading ? <View style={{ marginRight: 10 }}>{leading}</View> : null}
        <TextInput
          placeholderTextColor={(colors.mutedText as string) + 'CC'}
          selectionColor={colors.primary as string}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[baseInput, style as any]}
          {...props}
        />
        {trailing ? <View style={{ marginLeft: 10 }}>{trailing}</View> : null}
      </View>

      {error ? (
        <Text variant="bodySm" color={palette.alert} style={{ marginTop: 6 }}>
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="bodySm" muted style={{ marginTop: 6 }}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

export default TextField;
