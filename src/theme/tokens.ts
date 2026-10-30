/**
 * Unified Design Tokens — iOS 26 Liquid Glass Precision Instrument Theme
 *
 * Principles:
 * - Quiet, high-craft dark precision instrument (#0B0C0F cold charcoal base).
 * - Text hierarchy strictly via white opacity: 0.92 (primary), 0.60 (secondary), 0.38 (tertiary).
 * - Single low-saturation muted steel accent (#7E99B3) for primary actions & key figures.
 * - Neutral-cool tone (#94B0C2) for remaining allowance; muted amber (#B88648) & sand red (#B55A52) for warnings.
 * - Concentric continuous corner radii: outerRadius = innerRadius + padding.
 */

export const theme = {
  colors: {
    background: {
      base: '#0B0C0F',
      elevatedSurface: '#12151B',
      listSurface: 'rgba(255, 255, 255, 0.032)',
      subtleSurface: 'rgba(255, 255, 255, 0.048)',
      pressedSurface: 'rgba(255, 255, 255, 0.075)',
    },
    ambientOrbs: {
      orbPrimary: '#3B4F66',
      orbSecondary: '#2C3D52',
      orbTertiary: '#465B73',
    },
    glass: {
      tintRegular: 'rgba(18, 22, 29, 0.38)',
      tintClear: 'rgba(18, 22, 29, 0.18)',
      fallbackBg: 'rgba(20, 24, 31, 0.72)',
      fallbackBorder: 'rgba(255, 255, 255, 0.10)',
      hairline: 'rgba(255, 255, 255, 0.07)',
      subtleBorder: 'rgba(255, 255, 255, 0.06)',
    },
    text: {
      primary: 'rgba(255, 255, 255, 0.92)',
      secondary: 'rgba(255, 255, 255, 0.60)',
      tertiary: 'rgba(255, 255, 255, 0.38)',
      inverse: '#0B0C0F',
    },
    accent: {
      primary: '#7E99B3',
      subtleBg: 'rgba(126, 153, 179, 0.14)',
      subtleBorder: 'rgba(126, 153, 179, 0.28)',
    },
    semantic: {
      remaining: '#94B0C2',
      remainingSubtle: 'rgba(148, 176, 194, 0.12)',
      warning: '#B88648',
      warningSubtle: 'rgba(184, 134, 72, 0.14)',
      danger: '#B55A52',
      dangerSubtle: 'rgba(181, 90, 82, 0.14)',
    },
  },

  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },

  /**
   * Concentric radii rule: outerRadius = innerRadius + padding
   * Example: Outer card 24pt with 12pt/16pt padding -> Inner element 12pt/10pt
   */
  radii: {
    outerCard: 24,
    innerCard: 12,
    listGroup: 18,
    control: 14,
    chip: 10,
    pill: 999,
  },

  typography: {
    heroAmount: {
      fontSize: 44,
      fontWeight: '500' as const,
      letterSpacing: -1.2,
      lineHeight: 50,
    },
    statAmount: {
      fontSize: 17,
      fontWeight: '500' as const,
      letterSpacing: -0.4,
      lineHeight: 22,
    },
    listAmount: {
      fontSize: 16,
      fontWeight: '500' as const,
      letterSpacing: -0.3,
      lineHeight: 21,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '500' as const,
      letterSpacing: 0.2,
      lineHeight: 18,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
      letterSpacing: -0.1,
      lineHeight: 20,
    },
    bodyMedium: {
      fontSize: 14,
      fontWeight: '500' as const,
      letterSpacing: -0.1,
      lineHeight: 19,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      letterSpacing: 0,
      lineHeight: 16,
    },
    micro: {
      fontSize: 11,
      fontWeight: '500' as const,
      letterSpacing: 0.2,
      lineHeight: 14,
    },
    maxAmountFontScale: 1.15,
  },

  motion: {
    springRestrained: {
      damping: 28,
      stiffness: 290,
      mass: 0.85,
    },
    springSmooth: {
      damping: 26,
      stiffness: 240,
      mass: 0.85,
    },
    pressScale: 0.98,
    pressHighlightOpacity: 0.06,
    staggerDelayMs: 32,
    maxStaggerDelayMs: 192,
    enterTranslateY: 6,
  },
} as const;

export type AppTheme = typeof theme;
