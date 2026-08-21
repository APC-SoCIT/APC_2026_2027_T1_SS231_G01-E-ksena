

import { Platform } from 'react-native';

export const BRAND_RED = '#A32A22';
export const BRAND_RED_HOVER = '#841F19';
export const BRAND_RED_SUBTLE = '#F5E9E8';
export const WHITE = '#ffffff';
export const OFF_WHITE = '#F6F7F8';
export const BORDER = '#DFE2E6';
export const TEXT_PRIMARY = '#1C2126';
export const TEXT_SECONDARY = '#5B6470';

export const SUCCESS = '#1E7A46';
export const SUCCESS_BG = '#E7F3EC';
export const DANGER = BRAND_RED;
export const DANGER_BG = '#F7EAE9';
export const DANGER_BORDER = '#DFB6B3';

export const Colors = {
  light: {
    text: TEXT_PRIMARY,
    textSecondary: TEXT_SECONDARY,
    background: WHITE,
    backgroundAlt: OFF_WHITE,
    tint: BRAND_RED,
    border: BORDER,
    icon: TEXT_SECONDARY,
    tabIconDefault: TEXT_SECONDARY,
    tabIconSelected: BRAND_RED,
    button: BRAND_RED,
    buttonHover: BRAND_RED_HOVER,
    cardBg: WHITE,
    inputBorder: BORDER,
  },
  dark: {
    text: WHITE,
    textSecondary: '#aaa',
    background: TEXT_PRIMARY,
    backgroundAlt: '#2a2a2a',
    tint: BRAND_RED,
    border: '#333',
    icon: '#aaa',
    tabIconDefault: '#aaa',
    tabIconSelected: BRAND_RED,
    button: BRAND_RED,
    buttonHover: BRAND_RED_HOVER,
    cardBg: '#2a2a2a',
    inputBorder: '#444',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const Radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
};

export const CardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 3 },
  default: {},
});

export const FontSizes = {
  xs: 12,
  sm: 14,
  body: 16,
  subtitle: 18,
  title: 22,
  large: 28,
};

export type RoleThemeKey = 'police' | 'firefighter' | 'medic';

export type RoleThemeColors = {
  primary: string;
  primaryHover: string;
  displayName: string;
};

export const RoleThemes: Record<RoleThemeKey, RoleThemeColors> = {
  police: {
    primary: '#1E3A5F',
    primaryHover: '#152A46',
    displayName: 'Police',
  },
  firefighter: {
    primary: '#A32A22',
    primaryHover: '#841F19',
    displayName: 'Firefighter',
  },
  medic: {
    primary: '#1E7A46',
    primaryHover: '#155C35',
    displayName: 'Medic',
  },
};

export function getRoleTheme(role: RoleThemeKey | undefined): RoleThemeColors {
  if (role === 'police' || role === 'firefighter' || role === 'medic') {
    return RoleThemes[role];
  }
  return RoleThemes.firefighter;
}

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
    rounded: "'SF Pro Rounded', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
});