import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { theme } from '../theme/tokens';
import { AppSymbol } from './AppSymbol';
import { iosLayoutSpring, triggerHaptic } from './iosAnimations';

const CATEGORY_OPTIONS = ['超商', '食物', '飲料', '車費', '日用品', '娛樂', '轉帳'] as const;

export interface CategoryGlassTint {
  bg: string;
  border: string;
  text: string;
}

export function getCategoryGlassTint(_cat: string | null): CategoryGlassTint {
  return {
    bg: theme.colors.background.subtleSurface,
    border: theme.colors.glass.subtleBorder,
    text: theme.colors.text.secondary,
  };
}

interface MorphingCategoryPillProps {
  currentCategory: string | null;
  onSelectCategory: (category: string) => void;
}

export function MorphingCategoryPill({
  currentCategory,
  onSelectCategory,
}: MorphingCategoryPillProps) {
  const [expanded, setExpanded] = useState(false);
  const label = currentCategory || '日常';

  return (
    <Animated.View
      layout={iosLayoutSpring}
      style={[
        styles.pillShell,
        expanded && styles.pillShellExpanded,
      ]}
    >
      {!expanded ? (
        <Animated.View
          key="collapsed"
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(90)}
        >
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              setExpanded(true);
            }}
            style={styles.collapsedBtn}
            hitSlop={6}
          >
            <Text style={styles.collapsedText}>{label}</Text>
            <AppSymbol name="chevron.down" size={9} color={theme.colors.text.tertiary} />
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View
          key="expanded"
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(90)}
          style={styles.expandedRow}
        >
          {CATEGORY_OPTIONS.map((cat) => {
            const isSelected = cat === label;
            return (
              <Pressable
                key={cat}
                onPress={() => {
                  triggerHaptic('light');
                  onSelectCategory(cat);
                  setExpanded(false);
                }}
                style={[
                  styles.optionPill,
                  isSelected && styles.optionPillSelected,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              setExpanded(false);
            }}
            style={styles.closeMiniBtn}
            hitSlop={6}
          >
            <AppSymbol name="xmark" size={10} color={theme.colors.text.tertiary} />
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pillShell: {
    alignSelf: 'flex-start',
    borderRadius: theme.radii.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
    backgroundColor: theme.colors.background.subtleSurface,
    overflow: 'hidden',
  },
  pillShellExpanded: {
    borderRadius: theme.radii.innerCard,
    backgroundColor: theme.colors.background.elevatedSurface,
    borderColor: theme.colors.glass.fallbackBorder,
    paddingVertical: 4,
    paddingHorizontal: 5,
    marginTop: 4,
  },
  collapsedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    gap: 4,
  },
  collapsedText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: theme.typography.micro.fontWeight,
  },
  expandedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  optionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
    backgroundColor: theme.colors.background.subtleSurface,
  },
  optionPillSelected: {
    backgroundColor: theme.colors.accent.primary,
    borderColor: theme.colors.accent.primary,
  },
  optionText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: theme.colors.text.inverse,
    fontWeight: '600',
  },
  closeMiniBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
});

