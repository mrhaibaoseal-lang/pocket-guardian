import type { BlurTint } from 'expo-blur';
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, usePalette } from '../theme';

export interface LiquidGlassProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  shape?: 'card' | 'group' | 'pill';
  /** @deprecated kept for call-site compatibility; cards are now opaque iOS grouped cells. */
  intensity?: number;
  /** @deprecated */
  tint?: BlurTint;
  /** Raised cards use the tertiary grouped background (e.g. a card inside a sheet). */
  elevated?: boolean;
}

/**
 * Plain iOS inset-grouped card: opaque secondarySystemGroupedBackground,
 * continuous corners, no blur / gradient / rim light.
 * Name kept so existing screens keep compiling.
 */
export function LiquidGlassCard({ children, style, contentStyle, shape = 'card' }: LiquidGlassProps) {
  const c = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: shape === 'pill' ? 999 : radius.group,
          borderCurve: 'continuous',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

export const LiquidGlassView = LiquidGlassCard;
