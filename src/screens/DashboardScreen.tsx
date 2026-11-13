import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ActiveModal } from '../components/ActionSheetModals';
import { AnimatedRollingNumber, LiquidLightTube, TactilePressable } from '../components/iosAnimations';
import { Icon, IconTile } from '../components/ui/Icon';
import { LargeTitle, Row, Section } from '../components/ui/List';
import { categoryVisual } from '../components/ui/txVisual';
import { TxRow } from '../components/ui/TxRow';
import { useLedger } from '../store/useLedger';
import { tabular, type, usePalette, useThemedStyles, type Palette } from '../theme';

type TabTarget = 'dashboard' | 'transactions' | 'debts' | 'settings';

interface DashboardScreenProps {
  topInsetPadding?: number;
  bottomInsetPadding?: number;
  onOpenModal: (modal: ActiveModal, presetCategory?: string) => void;
  onNavigateTab: (tab: TabTarget) => void;
}

const QUICK_CATEGORIES = ['超商', '食物', '飲料', '車費'] as const;
const RECENT_LIMIT = 5;

export function DashboardScreen({
  topInsetPadding = 54,
  bottomInsetPadding = 120,
  onOpenModal,
  onNavigateTab,
}: DashboardScreenProps) {
  const { data, summary, settleEveningPiggy, updateTxCategory } = useLedger();
  const { safe, balances, radar, upcoming, settings } = summary;
  const c = usePalette();
  const s = useThemedStyles(makeStyles);
  const todaySettled = settings.lastSettledDate === safe.today;

  const recent = useMemo(
    () =>
      data.transactions
        .filter((t) => !t.deletedAt)
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
        .slice(0, RECENT_LIMIT),
    [data.transactions],
  );

  const remaining = safe.remainingMonthlyBudget;
  const overBudget = remaining < 0;

  const spentPercent = useMemo(() => {
    if (safe.spentThisCycle <= 0) return 0;
    const pool = settings.monthlyBudget > 0 ? settings.monthlyBudget : safe.spentThisCycle + remaining;
    if (pool <= 0) return 100;
    return Math.min(100, Math.max(2, (safe.spentThisCycle / pool) * 100));
  }, [safe.spentThisCycle, settings.monthlyBudget, remaining]);

  const todayLeft = Math.floor(safe.todayLeft);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingTop: topInsetPadding, paddingBottom: bottomInsetPadding }}
      showsVerticalScrollIndicator={false}
    >
      <LargeTitle
        title="總覽"
        right={
          <TactilePressable onPress={() => onOpenModal('expense')} haptic="light" contentStyle={s.addButton}>
            <Icon name="plus" size={18} color={c.onAccent} weight="bold" />
          </TactilePressable>
        }
      />

      {/* ---------- Hero: what's left this month ---------- */}
      <View style={s.heroCard}>
        <Text style={s.heroLabel}>本月還能花</Text>
        <AnimatedRollingNumber value={remaining} style={[s.heroAmount, overBudget && { color: c.negative }]} />
        <LiquidLightTube
          percent={spentPercent}
          height={6}
          color={overBudget ? c.negative : c.accent}
          trackColor={c.fillStrong}
        />
        <View style={s.heroMetaRow}>
          <Text style={s.heroMeta}>
            今天還能花{' '}
            <Text style={[s.heroMetaStrong, todayLeft < 0 && { color: c.negative }]}>
              ${todayLeft.toLocaleString()}
            </Text>
          </Text>
          <Pressable onPress={() => onNavigateTab('settings')} hitSlop={8}>
            <Text style={s.heroMeta}>剩 {safe.daysRemaining} 天</Text>
          </Pressable>
        </View>

        <View style={s.heroDivider} />

        <View style={s.statRow}>
          <Stat label="本月已花" value={safe.spentThisCycle} />
          <View style={s.statDivider} />
          <Stat label="今日花費" value={safe.spentToday} />
          <View style={s.statDivider} />
          <Stat label="每日額度" value={safe.dailyAllowance} />
        </View>
      </View>

      {/* ---------- Quick add ---------- */}
      <Section header="快速記一筆現金">
        <View style={s.quickRow}>
          {QUICK_CATEGORIES.map((cat) => {
            const v = categoryVisual(cat, c);
            return (
              <TactilePressable
                key={cat}
                style={s.quickItem}
                contentStyle={s.quickItemInner}
                onPress={() => onOpenModal('expense', cat)}
              >
                <IconTile name={v.icon} bg={v.color} size={44} />
                <Text style={s.quickLabel}>{cat}</Text>
              </TactilePressable>
            );
          })}
        </View>
      </Section>

      {/* ---------- Accounts ---------- */}
      <Section header="帳戶" separatorInset={58}>
        <Row
          leading={<IconTile name="bank" bg={c.blue} />}
          title="玉山銀行"
          subtitle={settings.ownAccountSuffix ? `末五碼 ${settings.ownAccountSuffix}` : undefined}
          value={`$${Math.round(balances.bank).toLocaleString()}`}
          valueStyle={s.valueLabel}
        />
        <Row
          leading={<IconTile name="wallet" bg={c.accent} />}
          title="現金"
          value={`$${Math.round(balances.cash).toLocaleString()}`}
          valueStyle={s.valueLabel}
        />
        <Row
          title="可用總額"
          titleStyle={{ fontWeight: '600' }}
          value={`$${Math.floor(safe.trueAvailable).toLocaleString()}`}
          valueStyle={[s.valueLabel, { fontWeight: '600' }]}
        />
      </Section>

      {/* ---------- Tools ---------- */}
      <Section header="工具" separatorInset={58}>
        <Row
          leading={<IconTile name="plus" bg={c.accent} />}
          title="記收支或轉帳"
          chevron
          onPress={() => onOpenModal('expense')}
        />
        <Row
          leading={<IconTile name="transfer" bg={c.cyan} />}
          title="ATM 存提款"
          chevron
          onPress={() => onOpenModal('atm')}
        />
        <Row
          leading={<IconTile name="scold" bg={c.warning} />}
          title="罵醒我"
          subtitle="買之前先想一下"
          chevron
          onPress={() => onOpenModal('scold')}
        />
        <Row
          leading={<IconTile name="adjust" bg={c.gray} />}
          title="校正餘額"
          chevron
          onPress={() => onOpenModal('reconcile')}
        />
      </Section>

      {/* ---------- Savings ---------- */}
      <Section
        header="小金庫"
        separatorInset={58}
        footer={
          radar.weekCount > 0
            ? `本週小額消費（$200 以下）${radar.weekCount} 筆，共 $${radar.weekTotal.toLocaleString()}。`
            : undefined
        }
      >
        <Row
          leading={<IconTile name="savings" bg={c.positive} />}
          title="已存下"
          value={`$${settings.piggyBankSaved.toLocaleString()}`}
        />
        <Row
          leading={<IconTile name="scold" bg={c.warning} />}
          title="忍住沒買"
          value={`$${settings.resistedImpulseTotal.toLocaleString()}`}
        />
        {upcoming.length > 0 ? (
          <Row
            leading={<IconTile name="repeat" bg={c.indigo} />}
            title="即將扣款"
            value={`${upcoming.length} 筆`}
            chevron
            onPress={() => onNavigateTab('settings')}
          />
        ) : null}
        <Row
          title={todaySettled ? '今天已結算' : `把今天剩下的 $${Math.max(0, todayLeft).toLocaleString()} 存進小金庫`}
          titleStyle={{ color: todaySettled ? c.secondaryLabel : c.positive }}
          numberOfLines={2}
          onPress={todaySettled ? undefined : settleEveningPiggy}
        />
      </Section>

      {/* ---------- Recent ---------- */}
      <Section
        header="最近"
        separatorInset={62}
        headerRight={
          <Pressable onPress={() => onNavigateTab('transactions')} hitSlop={10}>
            <Text style={s.headerLink}>全部</Text>
          </Pressable>
        }
      >
        {recent.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>還沒有紀錄</Text>
            <Text style={s.emptySub}>用上面的快速記帳，或讓 iOS 捷徑自動記帳。</Text>
          </View>
        ) : (
          recent.map((tx) => (
            <TxRow key={tx.id} tx={tx} onChangeCategory={(cat) => updateTxCategory(tx.id, cat)} />
          ))
        )}
      </Section>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <AnimatedRollingNumber value={value} style={s.statValue} />
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 4,
  },
  heroCard: {
    marginHorizontal: 16,
    marginBottom: 28,
    padding: 20,
    backgroundColor: c.card,
    borderRadius: 20,
    borderCurve: 'continuous' as const,
  },
  heroLabel: { ...type.subheadline, color: c.secondaryLabel },
  heroAmount: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '700' as const,
    letterSpacing: -1,
    color: c.label,
    marginTop: 2,
    marginBottom: 14,
    ...tabular,
  },
  heroMetaRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 10,
  },
  heroMeta: { ...type.footnote, color: c.secondaryLabel },
  heroMetaStrong: { color: c.label, fontWeight: '600' as const, ...tabular },
  heroDivider: { height: 0.5, backgroundColor: c.separator, marginVertical: 16 },
  statRow: { flexDirection: 'row' as const },
  stat: { flex: 1 },
  statDivider: { width: 0.5, backgroundColor: c.separator, marginHorizontal: 12 },
  statLabel: { ...type.caption1, color: c.secondaryLabel },
  statValue: { ...type.headline, ...tabular, color: c.label, marginTop: 3 },
  quickRow: {
    flexDirection: 'row' as const,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  quickItem: { flex: 1 },
  quickItemInner: { alignItems: 'center' as const, gap: 6 },
  quickLabel: { ...type.footnote, color: c.label },
  valueLabel: { color: c.label },
  headerLink: { ...type.footnote, color: c.positive, fontWeight: '600' as const },
  empty: { paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' as const },
  emptyTitle: { ...type.headline, color: c.label },
  emptySub: { ...type.footnote, color: c.secondaryLabel, marginTop: 4, textAlign: 'center' as const },
});
