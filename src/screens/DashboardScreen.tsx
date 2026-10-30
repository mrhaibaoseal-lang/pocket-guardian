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
import { AppSymbol, type AppIconName } from '../components/AppSymbol';
import {
  AnimatedRollingNumber,
  LiquidLightTube,
  StaggeredItem,
  TactilePressable,
} from '../components/iosAnimations';
import { LiquidGlassCard, LiquidGlassGroup } from '../components/LiquidGlassView';
import { MorphingCategoryPill } from '../components/MorphingCategoryPill';
import { useLedger } from '../store/useLedger';
import { theme } from '../theme/tokens';

interface DashboardScreenProps {
  topInsetPadding?: number;
  bottomInsetPadding?: number;
  onOpenModal: (modal: ActiveModal, presetCategory?: string) => void;
  onNavigateTab: (tab: 'dashboard' | 'transactions' | 'debts' | 'testbench' | 'settings') => void;
  onScrollShrinkChange?: (shrunk: boolean) => void;
}

const QUICK_CASH_CHIPS: ReadonlyArray<{
  icon: AppIconName;
  label: string;
  category: string;
}> = [
  { icon: 'bag', label: '超商', category: '超商' },
  { icon: 'fork.knife', label: '食物', category: '食物' },
  { icon: 'cup.and.saucer', label: '飲料', category: '飲料' },
  { icon: 'tram', label: '車費', category: '車費' },
];

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

function iconForTx(tx: Transaction): AppIconName {
  if (tx.type === 'transfer') return 'arrow.left.arrow.right';
  if (tx.type === 'adjustment') return 'equal.circle';
  if (tx.type === 'income') return 'arrow.down.left';
  if (tx.method === 'apple_pay') return 'wave.3.right';
  if (tx.method === 'bank_transfer') return 'arrow.up.right';
  if (tx.method === 'debit_card') return 'creditcard';
  return 'banknote';
}

