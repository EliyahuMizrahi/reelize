import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Noctis } from "@/components/brand/Noctis";
import { Surface, Divider } from "@/components/ui/Surface";
import { Text, Overline, BodySm } from "@/components/ui/Text";
import { palette, radii, spacing, z } from "@/constants/tokens";
import { useAppTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useClasses } from "@/data/hooks";
import type { ClassWithCounts } from "@/data/queries";

const TOP_BAR_HEIGHT = 52;
const RAIL_COLLAPSED = 64;
const RAIL_EXPANDED = 232;
const HOVER_IN_MS = 140;
const HOVER_OUT_MS = 160;

// ───────────────────────── Course context ─────────────────────────
type CourseCtx = {
  activeCourseId: string | null;
  setActiveCourseId: (id: string | null) => void;
};
const WebCourseContext = createContext<CourseCtx | undefined>(undefined);

export function useActiveCourse(): CourseCtx {
  const ctx = useContext(WebCourseContext);
  if (!ctx)
    return { activeCourseId: null, setActiveCourseId: () => {} };
  return ctx;
}

// ───────────────────────── Rail items ─────────────────────────
type RailIcon = "home" | "book-open" | "plus-square";
type RailItem = {
  key: string;
  label: string;
  icon: RailIcon;
  path: string;
  match: string;
};

const RAIL_ITEMS: RailItem[] = [
  { key: "feed", label: "Home", icon: "home", path: "/(tabs)/feed", match: "feed" },
  { key: "library", label: "Library", icon: "book-open", path: "/(tabs)/library", match: "library" },
  { key: "create", label: "Create", icon: "plus-square", path: "/(tabs)/create", match: "create" },
];

// ───────────────────────── Floating menu primitive ─────────────────────────
function FloatingMenu({
  open,
  onClose,
  anchor,
  width = 260,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchor: { top: number; left?: number; right?: number };
  width?: number;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  if (!open) return null;
  return (
    <>
      <Pressable
        onPress={onClose}
        style={
          {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: z.overlay,
          } as any
        }
      />
      <View
        style={{
          position: "absolute",
          top: anchor.top,
          left: anchor.left,
          right: anchor.right,
          width,
          zIndex: z.overlay + 1,
        }}
      >
        <Surface
          padded={0}
          radius="lg"
          bordered
          style={{
            backgroundColor: colors.card as string,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
          }}
        >
          {children}
        </Surface>
      </View>
    </>
  );
}

function MenuItem({
  label,
  hint,
  icon,
  onPress,
  danger,
  trailing,
}: {
  label: string;
  hint?: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }: any) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        backgroundColor: hovered ? (colors.elevated as string) : "transparent",
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {icon ? (
        <Feather
          name={icon}
          size={14}
          color={danger ? palette.alert : (colors.mutedText as string)}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          variant="bodySm"
          weight="medium"
          color={danger ? palette.alert : (colors.text as string)}
        >
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

// ───────────────────────── Course switcher ─────────────────────────
function CourseSwitcher() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { data: classes } = useClasses();
  const { activeCourseId, setActiveCourseId } = useActiveCourse();
  const [open, setOpen] = useState(false);
  const list = classes ?? [];
  const current = useMemo(
    () => list.find((c) => c.id === activeCourseId) ?? null,
    [list, activeCourseId],
  );

  const pick = (c: ClassWithCounts | null) => {
    setActiveCourseId(c?.id ?? null);
    setOpen(false);
    router.push("/(tabs)/library" as any);
  };

  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ hovered }: any) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          height: 32,
          paddingHorizontal: spacing.md,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: colors.border as string,
          backgroundColor: hovered
            ? (colors.elevated as string)
            : (colors.card as string),
        })}
      >
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            backgroundColor: current?.color_hex ?? (palette.teal as string),
          }}
        />
        <Text variant="bodySm" weight="medium">
          {current?.name ?? "All courses"}
        </Text>
        <Feather
          name="chevron-down"
          size={12}
          color={colors.mutedText as string}
          style={{ marginLeft: spacing.xs }}
        />
      </Pressable>
      <FloatingMenu
        open={open}
        onClose={() => setOpen(false)}
        anchor={{ top: 40, left: 0 }}
        width={280}
      >
        <View style={{ paddingVertical: spacing.sm }}>
          <Overline
            muted
            style={{ paddingHorizontal: spacing.lg, paddingVertical: 6 }}
          >
            Courses
          </Overline>
          <MenuItem
            label="All courses"
            onPress={() => pick(null)}
            trailing={
              !current ? (
                <Feather
                  name="check"
                  size={12}
                  color={colors.primary as string}
                />
              ) : null
            }
          />
          <Divider />
          {list.length === 0 ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
              <BodySm muted>No courses yet.</BodySm>
            </View>
          ) : (
            list.map((c) => (
              <MenuItem
                key={c.id}
                label={c.name}
                hint={`${c.clip_count} lessons`}
                onPress={() => pick(c)}
                trailing={
                  current?.id === c.id ? (
                    <Feather
                      name="check"
                      size={12}
                      color={colors.primary as string}
                    />
                  ) : (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: c.color_hex,
                        opacity: 0.7,
                      }}
                    />
                  )
                }
              />
            ))
          )}
          <Divider />
          <MenuItem
            label="New course"
            icon="plus"
            onPress={() => {
              setOpen(false);
              router.push("/(tabs)/library?new=1" as any);
            }}
          />
        </View>
      </FloatingMenu>
    </View>
  );
}

