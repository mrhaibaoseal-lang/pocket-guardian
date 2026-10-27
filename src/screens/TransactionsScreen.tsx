import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Transaction } from '../../core';
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
  if (tx.type === 'transfer') return '🏧 ATM 內部互轉';
  if (tx.type === 'adjustment') return '⚖️ 魔術平帳校正';
  if (tx.type === 'income') return '💰 收入入帳';
  switch (tx.method) {
    case 'apple_pay':
      return '💳 Apple Pay (玉山)';
    case 'debit_card':
      return '🏦 玉山簽帳金融卡';
    case 'bank_transfer':
      return '📲 玉山銀行轉帳';
    case 'cash':
      return '💵 現金';
    default:
      return '📝 其他';
  }
}

export function TransactionsScreen() {
  const {
    data,
    splitMergedTx,
    toggleAdvanceTx,
    softDeleteTx,
    restoreTx,
  } = useLedger();

  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');

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
          <Text style={styles.screenTitle}>📋 帳務明細與雙源配對</Text>
          <Text style={styles.screenSub}>
            Apple Pay 與玉山通知自動合併為 1 筆；若連買兩次可一鍵拆單
          </Text>
        </View>
      </View>

      <View style={styles.segmentRow}>
        <Pressable
          style={[styles.segmentBtn, viewMode === 'active' && styles.segmentBtnActive]}
          onPress={() => setViewMode('active')}
        >
          <Text
            style={[
              styles.segmentText,
              viewMode === 'active' && styles.segmentTextActive,
            ]}
          >
            ✅ 有效帳目 ({activeTxs.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.segmentBtn, viewMode === 'trash' && styles.segmentBtnTrash]}
          onPress={() => setViewMode('trash')}
        >
          <Text
            style={[
              styles.segmentText,
              viewMode === 'trash' && styles.segmentTextActive,
            ]}
          >
            🗑️ 7天回收桶 ({trashTxs.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {list.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>
              {viewMode === 'active' ? '📭' : '🧹'}
            </Text>
            <Text style={styles.emptyTitle}>
              {viewMode === 'active' ? '目前沒有交易紀錄' : '回收桶是空的'}
            </Text>
            <Text style={styles.emptyDesc}>
              {viewMode === 'active'
                ? '可由下方戰情室快速記帳，或到「⚡ 捷徑測試台」模擬 Apple Pay 與玉山通知'
                : '被撤銷的交易會在這裡保留 7 天，隨時可無損還原'}
            </Text>
          </View>
        ) : (
          list.map((tx) => {
            const isMerged = Boolean(
              tx.frontendSlot &&
                tx.bankSlot &&
                tx.mergedMetadata?.frontendEvent &&
                tx.mergedMetadata?.bankEvent,
            );

            const amountColor =
              tx.type === 'income' || (tx.type === 'adjustment' && tx.amount > 0)
                ? '#34D399'
                : tx.type === 'transfer' || tx.isAdvance
                ? '#38BDF8'
                : '#F8FAFC';

            const amountPrefix =
              tx.type === 'income' || (tx.type === 'adjustment' && tx.amount > 0)
                ? '+'
                : tx.type === 'transfer'
                ? '⇄ '
                : tx.type === 'adjustment' && tx.amount < 0
                ? '-'
                : '-';

            return (
              <View
                key={tx.id}
                style={[
                  styles.txCard,
                  isMerged && styles.txCardMerged,
                  tx.isAdvance && styles.txCardAdvance,
                ]}
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

                {/* Slot Pairing Badges (Visualizing the Deduplication Engine) */}
                {(tx.frontendSlot || tx.bankSlot || tx.isAdvance) && (
                  <View style={styles.slotRow}>
                    {tx.frontendSlot && (
                      <View style={styles.slotPillFrontend}>
                        <Text style={styles.slotPillText}>
                          前端槽：{tx.frontendSlot === 'apple_pay' ? '💳 Apple Pay 店名' : '✍️ 手動輸入'}
                        </Text>
                      </View>
                    )}
                    {tx.bankSlot && (
                      <View style={styles.slotPillBank}>
                        <Text style={styles.slotPillText}>
                          銀行槽：{tx.bankSlot === 'efingo_push' ? '🏦 玉山 e.Fingo' : '📄 轉帳成功頁'}
                        </Text>
                      </View>
                    )}
                    {isMerged && (
                      <View style={styles.slotPillLocked}>
                        <Text style={styles.slotPillLockedText}>
                          🔒 雙源已合併上鎖（只扣 1 次錢）
                        </Text>
                      </View>
                    )}
                    {tx.isAdvance && (
                      <View style={styles.slotPillAdvance}>
                        <Text style={styles.slotPillAdvanceText}>
                          🤝 代墊款（不計入個人花費）
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
                            ✂️ 我真的買了兩次（拆成兩筆）
                          </Text>
                        </Pressable>
                      )}

                      {tx.type === 'expense' && (
                        <Pressable
                          style={[
                            styles.advanceBtn,
                            tx.isAdvance && styles.advanceBtnActive,
                          ]}
                          onPress={() => toggleAdvanceTx(tx.id)}
                        >
                          <Text style={styles.advanceBtnText}>
                            {tx.isAdvance ? '↩️ 改回個人花費' : '🤝 標記幫朋友代墊'}
                          </Text>
                        </Pressable>
                      )}
                    </View>

                    <SafeConfirmButton
                      label="🗑️ 撤銷"
                      confirmLabel="⚠️ 再點確認撤銷"
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
                      <Text style={styles.restoreBtnText}>♻️ 一鍵無損還原</Text>
                    </Pressable>
                  </View>
                )}
              </View>
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
    backgroundColor: '#0B0F17',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  headerRow: {
    marginBottom: 10,
  },
  screenTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  screenSub: {
    color: '#94A3B8',
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
    borderRadius: 12,
    backgroundColor: '#131C2E',
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
  },
  segmentBtnTrash: {
    backgroundColor: '#3B1D2E',
    borderColor: '#F43F5E',
  },
  segmentText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#F8FAFC',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 28,
    gap: 10,
  },
  emptyBox: {
    backgroundColor: '#131C2E',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginTop: 20,
  },
  emptyEmoji: {
    fontSize: 38,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDesc: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  txCard: {
    backgroundColor: '#131C2E',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 8,
  },
  txCardMerged: {
    borderColor: '#10B981',
    backgroundColor: '#0D2124',
  },
  txCardAdvance: {
    borderColor: '#38BDF8',
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
    fontWeight: '800',
  },
  txMeta: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 3,
  },
  txAmountWrap: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 18,
    fontWeight: '900',
  },
  txAccountTag: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  slotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  slotPillFrontend: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#0284C7',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  slotPillBank: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#059669',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  slotPillText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  slotPillLocked: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: '#D97706',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  slotPillLockedText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '700',
  },
  slotPillAdvance: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  slotPillAdvanceText: {
    color: '#BAE6FD',
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  leftActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  splitBtn: {
    backgroundColor: '#3B2F13',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  splitBtnText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '700',
  },
  advanceBtn: {
    backgroundColor: '#1E293B',
    borderColor: '#475569',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  advanceBtnActive: {
    backgroundColor: '#0C4A6E',
    borderColor: '#38BDF8',
  },
  advanceBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  deletedTimeText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  restoreBtn: {
    backgroundColor: '#065F46',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  restoreBtnText: {
    color: '#ECFDF5',
    fontSize: 12,
    fontWeight: '700',
  },
});
