import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  buildSummary,
  createAtm,
  createIncome,
  createManualExpense,
  DEFAULT_SETTINGS,
  MemoryLedger,
  scold,
  taipeiDate,
  uuid,
} from '../../core';
import type {
  AccountId,
  DashboardSummary,
  EventSource,
  IngestResult,
  LedgerData,
  Payee,
  PayMethod,
  RawInput,
  ScoldMode,
  ScoldResult,
  Settings,
  Subscription,
  Transaction,
} from '../../core';

const STORAGE_KEY = 'POCKET_GUARDIAN_LEDGER_V3_2_CLEAN';
const META_KEY = 'POCKET_GUARDIAN_META_V3_2';

export interface AppMeta {
  workerUrl: string;
  ingestToken: string;
  sidestoreRefreshedAt: string;
}

function createInitialDemoLedger(): LedgerData {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      openingBank: 0,
      openingCash: 0,
      monthlyBudget: 0,
      cycleStartDay: 1,
      safetyFloor: 0,
      hourlyWage: 0,
      bentoPrice: 0,
      ownAccountSuffix: '83151',
      piggyBankSaved: 0,
      resistedImpulseTotal: 0,
      lastSettledDate: null,
    },
    transactions: [],
    events: [],
    payees: [],
    subscriptions: [],
  };
}

