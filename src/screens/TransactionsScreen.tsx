import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { taipeiDate } from '../../core';
import type { Transaction } from '../../core';
import { SafeConfirmButton } from '../components/SafeConfirmButton';
import { Field, SearchField } from '../components/ui/Field';
import { Button, LargeTitle, Section } from '../components/ui/List';
import { Segmented } from '../components/ui/Segmented';
import { formatGroupDateTitle } from '../components/ui/txVisual';
import { isMergedTx, TxRow } from '../components/ui/TxRow';
import { useLedger } from '../store/useLedger';
import { type, usePalette, useThemedStyles, type Palette } from '../theme';

function methodLabel(tx: Transaction): string {
  if (tx.type === 'transfer') {
    const from = tx.accountId === 'bank' ? '玉山' : '現金';
    const to = tx.toAccountId === 'bank' ? '玉山' : '現金';
    return `${from} → ${to}`;
  }
  if (tx.type === 'adjustment') return '餘額校正';
  if (tx.type === 'income') return '收入';
  switch (tx.method) {
    case 'apple_pay':
      return 'Apple Pay';
    case 'debit_card':
      return '簽帳金融卡';
    case 'bank_transfer':
      return '銀行轉帳';
    case 'cash':
      return '現金';
    default:
      return '其他';
  }
}

function sourceLabel(tx: Transaction): string | null {
  const parts: string[] = [];
  if (tx.frontendSlot) parts.push(tx.frontendSlot === 'apple_pay' ? 'Apple Pay 通知' : '手動輸入');
  if (tx.bankSlot) parts.push(tx.bankSlot === 'efingo_push' ? '玉山推播' : '轉帳成功頁');
  return parts.length ? parts.join(' + ') : null;
}

function formatFullTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

interface ScreenProps {
  topInsetPadding?: number;
  bottomInsetPadding?: number;
}

