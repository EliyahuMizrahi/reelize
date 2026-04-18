import { WebSidebar } from "@/components/navigation/WebSidebar";
import { useAppTheme } from "@/contexts/ThemeContext";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Noctis } from "@/components/brand/Noctis";
import { palette } from "@/constants/tokens";
import { Text } from "@/components/ui/Text";

type TabIconProps = { color: string; focused: boolean };

function FeedIcon({ color }: TabIconProps) {
  return <Feather name="film" size={22} color={color} />;
}

function CreateIcon({ focused }: TabIconProps) {
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: focused ? palette.sage : palette.teal,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ rotate: "45deg" }],
      }}
    >
      <View style={{ transform: [{ rotate: "-45deg" }] }}>
        <Feather name="plus" size={20} color={palette.ink} />
      </View>
    </View>
  );
}

function LibraryIcon({ color }: TabIconProps) {
  return <Feather name="book-open" size={22} color={color} />;
}

function ProfileIcon({ color, focused }: TabIconProps) {
  return <Noctis variant="head" size={26} color={color} eyeColor={focused ? palette.sage : color} />;
}

function TabLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text variant="caption" weight="semibold" upper color={color} style={{ marginTop: 2, letterSpacing: 1.4 }}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const isWeb = Platform.OS === "web";

  const handleNewVideo = () => {
    router.push("/(tabs)/create" as any);
  };

  if (isWeb) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background as string,
          flexDirection: "row",
        }}
      >
        <WebSidebar onNewVideo={handleNewVideo} />
        <View style={{ flex: 1 }}>
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
        </View>
      </View>
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
          tabBarActiveTintColor: colors.primary as string,
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
              Haptics.selectionAsync().catch(() => {});
            }
          },
        }}
      >
        <Tabs.Screen
          name="feed"
          options={{
            tabBarIcon: (p) => <FeedIcon {...p} />,
            tabBarLabel: ({ color }) => <TabLabel label="Feed" color={color} />,
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
          name="library"
          options={{
            tabBarIcon: (p) => <LibraryIcon {...p} />,
            tabBarLabel: ({ color }) => <TabLabel label="Library" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: (p) => <ProfileIcon {...p} />,
            tabBarLabel: ({ color }) => <TabLabel label="Profile" color={color} />,
          }}
        />
      </Tabs>
    </Container>
  );
}
