import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Transaction } from '../../../core';
import { tabular, type, usePalette, useThemedStyles, type Palette } from '../../theme';
import { MorphingCategoryPill } from '../MorphingCategoryPill';
import { Icon, IconTile } from './Icon';
import {
  accountLabel,
  formatTimeShort,
  formatTxAmount,
  isPositiveTx,
  txTitle,
  txVisual,
} from './txVisual';

export function isMergedTx(tx: Transaction): boolean {
  return Boolean(tx.frontendSlot && tx.bankSlot && tx.mergedMetadata?.frontendEvent && tx.mergedMetadata?.bankEvent);
}

/**
 * One transaction line, Wallet-style:
 * [tile] Merchant                 −$120
 *        Category ▾ · 12:39        玉山
 */
export function TxRow({
  tx,
  onChangeCategory,
  onPress,
  expanded = false,
  showTime = true,
}: {
  tx: Transaction;
  onChangeCategory?: (category: string) => void;
  onPress?: () => void;
  expanded?: boolean;
  showTime?: boolean;
}) {
  const c = usePalette();
  const s = useThemedStyles(makeStyles);
  const v = txVisual(tx, c);
  const positive = isPositiveTx(tx);
  const merged = isMergedTx(tx);

  const content = (
    <>
      <IconTile name={v.icon} bg={v.color} size={34} />
      <View style={s.main}>
        <View style={s.titleRow}>
          <Text style={s.title} numberOfLines={1}>
            {txTitle(tx)}
          </Text>
          {merged ? <Icon name="lock" size={11} color={c.tertiaryLabel} /> : null}
        </View>
        <View style={s.subRow}>
          {onChangeCategory ? (
            <MorphingCategoryPill currentCategory={tx.category} onSelectCategory={onChangeCategory} />
          ) : (
            <Text style={s.sub}>{tx.category || '日常'}</Text>
          )}
          {showTime ? <Text style={s.sub}>· {formatTimeShort(tx.occurredAt)}</Text> : null}
        </View>
      </View>
      <View style={s.right}>
        <Text style={[s.amount, positive && { color: c.positive }]}>{formatTxAmount(tx)}</Text>
        <Text style={s.account}>{accountLabel(tx.accountId)}</Text>
      </View>
      {onPress ? (
        <Icon
          name="chevronDown"
          size={11}
          color={c.tertiaryLabel}
          weight="semibold"
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      ) : null}
    </>
  );

  if (!onPress) return <View style={s.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.fillStrong }]}>
      {content}
    </Pressable>
  );
}

const makeStyles = (c: Palette) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 60,
  },
  main: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  title: { ...type.body, color: c.label, flexShrink: 1 },
  subRow: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: 4, marginTop: 2 },
  sub: { ...type.footnote, color: c.secondaryLabel },
  right: { alignItems: 'flex-end' as const },
  amount: { ...type.body, ...tabular, color: c.label },
  account: { ...type.caption1, color: c.secondaryLabel, marginTop: 2 },
});
