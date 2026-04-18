export const palette = {
  ink: '#04141E',
  inkDeep: '#010A12',
  inkTint: '#0A2B35',
  inkElevated: '#14404C',
  inkBorder: '#1A4852',
  teal: '#44706F',
  tealDeep: '#2C5655',
  tealBright: '#5F9593',
  sage: '#8BBAB1',
  sageSoft: '#A9CFC7',
  mist: '#F5F8F7',
  fog: '#CED9D7',
  fogBorder: '#E3EBE9',
  paper: '#F2EDE4',
  paperDeep: '#E8E0D1',
  alert: '#C95A4B',
  alertSoft: '#E9A49A',
  gold: '#C6A36A',
};

export const shimmer = {
  colors: ['#A9CFC7', '#8BBAB1', '#5F9593', '#44706F', '#8BBAB1'] as const,
  locations: [0, 0.3, 0.55, 0.78, 1] as const,
};

export const type = {
  serif: 'Fraunces_500Medium',
  serifItalic: 'Fraunces_500Medium_Italic',
  serifBook: 'Fraunces_400Regular',
  serifBold: 'Fraunces_700Bold',
  sans: 'Inter_500Medium',
  sansRegular: 'Inter_400Regular',
  sansSemibold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
};

type ScaleDef = { size: number; line: number; letter: number; family: 'serif' | 'sans' | 'mono' };

export const scale = {
  display1: { size: 56, line: 60, letter: -1.4, family: 'serif' },
  display2: { size: 44, line: 48, letter: -1.0, family: 'serif' },
  headline: { size: 34, line: 40, letter: -0.8, family: 'serif' },
  title: { size: 24, line: 30, letter: -0.4, family: 'serif' },
  titleSm: { size: 18, line: 24, letter: -0.2, family: 'serif' },
  bodyLg: { size: 17, line: 26, letter: -0.1, family: 'sans' },
  body: { size: 15, line: 22, letter: -0.05, family: 'sans' },
  bodySm: { size: 13, line: 20, letter: 0, family: 'sans' },
  label: { size: 12, line: 16, letter: 0.3, family: 'sans' },
  caption: { size: 11, line: 14, letter: 0.2, family: 'sans' },
  mono: { size: 12, line: 16, letter: 0, family: 'mono' },
  monoSm: { size: 10, line: 14, letter: 0.4, family: 'mono' },
  overline: { size: 10, line: 12, letter: 2.2, family: 'sans' },
} satisfies Record<string, ScaleDef>;

export type ScaleVariant = keyof typeof scale;

export const spacing = {
  px: 1,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 44,
  '5xl': 60,
  '6xl': 80,
  '7xl': 120,
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  '3xl': 36,
  '4xl': 44,
  pill: 999,
} as const;

export const motion = {
  dur: {
    instant: 120,
    fast: 200,
    normal: 320,
    slow: 560,
    deliberate: 900,
    cinema: 1400,
    epic: 2400,
  },
  ease: {
    standard: [0.22, 1, 0.36, 1] as [number, number, number, number],
    entrance: [0.16, 1, 0.3, 1] as [number, number, number, number],
    exit: [0.7, 0, 0.84, 0] as [number, number, number, number],
    swift: [0.4, 0, 0.2, 1] as [number, number, number, number],
    linear: [0, 0, 1, 1] as [number, number, number, number],
  },
};

export const z = {
  base: 0,
  raised: 1,
  sticky: 10,
  nav: 20,
  overlay: 40,
  modal: 50,
  toast: 60,
} as const;

export const layout = {
  maxContent: 1120,
  maxArticle: 680,
  sidebarWidth: 260,
  sidebarCollapsed: 72,
  tabBarHeight: 86,
  reelWidth: 9,
  reelHeight: 16,
} as const;
