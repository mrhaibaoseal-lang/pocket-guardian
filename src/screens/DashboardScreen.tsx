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
import {
  AnimatedRollingNumber,
  LiquidLightTube,
  StaggeredItem,
  TactilePressable,
} from '../components/iosAnimations';
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
  onNavigateTab: (tab: 'dashboard' | 'transactions' | 'debts' | 'testbench' | 'settings') => void;
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
            <Text style={styles.heroOverline}>本月剩餘預算 · DESERT TITANIUM</Text>
            <Pressable
              style={styles.cycleCapsule}
              onPress={() => onNavigateTab('settings')}
            >
              <Text style={styles.cycleCapsuleText}>
                剩 {safe.daysRemaining} 天 · 每月 {settings.cycleStartDay} 號結算
              </Text>
            </Pressable>
          </View>

          <View style={styles.heroNumberRow}>
            <AnimatedRollingNumber
              value={remainingMonthlyBudget}
              style={styles.heroBigAmount}
            />

            <View style={styles.heroSubStatsCol}>
              <View style={styles.heroSubStatPill}>
                <Text style={styles.heroSubStatLabel}>本月已花</Text>
                <AnimatedRollingNumber
                  value={safe.spentThisCycle}
                  style={styles.heroSubStatValue}
                />
              </View>
              <View style={styles.heroSubStatPill}>
                <Text style={styles.heroSubStatLabel}>今日花費</Text>
                <AnimatedRollingNumber
                  value={safe.spentToday}
                  style={styles.heroSubStatValue}
                />
              </View>
            </View>
          </View>

          {/* 琥珀香檳光管進度條 (Warm Amber -> Champagne Gold Light Tube + Shimmer) */}
          <LiquidLightTube percent={budgetProgressPercent} />

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
                總預算{' '}
                <Text style={styles.amberHighlightText}>
                  {settings.monthlyBudget > 0
                    ? `$${settings.monthlyBudget.toLocaleString()}`
                    : '依餘額'}
                </Text>{' '}
                ▸
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
              <AnimatedRollingNumber
                value={balances.bank}
                style={styles.balanceCellValue}
              />
            </View>

            <View style={styles.verticalHairline} />

            <View style={styles.balanceCell}>
              <Text style={styles.balanceCellLabel}>現金錢包</Text>
              <AnimatedRollingNumber
                value={balances.cash}
                style={styles.balanceCellValue}
              />
            </View>

            <View style={styles.verticalHairline} />

            <View style={styles.balanceCell}>
              <Text style={styles.balanceCellLabel}>真正總可用</Text>
              <AnimatedRollingNumber
                value={Math.floor(safe.trueAvailable)}
                style={[styles.balanceCellValue, styles.amberHighlightText]}
              />
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

            <TactilePressable
              onPress={settleEveningPiggy}
              haptic="medium"
              contentStyle={[
                styles.settleGlassPill,
                todaySettled && styles.settleGlassPillDisabled,
              ]}
            >
              <Text style={styles.settleGlassPillText}>
                {todaySettled
                  ? '今日已結算'
                  : `晚間結算 +$${Math.max(0, Math.floor(safe.todayLeft))}`}
              </Text>
            </TactilePressable>
          </View>
        </LiquidGlassCard>

        {/* ====================================================================
            2. 3-SECOND QUICK CASH CAPSULES & LIQUID GLASS ACTION DECK
           ==================================================================== */}
        <View style={styles.controlDeckSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>快速記帳</Text>
            <Text style={styles.sectionHeaderMeta}>現金常用</Text>
          </View>

          {/* 4 Same-Family Metallic Glass Capsules */}
          <View style={styles.quickPillRow}>
            {QUICK_CASH_CHIPS.map((chip) => {
              const tint = getCategoryGlassTint(chip.category);
              return (
                <TactilePressable
                  key={chip.category}
                  style={styles.quickPillWrapper}
                  activeScale={0.92}
                  haptic="light"
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
                </TactilePressable>
              );
            })}
          </View>

          {/* 2x2 Liquid Glass Action Grid */}
          <View style={styles.actionGrid}>
            <View style={styles.actionGridRow}>
              <TactilePressable
                style={styles.actionCardWrap}
                activeScale={0.95}
                haptic="light"
                onPress={() => onOpenModal('expense')}
              >
                <LiquidGlassCard
                  shape="card"
                  elevated
                  intensity={55}
                  contentStyle={styles.actionCardInner}
                >
                  <View style={styles.glassIconCircle}>
                    <Text style={[styles.glassIconGlyph, { color: '#34D399' }]}>
                      ＋
                    </Text>
                  </View>
                  <View style={styles.actionCardTextCol}>
                    <Text style={styles.actionCardTitle}>記收支 / 轉帳</Text>
                    <Text style={styles.actionCardSub}>自訂記帳</Text>
                  </View>
                </LiquidGlassCard>
              </TactilePressable>

              <TactilePressable
                style={styles.actionCardWrap}
                activeScale={0.95}
                haptic="light"
                onPress={() => onOpenModal('atm')}
              >
                <LiquidGlassCard
                  shape="card"
                  elevated
                  intensity={55}
                  contentStyle={styles.actionCardInner}
                >
                  <View style={styles.glassIconCircle}>
                    <Text style={[styles.glassIconGlyph, { color: '#CBD5E1' }]}>
                      ⇄
                    </Text>
                  </View>
                  <View style={styles.actionCardTextCol}>
                    <Text style={styles.actionCardTitle}>ATM 存提同步</Text>
                    <Text style={styles.actionCardSub}>帳戶互轉</Text>
                  </View>
                </LiquidGlassCard>
              </TactilePressable>
            </View>

            <View style={styles.actionGridRow}>
              <TactilePressable
                style={styles.actionCardWrap}
                activeScale={0.95}
                haptic="medium"
                onPress={() => onOpenModal('scold')}
              >
                <LiquidGlassCard
                  shape="card"
                  elevated
                  intensity={55}
                  contentStyle={styles.actionCardInner}
                >
                  <View style={styles.glassIconCircle}>
                    <Text style={[styles.glassIconGlyph, { color: '#34D399' }]}>
                      ⚡
                    </Text>
                  </View>
                  <View style={styles.actionCardTextCol}>
                    <Text style={styles.actionCardTitle}>罵醒我</Text>
                    <Text style={styles.actionCardSub}>防衝動消費</Text>
                  </View>
                </LiquidGlassCard>
              </TactilePressable>

              <TactilePressable
                style={styles.actionCardWrap}
                activeScale={0.95}
                haptic="light"
                onPress={() => onOpenModal('reconcile')}
              >
                <LiquidGlassCard
                  shape="card"
                  elevated
                  intensity={55}
                  contentStyle={styles.actionCardInner}
                >
                  <View style={styles.glassIconCircle}>
                    <Text style={[styles.glassIconGlyph, { color: '#CBD5E1' }]}>
                      ⚖
                    </Text>
                  </View>
                  <View style={styles.actionCardTextCol}>
                    <Text style={styles.actionCardTitle}>魔術平帳</Text>
                    <Text style={styles.actionCardSub}>校正餘額</Text>
                  </View>
                </LiquidGlassCard>
              </TactilePressable>
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
            <Text style={styles.sectionHeaderTitle}>近期明細</Text>
            <Pressable onPress={() => onNavigateTab('transactions')}>
              <Text style={styles.sectionHeaderAction}>完整紀錄 ▸</Text>
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
                可由上方快速記帳，或透過 iOS 捷徑自動入帳
              </Text>
            </LiquidGlassCard>
          ) : (
            groupedTransactions.map((group, groupIdx) => (
              <StaggeredItem key={group.date} index={groupIdx} style={styles.dateGroupBlock}>
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
                      <StaggeredItem key={tx.id} index={idx}>
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
                      </StaggeredItem>
                    );
                  })}
                </LiquidGlassCard>
              </StaggeredItem>
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
    color: 'rgba(148, 163, 184, 0.78)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  cycleCapsule: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cycleCapsuleText: {
    color: '#CBD5E1',
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
    color: '#F8FAFC',
    fontSize: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  heroSubStatsCol: {
    gap: 4.5,
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  heroSubStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  heroSubStatLabel: {
    color: 'rgba(148, 163, 184, 0.78)',
    fontSize: 10.5,
    fontWeight: '600',
  },
  heroSubStatValue: {
    color: '#F8FAFC',
    fontSize: 12.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  lightTubeTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'visible',
  },
  lightTubeGlowWrap: {
    height: '100%',
    borderRadius: 999,
    shadowColor: '#10B981',
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
    color: 'rgba(148, 163, 184, 0.75)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  amberHighlightText: {
    color: '#34D399',
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
    color: 'rgba(148, 163, 184, 0.75)',
    fontSize: 11,
    fontWeight: '500',
  },
  balanceCellValue: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  verticalHairline: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    marginHorizontal: 12,
  },
  horizontalHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
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
    color: 'rgba(148, 163, 184, 0.75)',
    fontSize: 12,
  },
  achievementDot: {
    color: 'rgba(148, 163, 184, 0.4)',
    fontSize: 12,
  },
  tabularInline: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  settleGlassPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 0.8,
    borderColor: 'rgba(52, 211, 153, 0.34)',
  },
  settleGlassPillDisabled: {
    opacity: 0.45,
  },
  settleGlassPillText: {
    color: '#34D399',
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
    color: 'rgba(148, 163, 184, 0.78)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sectionHeaderMeta: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.85,
  },
  sectionHeaderAction: {
    color: '#34D399',
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
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassIconGlyph: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  actionCardTextCol: {
    flex: 1,
    gap: 2,
  },
  actionCardTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  actionCardSub: {
    color: 'rgba(148, 163, 184, 0.72)',
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
    color: 'rgba(148, 163, 184, 0.75)',
    fontSize: 12,
  },
  upcomingTag: {
    color: '#34D399',
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
    color: 'rgba(148, 163, 184, 0.75)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconGlyph: {
    color: '#CBD5E1',
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
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  mergedMiniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 0.8,
    borderColor: 'rgba(52, 211, 153, 0.32)',
  },
  mergedMiniBadgeText: {
    color: '#34D399',
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
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  splitMiniPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  splitMiniPillText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '600',
  },
  txRightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  txAmountText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  txAmountPositive: {
    color: '#6EE7B7',
  },
  txAccountSub: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 10,
  },
  insetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyCircleGlyph: {
    color: '#CBD5E1',
    fontSize: 20,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  pressedScale: {
    opacity: 0.8,
    transform: [{ scale: 0.985 }],
  },
});
