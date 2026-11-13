import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
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
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

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

export const iosLayoutSpring = LinearTransition.springify().damping(26).stiffness(300);

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

/** Subtle press feedback: slight scale + dim, like UIButton / CarPlay tiles. No glow. */
export function TactilePressable({
  children,
  onPress,
  style,
  contentStyle,
  activeScale = 0.97,
  haptic = 'light',
  disabled = false,
  hitSlop,
}: TactilePressableProps) {
  const pressed = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * 0.25,
    transform: [{ scale: 1 - pressed.value * (1 - Math.max(0.95, activeScale)) }],
  }));

  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop}
      style={style}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
      }}
      onPress={(e) => {
        triggerHaptic(haptic);
        onPress?.(e);
      }}
    >
      <Animated.View style={[contentStyle, animStyle, disabled && { opacity: 0.4 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export interface AnimatedRollingNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  duration?: number;
}

/** Counts smoothly to the new value (ease-out), no bounce. */
export function AnimatedRollingNumber({
  value,
  prefix = '$',
  suffix = '',
  style,
  duration = 420,
}: AnimatedRollingNumberProps) {
  const targetVal = Math.round(Number.isFinite(value) ? value : 0);
  const [displayVal, setDisplayVal] = useState(targetVal);
  const prevValRef = useRef(targetVal);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const startVal = prevValRef.current;
    const endVal = targetVal;
    prevValRef.current = endVal;
    if (startVal === endVal) {
      setDisplayVal(endVal);
      return;
    }
    const startTime = Date.now();
    const diff = endVal - startVal;
    const step = () => {
      const t = Math.min(1, (Date.now() - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayVal(Math.round(startVal + diff * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [targetVal, duration]);

  return (
    <Text style={[{ fontVariant: ['tabular-nums'] }, style]}>
      {displayVal < 0 ? '−' : ''}
      {prefix}
      {Math.abs(displayVal).toLocaleString()}
      {suffix}
    </Text>
  );
}

export interface LiquidLightTubeProps {
  percent: number;
  height?: number;
  /** fill color; defaults to system green */
  color?: string;
  trackColor?: string;
  /** @deprecated gradients removed */
  colors?: readonly [string, string, ...string[]];
}

/** Flat iOS progress bar (like Screen Time / Fitness). */
export function LiquidLightTube({ percent, height = 6, color, trackColor }: LiquidLightTubeProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const widthPct = useSharedValue(0);

  useEffect(() => {
    widthPct.value = withTiming(clamped, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [clamped, widthPct]);

  const fillAnimStyle = useAnimatedStyle(() => ({
    width: `${widthPct.value}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: trackColor ?? 'rgba(120, 120, 128, 0.2)' },
      ]}
    >
      <Animated.View
        style={[{ height: '100%', borderRadius: height / 2, backgroundColor: color ?? '#34C759' }, fillAnimStyle]}
      />
    </View>
  );
}

export function ScreenTransitionView({
  tabKey,
  tabIndex = 0,
  dragOffsetX,
  style,
  children,
}: {
  tabKey: string;
  tabIndex?: number;
  dragOffsetX?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const prevTabRef = useRef(tabKey);
  const prevIndexRef = useRef(tabIndex);

  useEffect(() => {
    if (prevTabRef.current === tabKey) return;
    const dir = tabIndex > prevIndexRef.current ? 1 : tabIndex < prevIndexRef.current ? -1 : 0;
    prevTabRef.current = tabKey;
    prevIndexRef.current = tabIndex;
    if (dragOffsetX) {
      dragOffsetX.value = 0;
    }
    opacity.value = 0.28;
    translateX.value = dir * 48;
    translateY.value = dir === 0 ? 10 : 4;
    scale.value = 0.985;
    opacity.value = withTiming(1, { duration: 185, easing: Easing.out(Easing.cubic) });
    translateX.value = withSpring(0, { damping: 21, stiffness: 290, mass: 0.68 });
    translateY.value = withSpring(0, { damping: 21, stiffness: 290, mass: 0.68 });
    scale.value = withSpring(1, { damping: 21, stiffness: 290, mass: 0.68 });
  }, [tabKey, tabIndex, dragOffsetX, opacity, translateX, translateY, scale]);

  const animStyle = useAnimatedStyle(() => {
    const liveDragX = dragOffsetX ? dragOffsetX.value : 0;
    const dragProgress = Math.min(Math.abs(liveDragX) / 280, 1);
    return {
      opacity: opacity.value * (1 - dragProgress * 0.18),
      transform: [
        { translateX: translateX.value + liveDragX },
        { translateY: translateY.value },
        { scale: scale.value * (1 - dragProgress * 0.022) },
      ],
    };
  });

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
  const delayMs = Math.min(index * 24, 120);
  return (
    <Animated.View
      entering={FadeIn.delay(delayMs).duration(220)}
      layout={iosLayoutSpring}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
  },
});
