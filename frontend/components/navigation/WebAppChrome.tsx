import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Noctis } from "@/components/brand/Noctis";
import { Divider, Surface } from "@/components/ui/Surface";
import { BodySm, Overline, Text } from "@/components/ui/Text";
import { palette, radii, spacing, type as fontType, z } from "@/constants/tokens";
import { useAppTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useClasses, useTopicsForClass } from "@/data/hooks";
import type { ClassWithCounts, TopicWithClipCount } from "@/data/queries";
import { useBreakpoint, webStyle } from "@/lib/web";

// ─────────────────────────  dims  ─────────────────────────
const TOP_BAR_HEIGHT = 48;
const RAIL_COLLAPSED = 56;
const RAIL_EXPANDED = 232;
const HOVER_IN_MS = 140;
const HOVER_OUT_MS = 160;
const CONTENT_MAX_WIDTH = 1400;
const SWITCHER_HEIGHT = 28;
const PILL_RADIUS = radii.sm; // 8

// ─────────────────────────  context  ─────────────────────────
type ChromeCtx = {
  activeShelfId: string | null;
  setActiveShelfId: (id: string | null) => void;
  activeDiscId: string | null;
  setActiveDiscId: (id: string | null) => void;
};
const WebChromeContext = createContext<ChromeCtx | undefined>(undefined);

export function useActiveShelf() {
  const ctx = useContext(WebChromeContext);
  if (!ctx) return { activeShelfId: null, setActiveShelfId: () => {} };
  return {
    activeShelfId: ctx.activeShelfId,
    setActiveShelfId: ctx.setActiveShelfId,
  };
}

export function useActiveDisc() {
  const ctx = useContext(WebChromeContext);
  if (!ctx) return { activeDiscId: null, setActiveDiscId: () => {} };
  return {
    activeDiscId: ctx.activeDiscId,
    setActiveDiscId: ctx.setActiveDiscId,
  };
}

// Backward-compat alias for existing consumers (feed.web, library/index.web etc).
export function useActiveCourse() {
  const ctx = useContext(WebChromeContext);
  if (!ctx) return { activeCourseId: null, setActiveCourseId: () => {} };
  return {
    activeCourseId: ctx.activeShelfId,
    setActiveCourseId: ctx.setActiveShelfId,
  };
}

// ─────────────────────────  rail  ─────────────────────────
type RailItem = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  path: string;
  match: string;
};

const RAIL_ITEMS: RailItem[] = [
  { key: "feed", label: "Home", icon: "home", path: "/(tabs)/feed", match: "feed" },
  { key: "library", label: "Library", icon: "book-open", path: "/(tabs)/library", match: "library" },
  { key: "create", label: "Create", icon: "plus-square", path: "/(tabs)/create", match: "create" },
];

function RailButton({
  item,
  active,
  onPress,
  labelStyle,
}: {
  item: RailItem;
  active: boolean;
  onPress: () => void;
  labelStyle: any;
}) {
  const { colors } = useAppTheme();
  const color = active ? (palette.mist as string) : (colors.mutedText as string);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      // @ts-expect-error — title forwards to HTML title on web for tooltip
      title={item.label}
      style={({ hovered, pressed, focused }: any) => [
        {
          height: 40,
          marginHorizontal: 8,
          marginVertical: 2,
          borderRadius: radii.sm,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: active
            ? (colors.elevated as string)
            : hovered
            ? ((colors.elevated as string) + "AA")
            : "transparent",
          opacity: pressed ? 0.8 : 1,
          position: "relative",
          overflow: "hidden",
        },
        webStyle.pointer,
        webStyle.transition(),
        focused ? webStyle.focusRing(colors.primary as string) : null,
      ]}
    >
      {active ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 2,
            borderRadius: 2,
            backgroundColor: colors.primary as string,
          }}
        />
      ) : null}
      <View
        style={{
          width: RAIL_COLLAPSED - 16,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={item.icon} size={17} color={color} />
      </View>
      <Animated.View style={[{ flex: 1, paddingRight: spacing.md }, labelStyle]}>
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
}

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

  const railStyle = useAnimatedStyle(() => ({ width: width.value }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));

  const isActive = (item: RailItem) => {
    if (item.match === "feed") {
      return pathname.endsWith("/feed") || pathname === "/";
    }
    return pathname.includes(item.match);
  };

  // Active on the dashboard root, but not on the settings sub-route — settings
  // is reached from the cog inside the dashboard, not from the rail.
  const dashboardActive =
    pathname.endsWith("/profile") && !pathname.includes("settings");

  return (
    <Animated.View
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          backgroundColor: colors.card as string,
          borderRightWidth: 1,
          borderRightColor: colors.border as string,
          overflow: "hidden",
          paddingTop: spacing.md,
          paddingBottom: spacing.md,
          zIndex: z.nav - 1,
          flexDirection: "column",
        },
        railStyle,
      ]}
    >
      <View style={{ flex: 1 }}>
        {RAIL_ITEMS.map((item) => (
          <RailButton
            key={item.key}
            item={item}
            active={isActive(item)}
            onPress={() => router.push(item.path as any)}
            labelStyle={labelStyle}
          />
        ))}
      </View>
      <RailButton
        item={{
          key: "dashboard",
          label: "Dashboard",
          icon: "user",
          path: "/(tabs)/profile",
          match: "profile",
        }}
        active={dashboardActive}
        onPress={() => router.push("/(tabs)/profile" as any)}
        labelStyle={labelStyle}
      />
    </Animated.View>
  );
}

