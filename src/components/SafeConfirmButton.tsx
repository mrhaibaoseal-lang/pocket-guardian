import React, { useEffect, useState } from 'react';
import { Pressable, Text, type ViewStyle } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { type, usePalette } from '../theme';
import { triggerHaptic } from './iosAnimations';

interface SafeConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  style?: ViewStyle;
  compact?: boolean;
  /** Destructive actions turn red when armed (default). */
  destructive?: boolean;
}

/**
 * Two-tap confirm button. First tap arms it for 3 s (turns red / accent),
 * second tap runs the action — same pattern as iOS swipe-to-delete confirm.
 */
export function SafeConfirmButton({
  label,
  confirmLabel = '再按一次確認',
  onConfirm,
  style,
  compact = false,
  destructive = true,
}: SafeConfirmButtonProps) {
  const c = usePalette();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  const armedBg = destructive ? c.negative : c.accent;
  const armedFg = destructive ? '#FFFFFF' : c.onAccent;

  return (
    <Animated.View layout={LinearTransition.duration(180)} style={style}>
      <Pressable
        onPress={() => {
          if (!armed) {
            triggerHaptic('warning');
            setArmed(true);
          } else {
            setArmed(false);
            triggerHaptic('success');
            onConfirm();
          }
        }}
        style={({ pressed }) => ({
          height: compact ? 28 : 40,
          paddingHorizontal: compact ? 12 : 16,
          borderRadius: compact ? 14 : 12,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: armed ? armedBg : c.fill,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={[
            compact ? type.footnote : type.subheadline,
            {
              fontWeight: '600',
              color: armed ? armedFg : destructive ? c.negative : c.label,
            },
          ]}
        >
          {armed ? confirmLabel : label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
