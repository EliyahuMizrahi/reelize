import React, { createContext, useContext, useRef } from 'react';
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

export type PaletteName = 'slate';

type PaletteDef = {
  name: PaletteName;
  label: string;
  description: string;
  swatches: string[];
  dark: PaletteColors;
  light: PaletteColors;
};

const SLATE_DARK: PaletteColors = {
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
};

export const PALETTES: Record<PaletteName, PaletteDef> = {
  slate: {
    name: 'slate',
    label: 'Slate',
    description: 'Cool blue-gray · corporate, crisp',
    swatches: ['#02060F', '#0D1E30', '#3F566E', '#91A5B8', '#CDD7DE'],
    dark: SLATE_DARK,
    light: SLATE_DARK,
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

const noop = () => {};

export const AppThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const value: AppTheme = {
    isDark: true,
    palette: 'slate',
    primaryColor: SLATE_DARK.primary,
    toggleTheme: noop,
    setPalette: noop,
    setPrimaryColor: noop,
    fadeAnim,
    colors: SLATE_DARK,
  };

  return (
    <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
  );
};

export function useAppTheme(): AppTheme {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider');
  return ctx;
}
