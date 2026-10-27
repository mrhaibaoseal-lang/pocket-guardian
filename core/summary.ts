import { computeBalances, computeMicroRadar, computeSafeToSpend, upcomingSubscriptions } from './ledger';
import type { Balances, MicroRadar, SafeToSpend } from './ledger';
import type { Settings, Subscription, Transaction } from './types';

export interface DashboardSummary {
  balances: Balances;
  safe: SafeToSpend;
  radar: MicroRadar;
  upcoming: Array<{ name: string; amount: number; due: string }>;
  settings: Settings;
  /** ISO time of the last reconcile, for the "帳本可信度" hint. */
  lastReconciledAt: string | null;
  generatedAt: string;
}

export function buildSummary(
  settings: Settings,
  txs: Transaction[],
  subs: Subscription[],
  now: string,
): DashboardSummary {
  const lastAdj = txs
    .filter((t) => t.type === 'adjustment' && !t.deletedAt)
    .map((t) => t.occurredAt)
    .sort()
    .pop();
  return {
    balances: computeBalances(settings, txs),
    safe: computeSafeToSpend(settings, txs, subs, now),
    radar: computeMicroRadar(txs, now),
    upcoming: upcomingSubscriptions(subs, now, 2).map((u) => ({ name: u.sub.name, amount: u.sub.amount, due: u.due })),
    settings,
    lastReconciledAt: lastAdj ?? (settings.openingAt.startsWith('1970') ? null : settings.openingAt),
    generatedAt: now,
  };
}

/** One-line text for the shortcut confirmation notification. */
export function confirmationText(prefix: string, summary: DashboardSummary): string {
  const s = summary.safe;
  const icon = s.weather === 'green' ? '🟢' : s.weather === 'yellow' ? '🟡' : '🔴';
  return `${prefix}｜${icon} 今天還能花 $${Math.floor(s.todayLeft)}`;
}

/** Compact payload for the iOS widget. */
export function widgetPayload(summary: DashboardSummary) {
  const s = summary.safe;
  return {
    todayLeft: Math.floor(s.todayLeft),
    dailyAllowance: s.dailyAllowance,
    batteryPercent: s.batteryPercent,
    weather: s.weather,
    bank: summary.balances.bank,
    cash: summary.balances.cash,
    trueAvailable: Math.floor(s.trueAvailable),
    updatedAt: summary.generatedAt,
  };
}
