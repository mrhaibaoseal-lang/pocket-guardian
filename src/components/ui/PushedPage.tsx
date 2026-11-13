import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { type, usePalette } from '../../theme';
import { Icon } from './Icon';

/** UINavigationController-style pushed page with a back button. Covers its parent. */
export function PushedPage({
  title,
  backLabel,
  topInset,
  onBack,
  children,
}: {
  title: string;
  backLabel: string;
  topInset: number;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const c = usePalette();
  return (
    <Animated.View
      entering={SlideInRight.duration(340).easing(Easing.out(Easing.cubic))}
      exiting={SlideOutRight.duration(260).easing(Easing.in(Easing.cubic))}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: c.bg,
        paddingTop: topInset,
        zIndex: 20,
      }}
    >
      <View
        style={{
          height: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 8,
        }}
      >
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, width: 80, opacity: pressed ? 0.4 : 1 })}
        >
          <View style={{ transform: [{ scaleX: -1 }] }}>
            <Icon name="chevronRight" size={18} color={c.positive} weight="semibold" />
          </View>
          <Text style={[type.body, { color: c.positive }]} numberOfLines={1}>
            {backLabel}
          </Text>
        </Pressable>
        <Text style={[type.headline, { color: c.label, flex: 1, textAlign: 'center' }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 80 }} />
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}
