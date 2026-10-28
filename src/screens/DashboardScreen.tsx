import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { taipeiDate } from '../../core';
import type { Transaction } from '../../core';
import type { ActiveModal } from '../components/ActionSheetModals';
import { LiquidGlassCard } from '../components/LiquidGlassView';
import {
  getCategoryGlassTint,
  MorphingCategoryPill,
} from '../components/MorphingCategoryPill';
import { useLedger } from '../store/useLedger';

interface DashboardScreenProps {
  topInsetPadding?: number;
  bottomInsetPadding?: number;
  onOpenModal: (modal: ActiveModal, presetCategory?: string) => void;
  onNavigateTab: (tab: 'dashboard' | 'transactions' | 'testbench' | 'settings') => void;
  onScrollShrinkChange?: (shrunk: boolean) => void;
}

const QUICK_CASH_CHIPS = [
  { glyph: '◈', label: '超商', category: '超商' },
  { glyph: '◯', label: '食物', category: '食物' },
  { glyph: '△', label: '飲料', category: '飲料' },
  { glyph: '□', label: '車費', category: '車費' },
] as const;

function formatGroupDateTitle(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return '今天';
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-TW', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function glyphForTx(tx: Transaction): string {
  if (tx.type === 'transfer') return '⇄';
  if (tx.type === 'adjustment') return '⚖';
  if (tx.type === 'income') return '↓';
  if (tx.method === 'apple_pay') return '';
  if (tx.method === 'bank_transfer') return '↗';
  if (tx.method === 'debit_card') return '▣';
  return '◈';
}