export function DashboardScreen({
  topInsetPadding = 72,
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
  const totalBudgetPool =
    settings.monthlyBudget > 0
      ? settings.monthlyBudget
      : Math.max(0, safe.spentThisCycle + remainingMonthlyBudget);

  const budgetProgressPercent = useMemo(() => {
    if (safe.spentThisCycle <= 0) return 0;
    if (totalBudgetPool <= 0) return 100;
    const raw = (safe.spentThisCycle / totalBudgetPool) * 100;
    return Math.min(100, Math.max(3, raw));
  }, [safe.spentThisCycle, totalBudgetPool]);

  const budgetTone: 'normal' | 'warning' | 'danger' = useMemo(() => {
    if (remainingMonthlyBudget < 0 || safe.todayLeft < 0) return 'danger';
    if (totalBudgetPool > 0 && remainingMonthlyBudget / totalBudgetPool < 0.2) return 'warning';
    return 'normal';
  }, [remainingMonthlyBudget, safe.todayLeft, totalBudgetPool]);

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
        {/* 1. Primary Instrument Hero Card (Single Focal Glass Layer) */}
        <LiquidGlassCard
          shape="card"
          glassStyle="regular"
          contentStyle={styles.heroCardInner}
        >
          <View style={styles.heroTopLabelRow}>
            <Text style={styles.heroOverline}>本月剩餘預算</Text>
            <Pressable
              style={styles.cycleCapsule}
              onPress={() => onNavigateTab('settings')}
              hitSlop={8}
            >
              <Text style={styles.cycleCapsuleText}>
                剩 {safe.daysRemaining} 天 · 每月 {settings.cycleStartDay} 號結算
              </Text>
              <AppSymbol name="chevron.right" size={11} color={theme.colors.text.tertiary} />
            </Pressable>
          </View>

          <View style={styles.heroNumberRow}>
            <AnimatedRollingNumber
              value={remainingMonthlyBudget}
              style={[
                styles.heroBigAmount,
                budgetTone === 'danger' && styles.amountDanger,
                budgetTone === 'warning' && styles.amountWarning,
              ]}
            />

            <View style={styles.heroSubStatsCol}>
              <View style={styles.heroSubStatRow}>
                <Text style={styles.heroSubStatLabel}>本月已花</Text>
                <AnimatedRollingNumber
                  value={safe.spentThisCycle}
                  style={styles.heroSubStatValue}
                />
              </View>
              <View style={styles.heroSubStatRow}>
                <Text style={styles.heroSubStatLabel}>今日花費</Text>
                <AnimatedRollingNumber
                  value={safe.spentToday}
                  style={styles.heroSubStatValue}
                />
              </View>
            </View>
          </View>

          <LiquidLightTube percent={budgetProgressPercent} tone={budgetTone} />

          <View style={styles.tubeSubRow}>
            <Text style={styles.tubeSubText}>
              今日可用{' '}
              <Text
                style={[
                  styles.remainingHighlightText,
                  safe.todayLeft < 0 && styles.amountDanger,
                ]}
              >
                ${Math.floor(safe.todayLeft).toLocaleString()}
              </Text>{' '}
              / 日額 ${safe.dailyAllowance.toLocaleString()}
            </Text>
            <Pressable onPress={() => onNavigateTab('settings')} hitSlop={8} style={styles.budgetModeLink}>
              <Text style={styles.tubeSubText}>
                上限{' '}
                <Text style={styles.secondaryValueInline}>
                  {settings.monthlyBudget > 0
                    ? `$${settings.monthlyBudget.toLocaleString()}`
                    : '依餘額'}
                </Text>
              </Text>
              <AppSymbol name="chevron.right" size={10} color={theme.colors.text.tertiary} />
            </Pressable>
          </View>

          <View style={styles.horizontalHairline} />

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
                style={[styles.balanceCellValue, styles.remainingHighlightText]}
              />
            </View>
          </View>

          <View style={styles.horizontalHairline} />

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
              haptic="light"
              contentStyle={[
                styles.settleGlassPill,
                todaySettled && styles.settleGlassPillDisabled,
              ]}
            >
              <AppSymbol
                name="moon.stars"
                size={11}
                color={todaySettled ? theme.colors.text.tertiary : theme.colors.accent.primary}
              />
              <Text
                style={[
                  styles.settleGlassPillText,
                  todaySettled && styles.settleGlassPillTextDisabled,
                ]}
              >
                {todaySettled
                  ? '今日已結算'
                  : `晚間結算 +$${Math.max(0, Math.floor(safe.todayLeft))}`}
              </Text>
            </TactilePressable>
          </View>
        </LiquidGlassCard>

        {/* 2. Restrained Instrument Control Deck (Grouped Native Glass Controls + Matte Quick Cash) */}
        <View style={styles.controlDeckSection}>
          <LiquidGlassGroup spacing={8} style={styles.primaryActionsRow}>
            <TactilePressable
              style={styles.primaryRecordBtnWrap}
              haptic="light"
              onPress={() => onOpenModal('expense')}
            >
              <LiquidGlassCard
                shape="control"
                glassStyle="regular"
                interactive
                contentStyle={styles.primaryRecordBtnInner}
              >
                <View style={styles.primaryAccentIconBox}>
                  <AppSymbol name="plus" size={16} color={theme.colors.accent.primary} weight="semibold" />
                </View>
                <View style={styles.actionCardTextCol}>
                  <Text style={styles.actionCardTitle} numberOfLines={1}>
                    記收支 / 轉帳
                  </Text>
                  <Text style={styles.actionCardSub} numberOfLines={1}>
                    手動入帳
                  </Text>
                </View>
              </LiquidGlassCard>
            </TactilePressable>

            <TactilePressable
              style={styles.compactToolBtnWrap}
              haptic="light"
              onPress={() => onOpenModal('atm')}
            >
              <LiquidGlassCard
                shape="control"
                glassStyle="regular"
                interactive
                contentStyle={styles.compactToolBtnInner}
              >
                <AppSymbol name="arrow.left.arrow.right" size={15} color={theme.colors.text.primary} />
                <Text style={styles.compactToolLabel}>ATM</Text>
              </LiquidGlassCard>
            </TactilePressable>

            <TactilePressable
              style={styles.compactToolBtnWrap}
              haptic="light"
              onPress={() => onOpenModal('scold')}
            >
              <LiquidGlassCard
                shape="control"
                glassStyle="regular"
                interactive
                contentStyle={styles.compactToolBtnInner}
              >
                <AppSymbol name="gauge.with.needle" size={15} color={theme.colors.text.primary} />
                <Text style={styles.compactToolLabel}>罵醒我</Text>
              </LiquidGlassCard>
            </TactilePressable>

            <TactilePressable
              style={styles.compactToolBtnWrap}
              haptic="light"
              onPress={() => onOpenModal('reconcile')}
            >
              <LiquidGlassCard
                shape="control"
                glassStyle="regular"
                interactive
                contentStyle={styles.compactToolBtnInner}
              >
                <AppSymbol name="equal.circle" size={15} color={theme.colors.text.primary} />
                <Text style={styles.compactToolLabel}>平帳</Text>
              </LiquidGlassCard>
            </TactilePressable>
          </LiquidGlassGroup>

          <View style={styles.quickPillRow}>
            {QUICK_CASH_CHIPS.map((chip) => (
              <TactilePressable
                key={chip.category}
                style={styles.quickPillWrapper}
                haptic="light"
                onPress={() => onOpenModal('expense', chip.category)}
              >
                <View style={styles.quickMattePill}>
                  <AppSymbol name={chip.icon} size={13} color={theme.colors.text.secondary} />
                  <Text style={styles.quickPillLabel}>{chip.label}</Text>
                </View>
              </TactilePressable>
            ))}
          </View>
        </View>

        {/* Micro-Spend Radar / Upcoming Strip (Non-Glass Matte Readout) */}
        {(radar.weekCount > 0 || upcoming.length > 0) && (
          <View style={styles.radarStripSurface}>
            <View style={styles.radarRow}>
              <Text style={styles.radarLabel}>
                小額消費（&lt;$200）：本週 {radar.weekCount} 筆 · 共{' '}
                <Text style={styles.tabularInline}>${radar.weekTotal}</Text>
              </Text>
              {upcoming.length > 0 && (
                <Pressable onPress={() => onNavigateTab('settings')} style={styles.upcomingLinkRow}>
                  <Text style={styles.upcomingTag}>
                    待扣款 {upcoming.length} 筆
                  </Text>
                  <AppSymbol name="chevron.right" size={10} color={theme.colors.text.tertiary} />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* 3. Non-Glass Precision Transaction List */}
        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>近期明細</Text>
            <Pressable onPress={() => onNavigateTab('transactions')} style={styles.upcomingLinkRow} hitSlop={8}>
              <Text style={styles.sectionHeaderAction}>完整紀錄</Text>
              <AppSymbol name="chevron.right" size={11} color={theme.colors.text.tertiary} />
            </Pressable>
          </View>

          {groupedTransactions.length === 0 ? (
            <View style={styles.emptyListSurface}>
              <View style={styles.emptyCircle}>
                <AppSymbol name="list.bullet" size={18} color={theme.colors.text.tertiary} />
              </View>
              <Text style={styles.emptyTitle}>尚無消費紀錄</Text>
              <Text style={styles.emptySubtitle}>
                可由上方快速記帳，或透過 iOS 捷徑自動入帳
              </Text>
            </View>
          ) : (
            groupedTransactions.map((group, groupIdx) => (
              <StaggeredItem key={group.date} index={groupIdx} style={styles.dateGroupBlock}>
                <Text style={styles.dateGroupHeader}>{group.title}</Text>

                <View style={styles.txGroupSurface}>
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
                      ? ''
                      : '-';

                    return (
                      <StaggeredItem key={tx.id} index={idx}>
                        <View style={styles.txRow}>
                          <View style={styles.txIconCircle}>
                            <AppSymbol
                              name={iconForTx(tx)}
                              size={15}
                              color={theme.colors.text.secondary}
                            />
                          </View>

                          <View style={styles.txMiddleCol}>
                            <View style={styles.txTitleRow}>
                              <Text style={styles.txMerchant} numberOfLines={1}>
                                {tx.merchant || tx.category || '未命名交易'}
                              </Text>
                              {isMerged && (
                                <View style={styles.mergedMiniBadge}>
                                  <AppSymbol name="lock.fill" size={9} color={theme.colors.text.tertiary} />
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

                          <View style={styles.txRightCol}>
                            <Text
                              style={[
                                styles.txAmountText,
                                isPositive && styles.txAmountPositive,
                              ]}
                              maxFontSizeMultiplier={theme.typography.maxAmountFontScale}
                            >
                              {prefix}${Math.abs(tx.amount).toLocaleString()}
                            </Text>
                            <Text style={styles.txAccountSub}>
                              {tx.accountId === 'bank' ? '玉山' : '現金'}
                            </Text>
                          </View>
                        </View>

                        {!isLast && <View style={styles.insetDivider} />}
                      </StaggeredItem>
                    );
                  })}
                </View>
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
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 112,
    gap: theme.spacing.lg,
  },
  heroCardInner: {
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  heroTopLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroOverline: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sectionTitle.fontSize,
    fontWeight: theme.typography.sectionTitle.fontWeight,
    letterSpacing: theme.typography.sectionTitle.letterSpacing,
  },
  cycleCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radii.pill,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.subtleSurface,
  },
  cycleCapsuleText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  heroNumberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  heroBigAmount: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.heroAmount.fontSize,
    fontWeight: theme.typography.heroAmount.fontWeight,
    lineHeight: theme.typography.heroAmount.lineHeight,
    letterSpacing: theme.typography.heroAmount.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  amountWarning: {
    color: theme.colors.semantic.warning,
  },
  amountDanger: {
    color: theme.colors.semantic.danger,
  },
  heroSubStatsCol: {
    gap: 5,
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  heroSubStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroSubStatLabel: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '400',
  },
  heroSubStatValue: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  tubeSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  tubeSubText: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
    fontVariant: ['tabular-nums'],
  },
  budgetModeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  remainingHighlightText: {
    color: theme.colors.semantic.remaining,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  secondaryValueInline: {
    color: theme.colors.text.secondary,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  balanceMatrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  balanceCell: {
    flex: 1,
    gap: 4,
  },
  balanceCellLabel: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: '400',
  },
  balanceCellValue: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.statAmount.fontSize,
    fontWeight: theme.typography.statAmount.fontWeight,
    letterSpacing: theme.typography.statAmount.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  verticalHairline: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: theme.colors.glass.hairline,
    marginHorizontal: theme.spacing.sm,
  },
  horizontalHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.glass.hairline,
  },
  heroFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  achievementText: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
  },
  achievementDot: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
  },
  tabularInline: {
    color: theme.colors.text.secondary,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  settleGlassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.accent.subtleBg,
    borderWidth: 1,
    borderColor: theme.colors.accent.subtleBorder,
  },
  settleGlassPillDisabled: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderColor: 'transparent',
  },
  settleGlassPillText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  settleGlassPillTextDisabled: {
    color: theme.colors.text.tertiary,
  },
  controlDeckSection: {
    gap: theme.spacing.xs,
  },
  primaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.xs,
    width: '100%',
  },
  primaryRecordBtnWrap: {
    flex: 1.95,
    minWidth: 0,
  },
  primaryRecordBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  primaryAccentIconBox: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.chip,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.accent.subtleBg,
    borderWidth: 1,
    borderColor: theme.colors.accent.subtleBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactToolBtnWrap: {
    flex: 0.78,
    minWidth: 0,
  },
  compactToolBtnInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 4,
  },
  compactToolLabel: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: '500',
  },
  actionCardTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  actionCardTitle: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: theme.typography.bodyMedium.fontWeight,
    letterSpacing: -0.3,
  },
  actionCardSub: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.micro.fontSize,
  },
  quickPillRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  quickPillWrapper: {
    flex: 1,
  },
  quickMattePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: theme.radii.chip,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.listSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
    gap: 6,
  },
  quickPillLabel: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '500',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sectionHeaderTitle: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sectionTitle.fontSize,
    fontWeight: theme.typography.sectionTitle.fontWeight,
    letterSpacing: theme.typography.sectionTitle.letterSpacing,
  },
  sectionHeaderAction: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '500',
  },
  upcomingLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  radarStripSurface: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.listSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  radarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  radarLabel: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.caption.fontSize,
  },
  upcomingTag: {
    color: theme.colors.accent.primary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: '500',
  },
  transactionsSection: {
    gap: theme.spacing.sm,
  },
  dateGroupBlock: {
    gap: 6,
  },
  dateGroupHeader: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '500',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  txGroupSurface: {
    borderRadius: theme.radii.listGroup,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.listSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  txIconCircle: {
    width: 34,
    height: 34,
    borderRadius: theme.radii.chip,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.subtleSurface,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: theme.colors.text.primary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '500',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  mergedMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.background.subtleSurface,
  },
  mergedMiniBadgeText: {
    color: theme.colors.text.tertiary,
    fontSize: 10,
    fontWeight: '500',
  },
  txSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  txTimeText: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.micro.fontSize,
    fontVariant: ['tabular-nums'],
  },
  splitMiniPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.background.subtleSurface,
  },
  splitMiniPillText: {
    color: theme.colors.text.secondary,
    fontSize: 10,
    fontWeight: '500',
  },
  txRightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  txAmountText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.listAmount.fontSize,
    fontWeight: theme.typography.listAmount.fontWeight,
    letterSpacing: theme.typography.listAmount.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  txAmountPositive: {
    color: theme.colors.semantic.remaining,
  },
  txAccountSub: {
    color: theme.colors.text.tertiary,
    fontSize: 10,
  },
  insetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.glass.hairline,
    marginLeft: 60,
  },
  emptyListSurface: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
    borderRadius: theme.radii.listGroup,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.listSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  emptyCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.subtleSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.bodyMedium.fontSize,
    fontWeight: '500',
  },
  emptySubtitle: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
    textAlign: 'center',
    lineHeight: 18,
  },
});
