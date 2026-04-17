import { useAppTheme } from "@/contexts/ThemeContext";
import React from "react";
import { Text, View } from "react-native";

export default function Tab4Screen() {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background as string, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.text as string, fontSize: 20, fontWeight: "600" }}>Tab 4</Text>
    </View>
  );
}
