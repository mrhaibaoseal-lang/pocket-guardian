import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { triggerHaptic } from './iosAnimations';

const CATEGORY_OPTIONS = ['超商', '食物', '飲料', '車費', '日用品', '娛樂', '轉帳'] as const;

export interface CategoryGlassTint {
  bg: string;
  border: string;
  text: string;
}

/**
 * 同色系金屬膠囊色溫：
 * - 『餐飲』（食物、飲料、早餐、午餐、晚餐、便當）：琥珀玻璃
 *   底 rgba(245, 158, 11, 0.14)、字 #FBBF24、邊框 rgba(251, 191, 36, 0.3)
 * - 『交通/日常』（車費、超商、日用品、娛樂、轉帳等）：大漠鈦金玻璃
 *   底 rgba(214, 195, 165, 0.12)、字 #E6D5B8、邊框 rgba(230, 213, 184, 0.25)
 */
export function getCategoryGlassTint(cat: string | null): CategoryGlassTint {
  const c = cat || '';
  if (/(食物|飲料|早餐|午餐|便當|晚餐|宵夜|餐飲)/.test(c)) {
    return {
      bg: 'rgba(245, 158, 11, 0.14)',
      border: 'rgba(251, 191, 36, 0.3)',
      text: '#FBBF24',
    };
  }
  return {
    bg: 'rgba(214, 195, 165, 0.12)',
    border: 'rgba(230, 213, 184, 0.25)',
    text: '#E6D5B8',
  };
}

interface MorphingCategoryPillProps {
  currentCategory: string | null;
  onSelectCategory: (category: string) => void;
}

const layoutSpring = LinearTransition.springify().damping(19).stiffness(240);

export function MorphingCategoryPill({
  currentCategory,
  onSelectCategory,
}: MorphingCategoryPillProps) {
  const [expanded, setExpanded] = useState(false);
  const label = currentCategory || '日常';
  const tint = getCategoryGlassTint(label);

  return (
    <Animated.View
      layout={layoutSpring}
      style={[
        styles.pillShell,
        {
          backgroundColor: expanded ? 'rgba(28, 22, 16, 0.94)' : tint.bg,
          borderColor: tint.border,
        },
        expanded && styles.pillShellExpanded,
      ]}
    >
      {!expanded ? (
        <Animated.View
          key="collapsed"
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(100)}
        >
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              setExpanded(true);
            }}
            style={styles.collapsedBtn}
            hitSlop={6}
          >
            <Text style={[styles.collapsedText, { color: tint.text }]}>{label}</Text>
            <Text style={[styles.chevronText, { color: tint.text }]}>▾</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View
          key="expanded"
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(110)}
          style={styles.expandedRow}
        >
          {CATEGORY_OPTIONS.map((cat) => {
            const isSelected = cat === label;
            const optTint = getCategoryGlassTint(cat);
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
                  {
                    backgroundColor: isSelected ? optTint.text : optTint.bg,
                    borderColor: optTint.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: isSelected ? '#080705' : optTint.text },
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
            <Text style={styles.closeMiniText}>✕</Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pillShell: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 0.8,
    overflow: 'hidden',
  },
  pillShellExpanded: {
    borderRadius: 18,
    paddingVertical: 4,
    paddingHorizontal: 5,
    marginTop: 4,
  },
  collapsedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    gap: 4,
  },
  collapsedText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  chevronText: {
    fontSize: 10,
    opacity: 0.78,
  },
  expandedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
  },
  optionPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 0.8,
  },
  optionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeMiniBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  closeMiniText: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
    fontWeight: '700',
  },
});
