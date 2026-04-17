import { useAppTheme } from '@/contexts/ThemeContext';
import React from 'react';
import { Text, TextInput, TextInputProps, View } from 'react-native';

export type TextFieldProps = TextInputProps & {
  label?: string;
  helperText?: string;
};

export const TextField: React.FC<TextFieldProps> = ({ label, helperText, style, ...props }) => {
  const { colors } = useAppTheme();

  return (
    <View style={{ width: '100%' }}>
      {label ? (
        <Text style={{ color: colors.mutedText as string, marginBottom: 8, fontSize: 14 }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.mutedText as string}
        style={[
          {
            width: '100%',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: colors.inputBackground as string,
            color: colors.text as string,
            borderWidth: 1,
            borderColor: colors.border as string,
          },
          style as any,
        ]}
        {...props}
      />
      {helperText ? (
        <Text style={{ color: colors.mutedText as string, marginTop: 6, fontSize: 12 }}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
};

export default TextField;


