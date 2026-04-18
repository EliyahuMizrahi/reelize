import { useAppTheme } from "@/contexts/ThemeContext";
import { FontAwesome5 } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type WebSidebarProps = {
  onNewVideo: () => void;
};

export const WebSidebar: React.FC<WebSidebarProps> = ({ onNewVideo }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useAppTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);

  const width = useSharedValue(260);
  const buttonWidth = useSharedValue(228);
  const textWidth = useSharedValue(150);
  const textOpacity = useSharedValue(1);
  const textTranslate = useSharedValue(0);
  const hamburgerOpacity = useSharedValue(1);

  const navItems = [
    { name: "tab1", label: "Tab 1", icon: "square" },
    { name: "tab2", label: "Tab 2", icon: "square" },
    { name: "tab3", label: "Tab 3", icon: "square" },
    { name: "tab4", label: "Tab 4", icon: "square" },
  ];

  const isActive = (tabName: string) => pathname.includes(tabName);

  const toggleSidebar = () => {
    if (isCollapsed) {
      textTranslate.value = -20;
      textOpacity.value = 0;
      width.value = withTiming(260, { duration: 300 });
      buttonWidth.value = withTiming(228, { duration: 300 });
      textWidth.value = withTiming(150, { duration: 300 });
      hamburgerOpacity.value = withTiming(1, { duration: 200 });
      setTimeout(() => {
        textOpacity.value = withTiming(1, { duration: 200 });
        textTranslate.value = withTiming(0, { duration: 250 });
      }, 100);
    } else {
      textOpacity.value = withTiming(0, { duration: 150 });
      textTranslate.value = withTiming(-20, { duration: 250 });
      textWidth.value = withTiming(0, { duration: 300 });
      buttonWidth.value = withTiming(38, { duration: 300 });
      width.value = withTiming(70, { duration: 300 });
      hamburgerOpacity.value = withTiming(0, { duration: 150 });
    }
    setIsCollapsed(!isCollapsed);
  };

  const animatedSidebarStyle = useAnimatedStyle(() => ({
    width: width.value,
  }));

  const animatedButtonStyle = useAnimatedStyle(() => ({
    width: buttonWidth.value,
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    width: textWidth.value,
    opacity: textOpacity.value,
    transform: [{ translateX: textTranslate.value }],
    marginLeft: textWidth.value < 16 ? 0 : 12,
  }));

  const animatedHamburgerStyle = useAnimatedStyle(() => ({
    opacity: hamburgerOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.card as string,
          borderRightWidth: 1,
          borderRightColor: colors.border as string,
          paddingVertical: 20,
          overflow: "hidden",
        },
        animatedSidebarStyle,
      ]}
    >
      <View style={{ paddingHorizontal: 16, width: "100%", flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Pressable
            onPress={isCollapsed ? toggleSidebar : undefined}
            onHoverIn={() => isCollapsed && setIsLogoHovered(true)}
            onHoverOut={() => setIsLogoHovered(false)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              height: 38,
              position: "relative",
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.mutedText as string,
                backgroundColor: colors.elevated as string,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.mutedText as string, fontSize: 7, fontWeight: "600" }}>
                32×32
              </Text>
            </View>
            {isCollapsed && isLogoHovered && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 32,
                  height: 32,
                  backgroundColor: colors.card as string,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 8,
                }}
              >
                <FontAwesome5
                  name="bars"
                  size={18}
                  color={colors.mutedText as string}
                />
              </View>
            )}
          </Pressable>
          <Animated.View style={animatedHamburgerStyle}>
            <Pressable
              onPress={toggleSidebar}
              style={({ pressed }) => ({
                padding: 8,
                paddingRight: 4,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <FontAwesome5
                name="bars"
                size={18}
                color={colors.mutedText as string}
              />
            </Pressable>
          </Animated.View>
        </View>

        <View
          style={{
            marginBottom: 24,
            overflow: "hidden",
          }}
        >
          <Animated.View style={animatedButtonStyle}>
            <Pressable
              onPress={onNewVideo}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.primary as string,
                borderRadius: 8,
                height: 38,
                opacity: pressed ? 0.8 : 1,
                overflow: "hidden",
              })}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <FontAwesome5 name="plus" size={18} color={colors.onPrimary as string} />
              </View>
              <Animated.View
                style={[
                  { overflow: "hidden", justifyContent: "center" },
                  animatedTextStyle,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.onPrimary as string,
                    fontSize: 15,
                    fontWeight: "600",
                    paddingRight: 16,
                  }}
                >
                  New Video
                </Text>
              </Animated.View>
            </Pressable>
          </Animated.View>
        </View>

        <View style={{ marginBottom: 24 }}>
          {navItems.map((item) => {
            const active = isActive(item.name);
            const color = active
              ? (colors.primary as string)
              : (colors.mutedText as string);
            const bgColor = active
              ? (colors.primary as string) + "2A"
              : "transparent";

            return (
              <View key={item.name} style={{ marginBottom: 8 }}>
                <Animated.View style={animatedButtonStyle}>
                  <Pressable
                    onPress={() => {
                      router.push(`/(tabs)/${item.name}` as any);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: bgColor,
                      borderRadius: 8,
                      height: 38,
                      opacity: pressed ? 0.7 : 1,
                      overflow: "hidden",
                      position: "relative",
                    })}
                  >
                    {active && (
                      <View
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 8,
                          bottom: 8,
                          width: 3,
                          borderRadius: 2,
                          backgroundColor: colors.primary as string,
                        }}
                      />
                    )}
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <FontAwesome5
                        name={item.icon as any}
                        size={18}
                        color={color}
                      />
                    </View>
                    <Animated.View
                      style={[
                        { overflow: "hidden", justifyContent: "center" },
                        animatedTextStyle,
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          color: color,
                          fontSize: 15,
                          fontWeight: active ? "700" : "500",
                          paddingRight: 16,
                        }}
                      >
                        {item.label}
                      </Text>
                    </Animated.View>
                  </Pressable>
                </Animated.View>
              </View>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
};
