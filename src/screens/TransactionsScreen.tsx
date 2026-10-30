import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Transaction } from '../../core';
import { AppSymbol, type AppIconName } from '../components/AppSymbol';
import { StaggeredItem, triggerHaptic } from '../components/iosAnimations';
import { LiquidGlassCard, LiquidGlassGroup } from '../components/LiquidGlassView';
import { SafeConfirmButton } from '../components/SafeConfirmButton';
import { useLedger } from '../store/useLedger';
import { theme } from '../theme/tokens';

function formatTaipeiTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

function methodBadgeText(tx: Transaction): string {
  if (tx.type === 'transfer') return 'ATM 內部互轉';
  if (tx.type === 'adjustment') return '餘額平帳校正';
  if (tx.type === 'income') return '收入入帳';
  switch (tx.method) {
    case 'apple_pay':
      return 'Apple Pay (玉山)';
    case 'debit_card':
      return '玉山簽帳金融卡';
    case 'bank_transfer':
      return '玉山銀行轉帳';
    case 'cash':
      return '現金';
    default:
      return '其他';
  }
}

function iconForTx(tx: Transaction): AppIconName {
  if (tx.type === 'transfer') return 'arrow.left.arrow.right';
  if (tx.type === 'adjustment') return 'equal.circle';
  if (tx.type === 'income') return 'arrow.down.left';
  if (tx.method === 'apple_pay') return 'wave.3.right';
  if (tx.method === 'bank_transfer') return 'arrow.up.right';
  if (tx.method === 'debit_card') return 'creditcard';
  return 'banknote';
}

