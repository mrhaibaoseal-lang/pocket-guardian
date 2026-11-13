import { useMemo } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

/**
 * iOS system palette (UIKit semantic colors), light + dark.
 * One accent (system green). Everything else is neutral grays,
 * with red reserved for overspending / destructive actions.
 */
export interface Palette {
  scheme: 'light' | 'dark';
  /** systemGroupedBackground — page canvas */
  bg: string;
  /** secondarySystemGroupedBackground — inset grouped cells */
  card: string;
  /** tertiarySystemGroupedBackground — controls inside cells */
  cardRaised: string;
  /** tertiarySystemFill — chips, search field, segmented track */
  fill: string;
  /** secondarySystemFill — pressed cells, progress track */
  fillStrong: string;
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  separator: string;
  /** opaque separator for hairlines on top of colored fills */
  separatorOpaque: string;
  accent: string;
  onAccent: string;
  positive: string;
  negative: string;
  warning: string;
  blue: string;
  indigo: string;
  purple: string;
  teal: string;
  cyan: string;
  pink: string;
  brown: string;
  gray: string;
  /** translucent chrome (tab bar / nav bar) */
  chrome: string;
  /** sheet backdrop */
  scrim: string;
}

const light: Palette = {
  scheme: 'light',
  bg: '#F2F2F7',
  card: '#FFFFFF',
  cardRaised: '#F2F2F7',
  fill: 'rgba(118, 118, 128, 0.12)',
  fillStrong: 'rgba(120, 120, 128, 0.16)',
  label: '#000000',
  secondaryLabel: 'rgba(60, 60, 67, 0.6)',
  tertiaryLabel: 'rgba(60, 60, 67, 0.3)',
  separator: 'rgba(60, 60, 67, 0.29)',
  separatorOpaque: '#C6C6C8',
  accent: '#34C759',
  onAccent: '#FFFFFF',
  positive: '#248A3D',
  negative: '#FF3B30',
  warning: '#FF9500',
  blue: '#007AFF',
  indigo: '#5856D6',
  purple: '#AF52DE',
  teal: '#30B0C7',
  cyan: '#32ADE6',
  pink: '#FF2D55',
  brown: '#A2845E',
  gray: '#8E8E93',
  chrome: 'rgba(249, 249, 249, 0.94)',
  scrim: 'rgba(0, 0, 0, 0.32)',
};

const dark: Palette = {
  scheme: 'dark',
  bg: '#000000',
  card: '#1C1C1E',
  cardRaised: '#2C2C2E',
  fill: 'rgba(118, 118, 128, 0.24)',
  fillStrong: 'rgba(120, 120, 128, 0.32)',
  label: '#FFFFFF',
  secondaryLabel: 'rgba(235, 235, 245, 0.6)',
  tertiaryLabel: 'rgba(235, 235, 245, 0.3)',
  separator: 'rgba(84, 84, 88, 0.65)',
  separatorOpaque: '#38383A',
  accent: '#30D158',
  onAccent: '#000000',
  positive: '#30D158',
  negative: '#FF453A',
  warning: '#FF9F0A',
  blue: '#0A84FF',
  indigo: '#5E5CE6',
  purple: '#BF5AF2',
  teal: '#40C8E0',
  cyan: '#64D2FF',
  pink: '#FF375F',
  brown: '#AC8E68',
  gray: '#8E8E93',
  chrome: 'rgba(22, 22, 23, 0.92)',
  scrim: 'rgba(0, 0, 0, 0.48)',
};

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

/** Build a StyleSheet from the active palette; recomputed only when the scheme flips. */
export function useThemedStyles<T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(
  factory: (c: Palette) => T,
): T {
  const c = usePalette();
  return useMemo(() => StyleSheet.create(factory(c)) as T, [c, factory]);
}

/** iOS Dynamic Type default sizes (Large). */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.41 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.32 },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400', letterSpacing: 0.07 },
} satisfies Record<string, TextStyle>;

export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const radius = {
  /** inset grouped list cell group */
  group: 20,
  /** small icon tile */
  tile: 8,
  /** sheets */
  sheet: 28,
  control: 12,
} as const;

/** Standard iOS spring for UI motion (close to UIKit default critically-damped feel). */
export const spring = { damping: 26, stiffness: 300, mass: 1 } as const;
export const springSnappy = { damping: 22, stiffness: 420, mass: 0.8 } as const;