// ───────────────────────── Avatar menu ─────────────────────────
function AvatarMenu() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { profile, user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const displayName = profile?.display_name ?? profile?.username ?? "You";
  const email = user?.email ?? "";

  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ hovered }: any) => ({
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: hovered
            ? (colors.elevated as string)
            : (colors.card as string),
          borderWidth: 1,
          borderColor: colors.border as string,
        })}
      >
        <Noctis
          variant="head"
          size={20}
          color={colors.text as string}
          eyeColor={colors.primary as string}
        />
      </Pressable>
      <FloatingMenu
        open={open}
        onClose={() => setOpen(false)}
        anchor={{ top: 40, right: 0 }}
        width={260}
      >
        <View style={{ paddingVertical: spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
            <Text variant="bodySm" weight="semibold">
              {displayName}
            </Text>
            {email ? (
              <Text variant="caption" muted>
                {email}
              </Text>
            ) : null}
          </View>
          <Divider />
          <MenuItem
            label="Profile"
            icon="user"
            onPress={() => {
              setOpen(false);
              router.push("/(tabs)/profile" as any);
            }}
          />
          <MenuItem
            label="Settings"
            icon="settings"
            onPress={() => {
              setOpen(false);
              router.push("/profile/settings" as any);
            }}
          />
          <Divider />
          <MenuItem
            label="Sign out"
            icon="log-out"
            danger
            onPress={async () => {
              setOpen(false);
              await logout();
            }}
          />
        </View>
      </FloatingMenu>
    </View>
  );
}

// ───────────────────────── Top bar ─────────────────────────
function TopBar({ onNewLesson }: { onNewLesson: () => void }) {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < 920;
  return (
    <View
      style={{
        height: TOP_BAR_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        backgroundColor: colors.card as string,
        gap: spacing.md,
        zIndex: z.nav,
      }}
    >
      <Pressable
        onPress={() => router.push("/(tabs)/feed" as any)}
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <Noctis
          variant="mark"
          size={22}
          color={isDark ? palette.mist : palette.ink}
          eyeColor={palette.sage}
        />
        {!compact ? (
          <Text variant="body" family="serif" weight="bold">
            Reelize
          </Text>
        ) : null}
      </Pressable>

      <View style={{ width: 1, height: 20, backgroundColor: colors.border as string, marginHorizontal: spacing.sm }} />

      <CourseSwitcher />

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={onNewLesson}
        style={({ hovered, pressed }: any) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          height: 32,
          paddingHorizontal: 12,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: colors.border as string,
          backgroundColor: pressed
            ? (colors.elevated as string)
            : hovered
            ? (colors.elevated as string)
            : (colors.inputBackground as string),
        })}
      >
        <Feather name="plus" size={13} color={colors.text as string} />
        <Text variant="bodySm" weight="medium" color={colors.text as string}>
          New lesson
        </Text>
      </Pressable>

      <AvatarMenu />
    </View>
  );
}