interface LedgerContextValue {
  data: LedgerData;
  summary: DashboardSummary;
  meta: AppMeta;
  lastUndoableTx: Transaction | null;
  lastToast: string | null;
  clearToast: () => void;
  ingestShortcut: (source: EventSource | null, raw: RawInput, customTime?: string) => IngestResult;
  addQuickExpense: (
    amount: number,
    method: Exclude<PayMethod, 'atm' | 'other'>,
    category: string,
    merchant?: string,
    note?: string,
  ) => void;
  addIncome: (amount: number, accountId: AccountId, note: string) => void;
  addAtmTransfer: (direction: 'withdraw' | 'deposit', amount: number, fee: number) => void;
  reconcileAccount: (accountId: AccountId, actual: number, affectsBudget: boolean) => void;
  splitMergedTx: (id: string) => void;
  toggleAdvanceTx: (id: string) => void;
  updateTxCategory: (id: string, category: string) => void;
  softDeleteTx: (id: string) => void;
  restoreTx: (id: string) => void;
  runScold: (item: string, price: number, mode: ScoldMode) => ScoldResult;
  recordResistedImpulse: (item: string, price: number) => void;
  settleEveningPiggy: () => void;
  addSubscription: (name: string, amount: number, billingDay: number, autoPost: boolean) => void;
  toggleSubscription: (id: string) => void;
  deleteSubscription: (id: string) => void;
  addPayee: (bankCode: string, accountSuffix: string, displayName: string, defaultCategory: string) => void;
  deletePayee: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateMeta: (patch: Partial<AppMeta>) => void;
  syncFromCloud: () => Promise<void>;
  pushToCloud: () => Promise<void>;
  resetDemoData: () => void;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LedgerData>(() => createInitialDemoLedger());
  const [meta, setMeta] = useState<AppMeta>({
    workerUrl: 'https://pocket-guardian-api.mr-haibaoseal.workers.dev',
    ingestToken: '',
    sidestoreRefreshedAt: new Date().toISOString(),
  });
  const [lastUndoableId, setLastUndoableId] = useState<string | null>(null);
  const [lastToast, setLastToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [savedData, savedMeta] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(META_KEY),
        ]);
        if (savedData) setData(JSON.parse(savedData) as LedgerData);
        if (savedMeta) setMeta((prev) => ({ ...prev, ...(JSON.parse(savedMeta) as Partial<AppMeta>) }));
      } catch {
        // Keep initial state on storage read failure
      }
    })();
  }, []);

  const persist = useCallback((next: LedgerData) => {
    const clone: LedgerData = {
      settings: { ...next.settings },
      transactions: [...next.transactions],
      events: [...next.events],
      payees: [...next.payees],
      subscriptions: [...next.subscriptions],
    };
    setData(clone);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clone)).catch(() => undefined);
  }, []);

  const triggerHaptic = useCallback((type: 'success' | 'warning' | 'light' = 'light') => {
    try {
      if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (type === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on web
    }
  }, []);

  const summary = useMemo(
    () => buildSummary(data.settings, data.transactions, data.subscriptions, new Date().toISOString()),
    [data],
  );

  const lastUndoableTx = useMemo(
    () => (lastUndoableId ? data.transactions.find((t) => t.id === lastUndoableId && !t.deletedAt) ?? null : null),
    [data.transactions, lastUndoableId],
  );

  const ingestShortcut = useCallback(
    (source: EventSource | null, raw: RawInput, customTime?: string): IngestResult => {
      const now = customTime ?? new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const res = ledger.ingest(source, raw, now);
      persist(ledger.data);
      if (res.transaction) setLastUndoableId(res.transaction.id);
      setLastToast(res.message);
      triggerHaptic(res.status === 'discarded_otp' ? 'warning' : 'success');
      return res;
    },
    [data, persist, triggerHaptic],
  );

  const addQuickExpense = useCallback(
    (
      amount: number,
      method: Exclude<PayMethod, 'atm' | 'other'>,
      category: string,
      merchant?: string,
      note?: string,
    ) => {
      if (!Number.isFinite(amount) || amount <= 0) return;
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const tx = createManualExpense({
        id: uuid(),
        amount,
        method,
        category,
        merchant: merchant?.trim() || category,
        note: note?.trim() || null,
        occurredAt: now,
        now,
      });
      ledger.upsert(tx);
      persist(ledger.data);
      setLastUndoableId(tx.id);
      setLastToast(`✅ 已記 ${tx.merchant} $${tx.amount}`);
      triggerHaptic('success');
    },
    [data, persist, triggerHaptic],
  );

  const addIncome = useCallback(
    (amount: number, accountId: AccountId, note: string) => {
      if (!Number.isFinite(amount) || amount <= 0) return;
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const tx = createIncome(uuid(), amount, accountId, note.trim() || '收入入帳', now);
      tx.merchant = note.trim() || '收入入帳';
      ledger.upsert(tx);
      persist(ledger.data);
      setLastUndoableId(tx.id);
      setLastToast(`💰 已入帳 ${tx.merchant} +$${tx.amount}`);
      triggerHaptic('success');
    },
    [data, persist, triggerHaptic],
  );

  const addAtmTransfer = useCallback(
    (direction: 'withdraw' | 'deposit', amount: number, fee: number) => {
      if (!Number.isFinite(amount) || amount <= 0) return;
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const created = createAtm({ transfer: uuid(), fee: uuid() }, direction, amount, fee, now);
      created.forEach((t) => ledger.upsert(t));
      persist(ledger.data);
      setLastUndoableId(created[0].id);
      setLastToast(
        direction === 'withdraw'
          ? `🏧 ATM 提款 $${amount}（玉山 -$${amount + fee} / 現金 +$${amount}，不計入花費）`
          : `🏧 ATM 存款 $${amount}（現金 -$${amount} / 玉山 +$${amount}）`,
      );
      triggerHaptic('success');
    },
    [data, persist, triggerHaptic],
  );

  const reconcileAccount = useCallback(
    (accountId: AccountId, actual: number, affectsBudget: boolean) => {
      if (!Number.isFinite(actual) || actual < 0) return;
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const adj = ledger.reconcile(accountId, actual, affectsBudget, now);
      persist(ledger.data);
      if (adj) {
        setLastUndoableId(adj.id);
        setLastToast(
          `⚖️ 魔術平帳完成：${accountId === 'bank' ? '玉山銀行' : '現金'}已對齊為 $${actual}（差額 ${
            adj.amount >= 0 ? '+' : ''
          }$${adj.amount}）`,
        );
      } else {
        setLastToast('✨ 餘額完全一致，無需調整！');
      }
      triggerHaptic('success');
    },
    [data, persist, triggerHaptic],
  );

  const splitMergedTx = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      if (ledger.split(id, now)) {
        persist(ledger.data);
        setLastToast('✂️ 已拆分為兩筆獨立交易（且雙邊已上鎖，不會再被合併）');
        triggerHaptic('warning');
      }
    },
    [data, persist, triggerHaptic],
  );

  const toggleAdvanceTx = useCallback(
    (id: string) => {
      const ledger = new MemoryLedger(data);
      const target = ledger.data.transactions.find((t) => t.id === id);
      if (!target) return;
      ledger.update(id, { isAdvance: !target.isAdvance });
      persist(ledger.data);
      setLastToast(!target.isAdvance ? '🤝 已標記為「代墊款（待收款）」，不計入花費' : '↩️ 已恢復計入一般花費');
      triggerHaptic('light');
    },
    [data, persist, triggerHaptic],
  );

  const updateTxCategory = useCallback(
    (id: string, category: string) => {
      const ledger = new MemoryLedger(data);
      const target = ledger.data.transactions.find((t) => t.id === id);
      if (!target) return;
      ledger.update(id, { category });
      persist(ledger.data);
      triggerHaptic('light');
    },
    [data, persist, triggerHaptic],
  );

  const softDeleteTx = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const removed = ledger.remove(id, now);
      persist(ledger.data);
      if (lastUndoableId === id) setLastUndoableId(null);
      if (removed) {
        setLastToast(`🗑️ 已撤銷「${removed.merchant ?? removed.category ?? '交易'} $${removed.amount}」（保留於 7 天回收桶）`);
      }
      triggerHaptic('warning');
    },
    [data, lastUndoableId, persist, triggerHaptic],
  );

  const restoreTx = useCallback(
    (id: string) => {
      const ledger = new MemoryLedger(data);
      const restored = ledger.restore(id);
      persist(ledger.data);
      if (restored) {
        setLastToast(`♻️ 已從回收桶還原「${restored.merchant ?? restored.category ?? '交易'} $${restored.amount}」`);
      }
      triggerHaptic('success');
    },
    [data, persist, triggerHaptic],
  );

  const runScold = useCallback(
    (item: string, price: number, mode: ScoldMode): ScoldResult => {
      return scold(item, price, mode, data.settings, data.transactions, data.subscriptions, new Date().toISOString());
    },
    [data],
  );

  const recordResistedImpulse = useCallback(
    (item: string, price: number) => {
      if (!Number.isFinite(price) || price <= 0) return;
      const next: LedgerData = {
        ...data,
        settings: {
          ...data.settings,
          resistedImpulseTotal: data.settings.resistedImpulseTotal + price,
        },
      };
      persist(next);
      setLastToast(`😤 太強了！忍住沒買「${item || '衝動商品'}」，榮譽榜累積省下 $${next.settings.resistedImpulseTotal}！`);
      triggerHaptic('success');
    },
    [data, persist, triggerHaptic],
  );

  const settleEveningPiggy = useCallback(() => {
    const today = taipeiDate(new Date());
    if (data.settings.lastSettledDate === today) {
      setLastToast('🌙 今天已經結算過囉！明天再來累積省錢小金庫');
      return;
    }
    const savedToday = Math.max(0, Math.floor(summary.safe.todayLeft));
    if (savedToday <= 0) {
      setLastToast('🌙 今天安全額度已用完，明天繼續加油！');
      return;
    }
    const next: LedgerData = {
      ...data,
      settings: {
        ...data.settings,
        piggyBankSaved: data.settings.piggyBankSaved + savedToday,
        lastSettledDate: today,
      },
    };
    persist(next);
    setLastToast(`🎉 今日結算完成！成功把沒花完的 $${savedToday} 存入「🐷 省錢成就小金庫」！`);
    triggerHaptic('success');
  }, [data, persist, summary.safe.todayLeft, triggerHaptic]);

  const addSubscription = useCallback(
    (name: string, amount: number, billingDay: number, autoPost: boolean) => {
      if (!name.trim() || amount <= 0) return;
      const sub: Subscription = {
        id: uuid(),
        name: name.trim(),
        amount,
        billingDay: Math.min(31, Math.max(1, Math.round(billingDay))),
        accountId: 'bank',
        isActive: true,
        autoPost,
        lastChargedMonth: null,
      };
      persist({ ...data, subscriptions: [...data.subscriptions, sub] });
      setLastToast(`👻 已新增固定扣款預留：每月 ${sub.billingDay} 號 ${sub.name} $${sub.amount}`);
      triggerHaptic('success');
    },
    [data, persist, triggerHaptic],
  );

  const toggleSubscription = useCallback(
    (id: string) => {
      persist({
        ...data,
        subscriptions: data.subscriptions.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)),
      });
      triggerHaptic('light');
    },
    [data, persist, triggerHaptic],
  );

  const deleteSubscription = useCallback(
    (id: string) => {
      persist({
        ...data,
        subscriptions: data.subscriptions.filter((s) => s.id !== id),
      });
      triggerHaptic('warning');
    },
    [data, persist, triggerHaptic],
  );

  const addPayee = useCallback(
    (bankCode: string, accountSuffix: string, displayName: string, defaultCategory: string) => {
      if (!accountSuffix.trim() || !displayName.trim()) return;
      const payee: Payee = {
        id: uuid(),
        bankCode: bankCode.trim() || '808',
        accountSuffix: accountSuffix.trim(),
        displayName: displayName.trim(),
        defaultCategory: defaultCategory.trim() || '轉帳',
      };
      persist({
        ...data,
        payees: [...data.payees.filter((p) => p.accountSuffix !== payee.accountSuffix), payee],
      });
      setLastToast(`👤 已記住常用轉帳對象：${payee.displayName} (****${payee.accountSuffix})`);
      triggerHaptic('success');
    },
    [data, persist, triggerHaptic],
  );

  const deletePayee = useCallback(
    (id: string) => {
      persist({ ...data, payees: data.payees.filter((p) => p.id !== id) });
      triggerHaptic('warning');
    },
    [data, persist, triggerHaptic],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      persist({ ...data, settings: { ...data.settings, ...patch } });
      setLastToast('⚙️ 設定已儲存並即時重算安全額度');
      triggerHaptic('light');
    },
    [data, persist, triggerHaptic],
  );

  const updateMeta = useCallback((patch: Partial<AppMeta>) => {
    setMeta((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(META_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const syncFromCloud = useCallback(async () => {
    const baseUrl = meta.workerUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/api/state`, {
      headers: meta.ingestToken ? { 'X-Ingest-Token': meta.ingestToken } : {},
    });
    const json = (await res.json()) as { ok?: boolean; data?: LedgerData };
    if (json.ok && json.data) {
      persist(json.data);
      setLastToast('☁️ 已從 Cloudflare D1 同步最新帳本');
      triggerHaptic('success');
    }
  }, [meta.ingestToken, meta.workerUrl, persist, triggerHaptic]);

  const pushToCloud = useCallback(async () => {
    const baseUrl = meta.workerUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(meta.ingestToken ? { 'X-Ingest-Token': meta.ingestToken } : {}),
      },
      body: JSON.stringify({ data }),
    });
    const json = (await res.json()) as { ok?: boolean };
    if (json.ok) {
      setLastToast('☁️ 已將本機帳本備份至 Cloudflare D1');
      triggerHaptic('success');
    }
  }, [data, meta.ingestToken, meta.workerUrl, triggerHaptic]);

  const resetDemoData = useCallback(() => {
    const fresh = createInitialDemoLedger();
    persist(fresh);
    setLastUndoableId(null);
    setLastToast('🧹 已將所有帳目與設定歸零');
    triggerHaptic('warning');
  }, [persist, triggerHaptic]);

  const value = useMemo<LedgerContextValue>(
    () => ({
      data,
      summary,
      meta,
      lastUndoableTx,
      lastToast,
      clearToast: () => setLastToast(null),
      ingestShortcut,
      addQuickExpense,
      addIncome,
      addAtmTransfer,
      reconcileAccount,
      splitMergedTx,
      toggleAdvanceTx,
      updateTxCategory,
      softDeleteTx,
      restoreTx,
      runScold,
      recordResistedImpulse,
      settleEveningPiggy,
      addSubscription,
      toggleSubscription,
      deleteSubscription,
      addPayee,
      deletePayee,
      updateSettings,
      updateMeta,
      syncFromCloud,
      pushToCloud,
      resetDemoData,
    }),
    [
      addAtmTransfer,
      addIncome,
      addPayee,
      addQuickExpense,
      addSubscription,
      data,
      deletePayee,
      deleteSubscription,
      ingestShortcut,
      lastToast,
      lastUndoableTx,
      meta,
      pushToCloud,
      reconcileAccount,
      recordResistedImpulse,
      resetDemoData,
      restoreTx,
      runScold,
      settleEveningPiggy,
      softDeleteTx,
      splitMergedTx,
      summary,
      syncFromCloud,
      toggleAdvanceTx,
      toggleSubscription,
      updateMeta,
      updateSettings,
      updateTxCategory,
    ],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error('useLedger must be used inside LedgerProvider');
  return ctx;
}
