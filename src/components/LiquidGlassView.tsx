import { BlurView, type BlurTint } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export interface LiquidGlassProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  shape?: 'card' | 'group' | 'pill';
  intensity?: number;
  tint?: BlurTint;
  elevated?: boolean;
}

/**
 * iOS 26 / iOS 27 Desert Titanium & Warm Amber <LiquidGlassCard> Component:
 * 1. Base: BlurView (intensity={55}, tint="systemThinMaterialDark") + Warm Smoked Overlay rgba(28, 24, 20, 0.4), borderRadius: 28 (continuous)
 * 2. 135° Champagne Surface Sheen: LinearGradient (0,0 -> 1,1) ['rgba(255, 238, 210, 0.16)', 'rgba(255, 238, 210, 0.03)', 'transparent']
 * 3. Asymmetric Desert Titanium Specular Rim: borderWidth: 0.8,
 *    top: 'rgba(255, 230, 190, 0.38)', left: 'rgba(255, 230, 190, 0.20)',
 *    right: 'rgba(212, 175, 55, 0.06)', bottom: 'rgba(212, 175, 55, 0.06)'
 */
export function LiquidGlassCard({
  children,
  style,
  contentStyle,
  shape = 'card',
  intensity = 55,
  tint = 'systemThinMaterialDark',
  elevated = false,
}: LiquidGlassProps) {
  const radiusStyle =
    shape === 'pill'
      ? styles.radiusPill
      : shape === 'group'
      ? styles.radiusGroup
      : styles.radiusCard;

  return (
    <View
      style={[
        styles.outerShell,
        elevated ? styles.bgElevated : styles.bgDefault,
        radiusStyle,
        Platform.OS === 'web' ? styles.webBackdrop : null,
        style,
      ]}
    >
      {/* Layer 1: Base Frosted Material Blur (intensity={55}, tint="systemThinMaterialDark") */}
      <BlurView
        tint={tint}
        intensity={intensity}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Layer 2: 135° Champagne Surface Sheen (左上 0,0 -> 右下 1,1) */}
      <LinearGradient
        colors={[
          'rgba(255, 238, 210, 0.16)',
          'rgba(255, 238, 210, 0.03)',
          'transparent',
        ]}
        locations={[0, 0.48, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Layer 3: Asymmetric Desert Titanium Specular Rim + Content */}
      <View style={[styles.specularRim, radiusStyle, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

// Alias for backward compatibility
export const LiquidGlassView = LiquidGlassCard;

const styles = StyleSheet.create({
  outerShell: {
    overflow: 'hidden',
    position: 'relative',
  },
  bgDefault: {
    backgroundColor: 'rgba(28, 24, 20, 0.4)',
  },
  bgElevated: {
    backgroundColor: 'rgba(34, 28, 22, 0.62)',
  },
  radiusCard: {
    borderRadius: 28,
    borderCurve: 'continuous',
  },
  radiusGroup: {
    borderRadius: 28,
    borderCurve: 'continuous',
  },
  radiusPill: {
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  webBackdrop: {
    // @ts-expect-error web CSS backdrop filter for PC simulator
    backdropFilter: 'blur(32px) saturate(165%)',
    WebkitBackdropFilter: 'blur(32px) saturate(165%)',
  },
  specularRim: {
    borderWidth: 0.8,
    borderTopColor: 'rgba(255, 230, 190, 0.38)',
    borderLeftColor: 'rgba(255, 230, 190, 0.20)',
    borderRightColor: 'rgba(212, 175, 55, 0.06)',
    borderBottomColor: 'rgba(212, 175, 55, 0.06)',
  },
});
