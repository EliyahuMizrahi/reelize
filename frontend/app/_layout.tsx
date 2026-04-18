import { AuthProvider } from "@/contexts/AuthContext";
import { AppThemeProvider } from "@/contexts/ThemeContext";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Platform } from "react-native";
import "react-native-gesture-handler";

const RootLayout = () => {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            ...(Platform.OS === "android" && {
              contentStyle: { backgroundColor: "#04141E" },
              animation: "none",
              presentation: "transparentModal",
            }),
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        <StatusBar backgroundColor="#04141E" style="light" />
      </AuthProvider>
    </AppThemeProvider>
  );
};

export default RootLayout;
