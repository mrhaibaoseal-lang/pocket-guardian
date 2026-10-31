import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  buildSummary,
  createAtm,
  createIncome,
  createManualExpense,
  DEFAULT_SETTINGS,
  MemoryLedger,
  mergeLedgerData,
  sanitizeLedgerData,
  scold,
  taipeiDate,
  uuid,
} from '../../core';
import type {
  AccountId,
  DashboardSummary,
  DebtDirection,
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
    debts: [],
  };
}

interface LedgerContextValue {
  data: LedgerData;
  summary: DashboardSummary;
  meta: AppMeta;
  lastUndoableTx: Transaction | null;
  lastToast: string | null;
  clearToast: () => void;
  clearUndo: () => void;
  setBannerPaused: (paused: boolean) => void;
  deleteInboxEvent: (eventId: string) => void;
  resolveInboxEvent: (eventId: string, amount: number, merchant?: string) => void;
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
  hardDeleteTx: (id: string) => void;
  emptyTrash: () => void;
  runScold: (item: string, price: number, mode: ScoldMode) => ScoldResult;
  recordResistedImpulse: (item: string, price: number) => void;
  settleEveningPiggy: () => void;
  addSubscription: (name: string, amount: number, billingDay: number, autoPost: boolean) => void;
  toggleSubscription: (id: string) => void;
  deleteSubscription: (id: string) => void;
  addPayee: (bankCode: string, accountSuffix: string, displayName: string, defaultCategory: string) => void;
  deletePayee: (id: string) => void;
  addDebt: (input: {
    personName: string;
    direction: DebtDirection;
    amount: number;
    title: string;
    note?: string | null;
    accountSuffix?: string | null;
    dueDate?: string | null;
    syncAccountId?: AccountId | null;
  }) => void;
  settleDebt: (debtId: string, amount: number, accountId: AccountId | null, note?: string | null) => void;
  netPersonDebts: (personName: string) => void;
  convertTxToDebtSplit: (
    txId: string,
    splits: Array<{ personName: string; amount: number; accountSuffix?: string | null }>,
  ) => void;
  deleteDebt: (debtId: string) => void;
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
  const [lastToast, setLastToastState] = useState<string | null>(null);
  const [toastSeq, setToastSeq] = useState<number>(0);
  const [bannerPaused, setBannerPaused] = useState<boolean>(false);

  const dataRef = useRef<LedgerData>(data);
  dataRef.current = data;
  const metaRef = useRef<AppMeta>(meta);
  metaRef.current = meta;
  const hydratedRef = useRef<boolean>(false);

  const setLastToast = useCallback((msg: string | null) => {
    setLastToastState(msg);
    if (msg) setToastSeq((n) => n + 1);
  }, []);

