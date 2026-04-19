// TODO: dark mode is currently hardcoded. See audit Ship-blocker #5.
import React, { createContext, useContext } from 'react';
import { ColorValue } from 'react-native';
import { palette } from '@/constants/tokens';

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
  background: palette.ink,
  card: palette.inkTint,
  elevated: palette.inkElevated,
  text: palette.fog,
  mutedText: palette.sage,
  inputBackground: palette.inkTint,
  border: palette.inkBorder,
  primary: palette.sage,
  onPrimary: palette.ink,
  secondary: palette.teal,
  success: '#8FB89E',
  warning: palette.gold,
  danger: palette.alert,
  info: palette.tealBright,
};

export const PALETTES: Record<PaletteName, PaletteDef> = {
  slate: {
    name: 'slate',
    label: 'Slate',
    description: 'Cool blue-gray · corporate, crisp',
    swatches: [palette.ink, palette.inkTint, palette.teal, palette.sage, palette.fog],
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

const warnNotImplemented = (name: string) => () => {
  if (__DEV__) {
    console.warn(`[theme] ${name} is not yet implemented`);
  }
};

export const AppThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const value: AppTheme = {
    isDark: true,
    palette: 'slate',
    primaryColor: SLATE_DARK.primary,
    toggleTheme: warnNotImplemented('toggleTheme'),
    setPalette: warnNotImplemented('setPalette'),
    setPrimaryColor: warnNotImplemented('setPrimaryColor'),
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
