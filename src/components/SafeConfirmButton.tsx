import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

interface SafeConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  style?: ViewStyle;
  compact?: boolean;
}

/**
 * 🛡️ 二次確認防誤觸按鈕 (Desert Titanium & Warm Amber Liquid Glass):
 * First tap arms the button in warm champagne gold for 3 seconds; second tap executes.
 */
export function SafeConfirmButton({
  label,
  confirmLabel = '再按一次確認 (3s)',
  onConfirm,
  style,
  compact = false,
}: SafeConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  const handlePress = () => {
    if (!armed) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        // ignore on web
      }
      setArmed(true);
    } else {
      setArmed(false);
      onConfirm();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.base,
        compact && styles.compact,
        armed ? styles.armed : styles.idle,
        style,
      ]}
    >
      <Text style={[styles.text, compact && styles.compactText, armed && styles.armedText]}>
        {armed ? confirmLabel : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.8,
  },
  compact: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  idle: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  armed: {
    backgroundColor: '#10B981',
    borderColor: '#6EE7B7',
  },
  text: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  compactText: {
    fontSize: 11,
  },
  armedText: {
    color: '#04120C',
    fontWeight: '800',
  },
});