export function TransactionsScreen() {
  const {
    data,
    splitMergedTx,
    toggleAdvanceTx,
    convertTxToDebtSplit,
    softDeleteTx,
    restoreTx,
  } = useLedger();

  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [debtSplitTxId, setDebtSplitTxId] = useState<string | null>(null);
  const [debtPeopleInput, setDebtPeopleInput] = useState('');
  const [debtAmountInput, setDebtAmountInput] = useState('');

  const handleOpenDebtSplit = (tx: Transaction) => {
    if (debtSplitTxId === tx.id) {
      setDebtSplitTxId(null);
      return;
    }
    setDebtSplitTxId(tx.id);
    setDebtPeopleInput('');
    setDebtAmountInput(String(Math.max(1, Math.round(tx.amount / 2))));
  };

  const handleConfirmDebtSplit = (tx: Transaction) => {
    const names = debtPeopleInput
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const personList = names.length > 0 ? names : ['朋友'];
    const perPersonAmt = Math.max(1, Math.round(Number(debtAmountInput) || 0));
    convertTxToDebtSplit(
      tx.id,
      personList.map((name) => ({ personName: name, amount: perPersonAmt })),
    );
    setDebtSplitTxId(null);
  };

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

  const list = viewMode === 'active' ? activeTxs : trashTxs;

  return (
    <View style={styles.container}>
      {/* Header & Mode Switcher */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.screenTitle}>帳務明細</Text>
          <Text style={styles.screenSub}>
            Apple Pay 與玉山通知自動配對 · 支援一鍵拆單
          </Text>
        </View>
      </View>

      <LiquidGlassGroup spacing={8} style={styles.segmentRow}>
        <Pressable
          style={[styles.segmentBtn, viewMode === 'active' && styles.segmentBtnActive]}
          onPress={() => {
            triggerHaptic('selection');
            setViewMode('active');
          }}
        >
          <Text
            style={[
              styles.segmentText,
              viewMode === 'active' && styles.segmentTextActive,
            ]}
          >
            有效帳目 ({activeTxs.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.segmentBtn, viewMode === 'trash' && styles.segmentBtnActive]}
          onPress={() => {
            triggerHaptic('selection');
            setViewMode('trash');
          }}
        >
          <Text
            style={[
              styles.segmentText,
              viewMode === 'trash' && styles.segmentTextActive,
            ]}
          >
            7天回收桶 ({trashTxs.length})
          </Text>
        </Pressable>
      </LiquidGlassGroup>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {list.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconCircle}>
              <AppSymbol name="list.bullet" size={18} color={theme.colors.text.tertiary} />
            </View>
            <Text style={styles.emptyTitle}>
              {viewMode === 'active' ? '目前沒有交易紀錄' : '回收桶是空的'}
            </Text>
            <Text style={styles.emptyDesc}>
              {viewMode === 'active'
                ? '可由首頁快速記帳，或透過 iOS 捷徑自動接收 Apple Pay 與玉山通知'
                : '被撤銷的交易會在這裡保留 7 天，隨時可無損還原'}
            </Text>
          </View>
        ) : (
          list.map((tx, idx) => {
            const isMerged = Boolean(
              tx.frontendSlot &&
                tx.bankSlot &&
                tx.mergedMetadata?.frontendEvent &&
                tx.mergedMetadata?.bankEvent,
            );

            const isPositive =
              tx.type === 'income' || (tx.type === 'adjustment' && tx.amount > 0);

            const amountColor = isPositive
              ? theme.colors.semantic.remaining
              : tx.type === 'transfer' || tx.isAdvance
              ? theme.colors.text.secondary
              : theme.colors.text.primary;

            const amountPrefix = isPositive
              ? '+'
              : tx.type === 'transfer'
              ? ''
              : '-';

            return (
              <StaggeredItem key={tx.id} index={idx}>
                <View style={styles.txCard}>
                  <View style={styles.txTopRow}>
                    <View style={styles.txIconCircle}>
                      <AppSymbol name={iconForTx(tx)} size={15} color={theme.colors.text.secondary} />
                    </View>
                    <View style={styles.txTitleWrap}>
                      <Text style={styles.txTitle}>
                        {tx.merchant || tx.category || '未命名交易'}
                      </Text>
                      <Text style={styles.txMeta}>
                        {formatTaipeiTime(tx.occurredAt)} · {methodBadgeText(tx)}
                      </Text>
                    </View>

                    <View style={styles.txAmountWrap}>
                      <Text
                        style={[styles.txAmount, { color: amountColor }]}
                        maxFontSizeMultiplier={theme.typography.maxAmountFontScale}
                      >
                        {amountPrefix}${Math.abs(tx.amount).toLocaleString()}
                      </Text>
                      <Text style={styles.txAccountTag}>
                        {tx.type === 'transfer'
                          ? `${tx.accountId === 'bank' ? '玉山' : '現金'} → ${
                              tx.toAccountId === 'bank' ? '玉山' : '現金'
                            }`
                          : tx.accountId === 'bank'
                          ? '玉山銀行'
                          : '現金錢包'}
                      </Text>
                    </View>
                  </View>

                  {(tx.frontendSlot || tx.bankSlot || tx.isAdvance) && (
                    <View style={styles.slotRow}>
                      {tx.frontendSlot && (
                        <View style={styles.slotPillTitanium}>
                          <Text style={styles.slotPillTitaniumText}>
                            前端槽：{tx.frontendSlot === 'apple_pay' ? 'Apple Pay 店名' : '手動輸入'}
                          </Text>
                        </View>
                      )}
                      {tx.bankSlot && (
                        <View style={styles.slotPillTitanium}>
                          <Text style={styles.slotPillTitaniumText}>
                            銀行槽：{tx.bankSlot === 'efingo_push' ? '玉山 e.Fingo' : '轉帳成功頁'}
                          </Text>
                        </View>
                      )}
                      {isMerged && (
                        <View style={styles.slotPillAmber}>
                          <AppSymbol name="lock.fill" size={9} color={theme.colors.text.secondary} />
                          <Text style={styles.slotPillAmberText}>
                            雙源已合併上鎖（只扣 1 次錢）
                          </Text>
                        </View>
                      )}
                      {tx.isAdvance && (
                        <View style={styles.slotPillAmber}>
                          <Text style={styles.slotPillAmberText}>
                            代墊款（不計入個人花費）
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {tx.note ? <Text style={styles.txNote}>備註：{tx.note}</Text> : null}

                  {viewMode === 'active' ? (
                    <View style={styles.txActionRow}>
                      <View style={styles.leftActions}>
                        {isMerged && (
                          <Pressable
                            style={styles.splitBtn}
                            onPress={() => splitMergedTx(tx.id)}
                          >
                            <Text style={styles.splitBtnText}>
                              拆成兩筆獨立交易
                            </Text>
                          </Pressable>
                        )}

                        {tx.type === 'expense' && (
                          <>
                            <Pressable
                              style={[
                                styles.advanceBtn,
                                tx.isAdvance && styles.advanceBtnActive,
                              ]}
                              onPress={() => toggleAdvanceTx(tx.id)}
                            >
                              <Text style={styles.advanceBtnText}>
                                {tx.isAdvance ? '改回個人花費' : '標記朋友代墊'}
                              </Text>
                            </Pressable>

                            <Pressable
                              style={[
                                styles.advanceBtn,
                                debtSplitTxId === tx.id && styles.advanceBtnActive,
                              ]}
                              onPress={() => handleOpenDebtSplit(tx)}
                            >
                              <Text style={styles.advanceBtnText}>
                                {debtSplitTxId === tx.id ? '收起拆帳' : '轉欠款 / AA拆帳'}
                              </Text>
                            </Pressable>
                          </>
                        )}
                      </View>

                      <SafeConfirmButton
                        label="撤銷"
                        confirmLabel="確認撤銷"
                        onConfirm={() => softDeleteTx(tx.id)}
                        compact
                      />
                    </View>
                    ) : (
                    <View style={styles.txActionRow}>
                      <Text style={styles.deletedTimeText}>
                        已移入回收桶（7天內可還原）
                      </Text>
                      <Pressable
                        style={styles.restoreBtn}
                        onPress={() => restoreTx(tx.id)}
                      >
                        <Text style={styles.restoreBtnText}>無損還原</Text>
                      </Pressable>
                    </View>
                  )}

                  {viewMode === 'active' && debtSplitTxId === tx.id && (
                    <View style={styles.debtSplitDrawer}>
                      <Text style={styles.debtSplitTitle}>
                        從這筆消費 (${tx.amount}) 轉出朋友欠款（代墊部分不吃個人預算）
                      </Text>

                      <View style={styles.debtSplitQuickRow}>
                        {[
                          { label: '2人平分', amt: Math.round(tx.amount / 2) },
                          { label: '3人平分', amt: Math.round(tx.amount / 3) },
                          { label: '4人平分', amt: Math.round(tx.amount / 4) },
                          { label: '全額代墊', amt: tx.amount },
                        ].map((q) => (
                          <Pressable
                            key={q.label}
                            style={styles.debtQuickChip}
                            onPress={() => setDebtAmountInput(String(Math.max(1, q.amt)))}
                          >
                            <Text style={styles.debtQuickChipText}>
                              {q.label} (${q.amt})
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={styles.debtSplitInputRow}>
                        <TextInput
                          style={[styles.debtSplitInput, { flex: 1.4 }]}
                          value={debtPeopleInput}
                          onChangeText={setDebtPeopleInput}
                          placeholder="朋友稱呼（多人用逗號，如：阿明, 小華）"
                          placeholderTextColor={theme.colors.text.tertiary}
                        />
                        <TextInput
                          style={[styles.debtSplitInput, { flex: 0.8 }]}
                          keyboardType="numeric"
                          value={debtAmountInput}
                          onChangeText={setDebtAmountInput}
                          placeholder="每人金額"
                          placeholderTextColor={theme.colors.text.tertiary}
                        />
                      </View>

                      <Pressable
                        style={styles.debtSplitConfirmBtn}
                        onPress={() => handleConfirmDebtSplit(tx)}
                      >
                        <Text style={styles.debtSplitConfirmText}>
                          建立欠款並保護個人預算
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </StaggeredItem>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 10,
  },
  headerRow: {
    marginBottom: 10,
  },
  screenTitle: {
    color: theme.colors.text.primary,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  screenSub: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
    marginTop: 2,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.listSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
  },
  segmentText: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 28,
    gap: 10,
  },
  emptyBox: {
    padding: 28,
    alignItems: 'center',
    gap: 8,
    borderRadius: theme.radii.listGroup,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.listSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  emptyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.innerCard,
    backgroundColor: theme.colors.background.subtleSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  emptyDesc: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
    textAlign: 'center',
    lineHeight: 18,
  },
  txCard: {
    padding: 15,
    gap: 8,
    borderRadius: theme.radii.listGroup,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.listSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  txTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  txIconCircle: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.chip,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.subtleSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  txTitleWrap: {
    flex: 1,
  },
  txTitle: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  txMeta: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.micro.fontSize,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  txAmountWrap: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 17,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  txAccountTag: {
    color: theme.colors.text.tertiary,
    fontSize: 10,
    marginTop: 2,
  },
  slotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  slotPillTitanium: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderColor: theme.colors.glass.subtleBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.pill,
  },
  slotPillTitaniumText: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
  },
  slotPillAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.pill,
  },
  slotPillAmberText: {
    color: theme.colors.text.primary,
    fontSize: 11,
    fontWeight: '500',
  },
  txNote: {
    color: theme.colors.text.secondary,
    fontSize: 12,
  },
  txActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.glass.hairline,
  },
  leftActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  splitBtn: {
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
  },
  splitBtnText: {
    color: theme.colors.text.primary,
    fontSize: 11,
    fontWeight: '500',
  },
  advanceBtn: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderColor: theme.colors.glass.subtleBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
  },
  advanceBtnActive: {
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
  },
  advanceBtnText: {
    color: theme.colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
  },
  deletedTimeText: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
  },
  restoreBtn: {
    backgroundColor: theme.colors.accent.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radii.pill,
  },
  restoreBtnText: {
    color: theme.colors.text.inverse,
    fontSize: 12,
    fontWeight: '600',
  },
  debtSplitDrawer: {
    backgroundColor: theme.colors.background.elevatedSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.fallbackBorder,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
    padding: 11,
    gap: 8,
    marginTop: 4,
  },
  debtSplitTitle: {
    color: theme.colors.text.primary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  debtSplitQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  debtQuickChip: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radii.pill,
  },
  debtQuickChipText: {
    color: theme.colors.text.secondary,
    fontSize: 10.5,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  debtSplitInputRow: {
    flexDirection: 'row',
    gap: 6,
  },
  debtSplitInput: {
    backgroundColor: theme.colors.background.base,
    borderWidth: 1,
    borderColor: theme.colors.glass.fallbackBorder,
    borderRadius: theme.radii.chip,
    paddingHorizontal: 9,
    paddingVertical: 6,
    color: theme.colors.text.primary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  debtSplitConfirmBtn: {
    backgroundColor: theme.colors.accent.primary,
    paddingVertical: 8,
    borderRadius: theme.radii.chip,
    alignItems: 'center',
  },
  debtSplitConfirmText: {
    color: theme.colors.text.inverse,
    fontSize: 12,
    fontWeight: '600',
  },
});
