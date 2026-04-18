import { PALETTES, PaletteName, useAppTheme } from "@/contexts/ThemeContext";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

export default function Tab4Screen() {
  const { colors, isDark, toggleTheme, palette, setPalette } = useAppTheme();

  const Section: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ color: colors.mutedText as string, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 12, textTransform: "uppercase" }}>
        {title}
      </Text>
      {children}
    </View>
  );

  const Swatch: React.FC<{ name: string; value: string; onValue?: string }> = ({ name, value, onValue }) => (
    <View style={{ flex: 1, minWidth: 140 }}>
      <View style={{ height: 60, borderRadius: 10, backgroundColor: value, borderWidth: 1, borderColor: colors.border as string, justifyContent: "center", alignItems: "center", marginBottom: 6 }}>
        {onValue && <Text style={{ color: onValue, fontWeight: "700", fontSize: 13 }}>Aa</Text>}
      </View>
      <Text style={{ color: colors.text as string, fontSize: 13, fontWeight: "600" }}>{name}</Text>
      <Text style={{ color: colors.mutedText as string, fontSize: 11, fontFamily: "monospace" }}>{value.toUpperCase()}</Text>
    </View>
  );

  const Badge: React.FC<{ label: string; bg: string; fg: string }> = ({ label, bg, fg }) => (
    <View style={{ backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
      <Text style={{ color: fg, fontWeight: "700", fontSize: 12, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background as string }}
      contentContainerStyle={{ padding: 24, paddingBottom: 80 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text as string, fontSize: 28, fontWeight: "800" }}>Theme Preview</Text>
          <Text style={{ color: colors.mutedText as string, fontSize: 14, marginTop: 4 }}>
            {isDark ? "Dark" : "Light"} · {PALETTES[palette].label} — {PALETTES[palette].description}
          </Text>
        </View>
        <Pressable
          onPress={toggleTheme}
          style={({ pressed }) => ({
            backgroundColor: colors.elevated as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 10,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors.text as string, fontWeight: "600" }}>
            {isDark ? "Light" : "Dark"}
          </Text>
        </Pressable>
      </View>

      <Section title="Palette">
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          {(Object.keys(PALETTES) as PaletteName[]).map((name) => {
            const p = PALETTES[name];
            const selected = palette === name;
            return (
              <Pressable
                key={name}
                onPress={() => setPalette(name)}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: colors.card as string,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? (colors.primary as string) : (colors.border as string),
                  borderRadius: 12,
                  padding: 12,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flexDirection: "row", height: 24, borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
                  {p.swatches.map((sw) => (
                    <View key={sw} style={{ flex: 1, backgroundColor: sw }} />
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.text as string, fontWeight: "700", fontSize: 14 }}>{p.label}</Text>
                  {selected && (
                    <View style={{ backgroundColor: colors.primary as string, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                      <Text style={{ color: colors.onPrimary as string, fontSize: 10, fontWeight: "700" }}>ACTIVE</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: colors.mutedText as string, fontSize: 11, marginTop: 3 }}>{p.description}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Side-by-side (Dark)">
        <View style={{ flexDirection: "row", gap: 12 }}>
          {(Object.keys(PALETTES) as PaletteName[]).map((name) => {
            const p = PALETTES[name];
            const d = p.dark;
            return (
              <View key={name} style={{ flex: 1, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border as string }}>
                <View style={{ backgroundColor: d.background, padding: 14 }}>
                  <Text style={{ color: d.mutedText, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
                    {p.label.toUpperCase()}
                  </Text>
                  <Text style={{ color: d.text, fontSize: 18, fontWeight: "700", marginTop: 4 }}>Heading</Text>
                  <Text style={{ color: d.mutedText, fontSize: 12, marginTop: 2 }}>Subtitle muted</Text>
                  <View style={{ backgroundColor: d.card, borderRadius: 8, padding: 10, marginTop: 10, borderWidth: 1, borderColor: d.border }}>
                    <Text style={{ color: d.text, fontSize: 12 }}>Card surface</Text>
                  </View>
                  <View style={{ backgroundColor: d.primary, paddingVertical: 10, borderRadius: 8, marginTop: 10, alignItems: "center" }}>
                    <Text style={{ color: d.onPrimary, fontWeight: "700", fontSize: 12 }}>Primary CTA</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </Section>

      <Section title="Surfaces">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Swatch name="background" value={colors.background as string} onValue={colors.text as string} />
          <Swatch name="card" value={colors.card as string} onValue={colors.text as string} />
          <Swatch name="elevated" value={colors.elevated as string} onValue={colors.text as string} />
          <Swatch name="inputBackground" value={colors.inputBackground as string} onValue={colors.text as string} />
        </View>
      </Section>

      <Section title="Accents">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Swatch name="primary" value={colors.primary as string} onValue={colors.onPrimary as string} />
          <Swatch name="secondary" value={colors.secondary as string} onValue="#FFFFFF" />
          <Swatch name="border" value={colors.border as string} />
          <Swatch name="mutedText" value={colors.mutedText as string} onValue={colors.background as string} />
        </View>
      </Section>

      <Section title="Semantic">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <Badge label="SUCCESS" bg={(colors.success as string) + "2A"} fg={colors.success as string} />
          <Badge label="WARNING" bg={(colors.warning as string) + "2A"} fg={colors.warning as string} />
          <Badge label="DANGER" bg={(colors.danger as string) + "2A"} fg={colors.danger as string} />
          <Badge label="INFO" bg={(colors.info as string) + "2A"} fg={colors.info as string} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Swatch name="success" value={colors.success as string} onValue={colors.onPrimary as string} />
          <Swatch name="warning" value={colors.warning as string} onValue={colors.onPrimary as string} />
          <Swatch name="danger" value={colors.danger as string} onValue="#FFFFFF" />
          <Swatch name="info" value={colors.info as string} onValue="#FFFFFF" />
        </View>
      </Section>

      <Section title="Typography">
        <View style={{ backgroundColor: colors.card as string, padding: 20, borderRadius: 14, borderWidth: 1, borderColor: colors.border as string }}>
          <Text style={{ color: colors.text as string, fontSize: 28, fontWeight: "800", marginBottom: 6 }}>Heading</Text>
          <Text style={{ color: colors.text as string, fontSize: 16, marginBottom: 10 }}>
            Body text sits comfortably on the card surface with balanced contrast.
          </Text>
          <Text style={{ color: colors.mutedText as string, fontSize: 13 }}>
            Muted supporting copy — captions, metadata, hints.
          </Text>
          <Text style={{ color: colors.primary as string, fontSize: 14, fontWeight: "700", marginTop: 10 }}>
            Primary accent link
          </Text>
        </View>
      </Section>

      <Section title="Buttons">
        <View style={{ gap: 12 }}>
          <Pressable style={{ backgroundColor: colors.primary as string, padding: 14, borderRadius: 10, alignItems: "center" }}>
            <Text style={{ color: colors.onPrimary as string, fontWeight: "700", fontSize: 15 }}>Primary Action</Text>
          </Pressable>
          <Pressable style={{ backgroundColor: colors.secondary as string, padding: 14, borderRadius: 10, alignItems: "center" }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>Secondary Action</Text>
          </Pressable>
          <Pressable style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.primary as string, padding: 14, borderRadius: 10, alignItems: "center" }}>
            <Text style={{ color: colors.primary as string, fontWeight: "700", fontSize: 15 }}>Outline</Text>
          </Pressable>
          <Pressable style={{ backgroundColor: "transparent", padding: 14, borderRadius: 10, alignItems: "center" }}>
            <Text style={{ color: colors.primary as string, fontWeight: "700", fontSize: 15 }}>Ghost</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Input">
        <View style={{ backgroundColor: colors.inputBackground as string, borderWidth: 1, borderColor: colors.border as string, borderRadius: 10, padding: 14 }}>
          <Text style={{ color: colors.mutedText as string, fontSize: 12, marginBottom: 4 }}>Email</Text>
          <Text style={{ color: colors.text as string, fontSize: 15 }}>you@example.com</Text>
        </View>
      </Section>

      <Section title="Hero">
        <View style={{ height: 140, borderRadius: 14, overflow: "hidden", position: "relative" }}>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.card as string }} />
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 70, backgroundColor: (colors.primary as string) + "30" }} />
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: 20, justifyContent: "flex-end" }}>
            <Text style={{ color: colors.text as string, fontSize: 20, fontWeight: "700" }}>Ready to create?</Text>
            <Text style={{ color: colors.mutedText as string, fontSize: 13, marginTop: 2 }}>
              Sage-on-navy sets a calm, premium tone.
            </Text>
          </View>
        </View>
      </Section>
    </ScrollView>
  );
}