export function DashboardScreen({
  topInsetPadding = 114,
  bottomInsetPadding = 116,
  onOpenModal,
  onNavigateTab,
  onScrollShrinkChange,
}: DashboardScreenProps) {
  const {
    data,
    summary,
    settleEveningPiggy,
    updateTxCategory,
    splitMergedTx,
  } = useLedger();
  const { safe, balances, radar, upcoming, settings } = summary;

  const lastScrollY = useRef(0);
  const todaySettled = settings.lastSettledDate === safe.today;

  // Group active transactions by Taipei date (YYYY-MM-DD) for Inset Grouped Glass List
  const groupedTransactions = useMemo(() => {
    const active = data.transactions
      .filter((t) => !t.deletedAt)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

    const groups: Array<{ date: string; title: string; items: Transaction[] }> = [];
    const map = new Map<string, Transaction[]>();

    for (const tx of active) {
      const d = taipeiDate(tx.occurredAt);
      const bucket = map.get(d);
      if (bucket) bucket.push(tx);
      else map.set(d, [tx]);
    }

    for (const [date, items] of map.entries()) {
      groups.push({
        date,
        title: formatGroupDateTitle(date, safe.today),
        items,
      });
    }
    return groups;
  }, [data.transactions, safe.today]);

  const remainingMonthlyBudget = safe.remainingMonthlyBudget;

  const budgetProgressPercent = useMemo(() => {
    if (safe.spentThisCycle <= 0) return 0;
    const totalPool =
      settings.monthlyBudget > 0
        ? settings.monthlyBudget
        : safe.spentThisCycle + remainingMonthlyBudget;
    if (totalPool <= 0) return 100;
    const raw = (safe.spentThisCycle / totalPool) * 100;
    return Math.min(100, Math.max(4, raw));
  }, [safe.spentThisCycle, settings.monthlyBudget, remainingMonthlyBudget]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!onScrollShrinkChange) return;
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    if (y <= 16) {
      onScrollShrinkChange(false);
    } else if (dy > 8) {
      onScrollShrinkChange(true);
    } else if (dy < -8) {
      onScrollShrinkChange(false);
    }
    lastScrollY.current = y;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: topInsetPadding,
            paddingBottom: bottomInsetPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
      >
        {/* ====================================================================
            1. HERO LIQUID GLASS CARD (本月總覽主卡 + 琥珀香檳光管進度條)
           ==================================================================== */}
        <LiquidGlassCard
          shape="card"
          elevated
          intensity={55}
          contentStyle={styles.heroCardInner}
        >
          <View style={styles.heroTopLabelRow}>
            <Text style={styles.heroOverline}>本月總支出 · DESERT TITANIUM</Text>
            <Pressable
              style={styles.cycleCapsule}
              onPress={() => onNavigateTab('settings')}
            >
              <Text style={styles.cycleCapsuleText}>
                每月 {settings.cycleStartDay} 號結算 · 剩 {safe.daysRemaining} 天
              </Text>
            </Pressable>
          </View>

          <View style={styles.heroNumberRow}>
            <Text style={styles.heroBigAmount}>
              ${safe.spentThisCycle.toLocaleString()}
            </Text>

            <View style={styles.todaySpendGlassPill}>
              <Text style={styles.todaySpendLabel}>今日花費</Text>
              <Text style={styles.todaySpendValue}>
                ${safe.spentToday.toLocaleString()}
              </Text>
            </View>
          </View>

          {/* 琥珀香檳光管進度條 (Warm Amber -> Champagne Gold Light Tube) */}
          <View style={styles.lightTubeTrack}>
            {budgetProgressPercent > 0 && (
              <View
                style={[
                  styles.lightTubeGlowWrap,
                  { width: `${budgetProgressPercent}%` },
                ]}
              >
                <LinearGradient
                  colors={['#D97706', '#FDE68A']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.lightTubeGradient}
                />
              </View>
            )}
          </View>

          <View style={styles.tubeSubRow}>
            <Text style={styles.tubeSubText}>
              今日還能花{' '}
              <Text style={styles.amberHighlightText}>
                ${Math.floor(safe.todayLeft).toLocaleString()}
              </Text>{' '}
              / 日額 ${safe.dailyAllowance.toLocaleString()}
            </Text>
            <Pressable onPress={() => onNavigateTab('settings')}>
              <Text style={styles.tubeSubText}>
                本月剩餘預算{' '}
                <Text style={styles.amberHighlightText}>
                  ${remainingMonthlyBudget.toLocaleString()}
                </Text>
              </Text>
            </Pressable>
          </View>

          <View style={styles.horizontalHairline} />

          {/* 3-Column Asset Matrix */}
          <View style={styles.balanceMatrixRow}>
            <View style={styles.balanceCell}>
              <Text style={styles.balanceCellLabel}>
                玉山 ({settings.ownAccountSuffix})
              </Text>
              <Text style={styles.balanceCellValue}>
                ${balances.bank.toLocaleString()}
              </Text>
            </View>

            <View style={styles.verticalHairline} />

            <View style={styles.balanceCell}>
              <Text style={styles.balanceCellLabel}>現金錢包</Text>
              <Text style={styles.balanceCellValue}>
                ${balances.cash.toLocaleString()}
              </Text>
            </View>

            <View style={styles.verticalHairline} />

            <View style={styles.balanceCell}>
              <Text style={styles.balanceCellLabel}>真正總可用</Text>
              <Text style={[styles.balanceCellValue, styles.amberHighlightText]}>
                ${Math.floor(safe.trueAvailable).toLocaleString()}
              </Text>
            </View>
          </View>

          <View style={styles.horizontalHairline} />

          {/* Piggy Bank & Evening Settlement Footer */}
          <View style={styles.heroFooterRow}>
            <View style={styles.achievementRow}>
              <Text style={styles.achievementText}>
                小金庫{' '}
                <Text style={styles.tabularInline}>
                  ${settings.piggyBankSaved.toLocaleString()}
                </Text>
              </Text>
              <Text style={styles.achievementDot}>·</Text>
              <Text style={styles.achievementText}>
                忍住沒買{' '}
                <Text style={styles.tabularInline}>
                  ${settings.resistedImpulseTotal.toLocaleString()}
                </Text>
              </Text>
            </View>

            <Pressable
              onPress={settleEveningPiggy}
              style={({ pressed }) => [
                styles.settleGlassPill,
                todaySettled && styles.settleGlassPillDisabled,
                pressed && styles.pressedScale,
              ]}
            >
              <Text style={styles.settleGlassPillText}>
                {todaySettled
                  ? '今日已結算'
                  : `晚間結算 +$${Math.max(0, Math.floor(safe.todayLeft))}`}
              </Text>
            </Pressable>
          </View>
        </LiquidGlassCard>

        {/* ====================================================================
            2. 3-SECOND QUICK CASH CAPSULES & LIQUID GLASS ACTION DECK
           ==================================================================== */}
        <View style={styles.controlDeckSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>3 秒極速現金分類（點選輸入金額）</Text>
            <Text style={styles.sectionHeaderMeta}>琥珀 × 大漠鈦金膠囊</Text>
          </View>

          {/* 4 Same-Family Metallic Glass Capsules */}
          <View style={styles.quickPillRow}>
            {QUICK_CASH_CHIPS.map((chip) => {
              const tint = getCategoryGlassTint(chip.category);
              return (
                <Pressable
                  key={chip.category}
                  style={({ pressed }) => [
                    styles.quickPillWrapper,
                    pressed && styles.pressedScale,
                  ]}
                  onPress={() => onOpenModal('expense', chip.category)}
                >
                  <View
                    style={[
                      styles.quickMetallicPill,
                      {
                        backgroundColor: tint.bg,
                        borderColor: tint.border,
                      },
                    ]}
                  >
                    <Text style={[styles.quickPillGlyph, { color: tint.text }]}>
                      {chip.glyph}
                    </Text>
                    <Text style={[styles.quickPillLabel, { color: tint.text }]}>
                      {chip.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* 2x2 Liquid Glass Action Grid */}
          <View style={styles.actionGrid}>
            <View style={styles.actionGridRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionCardWrap,
                  pressed && styles.pressedScale,
                ]}
                onPress={() => onOpenModal('expense')}
              >
                <LiquidGlassCard
                  shape="card"
                  elevated
                  intensity={55}
                  contentStyle={styles.actionCardInner}
                >
                  <View style={styles.glassIconCircle}>
                    <Text style={[styles.glassIconGlyph, { color: '#FBBF24' }]}>
                      ＋
                    </Text>
                  </View>
                  <View style={styles.actionCardTextCol}>
                    <Text style={styles.actionCardTitle}>記收支 / 轉帳</Text>
                    <Text style={styles.actionCardSub}>現金 · 玉山 · 簡寫</Text>
                  </View>
                </LiquidGlassCard>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.actionCardWrap,
                  pressed && styles.pressedScale,
                ]}
                onPress={() => onOpenModal('atm')}
              >
                <LiquidGlassCard
                  shape="card"
                  elevated
                  intensity={55}
                  contentStyle={styles.actionCardInner}
                >
                  <View style={styles.glassIconCircle}>
                    <Text style={[styles.glassIconGlyph, { color: '#E6D5B8' }]}>
                      ⇄
                    </Text>
                  </View>
                  <View style={styles.actionCardTextCol}>
                    <Text style={styles.actionCardTitle}>ATM 存提同步</Text>
                    <Text style={styles.actionCardSub}>內部互轉不算花費</Text>
                  </View>
                </LiquidGlassCard>
              </Pressable>
            </View>

            <View style={styles.actionGridRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionCardWrap,
                  pressed && styles.pressedScale,
                ]}
                onPress={() => onOpenModal('scold')}
              >
                <LiquidGlassCard
                  shape="card"
                  elevated
                  intensity={55}
                  contentStyle={styles.actionCardInner}
                >
                  <View style={styles.glassIconCircle}>
                    <Text style={[styles.glassIconGlyph, { color: '#FBBF24' }]}>
                      ⚡
                    </Text>
                  </View>
                  <View style={styles.actionCardTextCol}>
                    <Text style={styles.actionCardTitle}>罵醒我</Text>
                    <Text style={styles.actionCardSub}>換算時薪與便當</Text>
                  </View>
                </LiquidGlassCard>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.actionCardWrap,
                  pressed && styles.pressedScale,
                ]}
                onPress={() => onOpenModal('reconcile')}
              >
                <LiquidGlassCard
                  shape="card"
                  elevated
                  intensity={55}
                  contentStyle={styles.actionCardInner}
                >
                  <View style={styles.glassIconCircle}>
                    <Text style={[styles.glassIconGlyph, { color: '#E6D5B8' }]}>
                      ⚖
                    </Text>
                  </View>
                  <View style={styles.actionCardTextCol}>
                    <Text style={styles.actionCardTitle}>魔術平帳</Text>
                    <Text style={styles.actionCardSub}>對齊真實帳戶餘額</Text>
                  </View>
                </LiquidGlassCard>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Micro-Spend Radar / Upcoming Ghost Strip */}
        {(radar.weekCount > 0 || upcoming.length > 0) && (
          <LiquidGlassCard
            shape="card"
            intensity={55}
            contentStyle={styles.radarStripInner}
          >
            <View style={styles.radarRow}>
              <Text style={styles.radarLabel}>
                小額消費雷達（&lt;$200）：本週 {radar.weekCount} 筆 · 共{' '}
                <Text style={styles.tabularInline}>${radar.weekTotal}</Text>
              </Text>
              {upcoming.length > 0 && (
                <Pressable onPress={() => onNavigateTab('settings')}>
                  <Text style={styles.upcomingTag}>
                    即將扣款 {upcoming.length} 筆 ▸
                  </Text>
                </Pressable>
              )}
            </View>
          </LiquidGlassCard>
        )}

        {/* ====================================================================
            3. INSET GROUPED GLASS TRANSACTION LIST + METALLIC MORPHING PILL
           ==================================================================== */}
        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>Apple Pay 與近期帳務明細</Text>
            <Pressable onPress={() => onNavigateTab('transactions')}>
              <Text style={styles.sectionHeaderAction}>全部明細 / 回收桶 ▸</Text>
            </Pressable>
          </View>

          {groupedTransactions.length === 0 ? (
            <LiquidGlassCard
              shape="card"
              elevated
              intensity={55}
              contentStyle={styles.emptyListInner}
            >
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyCircleGlyph}></Text>
              </View>
              <Text style={styles.emptyTitle}>尚無消費紀錄</Text>
              <Text style={styles.emptySubtitle}>
                點選上方「超商 / 食物 / 飲料 / 車費」極速記帳，或由 iOS 26/27 錢包與玉山通知自動匯入
              </Text>
            </LiquidGlassCard>
          ) : (
            groupedTransactions.map((group) => (
              <View key={group.date} style={styles.dateGroupBlock}>
                <Text style={styles.dateGroupHeader}>{group.title}</Text>

                <LiquidGlassCard shape="card" elevated intensity={55}>
                  {group.items.map((tx, idx) => {
                    const isLast = idx === group.items.length - 1;
                    const isMerged = Boolean(
                      tx.frontendSlot &&
                        tx.bankSlot &&
                        tx.mergedMetadata?.frontendEvent &&
                        tx.mergedMetadata?.bankEvent,
                    );
                    const isPositive =
                      tx.type === 'income' ||
                      (tx.type === 'adjustment' && tx.amount > 0);
                    const prefix = isPositive
                      ? '+'
                      : tx.type === 'transfer'
                      ? '⇄ '
                      : '-';

                    return (
                      <View key={tx.id}>
                        <View style={styles.txRow}>
                          {/* Left Desert Titanium Circle Icon */}
                          <View style={styles.txIconCircle}>
                            <Text style={styles.txIconGlyph}>
                              {glyphForTx(tx)}
                            </Text>
                          </View>

                          {/* Middle Merchant + Metallic Morphing Category Pill */}
                          <View style={styles.txMiddleCol}>
                            <View style={styles.txTitleRow}>
                              <Text style={styles.txMerchant} numberOfLines={1}>
                                {tx.merchant || tx.category || '未命名交易'}
                              </Text>
                              {isMerged && (
                                <View style={styles.mergedMiniBadge}>
                                  <Text style={styles.mergedMiniBadgeText}>
                                    雙源已鎖
                                  </Text>
                                </View>
                              )}
                            </View>

                            <View style={styles.txSubRow}>
                              <MorphingCategoryPill
                                currentCategory={tx.category}
                                onSelectCategory={(newCat) =>
                                  updateTxCategory(tx.id, newCat)
                                }
                              />
                              <Text style={styles.txTimeText}>
                                {formatTimeShort(tx.occurredAt)}
                              </Text>
                              {isMerged && (
                                <Pressable
                                  onPress={() => splitMergedTx(tx.id)}
                                  style={styles.splitMiniPill}
                                >
                                  <Text style={styles.splitMiniPillText}>
                                    拆單
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          </View>

                          {/* Right Warm Porcelain White Tabular Amount */}
                          <View style={styles.txRightCol}>
                            <Text
                              style={[
                                styles.txAmountText,
                                isPositive && styles.txAmountPositive,
                              ]}
                            >
                              {prefix}${Math.abs(tx.amount).toLocaleString()}
                            </Text>
                            <Text style={styles.txAccountSub}>
                              {tx.accountId === 'bank' ? '玉山' : '現金'}
                            </Text>
                          </View>
                        </View>

                        {/* Inset Hairline Divider aligned with text column */}
                        {!isLast && <View style={styles.insetDivider} />}
                      </View>
                    );
                  })}
                </LiquidGlassCard>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 62,
    paddingHorizontal: 16,
    paddingBottom: 112,
    gap: 14,
  },
  heroCardInner: {
    padding: 18,
    gap: 12,
  },
  heroTopLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroOverline: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  cycleCapsule: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  cycleCapsuleText: {
    color: '#E6D5B8',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  heroNumberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  heroBigAmount: {
    color: '#FAF6F0',
    fontSize: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  todaySpendGlassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    marginBottom: 4,
  },
  todaySpendLabel: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
    fontWeight: '600',
  },
  todaySpendValue: {
    color: '#FAF6F0',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  lightTubeTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 235, 200, 0.08)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 230, 190, 0.16)',
    overflow: 'visible',
  },
  lightTubeGlowWrap: {
    height: '100%',
    borderRadius: 999,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.78,
    shadowRadius: 8,
  },
  lightTubeGradient: {
    flex: 1,
    borderRadius: 999,
  },
  tubeSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tubeSubText: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  amberHighlightText: {
    color: '#FBBF24',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  balanceMatrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceCell: {
    flex: 1,
    gap: 3,
  },
  balanceCellLabel: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
    fontWeight: '500',
  },
  balanceCellValue: {
    color: '#FAF6F0',
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  verticalHairline: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: 'rgba(255, 230, 190, 0.14)',
    marginHorizontal: 12,
  },
  horizontalHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 230, 190, 0.12)',
  },
  heroFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  achievementText: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
  },
  achievementDot: {
    color: 'rgba(235, 225, 210, 0.3)',
    fontSize: 12,
  },
  tabularInline: {
    color: '#FAF6F0',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  settleGlassPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  settleGlassPillDisabled: {
    opacity: 0.45,
  },
  settleGlassPillText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  controlDeckSection: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  sectionHeaderTitle: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sectionHeaderMeta: {
    color: '#E6D5B8',
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.8,
  },
  sectionHeaderAction: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '600',
  },
  quickPillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickPillWrapper: {
    flex: 1,
  },
  quickMetallicPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 0.8,
    gap: 5,
  },
  quickPillGlyph: {
    fontSize: 12,
    fontWeight: '700',
  },
  quickPillLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  actionGrid: {
    gap: 8,
  },
  actionGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionCardWrap: {
    flex: 1,
  },
  actionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 10,
  },
  glassIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassIconGlyph: {
    color: '#FAF6F0',
    fontSize: 15,
    fontWeight: '700',
  },
  actionCardTextCol: {
    flex: 1,
    gap: 2,
  },
  actionCardTitle: {
    color: '#FAF6F0',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  actionCardSub: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
  },
  radarStripInner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  radarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  radarLabel: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
  },
  upcomingTag: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  transactionsSection: {
    gap: 10,
  },
  dateGroupBlock: {
    gap: 6,
  },
  dateGroupHeader: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  txIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconGlyph: {
    color: '#E6D5B8',
    fontSize: 16,
    fontWeight: '600',
  },
  txMiddleCol: {
    flex: 1,
    gap: 5,
  },
  txTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txMerchant: {
    color: '#FAF6F0',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  mergedMiniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  mergedMiniBadgeText: {
    color: '#FBBF24',
    fontSize: 9,
    fontWeight: '700',
  },
  txSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  txTimeText: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  splitMiniPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  splitMiniPillText: {
    color: '#E6D5B8',
    fontSize: 10,
    fontWeight: '600',
  },
  txRightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  txAmountText: {
    color: '#FAF6F0',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  txAmountPositive: {
    color: '#FDE68A',
  },
  txAccountSub: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 10,
  },
  insetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 230, 190, 0.1)',
    marginLeft: 64,
  },
  emptyListInner: {
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyCircleGlyph: {
    color: '#E6D5B8',
    fontSize: 20,
  },
  emptyTitle: {
    color: '#FAF6F0',
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  pressedScale: {
    opacity: 0.8,
    transform: [{ scale: 0.985 }],
  },
});
