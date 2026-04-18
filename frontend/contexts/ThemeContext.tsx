import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, ColorValue } from 'react-native';

type PaletteColors = {
  background: string;
  card: string;
  elevated: string;
  text: string;
  mutedText: string;
  inputBackground: string;
  border: string;
  primary: string;
  onPrimary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
};

export type PaletteName = 'sage' | 'slate';

type PaletteDef = {
  name: PaletteName;
  label: string;
  description: string;
  swatches: string[];
  dark: PaletteColors;
  light: PaletteColors;
};

export const PALETTES: Record<PaletteName, PaletteDef> = {
  sage: {
    name: 'sage',
    label: 'Sage',
    description: 'Warm teal-green · calm, organic',
    swatches: ['#04141E', '#0A2B35', '#44706F', '#8BBAB1', '#CED9D7'],
    dark: {
      background: '#04141E',
      card: '#0A2B35',
      elevated: '#14404C',
      text: '#CED9D7',
      mutedText: '#8BBAB1',
      inputBackground: '#0F3440',
      border: '#1A4852',
      primary: '#8BBAB1',
      onPrimary: '#04141E',
      secondary: '#44706F',
      success: '#8BBAB1',
      warning: '#E0B066',
      danger: '#C96A5E',
      info: '#6FA8B8',
    },
    light: {
      background: '#F5F8F7',
      card: '#FFFFFF',
      elevated: '#FFFFFF',
      text: '#04141E',
      mutedText: '#44706F',
      inputBackground: '#FFFFFF',
      border: '#CED9D7',
      primary: '#44706F',
      onPrimary: '#FFFFFF',
      secondary: '#44706F',
      success: '#44706F',
      warning: '#B87A2A',
      danger: '#A1463B',
      info: '#3C6F82',
    },
  },
  slate: {
    name: 'slate',
    label: 'Slate',
    description: 'Cool blue-gray · corporate, crisp',
    swatches: ['#02060F', '#0D1E30', '#3F566E', '#91A5B8', '#CDD7DE'],
    dark: {
      background: '#02060F',
      card: '#0D1E30',
      elevated: '#18314A',
      text: '#CDD7DE',
      mutedText: '#91A5B8',
      inputBackground: '#122840',
      border: '#2A3F55',
      primary: '#91A5B8',
      onPrimary: '#02060F',
      secondary: '#3F566E',
      success: '#8FB89E',
      warning: '#D4A574',
      danger: '#C47B76',
      info: '#7FA5C7',
    },
    light: {
      background: '#F2F5F8',
      card: '#FFFFFF',
      elevated: '#FFFFFF',
      text: '#02060F',
      mutedText: '#3F566E',
      inputBackground: '#FFFFFF',
      border: '#CDD7DE',
      primary: '#3F566E',
      onPrimary: '#FFFFFF',
      secondary: '#91A5B8',
      success: '#3D6E52',
      warning: '#B0762A',
      danger: '#9E463E',
      info: '#365E85',
    },
  },
};

export type AppTheme = {
  isDark: boolean;
  palette: PaletteName;
  primaryColor: string;
  toggleTheme: () => void;
  setPalette: (name: PaletteName) => void;
  setPrimaryColor: (color: string) => void;
  fadeAnim: Animated.Value;
  colors: {
    background: ColorValue;
    card: ColorValue;
    elevated: ColorValue;
    text: ColorValue;
    mutedText: ColorValue;
    inputBackground: ColorValue;
    border: ColorValue;
    primary: ColorValue;
    onPrimary: ColorValue;
    secondary: ColorValue;
    success: ColorValue;
    warning: ColorValue;
    danger: ColorValue;
    info: ColorValue;
  };
};

const AppThemeContext = createContext<AppTheme | undefined>(undefined);

export const AppThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isDark, setIsDark] = useState(true);
  const [palette, setPaletteState] = useState<PaletteName>('sage');
  const [primaryOverride, setPrimaryOverride] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const toggleTheme = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0.3,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setIsDark((prev) => !prev);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  const setPalette = useCallback((name: PaletteName) => {
    setPaletteState(name);
    setPrimaryOverride(null);
  }, []);

  const setPrimaryColor = useCallback((color: string) => {
    setPrimaryOverride(color);
  }, []);

  const colors = useMemo(() => {
    const base = isDark ? PALETTES[palette].dark : PALETTES[palette].light;
    const primary = primaryOverride ?? base.primary;
    return { ...base, primary } as const;
  }, [isDark, palette, primaryOverride]);

  const primaryColor = colors.primary;

  const value = useMemo<AppTheme>(() => ({
    isDark,
    palette,
    primaryColor,
    toggleTheme,
    setPalette,
    setPrimaryColor,
    fadeAnim,
    colors,
  }), [isDark, palette, primaryColor, toggleTheme, setPalette, setPrimaryColor, fadeAnim, colors]);

  return (
    <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
  );
};

export function useAppTheme(): AppTheme {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider');
  return ctx;
}
