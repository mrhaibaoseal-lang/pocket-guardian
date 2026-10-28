import { addDays, budgetCycle, clampedDate, diffDays, taipeiDate, taipeiMonth, weekStart } from './time';
import type { Settings, Subscription, Transaction } from './types';

export const MICRO_SPEND_LIMIT = 200;

export interface Balances {
  bank: number;
  cash: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

function active(txs: Transaction[], settings: Settings): Transaction[] {
  const from = Date.parse(settings.openingAt);
  return txs.filter((t) => !t.deletedAt && Date.parse(t.occurredAt) >= from);
}

export function computeBalances(settings: Settings, txs: Transaction[]): Balances {
  const b: Balances = { bank: settings.openingBank, cash: settings.openingCash };
  for (const t of active(txs, settings)) {
    switch (t.type) {
      case 'expense':
        b[t.accountId] -= t.amount;
        break;
      case 'income':
        b[t.accountId] += t.amount;
        break;
      case 'transfer':
        b[t.accountId] -= t.amount;
        if (t.toAccountId) b[t.toAccountId] += t.amount;
        break;
      case 'adjustment':
        b[t.accountId] += t.amount; // signed
        break;
    }
  }
  return { bank: round(b.bank), cash: round(b.cash) };
}

/** How much a transaction counts as "spending" (budget-wise). */
export function spendingOf(t: Transaction): number {
  if (t.deletedAt || t.isAdvance) return 0;
  if (t.type === 'expense') return t.amount;
  if (t.type === 'adjustment' && t.affectsBudget && t.amount < 0) return -t.amount;
  return 0;
}

/** Subscriptions still to be charged between today (inclusive) and the cycle end (exclusive). */
export function pendingSubscriptions(subs: Subscription[], today: string, cycleEnd: string): Subscription[] {
  const out: Subscription[] = [];
  for (const s of subs) {
    if (!s.isActive) continue;
    // A cycle spans at most two calendar months.
    const months = new Set([today.slice(0, 7), addDays(cycleEnd, -1).slice(0, 7)]);
    for (const ym of months) {
      const [y, m] = ym.split('-').map(Number);
      const due = clampedDate(y, m, s.billingDay);
      const charged = s.lastChargedMonth !== null && s.lastChargedMonth >= ym;
      if (due >= today && due < cycleEnd && !charged) {
        out.push(s);
        break;
      }
    }
  }
  return out;
}

export type Weather = 'green' | 'yellow' | 'red';

export interface SafeToSpend {
  today: string;
  cycleStart: string;
  cycleEnd: string;
  daysRemaining: number;
  spentToday: number;
  spentThisCycle: number;
  pendingSubscriptions: number;
  trueAvailable: number;
  remainingMonthlyBudget: number;
  trackA: number;
  trackB: number;
  limitingTrack: 'budget' | 'balance';
  dailyAllowance: number;
  todayLeft: number;
  batteryPercent: number;
  weather: Weather;
  belowSafetyFloor: boolean;
}

export function computeSafeToSpend(
  settings: Settings,
  txs: Transaction[],
  subs: Subscription[],
  now: string,
): SafeToSpend {
  const today = taipeiDate(now);
  const { start, end } = budgetCycle(today, settings.cycleStartDay);
  const daysRemaining = Math.max(1, diffDays(today, end));

  let spentToday = 0;
  let spentBeforeToday = 0;
  for (const t of txs) {
    const d = taipeiDate(t.occurredAt);
    if (d < start || d >= end) continue;
    const s = spendingOf(t);
    if (d === today) spentToday += s;
    else if (d < today) spentBeforeToday += s;
  }

  const pendingSubs = pendingSubscriptions(subs, today, end).reduce((a, s) => a + s.amount, 0);
  const balances = computeBalances(settings, txs);
  const trueAvailable = balances.bank + balances.cash - pendingSubs;
  const spentThisCycle = round(spentBeforeToday + spentToday);

  // Allowances are fixed at the start of the day; today's spending is then subtracted.
  // - If monthlyBudget <= 0 (default 0): compute both remaining monthly budget and daily budget from current balance (trackB).
  // - If monthlyBudget > 0 (custom budget set): compute both remaining monthly budget and daily budget from monthlyBudget (trackA).
  const startOfDayAvailable = trueAvailable + spentToday;
  const trackB = (startOfDayAvailable - settings.safetyFloor) / daysRemaining;
  const hasCustomBudget = settings.monthlyBudget > 0;
  const trackA = hasCustomBudget
    ? (settings.monthlyBudget - spentBeforeToday - pendingSubs) / daysRemaining
    : trackB;
  const limitingTrack: 'budget' | 'balance' = hasCustomBudget ? 'budget' : 'balance';
  const dailyAllowance = Math.max(0, Math.floor(hasCustomBudget ? trackA : trackB));
  const todayLeft = round(dailyAllowance - spentToday);
  const remainingMonthlyBudget = hasCustomBudget
    ? Math.max(0, round(settings.monthlyBudget - spentThisCycle - pendingSubs))
    : Math.max(0, round(trueAvailable - settings.safetyFloor));
  const belowSafetyFloor = trueAvailable < settings.safetyFloor;

  const ratio = dailyAllowance > 0 ? spentToday / dailyAllowance : spentToday > 0 ? Infinity : 0;
  let weather: Weather = 'green';
  if (ratio >= 0.7) weather = 'yellow';
  if (ratio > 1 || belowSafetyFloor || dailyAllowance === 0) weather = 'red';

  return {
    today,
    cycleStart: start,
    cycleEnd: end,
    daysRemaining,
    spentToday: round(spentToday),
    spentThisCycle,
    pendingSubscriptions: pendingSubs,
    trueAvailable: round(trueAvailable),
    remainingMonthlyBudget,
    trackA: Math.floor(trackA),
    trackB: Math.floor(trackB),
    limitingTrack,
    dailyAllowance,
    todayLeft,
    batteryPercent: dailyAllowance > 0 ? Math.max(0, Math.min(100, Math.round((todayLeft / dailyAllowance) * 100))) : 0,
    weather,
    belowSafetyFloor,
  };
}

export interface MicroRadar {
  streakDays: number;
  weekCount: number;
  weekTotal: number;
  monthCount: number;
  alerts: string[];
}

export function isMicroSpend(t: Transaction): boolean {
  return (
    !t.deletedAt &&
    !t.isAdvance &&
    t.type === 'expense' &&
    t.method !== 'bank_transfer' &&
    t.amount < MICRO_SPEND_LIMIT
  );
}

/** 🐸 Detect "death by a thousand cuts" small spending. */
export function computeMicroRadar(txs: Transaction[], now: string): MicroRadar {
  const today = taipeiDate(now);
  const micro = txs.filter(isMicroSpend);
  const days = new Set(micro.map((t) => taipeiDate(t.occurredAt)));

  let cursor = days.has(today) ? today : addDays(today, -1);
  let streakDays = 0;
  while (days.has(cursor)) {
    streakDays += 1;
    cursor = addDays(cursor, -1);
  }

  const ws = weekStart(today);
  const thisWeek = micro.filter((t) => {
    const d = taipeiDate(t.occurredAt);
    return d >= ws && d <= today;
  });
  const weekTotal = round(thisWeek.reduce((a, t) => a + t.amount, 0));
  const month = taipeiMonth(now);
  const monthCount = micro.filter((t) => taipeiMonth(t.occurredAt) === month).length;

  const alerts: string[] = [];
  if (streakDays >= 3) alerts.push(`已經連續 ${streakDays} 天都有小額消費了`);
  if (thisWeek.length > 7) alerts.push(`這週已經刷了 ${thisWeek.length} 次小錢`);
  if (weekTotal >= 1000) alerts.push(`這週小錢累積 $${weekTotal}，每筆都不大但加起來很可觀`);

  return { streakDays, weekCount: thisWeek.length, weekTotal, monthCount, alerts };
}

/** ⏳ "That's X hours of work / Y bentos". */
export function convertToFeelings(amount: number, settings: Settings): { hours: number; bentos: number } {
  return {
    hours: settings.hourlyWage > 0 ? Math.round((amount / settings.hourlyWage) * 10) / 10 : 0,
    bentos: settings.bentoPrice > 0 ? Math.round((amount / settings.bentoPrice) * 10) / 10 : 0,
  };
}

/**
 * A card charge that matches an uncharged subscription (same amount, within ±3
 * days of its due date) is that subscription. Returns the subscription and month.
 */
export function matchSubscription(
  subs: Subscription[],
  amount: number,
  occurredAt: string,
): { sub: Subscription; month: string } | null {
  const day = taipeiDate(occurredAt);
  for (const s of subs) {
    if (!s.isActive || s.amount !== amount) continue;
    for (const ym of new Set([addDays(day, -3).slice(0, 7), day.slice(0, 7), addDays(day, 3).slice(0, 7)])) {
      const [y, m] = ym.split('-').map(Number);
      const due = clampedDate(y, m, s.billingDay);
      const charged = s.lastChargedMonth !== null && s.lastChargedMonth >= ym;
      if (!charged && Math.abs(diffDays(due, day)) <= 3) return { sub: s, month: ym };
    }
  }
  return null;
}

/** Auto-post subscriptions due today or earlier this month that have not been charged yet. */
export function dueSubscriptions(subs: Subscription[], now: string): Array<{ sub: Subscription; month: string; due: string }> {
  const today = taipeiDate(now);
  const ym = today.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  return subs
    .filter((s) => s.isActive && s.autoPost && (s.lastChargedMonth === null || s.lastChargedMonth < ym))
    .map((s) => ({ sub: s, month: ym, due: clampedDate(y, m, s.billingDay) }))
    .filter((x) => x.due <= today);
}

/** 👻 Subscriptions charging within the next `days` days (for the 2-day warning). */
export function upcomingSubscriptions(subs: Subscription[], now: string, days: number): Array<{ sub: Subscription; due: string }> {
  const today = taipeiDate(now);
  const limit = addDays(today, days);
  const out: Array<{ sub: Subscription; due: string }> = [];
  for (const s of subs) {
    if (!s.isActive) continue;
    for (const ym of new Set([today.slice(0, 7), limit.slice(0, 7)])) {
      const [y, m] = ym.split('-').map(Number);
      const due = clampedDate(y, m, s.billingDay);
      const charged = s.lastChargedMonth !== null && s.lastChargedMonth >= ym;
      if (due > today && due <= limit && !charged) out.push({ sub: s, due });
    }
  }
  return out;
}
