import { type BlurTint } from 'expo-blur';
import { GlassContainer, GlassView, type GlassStyle } from 'expo-glass-effect';
import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from '../theme/tokens';

export interface LiquidGlassProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  shape?: 'card' | 'group' | 'pill' | 'control';
  glassStyle?: GlassStyle;
  interactive?: boolean;
  tintColor?: string;
  /** Kept for backward compatibility with existing screens before they are migrated */
  intensity?: number;
  tint?: BlurTint;
  elevated?: boolean;
}

/**
 * iOS 26 Native Liquid Glass View (via `expo-glass-effect` GlassView & GlassContainer).
 * - Uses native `GlassView` directly on iOS 26 with `glassEffectStyle="regular"` by default.
 * - Concentric continuous corner curves (`borderCurve: 'continuous'`).
 */
export function LiquidGlassCard({
  children,
  style,
  contentStyle,
  shape = 'card',
  glassStyle = 'regular',
  interactive = false,
  tintColor,
}: LiquidGlassProps) {
  const radiusStyle =
    shape === 'pill'
      ? styles.radiusPill
      : shape === 'control'
      ? styles.radiusControl
      : shape === 'group'
      ? styles.radiusGroup
      : styles.radiusCard;

  if (Platform.OS === 'ios') {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        isInteractive={interactive}
        colorScheme="dark"
        tintColor={tintColor}
        style={[styles.nativeShell, radiusStyle, style, contentStyle]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View style={[styles.webShell, radiusStyle, style, contentStyle]}>
      {children}
    </View>
  );
}

export function LiquidGlassGroup({
  spacing = 8,
  style,
  children,
}: {
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (Platform.OS === 'ios') {
    return (
      <GlassContainer spacing={spacing} style={style}>
        {children}
      </GlassContainer>
    );
  }
  return <View style={style}>{children}</View>;
}

export const LiquidGlassView = LiquidGlassCard;

const styles = StyleSheet.create({
  nativeShell: {
    overflow: 'hidden',
    position: 'relative',
  },
  webShell: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: theme.colors.glass.fallbackBg,
    borderWidth: 1,
    borderColor: theme.colors.glass.fallbackBorder,
    // @ts-expect-error web backdrop filter for preview screenshot
    backdropFilter: 'blur(28px) saturate(140%)',
    WebkitBackdropFilter: 'blur(28px) saturate(140%)',
  },
  radiusCard: {
    borderRadius: theme.radii.outerCard,
    borderCurve: 'continuous',
  },
  radiusGroup: {
    borderRadius: theme.radii.listGroup,
    borderCurve: 'continuous',
  },
  radiusControl: {
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
  },
  radiusPill: {
    borderRadius: theme.radii.pill,
    borderCurve: 'continuous',
  },
});

