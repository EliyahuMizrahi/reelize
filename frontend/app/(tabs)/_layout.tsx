import { WebSidebar } from "@/components/navigation/WebSidebar";
import { useAppTheme } from "@/contexts/ThemeContext";
import { FontAwesome5 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TabsLayout() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const isWeb = Platform.OS === "web";

  const handleNewVideo = () => {
    router.push("/(tabs)/tab1" as any);
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
            <Tabs.Screen name="tab1" />
            <Tabs.Screen name="tab2" />
            <Tabs.Screen name="tab3" />
            <Tabs.Screen name="tab4" />
          </Tabs>
        </View>
      </View>
    );
  }

  const Container = Platform.OS === "android" ? SafeAreaView : View;

  return (
    <Container
      style={{ flex: 1, backgroundColor: colors.background as string }}
      edges={Platform.OS === "android" ? ['top', 'bottom'] : undefined}
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
            height: 90,
            paddingBottom: Platform.OS === "android" ? 0 : 8,
            paddingTop: 8,
          },
          tabBarItemStyle: { height: "100%" },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
            marginTop: 4,
          },
          ...(Platform.OS === "android" && {
            contentStyle: { backgroundColor: colors.background as string },
            animation: "none",
            presentation: "transparentModal",
          }),
        }}
        screenListeners={{
          tabPress: () => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
          },
        }}
      >
        <Tabs.Screen
          name="tab1"
          options={{
            title: "Tab 1",
            tabBarIcon: ({ color }) => (
              <FontAwesome5 name="square" size={24} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="tab2"
          options={{
            title: "Tab 2",
            tabBarIcon: ({ color }) => (
              <FontAwesome5 name="square" size={24} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="tab3"
          options={{
            title: "Tab 3",
            tabBarIcon: ({ color }) => (
              <FontAwesome5 name="square" size={24} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="tab4"
          options={{
            title: "Tab 4",
            tabBarIcon: ({ color }) => (
              <FontAwesome5 name="square" size={24} color={color} />
            ),
          }}
        />
      </Tabs>
    </Container>
  );
}