// ───────────────────────── Rail ─────────────────────────
function Rail() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const width = useSharedValue(RAIL_COLLAPSED);
  const labelOpacity = useSharedValue(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (hovered) {
      width.value = withTiming(RAIL_EXPANDED, { duration: HOVER_IN_MS });
      hoverTimer.current = setTimeout(() => {
        labelOpacity.value = withTiming(1, { duration: 120 });
      }, 60);
    } else {
      labelOpacity.value = withTiming(0, { duration: 80 });
      width.value = withTiming(RAIL_COLLAPSED, { duration: HOVER_OUT_MS });
    }
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, [hovered, width, labelOpacity]);

  const railAnimatedStyle = useAnimatedStyle(() => ({ width: width.value }));
  const labelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
  }));

  const isActive = (item: RailItem) => {
    if (item.match === "feed") {
      return pathname.endsWith("/feed") || pathname === "/";
    }
    return pathname.includes(item.match);
  };

  const settingsActive = pathname.includes("settings");

  return (
    <Animated.View
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={[
        {
          position: "absolute",
          top: TOP_BAR_HEIGHT,
          left: 0,
          bottom: 0,
          backgroundColor: colors.card as string,
          borderRightWidth: 1,
          borderRightColor: colors.border as string,
          overflow: "hidden",
          paddingVertical: spacing.md,
          zIndex: z.nav - 1,
          flexDirection: "column",
        },
        railAnimatedStyle,
      ]}
    >
      <View style={{ flex: 1 }}>
        {RAIL_ITEMS.map((item) => {
          const active = isActive(item);
          const color = active
            ? (colors.primary as string)
            : (colors.mutedText as string);
          return (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.path as any)}
              style={({ hovered: h, pressed }: any) => ({
                height: 40,
                marginHorizontal: 10,
                marginVertical: 2,
                borderRadius: radii.sm,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: active
                  ? (colors.primary as string) + "1A"
                  : h
                  ? (colors.elevated as string)
                  : "transparent",
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View style={{ width: RAIL_COLLAPSED - 20, alignItems: "center" }}>
                <Feather name={item.icon as any} size={18} color={color} />
              </View>
              <Animated.View style={[{ flex: 1 }, labelAnimatedStyle]}>
                <Text
                  variant="bodySm"
                  weight={active ? "semibold" : "medium"}
                  color={color}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => router.push("/profile/settings" as any)}
        style={({ hovered: h, pressed }: any) => ({
          height: 40,
          marginHorizontal: 10,
          marginVertical: 2,
          borderRadius: radii.sm,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: settingsActive
            ? (colors.primary as string) + "1A"
            : h
            ? (colors.elevated as string)
            : "transparent",
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <View style={{ width: RAIL_COLLAPSED - 20, alignItems: "center" }}>
          <Feather
            name="settings"
            size={18}
            color={
              settingsActive
                ? (colors.primary as string)
                : (colors.mutedText as string)
            }
          />
        </View>
        <Animated.View style={[{ flex: 1 }, labelAnimatedStyle]}>
          <Text
            variant="bodySm"
            weight={settingsActive ? "semibold" : "medium"}
            color={
              settingsActive
                ? (colors.primary as string)
                : (colors.mutedText as string)
            }
          >
            Settings
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────── Chrome ─────────────────────────
export const WebAppChrome: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const ctx = useMemo(
    () => ({ activeCourseId, setActiveCourseId }),
    [activeCourseId],
  );

  const onNewLesson = useCallback(() => {
    router.push("/(tabs)/create" as any);
  }, [router]);

  return (
    <WebCourseContext.Provider value={ctx}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background as string,
        }}
      >
        <TopBar onNewLesson={onNewLesson} />
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ width: RAIL_COLLAPSED }} />
          <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        </View>
        <Rail />
      </View>
    </WebCourseContext.Provider>
  );
};
