import { Platform, useWindowDimensions } from 'react-native';

export const isWeb = Platform.OS === 'web';

export const BREAKPOINTS = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1440,
} as const;
export type Breakpoint = keyof typeof BREAKPOINTS;

export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  const gte = (bp: Breakpoint) => width >= BREAKPOINTS[bp];
  return {
    width,
    height,
    gte,
    // convenience booleans tuned for this app's chrome
    isNarrow: width < BREAKPOINTS.md, // <768 — treat as mobile-web
    isCompact: width < BREAKPOINTS.lg, // <1024 — tablet-web
    isWide: width >= BREAKPOINTS.xl, // ≥1280 — desktop
  };
}

// Style fragments that react-native-web forwards to CSS. RN types don't include
// these, so the helpers return `any` — cast at call site if needed.
export const webStyle = {
  pointer: isWeb ? ({ cursor: 'pointer' } as any) : null,
  text: isWeb ? ({ cursor: 'text' } as any) : null,
  notAllowed: isWeb ? ({ cursor: 'not-allowed' } as any) : null,
  selectNone: isWeb ? ({ userSelect: 'none' } as any) : null,
  focusRing: (color: string, opacity: string = '55') =>
    isWeb
      ? ({
          outlineWidth: 0,
          outlineStyle: 'none',
          // 2px inner + 3px faint outer — mimics Supabase/Linear focus state
          boxShadow: `0 0 0 2px ${color}${opacity}`,
        } as any)
      : null,
  transition: (
    props: string = 'background-color, border-color, transform, box-shadow, opacity',
    ms: number = 140,
  ) =>
    isWeb
      ? ({
          transitionProperty: props,
          transitionDuration: `${ms}ms`,
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        } as any)
      : null,
};

// Turn a react-native-web element into an `<a href>` for proper keyboard,
// middle-click, and screen-reader semantics. Use with Pressable wrapped in a
// View, or pass through to components that forward accessibilityRole.
export function linkProps(href?: string) {
  if (!isWeb || !href) return {};
  return {
    accessibilityRole: 'link' as const,
    href,
  };
}
