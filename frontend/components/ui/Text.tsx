import React from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { useAppTheme } from '@/contexts/ThemeContext';
import { scale, type as t, ScaleVariant } from '@/constants/tokens';

type Family = 'serif' | 'sans' | 'mono';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

function familyFor(family: Family, weight: Weight = 'medium'): string {
  if (family === 'serif') {
    if (weight === 'bold') return t.serifBold;
    if (weight === 'regular') return t.serifBook;
    return t.serif;
  }
  if (family === 'mono') {
    return weight === 'medium' ? t.monoMedium : t.mono;
  }
  if (weight === 'bold') return t.sansBold;
  if (weight === 'semibold') return t.sansSemibold;
  if (weight === 'regular') return t.sansRegular;
  return t.sans;
}

export interface BrandTextProps extends TextProps {
  variant?: ScaleVariant;
  family?: Family;
  weight?: Weight;
  italic?: boolean;
  color?: string;
  muted?: boolean;
  align?: 'left' | 'center' | 'right';
  upper?: boolean;
  children?: React.ReactNode;
}

export function Text({
  variant = 'body',
  family,
  weight,
  italic,
  color,
  muted,
  align,
  upper,
  style,
  children,
  ...rest
}: BrandTextProps) {
  const { colors } = useAppTheme();
  const s = scale[variant];
  const f: Family = family ?? (s.family as Family);
  const fontFamily = italic && f === 'serif' ? t.serifItalic : familyFor(f, weight);
  const textColor = color ?? (muted ? (colors.mutedText as string) : (colors.text as string));

  const base: TextStyle = {
    fontFamily,
    fontSize: s.size,
    lineHeight: s.line,
    letterSpacing: s.letter,
    color: textColor,
    textAlign: align,
  };

  return (
    <RNText style={[base, upper && { textTransform: 'uppercase' }, style]} {...rest}>
      {children}
    </RNText>
  );
}

export const Display = (p: BrandTextProps) => <Text variant="display1" {...p} />;
export const Display2 = (p: BrandTextProps) => <Text variant="display2" {...p} />;
export const Headline = (p: BrandTextProps) => <Text variant="headline" {...p} />;
export const Title = (p: BrandTextProps) => <Text variant="title" {...p} />;
export const TitleSm = (p: BrandTextProps) => <Text variant="titleSm" {...p} />;
export const BodyLg = (p: BrandTextProps) => <Text variant="bodyLg" {...p} />;
export const Body = (p: BrandTextProps) => <Text variant="body" {...p} />;
export const BodySm = (p: BrandTextProps) => <Text variant="bodySm" {...p} />;
export const Label = (p: BrandTextProps) => <Text variant="label" weight="semibold" {...p} />;
export const Mono = (p: BrandTextProps) => <Text variant="mono" family="mono" {...p} />;
export const MonoSm = (p: BrandTextProps) => <Text variant="monoSm" family="mono" {...p} />;
export const Overline = (p: BrandTextProps) => <Text variant="overline" weight="semibold" upper {...p} />;