  const pushStateToCloudSilent = useCallback((payload: LedgerData, replace = false) => {
    const baseUrl = metaRef.current.workerUrl.replace(/\/+$/, '');
    if (!baseUrl) return;
    fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(metaRef.current.ingestToken ? { 'X-Ingest-Token': metaRef.current.ingestToken } : {}),
      },
      body: JSON.stringify(replace ? { data: payload, replace: true } : { data: payload }),
    }).catch(() => undefined);
  }, []);

  const pullAndMergeFromCloud = useCallback(
    async (silent = false) => {
      try {
        const baseUrl = metaRef.current.workerUrl.replace(/\/+$/, '');
        if (!baseUrl) return;
        const res = await fetch(`${baseUrl}/api/state`, {
          headers: metaRef.current.ingestToken ? { 'X-Ingest-Token': metaRef.current.ingestToken } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { ok?: boolean; data?: LedgerData };
        if (json.ok && json.data) {
          const { merged, newlySyncedTxs } = mergeLedgerData(dataRef.current, json.data);
          dataRef.current = merged;
          setData(merged);
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch(() => undefined);
          pushStateToCloudSilent(merged);
          if (!silent) {
            setLastToast(
              newlySyncedTxs.length > 0
                ? `☁️ 已同步 ${newlySyncedTxs.length} 筆捷徑新入帳`
                : '☁️ 已與 Cloudflare D1 同步最新帳務',
            );
          } else if (newlySyncedTxs.length > 0) {
            const latest = newlySyncedTxs[newlySyncedTxs.length - 1];
            const label = latest.merchant ?? latest.category ?? '消費';
            setLastToast(`☁️ 已自動同步捷徑入帳：${label} $${Math.round(latest.amount)}`);
          }
        }
      } catch {
        if (!silent) {
          setLastToast('⚠️ 雲端連線失敗（目前使用本機離線帳本）');
        }
      }
    },
    [pushStateToCloudSilent, setLastToast],
  );

  useEffect(() => {
    if (!lastToast || bannerPaused) return;
    const isErrorToast = lastToast.startsWith('⚠️');
    const duration = isErrorToast ? 8000 : 4500;
    const timer = setTimeout(() => {
      setLastToastState(null);
    }, duration);
    return () => clearTimeout(timer);
  }, [lastToast, toastSeq, bannerPaused]);

  useEffect(() => {
    if (!lastUndoableId || bannerPaused) return;
    const timer = setTimeout(() => {
      setLastUndoableId(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [lastUndoableId, toastSeq, bannerPaused]);

  useEffect(() => {
    (async () => {
      try {
        const [savedData, savedMeta] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(META_KEY),
        ]);
        if (savedMeta) {
          const parsedMeta = JSON.parse(savedMeta) as Partial<AppMeta>;
          setMeta((prev) => {
            const nextMeta = { ...prev, ...parsedMeta };
            metaRef.current = nextMeta;
            return nextMeta;
          });
        }
        if (savedData) {
          const parsed = sanitizeLedgerData(JSON.parse(savedData) as LedgerData);
          const nextData = {
            ...parsed,
            debts: Array.isArray(parsed.debts) ? parsed.debts : [],
          };
          dataRef.current = nextData;
          setData(nextData);
        }
      } catch {
        // Keep initial state on storage read failure
      } finally {
        hydratedRef.current = true;
        pullAndMergeFromCloud(true).catch(() => undefined);
      }
    })();
  }, [pullAndMergeFromCloud]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && hydratedRef.current) {
        pullAndMergeFromCloud(true).catch(() => undefined);
      }
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && hydratedRef.current) {
        pullAndMergeFromCloud(true).catch(() => undefined);
      }
    }, 8000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [pullAndMergeFromCloud]);

  const persist = useCallback(
    (next: LedgerData, syncCloud: boolean | { syncCloud?: boolean; replaceCloud?: boolean } = true) => {
      const sanitized = sanitizeLedgerData(next);
      const clone: LedgerData = {
        settings: { ...sanitized.settings },
        transactions: [...sanitized.transactions],
        events: [...sanitized.events],
        payees: [...sanitized.payees],
        subscriptions: [...sanitized.subscriptions],
        debts: [...(sanitized.debts ?? [])],
      };
      dataRef.current = clone;
      setData(clone);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clone)).catch(() => undefined);
      const shouldSync =
        typeof syncCloud === 'boolean' ? syncCloud : syncCloud.syncCloud !== false;
      const shouldReplace =
        typeof syncCloud === 'object' && Boolean(syncCloud.replaceCloud);
      if (shouldSync) {
        pushStateToCloudSilent(clone, shouldReplace);
      }
    },
    [pushStateToCloudSilent],
  );

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

  const hardDeleteTx = useCallback(
    (id: string) => {
      const ledger = new MemoryLedger(data);
      const removed = ledger.hardDelete(id);
      if (!removed) return;
      if (lastUndoableId === id) setLastUndoableId(null);
      persist(ledger.data, { replaceCloud: true });
      setLastToast(`🗑️ 已永久刪除「${removed.merchant ?? removed.category ?? '交易'} $${removed.amount}」`);
      triggerHaptic('warning');
    },
    [data, lastUndoableId, persist, setLastToast, triggerHaptic],
  );

  const emptyTrash = useCallback(() => {
    const ledger = new MemoryLedger(data);
    const count = ledger.emptyTrash();
    if (count <= 0) return;
    if (lastUndoableId && !ledger.data.transactions.some((t) => t.id === lastUndoableId)) {
      setLastUndoableId(null);
    }
    persist(ledger.data, { replaceCloud: true });
    setLastToast(`🗑️ 已一鍵清空回收桶（永久刪除 ${count} 筆紀錄）`);
    triggerHaptic('warning');
  }, [data, lastUndoableId, persist, setLastToast, triggerHaptic]);

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

  const addDebt = useCallback(
    (input: {
      personName: string;
      direction: DebtDirection;
      amount: number;
      title: string;
      note?: string | null;
      accountSuffix?: string | null;
      dueDate?: string | null;
      syncAccountId?: AccountId | null;
    }) => {
      if (!Number.isFinite(input.amount) || input.amount <= 0) return;
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const rec = ledger.addDebt(input, now);
      if (rec.accountSuffix) {
        const exists = ledger.data.payees.some((p) => p.accountSuffix === rec.accountSuffix);
        if (!exists) {
          ledger.data.payees.push({
            id: uuid(),
            bankCode: '808',
            accountSuffix: rec.accountSuffix,
            displayName: rec.personName,
            defaultCategory: '欠款歸還',
          });
        }
      }
      persist(ledger.data);
      const dirLabel = rec.direction === 'owed_to_me' ? `${rec.personName} 欠我` : `我欠 ${rec.personName}`;
      const acctLabel =
        input.syncAccountId === 'bank'
          ? '（已同步玉山銀行餘額，不計入個人預算）'
          : input.syncAccountId === 'cash'
          ? '（已同步現金餘額，不計入個人預算）'
          : '';
      setLastToast(`🤝 已紀錄「${dirLabel} $${rec.originalAmount}」· ${rec.title}${acctLabel}`);
      triggerHaptic('success');
    },
    [data, persist, setLastToast, triggerHaptic],
  );

  const settleDebt = useCallback(
    (debtId: string, amount: number, accountId: AccountId | null, note?: string | null) => {
      if (!Number.isFinite(amount) || amount <= 0) return;
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const res = ledger.settleDebt(debtId, amount, accountId, note ?? null, now);
      if (!res) return;
      persist(ledger.data);
      if (res.transaction) setLastUndoableId(res.transaction.id);
      const fullOrPart =
        res.debt.status === 'settled'
          ? '🎉 已全額結清'
          : `⏳ 已部分${res.debt.direction === 'owed_to_me' ? '收回' : '歸還'} $${res.paidAmount}（剩 $${res.debt.remainingAmount}）`;
      const acctTag =
        accountId === 'bank'
          ? '｜玉山銀行已同步'
          : accountId === 'cash'
          ? '｜現金錢包已同步'
          : '｜僅更新欠款狀態';
      setLastToast(`${fullOrPart}：${res.debt.personName} · ${res.debt.title}${acctTag}`);
      triggerHaptic('success');
    },
    [data, persist, setLastToast, triggerHaptic],
  );

  const netPersonDebts = useCallback(
    (personName: string) => {
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const res = ledger.netPersonDebts(personName, now);
      if (res.offsetAmount <= 0) {
        setLastToast('⚠️ 目前該對象沒有雙向可互抵的欠款');
        return;
      }
      persist(ledger.data);
      setLastToast(`⚡ 已將「${personName}」雙向欠款自動互抵 $${res.offsetAmount}（共沖銷 ${res.affectedCount} 筆）！`);
      triggerHaptic('success');
    },
    [data, persist, setLastToast, triggerHaptic],
  );

  const convertTxToDebtSplit = useCallback(
    (txId: string, splits: Array<{ personName: string; amount: number; accountSuffix?: string | null }>) => {
      const now = new Date().toISOString();
      const ledger = new MemoryLedger(data);
      const created = ledger.convertTxToDebtSplit(txId, splits, now);
      if (created.length === 0) return;
      persist(ledger.data);
      const totalAmt = created.reduce((sum, d) => sum + d.originalAmount, 0);
      setLastToast(
        `🧮 已轉出 ${created.length} 筆代墊欠款（共 $${totalAmt}），代墊部分已排除不吃個人預算！`,
      );
      triggerHaptic('success');
    },
    [data, persist, setLastToast, triggerHaptic],
  );

  const deleteDebt = useCallback(
    (debtId: string) => {
      const ledger = new MemoryLedger(data);
      if (ledger.deleteDebt(debtId)) {
        persist(ledger.data);
        setLastToast('🗑️ 已刪除該筆欠款紀錄');
        triggerHaptic('warning');
      }
    },
    [data, persist, setLastToast, triggerHaptic],
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
    await pullAndMergeFromCloud(false);
    triggerHaptic('success');
  }, [pullAndMergeFromCloud, triggerHaptic]);

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
  }, [persist, setLastToast, triggerHaptic]);

  const deleteInboxEvent = useCallback(
    (eventId: string) => {
      const next: LedgerData = {
        ...data,
        events: data.events.filter((e) => e.id !== eventId),
      };
      persist(next);
      setLastToast('🗑️ 已從收件匣移除該筆紀錄');
      triggerHaptic('light');
    },
    [data, persist, setLastToast, triggerHaptic],
  );

  const resolveInboxEvent = useCallback(
    (eventId: string, amount: number, merchant?: string) => {
      if (!Number.isFinite(amount) || amount <= 0) return;
      const ev = data.events.find((e) => e.id === eventId);
      const now = new Date().toISOString();
      const occurredAt = ev?.parsed.occurredAt ?? ev?.receivedAt ?? now;
      const method: Exclude<PayMethod, 'atm' | 'other'> =
        ev?.source === 'transfer_page'
          ? 'bank_transfer'
          : ev?.source === 'wallet'
          ? 'apple_pay'
          : 'debit_card';
      const defaultMerchant =
        merchant?.trim() ||
        ev?.parsed.merchant ||
        (ev?.parsed.payeeSuffix ? `轉帳給 ****${ev.parsed.payeeSuffix}` : '收件匣補記');
      const ledger = new MemoryLedger(data);
      const tx = createManualExpense({
        id: uuid(),
        amount: Math.round(amount),
        method,
        category: method === 'bank_transfer' ? '轉帳' : '其他',
        merchant: defaultMerchant,
        note: '從收件匣手動補記',
        occurredAt,
        now,
      });
      ledger.upsert(tx);
      ledger.data.events = ledger.data.events.map((e) =>
        e.id === eventId
          ? { ...e, status: 'new_tx', transactionId: tx.id, reason: `已手動補記 $${tx.amount}` }
          : e,
      );
      persist(ledger.data);
      setLastUndoableId(tx.id);
      setLastToast(`✅ 已從收件匣補記 ${tx.merchant} $${tx.amount}`);
      triggerHaptic('success');
    },
    [data, persist, setLastToast, triggerHaptic],
  );

  const value = useMemo<LedgerContextValue>(
    () => ({
      data,
      summary,
      meta,
      lastUndoableTx,
      lastToast,
      clearToast: () => setLastToast(null),
      clearUndo: () => setLastUndoableId(null),
      setBannerPaused,
      deleteInboxEvent,
      resolveInboxEvent,
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
      hardDeleteTx,
      emptyTrash,
      runScold,
      recordResistedImpulse,
      settleEveningPiggy,
      addSubscription,
      toggleSubscription,
      deleteSubscription,
      addPayee,
      deletePayee,
      addDebt,
      settleDebt,
      netPersonDebts,
      convertTxToDebtSplit,
      deleteDebt,
      updateSettings,
      updateMeta,
      syncFromCloud,
      pushToCloud,
      resetDemoData,
    }),
    [
      addAtmTransfer,
      addDebt,
      addIncome,
      addPayee,
      addQuickExpense,
      addSubscription,
      convertTxToDebtSplit,
      data,
      deleteDebt,
      deletePayee,
      deleteSubscription,
      deleteInboxEvent,
      ingestShortcut,
      lastToast,
      lastUndoableTx,
      meta,
      netPersonDebts,
      pushToCloud,
      reconcileAccount,
      recordResistedImpulse,
      resetDemoData,
      resolveInboxEvent,
      restoreTx,
      hardDeleteTx,
      emptyTrash,
      runScold,
      setLastToast,
      settleDebt,
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