export function TransactionsScreen({ topInsetPadding = 54, bottomInsetPadding = 120 }: ScreenProps) {
  const {
    data,
    summary,
    updateTxCategory,
    splitMergedTx,
    toggleAdvanceTx,
    convertTxToDebtSplit,
    softDeleteTx,
    restoreTx,
    hardDeleteTx,
    emptyTrash,
  } = useLedger();
  const c = usePalette();
  const s = useThemedStyles(makeStyles);

  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [splitTxId, setSplitTxId] = useState<string | null>(null);
  const [splitPeople, setSplitPeople] = useState('');
  const [splitAmount, setSplitAmount] = useState('');

  const activeTxs = useMemo(
    () =>
      data.transactions
        .filter((t) => !t.deletedAt)
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
    [data.transactions],
  );
  const trashTxs = useMemo(
    () =>
      data.transactions
        .filter((t) => Boolean(t.deletedAt))
        .sort((a, b) => Date.parse(b.deletedAt ?? b.occurredAt) - Date.parse(a.deletedAt ?? a.occurredAt)),
    [data.transactions],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = viewMode === 'active' ? activeTxs : trashTxs;
    const filtered = q
      ? source.filter((t) =>
          [t.merchant, t.category, t.note, String(t.amount)].some((f) => (f ?? '').toLowerCase().includes(q)),
        )
      : source;
    const map = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const d = taipeiDate(tx.occurredAt);
      const bucket = map.get(d);
      if (bucket) bucket.push(tx);
      else map.set(d, [tx]);
    }
    return [...map.entries()].map(([date, items]) => ({
      date,
      title: formatGroupDateTitle(date, summary.safe.today),
      total: items
        .filter((t) => t.type === 'expense' && !t.isAdvance)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0),
      items,
    }));
  }, [viewMode, activeTxs, trashTxs, query, summary.safe.today]);

  const openSplit = (tx: Transaction) => {
    if (splitTxId === tx.id) {
      setSplitTxId(null);
      return;
    }
    setSplitTxId(tx.id);
    setSplitPeople('');
    setSplitAmount(String(Math.max(1, Math.round(tx.amount / 2))));
  };

  const confirmSplit = (tx: Transaction) => {
    const names = splitPeople
      .split(/[,，、\s]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    const people = names.length > 0 ? names : ['朋友'];
    const each = Math.max(1, Math.round(Number(splitAmount) || 0));
    convertTxToDebtSplit(
      tx.id,
      people.map((name) => ({ personName: name, amount: each })),
    );
    setSplitTxId(null);
  };

  const renderDetail = (tx: Transaction) => {
    const merged = isMergedTx(tx);
    const source = sourceLabel(tx);
    return (
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={s.detail}>
        <DetailLine label="時間" value={formatFullTime(tx.occurredAt)} />
        <DetailLine label="方式" value={methodLabel(tx)} />
        {source ? <DetailLine label="來源" value={merged ? `${source}（已合併，只扣一次）` : source} /> : null}
        {tx.isAdvance ? <DetailLine label="代墊" value="不計入個人花費" /> : null}
        {tx.note ? <DetailLine label="備註" value={tx.note} /> : null}

        {viewMode === 'active' ? (
          <View style={s.actions}>
            {merged ? <Button title="其實買了兩次，拆開" variant="gray" size="small" onPress={() => splitMergedTx(tx.id)} /> : null}
            {tx.type === 'expense' ? (
              <>
                <Button
                  title={tx.isAdvance ? '改回個人花費' : '標記為代墊'}
                  variant="gray"
                  size="small"
                  onPress={() => toggleAdvanceTx(tx.id)}
                />
                <Button
                  title={splitTxId === tx.id ? '取消分帳' : '分帳給朋友'}
                  variant="gray"
                  size="small"
                  onPress={() => openSplit(tx)}
                />
              </>
            ) : null}
            <SafeConfirmButton label="刪除" confirmLabel="確認刪除" onConfirm={() => softDeleteTx(tx.id)} compact />
          </View>
        ) : (
          <View style={s.actions}>
            <Button title="還原" variant="tinted" size="small" onPress={() => restoreTx(tx.id)} />
            <SafeConfirmButton label="永久刪除" confirmLabel="確認永久刪除" onConfirm={() => hardDeleteTx(tx.id)} compact />
          </View>
        )}

        {viewMode === 'active' && splitTxId === tx.id ? (
          <Animated.View entering={FadeIn.duration(180)} style={s.splitBox}>
            <Text style={s.splitTitle}>朋友要還你多少？代墊的部分不會算進你的預算。</Text>
            <View style={s.chipRow}>
              {[
                { label: '2 人平分', amt: Math.round(tx.amount / 2) },
                { label: '3 人平分', amt: Math.round(tx.amount / 3) },
                { label: '4 人平分', amt: Math.round(tx.amount / 4) },
                { label: '全額', amt: tx.amount },
              ].map((q) => {
                const selected = splitAmount === String(Math.max(1, q.amt));
                return (
                  <Pressable
                    key={q.label}
                    onPress={() => setSplitAmount(String(Math.max(1, q.amt)))}
                    style={[s.chip, selected && { backgroundColor: c.label }]}
                  >
                    <Text style={[s.chipText, selected && { color: c.card }]}>
                      {q.label} ${q.amt.toLocaleString()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={s.splitInputs}>
              <Field
                style={{ flex: 1.5 }}
                value={splitPeople}
                onChangeText={setSplitPeople}
                placeholder="名字，多人用逗號分隔"
              />
              <Field
                style={{ flex: 1 }}
                value={splitAmount}
                onChangeText={setSplitAmount}
                keyboardType="numeric"
                placeholder="每人金額"
              />
            </View>
            <Button title="建立欠款" onPress={() => confirmSplit(tx)} size="medium" />
          </Animated.View>
        ) : null}
      </Animated.View>
    );
  };

  const listEmpty = groups.length === 0;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingTop: topInsetPadding, paddingBottom: bottomInsetPadding }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <LargeTitle title="明細" />

      <View style={s.controls}>
        <SearchField value={query} onChangeText={setQuery} />
        <Segmented
          options={[
            { value: 'active', label: `全部 ${activeTxs.length}` },
            { value: 'trash', label: `最近刪除 ${trashTxs.length}` },
          ]}
          value={viewMode}
          onChange={(v) => {
            setViewMode(v);
            setExpandedId(null);
            setSplitTxId(null);
          }}
        />
      </View>

      {viewMode === 'trash' && trashTxs.length > 0 ? (
        <View style={s.trashBar}>
          <Text style={s.trashHint}>刪除的項目會保留 7 天。</Text>
          <SafeConfirmButton label="全部刪除" confirmLabel="確認清空" onConfirm={emptyTrash} compact />
        </View>
      ) : null}

      {listEmpty ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>
            {query ? '找不到符合的紀錄' : viewMode === 'active' ? '還沒有紀錄' : '沒有最近刪除的項目'}
          </Text>
          <Text style={s.emptySub}>
            {query
              ? '換個關鍵字試試。'
              : viewMode === 'active'
              ? '從總覽記一筆，或讓 iOS 捷徑自動記帳。'
              : '刪除的紀錄會在這裡保留 7 天，可以還原。'}
          </Text>
        </View>
      ) : (
        groups.map((g) => (
          <Animated.View key={g.date} layout={LinearTransition.duration(220)}>
            <Section
              header={g.title}
              headerRight={g.total > 0 ? <Text style={s.groupTotal}>−${g.total.toLocaleString()}</Text> : undefined}
              separatorInset={62}
            >
              {g.items.map((tx) => (
                <View key={tx.id}>
                  <TxRow
                    tx={tx}
                    expanded={expandedId === tx.id}
                    onChangeCategory={viewMode === 'active' ? (cat) => updateTxCategory(tx.id, cat) : undefined}
                    onPress={() => {
                      setExpandedId((cur) => (cur === tx.id ? null : tx.id));
                      if (splitTxId && splitTxId !== tx.id) setSplitTxId(null);
                    }}
                  />
                  {expandedId === tx.id ? renderDetail(tx) : null}
                </View>
              ))}
            </Section>
          </Animated.View>
        ))
      )}
    </ScrollView>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.detailLine}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  controls: { paddingHorizontal: 16, gap: 12, marginBottom: 20 },
  trashBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    marginTop: -8,
    marginBottom: 16,
  },
  trashHint: { ...type.footnote, color: c.secondaryLabel },
  groupTotal: { ...type.footnote, color: c.secondaryLabel, fontVariant: ['tabular-nums' as const] },
  detail: { paddingLeft: 62, paddingRight: 16, paddingBottom: 14, gap: 6 },
  detailLine: { flexDirection: 'row' as const, gap: 12 },
  detailLabel: { ...type.footnote, color: c.secondaryLabel, width: 34 },
  detailValue: { ...type.footnote, color: c.label, flex: 1 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 8 },
  splitBox: { marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: c.cardRaised, gap: 10 },
  splitTitle: { ...type.footnote, color: c.secondaryLabel },
  chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  chip: { height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: c.fill, justifyContent: 'center' as const },
  chipText: { ...type.footnote, color: c.label, fontWeight: '500' as const },
  splitInputs: { flexDirection: 'row' as const, gap: 8 },
  empty: { paddingVertical: 60, paddingHorizontal: 40, alignItems: 'center' as const },
  emptyTitle: { ...type.title3, color: c.label },
  emptySub: { ...type.subheadline, color: c.secondaryLabel, marginTop: 6, textAlign: 'center' as const },
});
