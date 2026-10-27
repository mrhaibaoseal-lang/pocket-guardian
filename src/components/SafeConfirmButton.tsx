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
 * 🛡️ 二次確認防誤觸按鈕 (Safe Undo / Delete):
 * First tap arms the button in amber for 3 seconds; second tap executes.
 */
export function SafeConfirmButton({
  label,
  confirmLabel = '⚠️ 再按一次確認 (3s)',
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
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  compact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  idle: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  armed: {
    backgroundColor: '#F59E0B',
    borderColor: '#FBBF24',
  },
  text: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '700',
  },
  compactText: {
    fontSize: 12,
  },
  armedText: {
    color: '#0F172A',
    fontWeight: '800',
  },
});
