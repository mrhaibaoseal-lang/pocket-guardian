import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { type, usePalette } from '../theme';
import { triggerHaptic } from './iosAnimations';
import { Icon } from './ui/Icon';
import { categoryVisual } from './ui/txVisual';

export const CATEGORY_OPTIONS = ['超商', '食物', '飲料', '車費', '日用品', '娛樂', '轉帳'] as const;

export interface CategoryGlassTint {
  bg: string;
  border: string;
  text: string;
}

/** @deprecated kept for older call sites; returns neutral fill colors. */
export function getCategoryGlassTint(_cat: string | null): CategoryGlassTint {
  return { bg: 'rgba(118, 118, 128, 0.12)', border: 'transparent', text: '#8E8E93' };
}

interface MorphingCategoryPillProps {
  currentCategory: string | null;
  onSelectCategory: (category: string) => void;
}

const layout = LinearTransition.duration(220);

/**
 * Inline category picker: a quiet text button that expands into a row of
 * category chips (like an iOS menu, but inline so it works inside lists).
 */
export function MorphingCategoryPill({ currentCategory, onSelectCategory }: MorphingCategoryPillProps) {
  const c = usePalette();
  const [expanded, setExpanded] = useState(false);
  const label = currentCategory || '日常';

  if (!expanded) {
    return (
      <Animated.View layout={layout} entering={FadeIn.duration(150)}>
        <Pressable
          hitSlop={8}
          onPress={() => {
            triggerHaptic('selection');
            setExpanded(true);
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Text style={[type.footnote, { color: c.secondaryLabel }]}>{label}</Text>
          <Icon name="chevronDown" size={9} color={c.tertiaryLabel} weight="bold" />
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      layout={layout}
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(120)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}
    >
      {CATEGORY_OPTIONS.map((cat) => {
        const selected = cat === label;
        const v = categoryVisual(cat, c);
        return (
          <Pressable
            key={cat}
            onPress={() => {
              triggerHaptic('selection');
              onSelectCategory(cat);
              setExpanded(false);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              height: 28,
              paddingHorizontal: 10,
              borderRadius: 14,
              backgroundColor: selected ? c.label : c.fill,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name={v.icon} size={12} color={selected ? c.card : v.color} weight="semibold" />
            <Text style={[type.footnote, { fontWeight: '500', color: selected ? c.card : c.label }]}>{cat}</Text>
          </Pressable>
        );
      })}
      <Pressable
        hitSlop={8}
        onPress={() => setExpanded(false)}
        style={{ height: 28, width: 28, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={10} color={c.secondaryLabel} weight="bold" />
        </View>
      </Pressable>
    </Animated.View>
  );
}
