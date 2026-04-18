import { AuthProvider } from "@/contexts/AuthContext";
import { AppThemeProvider, useAppTheme } from "@/contexts/ThemeContext";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import "react-native-gesture-handler";
import { useAppFonts } from "@/hooks/useAppFonts";
import { palette } from "@/constants/tokens";
import { Noctis } from "@/components/brand/Noctis";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootShell() {
  const { loaded } = useAppFonts();
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.ink,
        }}
      >
        <Noctis variant="mark" size={96} color={palette.mist} eyeColor={palette.sage} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background as string },
          ...(Platform.OS === "android" && {
            animation: "fade",
          }),
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <StatusBar
        backgroundColor={colors.background as string}
        style={isDark ? "light" : "dark"}
      />
    </AuthProvider>
  );
}

const RootLayout = () => {
  return (
    <AppThemeProvider>
      <RootShell />
    </AppThemeProvider>
  );
};

export default RootLayout;
