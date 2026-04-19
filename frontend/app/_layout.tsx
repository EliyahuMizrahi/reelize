import { AuthProvider } from "@/contexts/AuthContext";
import { AppThemeProvider, useAppTheme } from "@/contexts/ThemeContext";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Platform, View } from "react-native";
import "react-native-gesture-handler";
import { useAppFonts } from "@/hooks/useAppFonts";
import { palette } from "@/constants/tokens";
import { WebAppChrome } from "@/components/navigation/WebAppChrome";

const WEB_CHROME_PREFIXES = ["/feed", "/library", "/create", "/profile"];

function WebChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const show =
    Platform.OS === "web" &&
    WEB_CHROME_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!show) return <>{children}</>;
  return <WebAppChrome>{children}</WebAppChrome>;
}

function RootShell() {
  const { loaded } = useAppFonts();
  const { colors, isDark } = useAppTheme();

  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.ink,
        }}
      />
    );
  }

  return (
    <AuthProvider>
      <WebChromeGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background as string },
            animation: "fade",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </WebChromeGate>
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
