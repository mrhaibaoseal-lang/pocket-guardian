import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../theme/tokens';

export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'none';

export function triggerHaptic(kind: HapticKind = 'light'): void {
  if (Platform.OS === 'web' || kind === 'none') return;
  try {
    if (kind === 'selection') void Haptics.selectionAsync();
    else if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (kind === 'medium') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'warning') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Ignore on unsupported environments
  }
}

let cachedReduceMotion = false;
if (Platform.OS !== 'web') {
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => {
      cachedReduceMotion = Boolean(v);
    })
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
    cachedReduceMotion = Boolean(v);
  });
}

export const iosLayoutSpring = LinearTransition.springify()
  .damping(theme.motion.springRestrained.damping)
  .stiffness(theme.motion.springRestrained.stiffness)
  .mass(theme.motion.springRestrained.mass);

export interface TactilePressableProps {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  activeScale?: number;
  haptic?: HapticKind;
  disabled?: boolean;
  hitSlop?: number;
}

export function TactilePressable({
  children,
  onPress,
  style,
  contentStyle,
  activeScale = theme.motion.pressScale,
  haptic = 'light',
  disabled = false,
  hitSlop,
}: TactilePressableProps) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: glow.value * theme.motion.pressHighlightOpacity,
  }));

  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop}
      style={style}
      onPressIn={() => {
        if (!cachedReduceMotion) {
          scale.value = withSpring(activeScale, theme.motion.springRestrained);
        }
        glow.value = withTiming(1, { duration: 70 });
        triggerHaptic(haptic);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, theme.motion.springRestrained);
        glow.value = withTiming(0, { duration: 160 });
      }}
      onPress={onPress}
    >
      <Animated.View style={[contentStyle, animStyle]}>
        {children}
        <Animated.View pointerEvents="none" style={[styles.tactileHighlightOverlay, highlightStyle]} />
      </Animated.View>
    </Pressable>
  );
}

export interface AnimatedRollingNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  duration?: number;
  maxFontSizeMultiplier?: number;
}

export function AnimatedRollingNumber({
  value,
  prefix = '$',
  suffix = '',
  style,
  duration = 360,
  maxFontSizeMultiplier = theme.typography.maxAmountFontScale,
}: AnimatedRollingNumberProps) {
  const targetVal = Math.round(Number.isFinite(value) ? value : 0);
  const [displayVal, setDisplayVal] = useState(targetVal);
  const prevValRef = useRef(targetVal);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const startVal = prevValRef.current;
    const endVal = targetVal;
    prevValRef.current = endVal;

    if (!mountedRef.current || cachedReduceMotion) {
      mountedRef.current = true;
      setDisplayVal(endVal);
      return;
    }
    if (startVal === endVal) return;

    const startTime = Date.now();
    const diff = endVal - startVal;
    const step = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3.2);
      setDisplayVal(Math.round(startVal + diff * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else setDisplayVal(endVal);
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [targetVal, duration]);

  return (
    <Text style={style} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {displayVal < 0 ? '-' : ''}
      {prefix}
      {Math.abs(displayVal).toLocaleString()}
      {suffix}
    </Text>
  );
}

export interface LiquidLightTubeProps {
  percent: number;
  height?: number;
  tone?: 'normal' | 'warning' | 'danger';
  colors?: readonly [string, string, ...string[]];
}

export function LiquidLightTube({
  percent,
  height = 4,
  tone = 'normal',
}: LiquidLightTubeProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const widthPct = useSharedValue(clamped);

  useEffect(() => {
    if (cachedReduceMotion) {
      widthPct.value = clamped;
    } else {
      widthPct.value = withSpring(clamped, theme.motion.springSmooth);
    }
  }, [clamped, widthPct]);

  const fillColor =
    tone === 'danger'
      ? theme.colors.semantic.danger
      : tone === 'warning'
      ? theme.colors.semantic.warning
      : theme.colors.accent.primary;

  const fillAnimStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, widthPct.value))}%`,
    backgroundColor: fillColor,
  }));

  return (
    <View style={[styles.meterTrack, { height }]}>
      <Animated.View style={[styles.meterFill, fillAnimStyle]} />
    </View>
  );
}

export function ScreenTransitionView({
  tabKey,
  style,
  children,
}: {
  tabKey: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const prevTabRef = useRef(tabKey);

  useEffect(() => {
    if (prevTabRef.current === tabKey) return;
    prevTabRef.current = tabKey;
    if (cachedReduceMotion) return;
    opacity.value = 0.65;
    translateY.value = 4;
    opacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
    translateY.value = withSpring(0, theme.motion.springRestrained);
  }, [tabKey, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[{ flex: 1 }, style, animStyle]}>{children}</Animated.View>;
}

export function StaggeredItem({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (cachedReduceMotion) {
    return <View style={style}>{children}</View>;
  }
  const delayMs = Math.min(index * theme.motion.staggerDelayMs, theme.motion.maxStaggerDelayMs);
  return (
    <Animated.View
      entering={FadeInDown.delay(delayMs).duration(170)}
      layout={iosLayoutSpring}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tactileHighlightOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: theme.radii.control,
    backgroundColor: '#FFFFFF',
  },
  meterTrack: {
    borderRadius: theme.radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: theme.radii.pill,
  },
});