// ─────────────────────────  floating menu primitive  ─────────────────────────
function FloatingMenu({
  open,
  onClose,
  anchor,
  width = 280,
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
          radius="md"
          bordered
          style={{
            backgroundColor: colors.card as string,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 14 },
            ...((webStyle.transition("opacity, transform", 120) as any) ?? {}),
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
      style={({ hovered, pressed, focused }: any) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingHorizontal: spacing.md,
          paddingVertical: 9,
          backgroundColor: hovered ? (colors.elevated as string) : "transparent",
          opacity: pressed ? 0.75 : 1,
        },
        webStyle.pointer,
        focused ? webStyle.focusRing(colors.primary as string, "33") : null,
      ]}
    >
      {icon ? (
        <Feather
          name={icon}
          size={13}
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

// ─────────────────────────  switcher primitive  ─────────────────────────
type SwitcherItem = {
  id: string;
  name: string;
  color?: string | null;
  hint?: string;
};

function SwitcherPill({
  colorDot,
  label,
  open,
  onPress,
  disabled,
  placeholder,
}: {
  colorDot?: string | null;
  label: string;
  open: boolean;
  onPress: () => void;
  disabled?: boolean;
  placeholder?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ hovered, pressed, focused }: any) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          height: SWITCHER_HEIGHT,
          paddingLeft: colorDot ? 6 : 10,
          paddingRight: 8,
          borderRadius: PILL_RADIUS,
          borderWidth: 1,
          borderColor: open
            ? (colors.primary as string)
            : (colors.border as string),
          backgroundColor:
            open || hovered
              ? (colors.elevated as string)
              : (colors.card as string),
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        disabled ? webStyle.notAllowed : webStyle.pointer,
        webStyle.transition(),
        focused && !disabled
          ? webStyle.focusRing(colors.primary as string, "44")
          : null,
      ]}
    >
      {colorDot ? (
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 3,
            backgroundColor: colorDot,
          }}
        />
      ) : null}
      <Text
        variant="bodySm"
        weight="medium"
        numberOfLines={1}
        style={{ maxWidth: 180 }}
        color={placeholder ? (colors.mutedText as string) : (colors.text as string)}
      >
        {label}
      </Text>
      <Feather
        name="chevron-down"
        size={11}
        color={colors.mutedText as string}
        style={{
          marginLeft: 2,
          ...((webStyle.transition("transform", 160) as any) ?? {}),
          transform: [{ rotate: open ? "180deg" : "0deg" }],
        }}
      />
    </Pressable>
  );
}

function SwitcherPopover({
  open,
  onClose,
  anchor,
  sectionLabel,
  items,
  activeId,
  onPick,
  onCreate,
  createLabel,
  emptyLabel,
  searchPlaceholder,
}: {
  open: boolean;
  onClose: () => void;
  anchor: { top: number; left?: number; right?: number };
  sectionLabel: string;
  items: SwitcherItem[];
  activeId: string | null;
  onPick: (id: string) => void;
  onCreate?: () => void;
  createLabel?: string;
  emptyLabel: string;
  searchPlaceholder: string;
}) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <FloatingMenu open={open} onClose={onClose} anchor={anchor} width={300}>
      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border as string,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            height: 32,
            paddingHorizontal: 10,
            borderRadius: radii.sm,
            borderWidth: 1,
            borderColor: colors.border as string,
            backgroundColor: colors.inputBackground as string,
          }}
        >
          <Feather name="search" size={12} color={colors.mutedText as string} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.mutedText as string}
            autoFocus
            style={
              {
                flex: 1,
                color: colors.text as string,
                fontFamily: fontType.sansRegular,
                fontSize: 13,
                lineHeight: 18,
                ...((webStyle.selectNone ? {} : {}) as any),
                outlineStyle: "none",
                outlineWidth: 0,
              } as any
            }
          />
        </View>
      </View>

      <ScrollView style={{ maxHeight: 280 }}>
        <View style={{ paddingVertical: 6 }}>
          <Overline
            muted
            style={{ paddingHorizontal: spacing.md, paddingVertical: 6 }}
          >
            {sectionLabel}
          </Overline>

          {filtered.length === 0 ? (
            <View
              style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md }}
            >
              <BodySm muted>{query ? "No matches." : emptyLabel}</BodySm>
            </View>
          ) : (
            filtered.map((it) => (
              <MenuItem
                key={it.id}
                label={it.name}
                hint={it.hint}
                onPress={() => {
                  onPick(it.id);
                  onClose();
                }}
                trailing={
                  activeId === it.id ? (
                    <Feather
                      name="check"
                      size={12}
                      color={colors.primary as string}
                    />
                  ) : it.color ? (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: it.color,
                        opacity: 0.75,
                      }}
                    />
                  ) : null
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      {onCreate ? (
        <>
          <Divider />
          <MenuItem
            label={createLabel ?? "New"}
            icon="plus"
            onPress={() => {
              onCreate();
              onClose();
            }}
          />
        </>
      ) : null}
    </FloatingMenu>
  );
}

