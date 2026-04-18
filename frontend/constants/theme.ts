

import { Platform } from 'react-native';

const tintColorLight = '#44706F';
const tintColorDark = '#8BBAB1';

export const Colors = {
  light: {
    text: '#04141E',
    background: '#F5F8F7',
    tint: tintColorLight,
    icon: '#44706F',
    tabIconDefault: '#8BBAB1',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#CED9D7',
    background: '#04141E',
    tint: tintColorDark,
    icon: '#8BBAB1',
    tabIconDefault: '#44706F',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {

    sans: 'system-ui',

    serif: 'ui-serif',

    rounded: 'ui-rounded',

    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
