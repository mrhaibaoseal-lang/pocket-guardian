import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme/tokens';

interface SafeConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  style?: ViewStyle;
  compact?: boolean;
}

export function SafeConfirmButton({
  label,
  confirmLabel = '再按一次確認',
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // ignore on web
      }
      setArmed(true);
    } else {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {
        // ignore on web
      }
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
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  compact: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radii.pill,
  },
  idle: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderColor: theme.colors.glass.subtleBorder,
  },
  armed: {
    backgroundColor: theme.colors.semantic.dangerSubtle,
    borderColor: theme.colors.semantic.danger,
  },
  text: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '500',
  },
  compactText: {
    fontSize: theme.typography.micro.fontSize,
  },
  armedText: {
    color: theme.colors.semantic.danger,
    fontWeight: '600',
  },
});
