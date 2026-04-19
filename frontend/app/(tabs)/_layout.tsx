import { useAppTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette } from "@/constants/tokens";
import { Text } from "@/components/ui/Text";

type TabIconProps = { color: string; focused: boolean };

function CreateIcon({ color }: TabIconProps) {
  return <Feather name="plus-square" size={26} color={color} />;
}

function LibraryIcon({ color }: TabIconProps) {
  return <Feather name="book-open" size={22} color={color} />;
}

function ProfileIcon({ color }: TabIconProps) {
  return <Feather name="user" size={24} color={color} />;
}

function TabLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text variant="caption" weight="semibold" upper color={color} style={{ marginTop: 2, letterSpacing: 1.4 }}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const { colors } = useAppTheme();
  const { session, isLoading } = useAuth();
  const isWeb = Platform.OS === "web";

  if (isLoading) return null;
  if (!session) return <Redirect href="/(auth)/sign-up" />;

  if (isWeb) {
    return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: "none" },
        }}
      >
        <Tabs.Screen name="feed" />
        <Tabs.Screen name="create" />
        <Tabs.Screen name="library" />
        <Tabs.Screen name="profile" />
      </Tabs>
    );
  }

  const Container = Platform.OS === "android" ? SafeAreaView : View;

  return (
    <Container
      style={{ flex: 1, backgroundColor: colors.background as string }}
      edges={Platform.OS === "android" ? ["top", "bottom"] : undefined}
    >
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: palette.mist,
          tabBarInactiveTintColor: colors.mutedText as string,
          tabBarStyle: {
            backgroundColor: colors.card as string,
            borderTopWidth: 1,
            borderTopColor: colors.border as string,
            height: 86,
            paddingBottom: Platform.OS === "android" ? 0 : 12,
            paddingTop: 10,
          },
          tabBarItemStyle: { height: "100%" },
        }}
        screenListeners={{
          tabPress: () => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
          },
        }}
      >
        <Tabs.Screen name="feed" options={{ href: null }} />
        <Tabs.Screen
          name="library"
          options={{
            tabBarIcon: (p) => <LibraryIcon {...p} />,
            tabBarLabel: ({ color }) => <TabLabel label="Library" color={color} />,
          }}
        />
        <Tabs.Screen
          name="create"
          options={{
            tabBarIcon: (p) => <CreateIcon {...p} />,
            tabBarLabel: ({ color }) => <TabLabel label="Create" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: (p) => <ProfileIcon {...p} />,
            tabBarLabel: ({ color }) => <TabLabel label="Dashboard" color={color} />,
          }}
        />
      </Tabs>
    </Container>
  );
}
