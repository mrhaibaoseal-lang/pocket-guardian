import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ActiveModal } from '../components/ActionSheetModals';
import { useLedger } from '../store/useLedger';

interface DashboardScreenProps {
  onOpenModal: (modal: ActiveModal) => void;
  onNavigateTab: (tab: 'dashboard' | 'transactions' | 'testbench' | 'settings') => void;
}

const QUICK_CASH_CHIPS = [
  { label: '🥪 早餐 $65', amount: 65, category: '早餐', merchant: '早餐' },
  { label: '🍱 便當 $120', amount: 120, category: '午餐/便當', merchant: '雞腿便當' },
  { label: '🧋 飲料 $55', amount: 55, category: '飲料', merchant: '手搖飲' },
  { label: '🏪 超商 $89', amount: 89, category: '超商', merchant: '超商消費' },
];

export function DashboardScreen({ onOpenModal, onNavigateTab }: DashboardScreenProps) {
  const { data, summary, addQuickExpense, settleEveningPiggy } = useLedger();
  const { safe, balances, radar, upcoming, settings, lastReconciledAt } = summary;

  const weatherTheme =
    safe.weather === 'green'
      ? {
          bg: '#062E22',
          border: '#10B981',
          accent: '#34D399',
          badge: '🟢 安全綠燈｜放心生活',
        }
      : safe.weather === 'yellow'
      ? {
          bg: '#332407',
          border: '#F59E0B',
          accent: '#FBBF24',
          badge: '🟡 警戒黃燈｜今日已花逾 70%',
        }
      : {
          bg: '#381116',
          border: '#EF4444',
          accent: '#F87171',
          badge: safe.belowSafetyFloor
            ? '🔴 警報紅燈｜已跌破安全水位線！'
            : '🔴 超支紅燈｜今日額度已透支',
        };

  const todaySettled = settings.lastSettledDate === safe.today;

  return (
    <View style={styles.container}>
      {/* ====================================================================
          TOP 55%: VISUAL STATUS ZONE (iPhone 16 Plus 6.7" Upper Display Area)
         ==================================================================== */}
      <ScrollView
        style={styles.topZone}
        contentContainerStyle={styles.topZoneContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. 🔋 Daily Safe-to-Spend Battery Hero Card */}
        <View
          style={[
            styles.heroCard,
            { backgroundColor: weatherTheme.bg, borderColor: weatherTheme.border },
          ]}
        >
          <View style={styles.heroHeaderRow}>
            <View style={[styles.weatherPill, { borderColor: weatherTheme.border }]}>
              <Text style={[styles.weatherPillText, { color: weatherTheme.accent }]}>
                {weatherTheme.badge}
              </Text>
            </View>
            <Text style={styles.cycleTag}>
              週期剩 {safe.daysRemaining} 天
            </Text>
          </View>

          <View style={styles.heroMainRow}>
            <View>
              <Text style={styles.heroLabel}>今日還能花（安全額度）</Text>
              <View style={styles.heroAmountRow}>
                <Text style={[styles.heroAmount, { color: weatherTheme.accent }]}>
                  ${Math.floor(safe.todayLeft).toLocaleString()}
                </Text>
                <Text style={styles.heroAllowance}>
                  / 日額 ${safe.dailyAllowance.toLocaleString()}
                </Text>
              </View>
            </View>
            <View style={styles.batteryPercentageBox}>
              <Text style={[styles.batteryPercentText, { color: weatherTheme.accent }]}>
                🔋 {safe.batteryPercent}%
              </Text>
              <Text style={styles.spentTodaySub}>
                今日已花 ${safe.spentToday.toLocaleString()}
              </Text>
            </View>
          </View>

          {/* Battery Bar */}
          <View style={styles.batteryTrack}>
            <View
              style={[
                styles.batteryFill,
                {
                  width: `${Math.max(4, Math.min(100, safe.batteryPercent))}%`,
                  backgroundColor: weatherTheme.accent,
                },
              ]}
            />
          </View>

          {/* Dual-Track Explanation Row */}
          <View style={styles.dualTrackRow}>
            <Text style={styles.dualTrackText}>
              {safe.limitingTrack === 'budget' ? '🔒 受限於預算軌' : '🔒 受限於防破產軌'}｜軌道A(預算) $
              {safe.trackA}/日 · 軌道B(保底) ${safe.trackB}/日
            </Text>
          </View>

          {/* Evening 10-Second Piggy Settlement & Achievement Row */}
          <View style={styles.piggyRow}>
            <View style={styles.achievementBadges}>
              <Text style={styles.piggyBadgeText}>
                🐷 小金庫 ${settings.piggyBankSaved.toLocaleString()}
              </Text>
              <Text style={styles.piggyBadgeText}>
                🏆 忍住沒買 ${settings.resistedImpulseTotal.toLocaleString()}
              </Text>
            </View>
            <Pressable
              style={[
                styles.settleBtn,
                todaySettled && styles.settleBtnDisabled,
              ]}
              onPress={settleEveningPiggy}
            >
              <Text style={styles.settleBtnText}>
                {todaySettled
                  ? '🌙 今日已結算'
                  : `🌙 晚間結算存 $${Math.max(0, Math.floor(safe.todayLeft))}`}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 2. Account Balances & True Available Balance */}
        <View style={styles.balanceGrid}>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>🏦 玉山 ({settings.ownAccountSuffix})</Text>
            <Text style={styles.balanceValue}>${balances.bank.toLocaleString()}</Text>
            <Text style={styles.balanceSub}>簽帳卡 / Apple Pay</Text>
          </View>

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>💵 現金錢包</Text>
            <Text style={styles.balanceValue}>${balances.cash.toLocaleString()}</Text>
            <Text style={styles.balanceSub}>
              {lastReconciledAt ? '已平帳對齊' : '點下方魔術平帳'}
            </Text>
          </View>

          <View style={[styles.balanceCard, styles.trueAvailableCard]}>
            <Text style={styles.balanceLabel}>🛡️ 真正總可用</Text>
            <Text style={[styles.balanceValue, { color: '#38BDF8' }]}>
              ${Math.floor(safe.trueAvailable).toLocaleString()}
            </Text>
            <Text style={styles.balanceSub}>
              已預扣訂閱 ${safe.pendingSubscriptions}
            </Text>
          </View>
        </View>

        {/* 3. 🐸 Micro-Spend Radar & 👻 Upcoming Subscription Ghost Alerts */}
        <View style={styles.radarAndGhostRow}>
          <Pressable
            style={styles.radarCard}
            onPress={() => onNavigateTab('transactions')}
          >
            <View style={styles.radarHeader}>
              <Text style={styles.radarTitle}>🐸 小錢溫水煮青蛙雷達（&lt;$200）</Text>
              <Text style={styles.radarStats}>
                本週 {radar.weekCount} 筆 · 共 ${radar.weekTotal}
              </Text>
            </View>
            {radar.alerts.length > 0 ? (
              <Text style={styles.radarAlertText}>{radar.alerts[0]}</Text>
            ) : (
              <Text style={styles.radarSafeText}>
                ✨ 連續小額消費 {radar.streakDays} 天，目前控制良好！
              </Text>
            )}
          </Pressable>

          {upcoming.length > 0 && (
            <Pressable
              style={styles.ghostCard}
              onPress={() => onNavigateTab('settings')}
            >
              <Text style={styles.ghostTitle}>
                👻 固定扣款幽靈預警（48h 內即將扣款）
              </Text>
              {upcoming.map((u, idx) => (
                <Text key={idx} style={styles.ghostItem}>
                  • {u.due}｜{u.name} ${u.amount}（已從安全額度預先凍結）
                </Text>
              ))}
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ====================================================================
          BOTTOM 45%: THUMB-ZONE SINGLE-HANDED CONTROL DECK (6.7" Ergonomics)
         ==================================================================== */}
      <View style={styles.bottomThumbDeck}>
        {/* Quick 1-Tap Cash Strip */}
        <View style={styles.quickStripHeader}>
          <Text style={styles.quickStripTitle}>⚡ 3 秒極速現金記帳（單手點一下即記）</Text>
          <Text style={styles.quickStripCount}>
            有效交易 {data.transactions.filter((t) => !t.deletedAt).length} 筆
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickChipRow}
        >
          {QUICK_CASH_CHIPS.map((chip) => (
            <Pressable
              key={chip.label}
              style={({ pressed }) => [
                styles.quickChip,
                pressed && styles.quickChipPressed,
              ]}
              onPress={() =>
                addQuickExpense(chip.amount, 'cash', chip.category, chip.merchant)
              }
            >
              <Text style={styles.quickChipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* 2x2 Ergonomic Thumb Action Grid */}
        <View style={styles.actionGrid}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnPrimary,
              pressed && styles.btnPressed,
            ]}
            onPress={() => onOpenModal('expense')}
          >
            <Text style={styles.actionBtnEmoji}>💵</Text>
            <View style={styles.actionBtnTextWrap}>
              <Text style={styles.actionBtnTitle}>記收支 / 轉帳</Text>
              <Text style={styles.actionBtnSub}>現金·玉山·簡寫輸入</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnAtm,
              pressed && styles.btnPressed,
            ]}
            onPress={() => onOpenModal('atm')}
          >
            <Text style={styles.actionBtnEmoji}>🏧</Text>
            <View style={styles.actionBtnTextWrap}>
              <Text style={styles.actionBtnTitle}>ATM 存提同步</Text>
              <Text style={styles.actionBtnSub}>雙邊連動·不算花費</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnScold,
              pressed && styles.btnPressed,
            ]}
            onPress={() => onOpenModal('scold')}
          >
            <Text style={styles.actionBtnEmoji}>🛑</Text>
            <View style={styles.actionBtnTextWrap}>
              <Text style={styles.actionBtnTitle}>罵醒我</Text>
              <Text style={styles.actionBtnSub}>換算時薪與雞腿便當</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnReconcile,
              pressed && styles.btnPressed,
            ]}
            onPress={() => onOpenModal('reconcile')}
          >
            <Text style={styles.actionBtnEmoji}>⚖️</Text>
            <View style={styles.actionBtnTextWrap}>
              <Text style={styles.actionBtnTitle}>魔術平帳</Text>
              <Text style={styles.actionBtnSub}>10秒對齊真實餘額</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  topZone: {
    flex: 55,
  },
  topZoneContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  heroCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    gap: 10,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weatherPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  weatherPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cycleTag: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  heroMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  heroLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroAllowance: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  batteryPercentageBox: {
    alignItems: 'flex-end',
  },
  batteryPercentText: {
    fontSize: 20,
    fontWeight: '800',
  },
  spentTodaySub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  batteryTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    overflow: 'hidden',
  },
  batteryFill: {
    height: '100%',
    borderRadius: 999,
  },
  dualTrackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dualTrackText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '500',
  },
  piggyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    flexWrap: 'wrap',
    gap: 6,
  },
  achievementBadges: {
    flexDirection: 'row',
    gap: 10,
  },
  piggyBadgeText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '700',
  },
  settleBtn: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  settleBtnDisabled: {
    opacity: 0.5,
  },
  settleBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  balanceGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: '#131C2E',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  trueAvailableCard: {
    borderColor: '#0284C7',
    backgroundColor: '#0C1E33',
  },
  balanceLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  balanceValue: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 3,
  },
  balanceSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  radarAndGhostRow: {
    gap: 8,
  },
  radarCard: {
    backgroundColor: '#131C2E',
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  radarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radarTitle: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  radarStats: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  radarAlertText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  radarSafeText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  ghostCard: {
    backgroundColor: '#1E1B38',
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  ghostTitle: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  ghostItem: {
    color: '#E0E7FF',
    fontSize: 11,
  },
  bottomThumbDeck: {
    flex: 45,
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  quickStripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickStripTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  quickStripCount: {
    color: '#64748B',
    fontSize: 11,
  },
  quickChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  quickChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickChipPressed: {
    backgroundColor: '#334155',
    transform: [{ scale: 0.97 }],
  },
  quickChipText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    flex: 1,
    alignContent: 'stretch',
  },
  actionBtn: {
    width: '48.2%',
    minHeight: 74,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
  },
  actionBtnPrimary: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
  },
  actionBtnAtm: {
    backgroundColor: '#0C4A6E',
    borderColor: '#38BDF8',
  },
  actionBtnScold: {
    backgroundColor: '#4C1D95',
    borderColor: '#A78BFA',
  },
  actionBtnReconcile: {
    backgroundColor: '#3B2F13',
    borderColor: '#F59E0B',
  },
  btnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  actionBtnEmoji: {
    fontSize: 26,
  },
  actionBtnTextWrap: {
    flex: 1,
  },
  actionBtnTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  actionBtnSub: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 2,
  },
});
