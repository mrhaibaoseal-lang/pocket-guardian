import React from 'react';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { radius, tabular, type, useThemedStyles, usePalette, type Palette } from '../../theme';
import { triggerHaptic } from '../iosAnimations';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ */
/* Large title (UINavigationBar prefersLargeTitles)                    */
/* ------------------------------------------------------------------ */

export function LargeTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.largeTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.largeTitle} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={s.largeTitleSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Inset grouped section                                               */
/* ------------------------------------------------------------------ */

export function Section({
  header,
  headerRight,
  footer,
  children,
  style,
  contentStyle,
  separatorInset = 16,
}: {
  separatorInset?: number;
  header?: string;
  headerRight?: React.ReactNode;
  footer?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const s = useThemedStyles(makeStyles);
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[s.section, style]}>
      {header || headerRight ? (
        <View style={s.sectionHeaderRow}>
          {header ? <Text style={s.sectionHeader}>{header}</Text> : <View />}
          {headerRight}
        </View>
      ) : null}
      <View style={[s.group, contentStyle]}>
        {items.map((child, i) => (
          <React.Fragment key={(child as React.ReactElement).key ?? i}>
            {i > 0 ? <Separator inset={separatorInset} /> : null}
            {child}
          </React.Fragment>
        ))}
      </View>
      {footer ? <Text style={s.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

export function Separator({ inset = 16 }: { inset?: number }) {
  const s = useThemedStyles(makeStyles);
  return <View style={[s.separator, { marginLeft: inset }]} />;
}

/* ------------------------------------------------------------------ */
/* Row (UITableViewCell)                                               */
/* ------------------------------------------------------------------ */

export interface RowProps {
  leading?: React.ReactNode;
  title: string;
  titleStyle?: StyleProp<TextStyle>;
  subtitle?: string;
  value?: string;
  valueStyle?: StyleProp<TextStyle>;
  detail?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  numberOfLines?: number;
}

export function Row({
  leading,
  title,
  titleStyle,
  subtitle,
  value,
  valueStyle,
  detail,
  trailing,
  chevron = false,
  destructive = false,
  onPress,
  onLongPress,
  numberOfLines = 1,
}: RowProps) {
  const s = useThemedStyles(makeStyles);
  const c = usePalette();
  const body = (
    <>
      {leading ? <View style={s.rowLeading}>{leading}</View> : null}
      <View style={s.rowMain}>
        <Text
          style={[s.rowTitle, destructive && { color: c.negative }, titleStyle]}
          numberOfLines={numberOfLines}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value !== undefined || detail ? (
        <View style={s.rowValueCol}>
          {value !== undefined ? (
            <Text style={[s.rowValue, valueStyle]} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {detail ? <Text style={s.rowDetail}>{detail}</Text> : null}
        </View>
      ) : null}
      {trailing}
      {chevron ? (
        <Icon name="chevronRight" size={13} color={c.tertiaryLabel} weight="semibold" style={s.chevron} />
      ) : null}
    </>
  );

  if (!onPress && !onLongPress) {
    return <View style={s.row}>{body}</View>;
  }
  return (
    <Pressable
      onPress={() => {
        triggerHaptic('selection');
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.row, pressed && s.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export function Button({
  title,
  onPress,
  variant = 'filled',
  size = 'large',
  disabled = false,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive';
  size?: 'large' | 'medium' | 'small';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
}) {
  const s = useThemedStyles(makeStyles);
  const c = usePalette();
  const bg =
    variant === 'filled'
      ? c.accent
      : variant === 'tinted'
      ? c.scheme === 'dark'
        ? 'rgba(48, 209, 88, 0.18)'
        : 'rgba(52, 199, 89, 0.15)'
      : variant === 'gray'
      ? c.fill
      : variant === 'destructive'
      ? c.scheme === 'dark'
        ? 'rgba(255, 69, 58, 0.18)'
        : 'rgba(255, 59, 48, 0.12)'
      : 'transparent';
  const fg =
    variant === 'filled'
      ? c.onAccent
      : variant === 'destructive'
      ? c.negative
      : variant === 'gray'
      ? c.label
      : c.positive;
  const sizeStyle = size === 'large' ? s.btnLarge : size === 'medium' ? s.btnMedium : s.btnSmall;
  const textStyle = size === 'small' ? type.subheadline : type.headline;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        triggerHaptic('light');
        onPress();
      }}
      style={({ pressed }) => [
        s.btnBase,
        sizeStyle,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {icon}
      <Text style={[textStyle, { color: fg, fontWeight: '600' }]}>{title}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

export function Caption({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = usePalette();
  return <Text style={[type.footnote, { color: c.secondaryLabel }, style]}>{children}</Text>;
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'negative' | 'warning' }) {
  const c = usePalette();
  const fg = tone === 'accent' ? c.positive : tone === 'negative' ? c.negative : tone === 'warning' ? c.warning : c.secondaryLabel;
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: c.fill }}>
      <Text style={[type.caption2, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

export const makeStyles = (c: Palette) => ({
  largeTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  largeTitle: { ...type.largeTitle, color: c.label },
  largeTitleSub: { ...type.subheadline, color: c.secondaryLabel, marginTop: 2 },
  section: { marginHorizontal: 16, marginBottom: 28 },
  sectionHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    marginBottom: 7,
  },
  sectionHeader: { ...type.footnote, color: c.secondaryLabel },
  sectionFooter: { ...type.footnote, color: c.secondaryLabel, paddingHorizontal: 16, marginTop: 7 },
  group: {
    backgroundColor: c.card,
    borderRadius: radius.group,
    borderCurve: 'continuous' as const,
    overflow: 'hidden' as const,
  },
  separator: { height: 0.5, backgroundColor: c.separator },
  row: {
    minHeight: 50,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  rowPressed: { backgroundColor: c.fillStrong },
  rowLeading: { alignItems: 'center' as const, justifyContent: 'center' as const },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { ...type.body, color: c.label },
  rowSubtitle: { ...type.footnote, color: c.secondaryLabel, marginTop: 1 },
  rowValueCol: { alignItems: 'flex-end' as const, maxWidth: '55%' as const },
  rowValue: { ...type.body, ...tabular, color: c.secondaryLabel },
  rowDetail: { ...type.caption1, color: c.secondaryLabel, marginTop: 1 },
  chevron: { marginLeft: -4 },
  btnBase: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    borderCurve: 'continuous' as const,
  },
  btnLarge: { height: 50, borderRadius: 14, paddingHorizontal: 20 },
  btnMedium: { height: 40, borderRadius: 12, paddingHorizontal: 16 },
  btnSmall: { height: 30, borderRadius: 15, paddingHorizontal: 12 },
});
