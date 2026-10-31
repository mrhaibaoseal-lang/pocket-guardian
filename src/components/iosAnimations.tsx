import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
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
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
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

export const iosLayoutSpring = LinearTransition.springify().damping(19).stiffness(240).mass(0.8);

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
  activeScale = 0.94,
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
    opacity: glow.value * 0.14,
  }));

  return (
    <Pressable
      disabled={disabled}
      hitSlop={hitSlop}
      style={style}
      onPressIn={() => {
        scale.value = withSpring(activeScale, { damping: 18, stiffness: 420, mass: 0.65 });
        glow.value = withTiming(1, { duration: 80 });
        triggerHaptic(haptic);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 300, mass: 0.7 });
        glow.value = withTiming(0, { duration: 200 });
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
}

export function AnimatedRollingNumber({
  value,
  prefix = '$',
  suffix = '',
  style,
  duration = 460,
}: AnimatedRollingNumberProps) {
  const targetVal = Math.round(Number.isFinite(value) ? value : 0);
  const [displayVal, setDisplayVal] = useState(targetVal);
  const prevValRef = useRef(targetVal);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    const startVal = prevValRef.current;
    const endVal = targetVal;
    prevValRef.current = endVal;

    if (!mountedRef.current) {
      mountedRef.current = true;
      setDisplayVal(endVal);
      return;
    }
    if (startVal === endVal) return;

    pulseScale.value = withSequence(
      withTiming(1.045, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 12, stiffness: 260, mass: 0.7 }),
    );

    const startTime = Date.now();
    const diff = endVal - startVal;
    const step = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3.6);
      setDisplayVal(Math.round(startVal + diff * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else setDisplayVal(endVal);
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [targetVal, duration, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View style={pulseStyle}>
      <Text style={style}>
        {displayVal < 0 ? '-' : ''}
        {prefix}
        {Math.abs(displayVal).toLocaleString()}
        {suffix}
      </Text>
    </Animated.View>
  );
}

export interface LiquidLightTubeProps {
  percent: number;
  height?: number;
  colors?: readonly [string, string, ...string[]];
}

export function LiquidLightTube({
  percent,
  height = 8,
  colors = ['#059669', '#10B981', '#6EE7B7'],
}: LiquidLightTubeProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const widthPct = useSharedValue(0);
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    widthPct.value = withSpring(clamped, { damping: 18, stiffness: 130, mass: 0.85 });
  }, [clamped, widthPct]);

  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.cubic) }),
        withDelay(1400, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [shimmerProgress]);

  const fillAnimStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(100, widthPct.value))}%`,
  }));

  const shimmerAnimStyle = useAnimatedStyle(() => ({
    left: `${-30 + shimmerProgress.value * 135}%`,
    opacity: widthPct.value > 3 ? 0.75 : 0,
  }));

  return (
    <View style={[styles.lightTubeTrack, { height }]}>
      <Animated.View style={[styles.lightTubeGlowWrap, fillAnimStyle]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.lightTubeGradient} />
        <Animated.View pointerEvents="none" style={[styles.shimmerBlade, shimmerAnimStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(236, 253, 245, 0.72)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>
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
  const scale = useSharedValue(1);
  const prevTabRef = useRef(tabKey);

  useEffect(() => {
    if (prevTabRef.current === tabKey) return;
    prevTabRef.current = tabKey;
    opacity.value = 0.25;
    translateY.value = 10;
    scale.value = 0.985;
    opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
    translateY.value = withSpring(0, { damping: 20, stiffness: 290, mass: 0.7 });
    scale.value = withSpring(1, { damping: 20, stiffness: 290, mass: 0.7 });
  }, [tabKey, opacity, translateY, scale]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
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
  const delayMs = Math.min(index * 38, 260);
  return (
    <Animated.View
      entering={FadeInDown.delay(delayMs).springify().damping(18).stiffness(230).mass(0.75)}
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
    borderRadius: 28,
    backgroundColor: '#ECFDF5',
  },
  lightTubeTrack: {
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  lightTubeGlowWrap: {
    height: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
  lightTubeGradient: {
    flex: 1,
    borderRadius: 999,
  },
  shimmerBlade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '28%',
  },
});
