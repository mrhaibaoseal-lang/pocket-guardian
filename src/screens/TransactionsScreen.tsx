import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Transaction } from '../../core';
import { StaggeredItem, triggerHaptic } from '../components/iosAnimations';
import { LiquidGlassCard } from '../components/LiquidGlassView';
import { SafeConfirmButton } from '../components/SafeConfirmButton';
import { useLedger } from '../store/useLedger';

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
  if (tx.type === 'transfer') return '⇄ ATM 內部互轉';
  if (tx.type === 'adjustment') return '⚖ 魔術平帳校正';
  if (tx.type === 'income') return '↓ 收入入帳';
  switch (tx.method) {
    case 'apple_pay':
      return ' Apple Pay (玉山)';
    case 'debit_card':
      return '▣ 玉山簽帳金融卡';
    case 'bank_transfer':
      return '↗ 玉山銀行轉帳';
    case 'cash':
      return '◈ 現金';
    default:
      return '◈ 其他';
  }
}

export function TransactionsScreen() {
  const {
    data,
    splitMergedTx,
    toggleAdvanceTx,
    convertTxToDebtSplit,
    softDeleteTx,
    restoreTx,
    hardDeleteTx,
    emptyTrash,
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

      <View style={styles.segmentRow}>
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
      </View>

      {viewMode === 'trash' && trashTxs.length > 0 && (
        <View style={styles.trashToolbar}>
          <Text style={styles.trashToolbarText}>
            共 {trashTxs.length} 筆已撤銷紀錄
          </Text>
          <SafeConfirmButton
            label={`🗑️ 一鍵全部刪除 (${trashTxs.length})`}
            confirmLabel="⚠️ 再按一次永久清空 (3s)"
            onConfirm={emptyTrash}
            compact
          />
        </View>
      )}

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {list.length === 0 ? (
          <LiquidGlassCard shape="card" elevated contentStyle={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>
              {viewMode === 'active' ? '' : '◈'}
            </Text>
            <Text style={styles.emptyTitle}>
              {viewMode === 'active' ? '目前沒有交易紀錄' : '回收桶是空的'}
            </Text>
            <Text style={styles.emptyDesc}>
              {viewMode === 'active'
                ? '可由首頁快速記帳，或透過 iOS 捷徑自動接收 Apple Pay 與玉山通知'
                : '被撤銷的交易會在這裡保留 7 天，隨時可無損還原'}
            </Text>
          </LiquidGlassCard>
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
              ? '#6EE7B7'
              : tx.type === 'transfer' || tx.isAdvance
              ? '#CBD5E1'
              : '#F8FAFC';

            const amountPrefix = isPositive
              ? '+'
              : tx.type === 'transfer'
              ? '⇄ '
              : '-';

            return (
              <StaggeredItem key={tx.id} index={idx}>
                <LiquidGlassCard
                  shape="card"
                  elevated={isMerged}
                  contentStyle={styles.txCard}
                >
                {/* Top Row: Title + Amount */}
                <View style={styles.txTopRow}>
                  <View style={styles.txTitleWrap}>
                    <Text style={styles.txTitle}>
                      {tx.merchant || tx.category || '未命名交易'}
                    </Text>
                    <Text style={styles.txMeta}>
                      {formatTaipeiTime(tx.occurredAt)} · {methodBadgeText(tx)}
                    </Text>
                  </View>

                  <View style={styles.txAmountWrap}>
                    <Text style={[styles.txAmount, { color: amountColor }]}>
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

                {/* Slot Pairing Badges (Desert Titanium & Warm Amber Pills) */}
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

                {/* Action Footer */}
                {viewMode === 'active' ? (
                  <View style={styles.txActionRow}>
                    <View style={styles.leftActions}>
                      {isMerged && (
                        <Pressable
                          style={styles.splitBtn}
                          onPress={() => splitMergedTx(tx.id)}
                        >
                          <Text style={styles.splitBtnText}>
                            我真的買了兩次（拆成兩筆）
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
                              {tx.isAdvance ? '改回個人花費' : '標記幫朋友代墊'}
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
                              {debtSplitTxId === tx.id ? '✕ 收起拆帳' : '🤝 轉欠款／AA拆帳'}
                            </Text>
                          </Pressable>
                        </>
                      )}
                    </View>

                    <SafeConfirmButton
                      label="撤銷"
                      confirmLabel="再點確認撤銷"
                      onConfirm={() => softDeleteTx(tx.id)}
                      compact
                    />
                  </View>
                ) : (
                  <View style={styles.txActionRow}>
                    <Text style={styles.deletedTimeText}>
                      已移入回收桶（7天內可還原）
                    </Text>
                    <View style={styles.trashItemBtnGroup}>
                      <SafeConfirmButton
                        label="永久刪除"
                        confirmLabel="確認刪除"
                        onConfirm={() => hardDeleteTx(tx.id)}
                        compact
                      />
                      <Pressable
                        style={styles.restoreBtn}
                        onPress={() => restoreTx(tx.id)}
                      >
                        <Text style={styles.restoreBtnText}>一鍵無損還原</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Idea 2: Inline Convert/AA-Split to Debt Drawer */}
                {viewMode === 'active' && debtSplitTxId === tx.id && (
                  <View style={styles.debtSplitDrawer}>
                    <Text style={styles.debtSplitTitle}>
                      🧮 從這筆消費 (${tx.amount}) 轉出朋友欠款（代墊部分不吃個人預算）
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
                        placeholderTextColor="rgba(235, 225, 210, 0.35)"
                      />
                      <TextInput
                        style={[styles.debtSplitInput, { flex: 0.8 }]}
                        keyboardType="numeric"
                        value={debtAmountInput}
                        onChangeText={setDebtAmountInput}
                        placeholder="每人金額"
                        placeholderTextColor="rgba(235, 225, 210, 0.35)"
                      />
                    </View>

                    <Pressable
                      style={styles.debtSplitConfirmBtn}
                      onPress={() => handleConfirmDebtSplit(tx)}
                    >
                      <Text style={styles.debtSplitConfirmText}>
                        ✅ 建立欠款並保護個人預算
                      </Text>
                    </Pressable>
                  </View>
                )}
                </LiquidGlassCard>
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
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  headerRow: {
    marginBottom: 10,
  },
  screenTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  screenSub: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 12,
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
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  segmentText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#34D399',
    fontWeight: '700',
  },
  trashToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderColor: 'rgba(52, 211, 153, 0.28)',
    borderWidth: 0.8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  trashToolbarText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  trashItemBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    gap: 6,
  },
  emptyEmoji: {
    color: '#CBD5E1',
    fontSize: 32,
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDesc: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  txCard: {
    padding: 15,
    gap: 8,
  },
  txTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  txTitleWrap: {
    flex: 1,
  },
  txTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  txMeta: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 11,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  txAmountWrap: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  txAccountTag: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 10,
    marginTop: 2,
  },
  slotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  slotPillTitanium: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 0.8,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  slotPillTitaniumText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  slotPillAmber: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(52, 211, 153, 0.32)',
    borderWidth: 0.8,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  slotPillAmberText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  txNote: {
    color: '#CBD5E1',
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
    borderTopColor: 'rgba(255, 255, 255, 0.10)',
  },
  leftActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  splitBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(52, 211, 153, 0.32)',
    borderWidth: 0.8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  splitBtnText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  advanceBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 0.8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  advanceBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  advanceBtnText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  deletedTimeText: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 11,
  },
  restoreBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  restoreBtnText: {
    color: '#04120C',
    fontSize: 12,
    fontWeight: '800',
  },
  debtSplitDrawer: {
    backgroundColor: 'rgba(8, 12, 15, 0.88)',
    borderWidth: 0.8,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    borderRadius: 12,
    padding: 11,
    gap: 8,
    marginTop: 4,
  },
  debtSplitTitle: {
    color: '#34D399',
    fontSize: 11.5,
    fontWeight: '700',
  },
  debtSplitQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  debtQuickChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  debtQuickChipText: {
    color: '#CBD5E1',
    fontSize: 10.5,
    fontWeight: '600',
  },
  debtSplitInputRow: {
    flexDirection: 'row',
    gap: 6,
  },
  debtSplitInput: {
    backgroundColor: 'rgba(5, 8, 10, 0.85)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    color: '#F8FAFC',
    fontSize: 12,
  },
  debtSplitConfirmBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  debtSplitConfirmText: {
    color: '#04120C',
    fontSize: 12,
    fontWeight: '800',
  },
});
