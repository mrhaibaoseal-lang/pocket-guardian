import { SymbolView, type AndroidSymbol, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Semantic icon names → SF Symbol (iOS) + Material Symbol (web / Android).
 * Keep this the only place that knows raw symbol names.
 */
const ICONS = {
  // navigation
  overview: { ios: 'chart.pie.fill', web: 'pie_chart' },
  list: { ios: 'list.bullet', web: 'list' },
  people: { ios: 'person.2.fill', web: 'group' },
  settings: { ios: 'gearshape.fill', web: 'settings' },
  chevronRight: { ios: 'chevron.right', web: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', web: 'expand_more' },
  close: { ios: 'xmark', web: 'close' },
  closeCircle: { ios: 'xmark.circle.fill', web: 'close' },
  plus: { ios: 'plus', web: 'add' },
  search: { ios: 'magnifyingglass', web: 'search' },
  check: { ios: 'checkmark', web: 'check' },
  more: { ios: 'ellipsis', web: 'more_horiz' },
  info: { ios: 'info.circle', web: 'info' },
  // money
  bank: { ios: 'building.columns.fill', web: 'account_balance' },
  wallet: { ios: 'wallet.bifold.fill', web: 'account_balance_wallet' },
  card: { ios: 'creditcard.fill', web: 'credit_card' },
  transfer: { ios: 'arrow.left.arrow.right', web: 'swap_horiz' },
  income: { ios: 'arrow.down', web: 'arrow_downward' },
  outgoing: { ios: 'arrow.up.right', web: 'north_east' },
  adjust: { ios: 'slider.horizontal.3', web: 'tune' },
  fee: { ios: 'percent', web: 'percent' },
  savings: { ios: 'banknote.fill', web: 'savings' },
  scold: { ios: 'bolt.fill', web: 'bolt' },
  balance: { ios: 'scalemass.fill', web: 'balance' },
  receipt: { ios: 'doc.text.fill', web: 'receipt' },
  repeat: { ios: 'arrow.triangle.2.circlepath', web: 'event_repeat' },
  calendar: { ios: 'calendar', web: 'calendar_month' },
  clock: { ios: 'clock', web: 'schedule' },
  // categories
  store: { ios: 'storefront.fill', web: 'storefront' },
  food: { ios: 'fork.knife', web: 'restaurant' },
  drink: { ios: 'cup.and.saucer.fill', web: 'local_cafe' },
  transport: { ios: 'car.fill', web: 'directions_car' },
  basket: { ios: 'basket.fill', web: 'shopping_basket' },
  fun: { ios: 'gamecontroller.fill', web: 'sports_esports' },
  // actions
  trash: { ios: 'trash', web: 'delete' },
  undo: { ios: 'arrow.uturn.backward', web: 'undo' },
  split: { ios: 'arrow.triangle.branch', web: 'call_split' },
  edit: { ios: 'pencil', web: 'edit' },
  copy: { ios: 'doc.on.doc', web: 'content_copy' },
  share: { ios: 'square.and.arrow.up', web: 'ios_share' },
  cloud: { ios: 'icloud.fill', web: 'cloud' },
  sync: { ios: 'arrow.clockwise', web: 'sync' },
  person: { ios: 'person.fill', web: 'person' },
  personAdd: { ios: 'person.badge.plus', web: 'person_add' },
  handshake: { ios: 'hands.sparkles.fill', web: 'handshake' },
  lock: { ios: 'lock.fill', web: 'lock' },
  warning: { ios: 'exclamationmark.triangle.fill', web: 'warning' },
  shortcut: { ios: 'square.stack.3d.up.fill', web: 'shortcut' },
  bell: { ios: 'bell.fill', web: 'notifications' },
  history: { ios: 'clock.arrow.circlepath', web: 'history' },
  restore: { ios: 'arrow.uturn.left.circle', web: 'restore' },
  reset: { ios: 'arrow.counterclockwise', web: 'refresh' },
  sliders: { ios: 'slider.horizontal.3', web: 'tune' },
} as const satisfies Record<string, { ios: SFSymbol; web: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color,
  weight = 'regular',
  style,
}: {
  name: IconName;
  size?: number;
  color: string;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}) {
  const entry = ICONS[name];
  return (
    <SymbolView
      name={{ ios: entry.ios, android: entry.web, web: entry.web }}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={style}
      fallback={<Text style={{ color, fontSize: size * 0.8 }}>•</Text>}
    />
  );
}

/** iOS Settings-style colored rounded-square icon tile. */
export function IconTile({
  name,
  bg,
  size = 30,
  fg = '#FFFFFF',
}: {
  name: IconName;
  bg: string;
  size?: number;
  fg?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        borderCurve: 'continuous',
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={size * 0.56} color={fg} weight="semibold" />
    </View>
  );
}
