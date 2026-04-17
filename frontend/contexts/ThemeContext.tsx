import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, ColorValue } from 'react-native';

export type AppTheme = {
  isDark: boolean;
  primaryColor: string;
  toggleTheme: () => void;
  setPrimaryColor: (color: string) => void;
  fadeAnim: Animated.Value;
  colors: {
    background: ColorValue;
    card: ColorValue;
    text: ColorValue;
    mutedText: ColorValue;
    inputBackground: ColorValue;
    border: ColorValue;
    primary: ColorValue;
  };
};

const DEFAULT_PRIMARY = '#ef4444';

const AppThemeContext = createContext<AppTheme | undefined>(undefined);

export const AppThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isDark, setIsDark] = useState(true);
  const [primaryColor, setPrimaryColorState] = useState(DEFAULT_PRIMARY);
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

  const setPrimaryColor = useCallback((color: string) => {
    setPrimaryColorState(color);
  }, []);

  const colors = useMemo(() => {
    if (isDark) {
      return {
        background: '#0f0f12',
        card: '#17171c',
        text: '#f5f5f6',
        mutedText: '#b4b7be',
        inputBackground: '#1f1f25',
        border: '#2a2a31',
        primary: primaryColor,
      } as const;
    }
    return {
      background: '#ffffff',
      card: '#f3f4f6',
      text: '#0f172a',
      mutedText: '#475569',
      inputBackground: '#ffffff',
      border: '#e5e7eb',
      primary: primaryColor,
    } as const;
  }, [isDark, primaryColor]);

  const value = useMemo<AppTheme>(() => ({
    isDark,
    primaryColor,
    toggleTheme,
    setPrimaryColor,
    fadeAnim,
    colors,
  }), [isDark, primaryColor, toggleTheme, setPrimaryColor, fadeAnim, colors]);

  return (
    <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
  );
};

export function useAppTheme(): AppTheme {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider');
  return ctx;
}


