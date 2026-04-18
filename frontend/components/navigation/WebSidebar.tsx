import { useAppTheme } from "@/contexts/ThemeContext";
import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { NoctisLockup, Noctis } from "@/components/brand/Noctis";
import { palette, radii } from "@/constants/tokens";
import { Text, Overline } from "@/components/ui/Text";

type WebSidebarProps = {
  onNewVideo: () => void;
};

type NavIcon = 'film' | 'plus' | 'book-open' | 'user' | 'settings';
type NavItem = {
  name: string;
  label: string;
  icon: NavIcon;
  path: string;
  group?: string;
};

const navItems: NavItem[] = [
  { name: "feed", label: "Feed", icon: "film", path: "/(tabs)/feed", group: "Study" },
  { name: "library", label: "Library", icon: "book-open", path: "/(tabs)/library", group: "Study" },
  { name: "create", label: "Create", icon: "plus", path: "/(tabs)/create", group: "Make" },
  { name: "profile", label: "Profile", icon: "user", path: "/(tabs)/profile", group: "You" },
];

export const WebSidebar: React.FC<WebSidebarProps> = ({ onNewVideo }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { colors, isDark } = useAppTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const width = useSharedValue(260);
  const textOpacity = useSharedValue(1);

  const isActive = (item: NavItem) => pathname.includes(item.name);

  const toggleSidebar = () => {
    const next = !isCollapsed;
    if (next) {
      textOpacity.value = withTiming(0, { duration: 120 });
      width.value = withTiming(74, { duration: 260 });
    } else {
      width.value = withTiming(260, { duration: 260 });
      setTimeout(() => {
        textOpacity.value = withTiming(1, { duration: 220 });
      }, 120);
    }
    setIsCollapsed(next);
  };

  const animatedSidebarStyle = useAnimatedStyle(() => ({ width: width.value }));
  const animatedTextStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const groups: Record<string, NavItem[]> = {};
  navItems.forEach((n) => {
    const g = n.group || "General";
    groups[g] = groups[g] || [];
    groups[g].push(n);
  });

  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.card as string,
          borderRightWidth: 1,
          borderRightColor: colors.border as string,
          paddingTop: 20,
          paddingBottom: 20,
          overflow: "hidden",
          height: "100%",
        },
        animatedSidebarStyle,
      ]}
    >
      <View style={{ paddingHorizontal: 18, flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <Pressable
            onPress={() => router.push("/(tabs)/feed" as any)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <Noctis variant="mark" size={28} color={isDark ? palette.mist : palette.ink} eyeColor={palette.sage} />
            <Animated.View style={animatedTextStyle}>
              {!isCollapsed ? (
                <Text variant="bodyLg" family="serif" weight="bold">
                  Reelize
                </Text>
              ) : null}
            </Animated.View>
          </Pressable>
          <Pressable onPress={toggleSidebar} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 0.9, padding: 4 })}>
            <Feather name={isCollapsed ? "chevron-right" : "chevron-left"} size={16} color={colors.mutedText as string} />
          </Pressable>
        </View>

        <Pressable
          onPress={onNewVideo}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.primary as string,
            borderRadius: radii.md,
            height: 40,
            paddingHorizontal: 10,
            opacity: pressed ? 0.88 : 1,
            marginBottom: 28,
            gap: 10,
          })}
        >
          <View
            style={{
              width: 22,
              height: 22,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="plus" size={16} color={isDark ? palette.ink : palette.mist} />
          </View>
          <Animated.View style={animatedTextStyle}>
            {!isCollapsed ? (
              <Text variant="bodySm" weight="semibold" color={isDark ? palette.ink : palette.mist}>
                New lesson
              </Text>
            ) : null}
          </Animated.View>
          <View style={{ flex: 1 }} />
          {!isCollapsed ? (
            <Animated.View style={animatedTextStyle}>
              <View style={{
                paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                backgroundColor: 'rgba(0,0,0,0.12)',
              }}>
                <Text variant="monoSm" family="mono" color={isDark ? palette.ink : palette.mist}>
                  ⌘ N
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </Pressable>

        {Object.entries(groups).map(([group, items]) => (
          <View key={group} style={{ marginBottom: 20 }}>
            {!isCollapsed ? (
              <Animated.View style={animatedTextStyle}>
                <Overline muted style={{ marginBottom: 8, paddingHorizontal: 4 }}>
                  {group}
                </Overline>
              </Animated.View>
            ) : null}
            {items.map((item) => {
              const active = isActive(item);
              const color = active ? (colors.primary as string) : (colors.mutedText as string);
              const bg = active ? (colors.primary as string) + "1A" : "transparent";
              return (
                <Pressable
                  key={item.name}
                  onPress={() => router.push(item.path as any)}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: bg || (hovered ? (colors.elevated as string) : "transparent"),
                    borderRadius: radii.sm,
                    height: 36,
                    paddingHorizontal: 6,
                    marginBottom: 2,
                    opacity: pressed ? 0.7 : 1,
                    gap: 10,
                  })}
                >
                  {active ? (
                    <View
                      style={{
                        position: "absolute",
                        left: -18,
                        top: 8,
                        bottom: 8,
                        width: 3,
                        borderRadius: 2,
                        backgroundColor: colors.primary as string,
                      }}
                    />
                  ) : null}
                  <View style={{ width: 22, alignItems: "center" }}>
                    <Feather name={item.icon as any} size={16} color={color} />
                  </View>
                  <Animated.View style={[{ flex: 1 }, animatedTextStyle]}>
                    {!isCollapsed ? (
                      <Text variant="bodySm" weight={active ? "semibold" : "medium"} color={color}>
                        {item.label}
                      </Text>
                    ) : null}
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => router.push("/profile/settings" as any)}
          style={({ pressed, hovered }: any) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 6,
            height: 36,
            borderRadius: radii.sm,
            backgroundColor: hovered ? (colors.elevated as string) : "transparent",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="settings" size={16} color={colors.mutedText as string} />
          <Animated.View style={animatedTextStyle}>
            {!isCollapsed ? (
              <Text variant="bodySm" muted>Settings</Text>
            ) : null}
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
};