// ─────────────────────────  shelf switcher  ─────────────────────────
function ShelfSwitcher() {
  const router = useRouter();
  const { data: classes } = useClasses();
  const { activeShelfId, setActiveShelfId } = useActiveShelf();
  const { setActiveDiscId } = useActiveDisc();
  const [open, setOpen] = useState(false);

  const list = classes ?? [];
  const current = useMemo(
    () => list.find((c) => c.id === activeShelfId) ?? null,
    [list, activeShelfId],
  );

  // Auto-select the first shelf once classes land, so the disc switcher has
  // a scope and the pill isn't stuck on a "no selection" state.
  useEffect(() => {
    if (!activeShelfId && list.length > 0) {
      setActiveShelfId(list[0].id);
    }
  }, [activeShelfId, list, setActiveShelfId]);

  const items: SwitcherItem[] = list.map((c: ClassWithCounts) => ({
    id: c.id,
    name: c.name,
    color: c.color_hex,
    hint: `${c.clip_count} lessons · ${c.topic_count} discs`,
  }));

  const pick = (id: string) => {
    setActiveShelfId(id);
    setActiveDiscId(null); // reset disc when shelf changes
  };

  return (
    <View>
      <SwitcherPill
        colorDot={current?.color_hex ?? palette.sage}
        label={current?.name ?? "No shelves"}
        placeholder={!current}
        open={open}
        onPress={() => setOpen((v) => !v)}
      />
      <SwitcherPopover
        open={open}
        onClose={() => setOpen(false)}
        anchor={{ top: SWITCHER_HEIGHT + 8, left: 0 }}
        sectionLabel="Shelves"
        items={items}
        activeId={activeShelfId}
        onPick={pick}
        onCreate={() => router.push("/(tabs)/library?new=1" as any)}
        createLabel="New shelf"
        emptyLabel="No shelves yet."
        searchPlaceholder="Find a shelf…"
      />
    </View>
  );
}

// ─────────────────────────  disc switcher  ─────────────────────────
function DiscSwitcher() {
  const router = useRouter();
  const { activeShelfId } = useActiveShelf();
  const { activeDiscId, setActiveDiscId } = useActiveDisc();
  const { data: topics } = useTopicsForClass(activeShelfId ?? undefined);
  const [open, setOpen] = useState(false);

  const list = topics ?? [];
  const current = useMemo(
    () => list.find((t) => t.id === activeDiscId) ?? null,
    [list, activeDiscId],
  );

  // Auto-select the first disc in the current shelf so the pill always reflects
  // a real selection (matches mobile's behaviour where a disc is implied).
  useEffect(() => {
    if (activeShelfId && !activeDiscId && list.length > 0) {
      setActiveDiscId(list[0].id);
    }
  }, [activeShelfId, activeDiscId, list, setActiveDiscId]);

  const items: SwitcherItem[] = list.map((t: TopicWithClipCount) => ({
    id: t.id,
    name: t.name,
    color: (t as any).color_hex ?? palette.teal,
    hint: `${t.clip_count} lessons`,
  }));

  if (!activeShelfId) {
    return (
      <SwitcherPill
        label="Pick a shelf"
        open={false}
        onPress={() => {}}
        disabled
        placeholder
      />
    );
  }

  return (
    <View>
      <SwitcherPill
        colorDot={(current as any)?.color_hex ?? palette.teal}
        label={current?.name ?? (list.length === 0 ? "No discs" : "Select a disc")}
        placeholder={!current}
        open={open}
        onPress={() => setOpen((v) => !v)}
      />
      <SwitcherPopover
        open={open}
        onClose={() => setOpen(false)}
        anchor={{ top: SWITCHER_HEIGHT + 8, left: 0 }}
        sectionLabel="Discs"
        items={items}
        activeId={activeDiscId}
        onPick={setActiveDiscId}
        onCreate={() =>
          router.push(
            `/(tabs)/library?shelf=${activeShelfId}&newDisc=1` as any,
          )
        }
        createLabel="New disc"
        emptyLabel="No discs in this shelf yet."
        searchPlaceholder="Find a disc…"
      />
    </View>
  );
}

