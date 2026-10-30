import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from '../theme/tokens';

export type AppIconName =
  | 'chart.bar'
  | 'list.bullet'
  | 'arrow.left.arrow.right'
  | 'bolt'
  | 'slider.horizontal.3'
  | 'plus'
  | 'gauge.with.needle'
  | 'equal.circle'
  | 'bag'
  | 'fork.knife'
  | 'cup.and.saucer'
  | 'tram'
  | 'wave.3.right'
  | 'creditcard'
  | 'arrow.up.right'
  | 'arrow.down.left'
  | 'banknote'
  | 'chevron.right'
  | 'chevron.down'
  | 'xmark'
  | 'lock.fill'
  | 'calendar'
  | 'moon.stars';

const WEB_PATHS: Record<AppIconName, string> = {
  'chart.bar': 'M5 19V12M12 19V6M19 19V9',
  'list.bullet': 'M8 7H20M8 12H20M8 17H20M4.5 7H4.6M4.5 12H4.6M4.5 17H4.6',
  'arrow.left.arrow.right': 'M7 10L4 7L7 4M4 7H20M17 14L20 17L17 20M20 17H4',
  bolt: 'M13 3L5.5 13.5H12L11 21L18.5 10.5H12L13 3Z',
  'slider.horizontal.3': 'M4 7H20M4 12H20M4 17H20M9 5V9M15 10V14M10 15V19',
  plus: 'M12 5V19M5 12H19',
  'gauge.with.needle': 'M4.5 16.5A8 8 0 1 1 19.5 16.5M12 14L15.5 9.5',
  'equal.circle': 'M8.5 10.2H15.5M8.5 13.8H15.5M20.5 12A8.5 8.5 0 1 1 3.5 12A8.5 8.5 0 0 1 20.5 12Z',
  bag: 'M6 8H18L17 19.5H7L6 8ZM9 8V6.5A3 3 0 0 1 15 6.5V8',
  'fork.knife': 'M7 4V10C7 11.4 8 12.2 9 12.5V20M11 4V10M16.5 4V20M16.5 4C14.8 4 14 6.5 14 9.5C14 11.2 15 12 16.5 12',
  'cup.and.saucer': 'M5 7H15V12.5A4.5 4.5 0 0 1 10.5 17H9.5A4.5 4.5 0 0 1 5 12.5V7ZM15 8.5H17A2 2 0 0 1 17 12.5H15M4 19.5H17',
  tram: 'M6 5H18V17H6V5ZM6 11.5H18M8.5 19.5L7 17M15.5 19.5L17 17',
  'wave.3.right': 'M7 9.5C8.5 11 8.5 13 7 14.5M10.5 7C13 9.7 13 14.3 10.5 17M14 4.5C17.6 8.6 17.6 15.4 14 19.5',
  creditcard: 'M3.5 6H20.5V18H3.5V6ZM3.5 10H20.5',
  'arrow.up.right': 'M7 17L17 7M9 7H17V15',
  'arrow.down.left': 'M17 7L7 17M15 17H7V9',
  banknote: 'M3.5 6.5H20.5V17.5H3.5V6.5ZM14.2 12A2.2 2.2 0 1 1 9.8 12A2.2 2.2 0 0 1 14.2 12Z',
  'chevron.right': 'M9.5 6.5L15 12L9.5 17.5',
  'chevron.down': 'M6.5 9.5L12 15L17.5 9.5',
  xmark: 'M7 7L17 17M17 7L7 17',
  'lock.fill': 'M6 11H18V20H6V11ZM8.5 11V8A3.5 3.5 0 0 1 15.5 8V11',
  calendar: 'M4 5.5H20V20H4V5.5ZM4 10H20',
  'moon.stars': 'M18.5 14.5A7.5 7.5 0 0 1 9.5 5.5A7.5 7.5 0 1 0 18.5 14.5Z',
};

export interface AppSymbolProps {
  name: AppIconName;
  size?: number;
  color?: string;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}

export function AppSymbol({
  name,
  size = 17,
  color = theme.colors.text.primary,
  weight = 'medium',
  style,
}: AppSymbolProps) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={name as SFSymbol}
        size={size}
        tintColor={color}
        weight={weight}
        type="monochrome"
        resizeMode="scaleAspectFit"
        style={[{ width: size, height: size }, style]}
      />
    );
  }

  const strokeWidth = weight === 'semibold' || weight === 'bold' ? 1.9 : 1.55;
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d={WEB_PATHS[name]}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
