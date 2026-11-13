import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { type, usePalette } from '../../theme';
import { triggerHaptic } from '../iosAnimations';

/** UISegmentedControl look-alike with a sliding thumb. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segW = width > 0 ? (width - 4) / options.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring(index * segW, { damping: 28, stiffness: 380 });
  }, [index, segW, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        { height: 32, borderRadius: 9, backgroundColor: c.fill, padding: 2, flexDirection: 'row' },
        style,
      ]}
    >
      {segW > 0 ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 2,
              left: 2,
              bottom: 2,
              width: segW,
              borderRadius: 7,
              backgroundColor: c.scheme === 'dark' ? '#636366' : '#FFFFFF',
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => {
              if (!selected) {
                triggerHaptic('selection');
                onChange(o.value);
              }
            }}
          >
            <Text
              numberOfLines={1}
              style={[type.footnote, { color: c.label, fontWeight: selected ? '600' : '500' }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