// ─────────────────────────  path slash separator  ─────────────────────────
function PathSlash() {
  const { colors } = useAppTheme();
  return (
    <Text
      variant="bodySm"
      style={{
        marginHorizontal: 2,
        color: (colors.mutedText as string) + "AA",
        fontSize: 14,
        fontFamily: fontType.sansRegular,
      }}
    >
      /
    </Text>
  );
}

// ─────────────────────────  avatar menu  ─────────────────────────
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
        accessibilityRole="button"
        accessibilityLabel="Account menu"
        style={({ hovered, pressed, focused }: any) => [
          {
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: hovered
              ? (colors.elevated as string)
              : (colors.card as string),
            borderWidth: 1,
            borderColor: colors.border as string,
            opacity: pressed ? 0.85 : 1,
          },
          webStyle.pointer,
          webStyle.transition(),
          focused ? webStyle.focusRing(colors.primary as string, "44") : null,
        ]}
      >
        <Noctis
          variant="head"
          size={18}
          color={colors.text as string}
          eyeColor={colors.primary as string}
        />
      </Pressable>
      <FloatingMenu
        open={open}
        onClose={() => setOpen(false)}
        anchor={{ top: SWITCHER_HEIGHT + 8, right: 0 }}
        width={260}
      >
        <View style={{ paddingVertical: spacing.sm }}>
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
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
            onPress={() => {
              setOpen(false);
              // Fire-and-forget — `logout()` in AuthContext awaits
              // supabase.auth.signOut and then router.replace to /(auth)/sign-up.
              // We don't await here so the menu closes immediately.
              logout().catch((err) => {
                // eslint-disable-next-line no-console
                console.warn('[web] signout failed', err);
              });
            }}
          />
        </View>
      </FloatingMenu>
    </View>
  );
}

// ─────────────────────────  top bar  ─────────────────────────
function TopBar() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const { width } = useBreakpoint();
  const showDisc = width >= 640;

  return (
    <View
      style={{
        height: TOP_BAR_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        backgroundColor: colors.card as string,
        gap: 8,
        zIndex: z.nav,
      }}
    >
      {/* Logo */}
      <Pressable
        onPress={() => router.push("/(tabs)/feed" as any)}
        accessibilityRole="link"
        accessibilityLabel="Reelize home"
        // @ts-expect-error
        title="Home"
        style={({ hovered, focused }: any) => [
          {
            width: 28,
            height: 28,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: hovered
              ? (colors.elevated as string)
              : "transparent",
            marginRight: 4,
          },
          webStyle.pointer,
          webStyle.transition(),
          focused ? webStyle.focusRing(colors.primary as string, "44") : null,
        ]}
      >
        <Noctis
          variant="mark"
          size={20}
          color={isDark ? palette.mist : palette.ink}
          eyeColor={colors.primary as string}
        />
      </Pressable>

      {/* Shelf → disc breadcrumb pills */}
      <ShelfSwitcher />
      {showDisc ? (
        <>
          <PathSlash />
          <DiscSwitcher />
        </>
      ) : null}

      {/* spacer */}
      <View style={{ flex: 1 }} />

      {/* Right cluster */}
      <AvatarMenu />
    </View>
  );
}

// ─────────────────────────  chrome  ─────────────────────────
export const WebAppChrome: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { colors } = useAppTheme();
  const [activeShelfId, setActiveShelfId] = useState<string | null>(null);
  const [activeDiscId, setActiveDiscId] = useState<string | null>(null);
  const ctx = useMemo(
    () => ({ activeShelfId, setActiveShelfId, activeDiscId, setActiveDiscId }),
    [activeShelfId, activeDiscId],
  );

  return (
    <WebChromeContext.Provider value={ctx}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background as string,
        }}
      >
        <TopBar />
        <View style={{ flex: 1, flexDirection: "row", minHeight: 0 }}>
          {/* spacer reserves rail collapsed width — rail itself is absolutely
              positioned and floats over content when hover-expanded */}
          <View style={{ width: RAIL_COLLAPSED }} />
          <View
            style={{
              flex: 1,
              minWidth: 0,
              alignItems: "center",
            }}
          >
            <View
              style={{
                flex: 1,
                width: "100%",
                maxWidth: CONTENT_MAX_WIDTH,
                minHeight: 0,
              }}
            >
              {children}
            </View>
          </View>
          <Rail />
        </View>
      </View>
    </WebChromeContext.Provider>
  );
};

export default WebAppChrome;
