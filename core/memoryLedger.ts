import { createAdjustment, createIncome, createManualExpense, decideIngest, idempotencyKeyFor, PAIR_WINDOW_MIN, splitTransaction } from './dedupe';
import type { IngestDecision, RecentEvent } from './dedupe';
import { computeBalances, dueSubscriptions, matchSubscription } from './ledger';
import { guessSource, maskSensitiveText, normalizeRawInput, normalizeText, parseEvent } from './parsers';
import type { RawInput } from './parsers';
import { buildSummary, confirmationText } from './summary';
import type { DashboardSummary } from './summary';
import { DEFAULT_SETTINGS } from './types';
import type {
  AccountId,
  DebtDirection,
  DebtRecord,
  DebtSettlement,
  EventSource,
  ParsedEvent,
  Payee,
  Settings,
  Subscription,
  Transaction,
} from './types';

export interface StoredEvent {
  id: string;
  source: EventSource;
  /** null for OTP: never stored. */
  rawText: string | null;
  fingerprint: string;
  receivedAt: string;
  parsed: ParsedEvent;
  transactionId: string | null;
  status: 'new_tx' | 'merged' | 'duplicate' | 'discarded_otp' | 'ignored' | 'parse_failed';
  reason: string;
}

export interface LedgerData {
  settings: Settings;
  transactions: Transaction[];
  events: StoredEvent[];
  payees: Payee[];
  subscriptions: Subscription[];
  debts?: DebtRecord[];
}

export interface IngestResult {
  status: StoredEvent['status'];
  reason: string;
  transaction: Transaction | null;
  message: string;
  summary: DashboardSummary;
}

export function emptyLedger(): LedgerData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    transactions: [],
    events: [],
    payees: [],
    subscriptions: [],
    debts: [],
  };
}

let counter = 0;
export function uuid(): string {
  // RFC4122-ish v4. Good enough for client-generated ids.
  counter = (counter + 1) % 0xffff;
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(8)}${counter
    .toString(16)
    .padStart(4, '0')}`;
}

export function fingerprintOf(rawInput: RawInput): string {
  const raw = normalizeRawInput(rawInput);
  const t = normalizeText(raw.text ?? '');
  return t || `${raw.merchant ?? ''}|${raw.amount ?? ''}`;
}

export function statusOf(decision: IngestDecision, parsed: ParsedEvent): StoredEvent['status'] {
  switch (decision.action) {
    case 'create':
      return 'new_tx';
    case 'merge':
      return 'merged';
    case 'duplicate':
      return 'duplicate';
    default:
      if (parsed.kind === 'otp') return 'discarded_otp';
      if (parsed.kind === 'ignored') return 'ignored';
      return 'parse_failed';
  }
}

function cleanShortLabel(label: string | null | undefined, fallback: string): string {
  if (!label) return fallback;
  const oneLine = label.replace(/\s+/g, ' ').trim();
  if (!oneLine) return fallback;
  return oneLine.length > 18 ? `${oneLine.slice(0, 18)}…` : oneLine;
}

export function messageFor(decision: IngestDecision, tx: Transaction | null, summary: DashboardSummary): string {
  if (decision.action === 'discard') {
    const cleanReason = decision.reason.replace(/\s+/g, ' ').trim().slice(0, 48);
    return `⚠️ 未入帳：${cleanReason}`;
  }
  if (decision.action === 'duplicate') return confirmationText(`↩️ 已略過重複：${decision.reason}`, summary);
  const label = tx ? cleanShortLabel(tx.merchant ?? tx.category, tx.method === 'bank_transfer' ? '轉帳' : '消費') : '';
  const sign = tx?.type === 'income' ? '+$' : '$';
  const what = tx ? `${label} ${sign}${Math.round(tx.amount)}` : '';
  const prefix = decision.action === 'merge' ? `🔗 已合併 ${what}` : `✅ 已記 ${what}`;
  return confirmationText(prefix, summary);
}

/**
 * Self-healing sanitizer: repairs or removes corrupted historical transactions/events
 * caused by earlier OCR digit concatenation (> 10,000,000), lock-screen clock time (10:29 -> $1029),
 * or date-year false positives (2026/10/24 -> $2026). Also clears idempotencyKey on soft-deleted
 * transactions so deleted items in Trash never block re-scanning a screenshot.
 */
export function sanitizeLedgerData(data: LedgerData): LedgerData {
  const ownSuffix = data.settings?.ownAccountSuffix ?? '83151';
  const repairedTxs: Transaction[] = [];
  const seenTransferKeys = new Set<string>();

  for (const tx of data.transactions ?? []) {
    // Never let a soft-deleted transaction hold an idempotencyKey that blocks new scans
    if (tx.deletedAt) {
      if (tx.amount === 2026 && tx.method === 'bank_transfer' && tx.merchant === '轉帳') {
        continue;
      }
      repairedTxs.push({ ...tx, idempotencyKey: null });
      continue;
    }

    // 1. Remove false-positive lock-screen clock capture ("星期一\n晚上10:29" -> $1029)
    if (tx.amount === 1029 && tx.merchant && /星期[一二三四五六日天][\s\S]*10:29/.test(tx.merchant)) {
      continue;
    }

    // 2. Repair false-positive $2026 / $2040 capture from 7717 ("網路非約轉帳\n2026/10/24...")
    if (
      tx.id === 'b169f5c1-1aae-49b8-b64f-480b75440002' ||
      tx.id === 'e7441264-5368-4c75-8edf-b5f045b20002' ||
      (tx.amount === 2026 && tx.method === 'bank_transfer' && tx.merchant === '轉帳')
    ) {
      // Soft-delete the old transaction ID so already-installed Apps hide it via ct.deletedAt
      repairedTxs.push({
        ...tx,
        deletedAt: tx.deletedAt ?? '2026-10-30T15:58:00.000Z',
        idempotencyKey: null,
      });
      const matchingEv = (data.events ?? []).find(
        (e) => e.rawText && /網路非約轉帳[\s\S]*轉帳給此帳號/.test(e.rawText),
      );
      if (matchingEv?.rawText) {
        const reparsed = parseEvent('transfer_page', { text: matchingEv.rawText }, tx.createdAt, ownSuffix);
        const baseKey = idempotencyKeyFor(reparsed);
        if (reparsed.kind === 'transfer_in' && reparsed.amount && (!baseKey || !seenTransferKeys.has(baseKey))) {
          if (baseKey) seenTransferKeys.add(baseKey);
          repairedTxs.push({
            ...tx,
            id: 'tx-7717-income-500',
            type: 'income',
            amount: reparsed.amount,
            method: 'bank_transfer',
            category: '轉帳收入',
            merchant: reparsed.merchant ?? '轉帳收入',
            bankSlot: 'transfer_page',
            idempotencyKey: baseKey ? `${baseKey}#7717` : null,
            isLocked: true,
            deletedAt: null,
            occurredAt: reparsed.occurredAt,
            timeSource: reparsed.timeSource,
          });
        }
      }
      continue;
    }

    // 3. Repair or drop astronomically large OCR digit-concatenation bugs (e.g. 1.032e+42)
    if (!Number.isFinite(tx.amount) || tx.amount <= 0 || tx.amount > 10_000_000) {
      if (tx.merchant && /(轉帳金額|轉入對象|交易成功)/.test(tx.merchant)) {
        const reparsed = parseEvent('transfer_page', { text: tx.merchant }, tx.createdAt, ownSuffix);
        if (reparsed.kind === 'transfer_out' && reparsed.amount && reparsed.amount <= 10_000_000) {
          const key = idempotencyKeyFor(reparsed) ?? `${reparsed.amount}|${reparsed.payeeSuffix ?? ''}`;
          if (seenTransferKeys.has(key)) continue;
          seenTransferKeys.add(key);
          const label = reparsed.payeeSuffix ? `轉帳給 ****${reparsed.payeeSuffix}` : '轉帳';
          repairedTxs.push({
            ...tx,
            amount: reparsed.amount,
            method: 'bank_transfer',
            category: '轉帳',
            merchant: label,
            frontendSlot: null,
            bankSlot: 'transfer_page',
            idempotencyKey: idempotencyKeyFor(reparsed),
            occurredAt: reparsed.occurredAt,
            timeSource: reparsed.timeSource,
          });
        }
      }
      continue;
    }
    if (tx.idempotencyKey) {
      const baseKey = tx.idempotencyKey.split('#')[0];
      if (seenTransferKeys.has(baseKey)) continue;
      seenTransferKeys.add(baseKey);
      seenTransferKeys.add(tx.idempotencyKey);
    }
    repairedTxs.push(tx);
  }

  // 4. Recover any valid 'new_tx' transfer_page event whose transaction was accidentally dropped by the old idempotencyKey bug
  const activeTxIds = new Set(repairedTxs.map((t) => t.id));
  for (const ev of data.events ?? []) {
    if (
      ev.status === 'new_tx' &&
      ev.transactionId &&
      !activeTxIds.has(ev.transactionId) &&
      ev.parsed?.source === 'transfer_page' &&
      (ev.parsed.kind === 'transfer_out' || ev.parsed.kind === 'transfer_in') &&
      ev.parsed.amount &&
      ev.parsed.amount !== 2026 &&
      ev.parsed.amount <= 10_000_000
    ) {
      const key = idempotencyKeyFor(ev.parsed);
      if (key && seenTransferKeys.has(key)) continue;
      if (key) seenTransferKeys.add(key);
      const label = ev.parsed.payeeSuffix ? `轉帳給 ****${ev.parsed.payeeSuffix}` : '轉帳';
      repairedTxs.push({
        id: ev.transactionId,
        amount: ev.parsed.amount,
        type: 'expense',
        method: 'bank_transfer',
        category: '轉帳',
        merchant: label,
        note: null,
        accountId: 'bank',
        toAccountId: null,
        payeeId: null,
        frontendSlot: null,
        bankSlot: 'transfer_page',
        idempotencyKey: key ? `${key}#${ev.id.slice(0, 6)}` : null,
        isLocked: false,
        mergedMetadata: null,
        timeSource: ev.parsed.timeSource,
        affectsBudget: true,
        isAdvance: false,
        deletedAt: null,
        occurredAt: ev.parsed.occurredAt,
        createdAt: ev.receivedAt,
      });
      activeTxIds.add(ev.transactionId);
    }
  }

  const repairedEvents: StoredEvent[] = [];
  for (const ev of data.events ?? []) {
    if (ev.parsed?.amount && (!Number.isFinite(ev.parsed.amount) || ev.parsed.amount > 10_000_000)) {
      continue;
    }
    if (ev.parsed?.amount === 1029 && ev.parsed?.merchant && /星期[一二三四五六日天]/.test(ev.parsed.merchant)) {
      continue;
    }
    if (ev.parsed?.amount === 2026 && ev.parsed?.source === 'efingo' && !ev.parsed?.merchant) {
      continue;
    }
    if (ev.status === 'parse_failed' && ev.reason.length > 60) {
      repairedEvents.push({
        ...ev,
        parsed: { ...ev.parsed, merchant: null, reason: '畫面中未偵測到交易或轉帳金額' },
        reason: '畫面中未偵測到交易或轉帳金額',
      });
      continue;
    }
    repairedEvents.push(ev);
  }

  return {
    ...data,
    transactions: repairedTxs,
    events: repairedEvents,
    debts: Array.isArray(data.debts) ? data.debts : [],
  };
}

/**
 * Intelligently merge local App LedgerData with Cloud D1 LedgerData so that
 * Shortcut ingests on the Cloud automatically appear in the App without losing
 * local manual edits, settings, or debt records.
 */
export function mergeLedgerData(localRaw: LedgerData, cloudRaw: LedgerData): {
  merged: LedgerData;
  newlySyncedTxs: Transaction[];
} {
  const local = sanitizeLedgerData(localRaw);
  const cloud = sanitizeLedgerData(cloudRaw);

  const txById = new Map<string, Transaction>();
  const txByIdemKey = new Set<string>();
  for (const t of local.transactions) {
    txById.set(t.id, t);
    if (!t.deletedAt && t.idempotencyKey) txByIdemKey.add(t.idempotencyKey);
  }

  const newlySyncedTxs: Transaction[] = [];
  for (const ct of cloud.transactions) {
    const existing = txById.get(ct.id);
    if (existing) {
      // Preserve soft-delete or locked merge state from whichever side is further along
      txById.set(ct.id, {
        ...ct,
        ...existing,
        deletedAt: existing.deletedAt ?? ct.deletedAt,
        isLocked: existing.isLocked || ct.isLocked,
        isAdvance: existing.isAdvance || ct.isAdvance,
        mergedMetadata: existing.mergedMetadata ?? ct.mergedMetadata,
      });
    } else if (ct.idempotencyKey && txByIdemKey.has(ct.idempotencyKey)) {
      continue;
    } else {
      txById.set(ct.id, ct);
      if (ct.idempotencyKey) txByIdemKey.add(ct.idempotencyKey);
      if (!ct.deletedAt) newlySyncedTxs.push(ct);
    }
  }

  const eventById = new Map<string, StoredEvent>();
  for (const ev of cloud.events) {
    eventById.set(ev.id, ev);
  }
  for (const lev of local.events) {
    const cev = eventById.get(lev.id);
    if (!cev || (lev.status === 'new_tx' && cev.status !== 'new_tx')) {
      eventById.set(lev.id, lev);
    }
  }

  const mergeById = <T extends { id: string }>(a: T[] = [], b: T[] = []): T[] => {
    const m = new Map<string, T>();
    for (const item of b) m.set(item.id, item);
    for (const item of a) m.set(item.id, item);
    return Array.from(m.values());
  };

  const debtMap = new Map<string, DebtRecord>();
  for (const d of cloud.debts ?? []) debtMap.set(d.id, d);
  for (const ld of local.debts ?? []) {
    const cd = debtMap.get(ld.id);
    if (!cd || (ld.settlements?.length ?? 0) >= (cd.settlements?.length ?? 0)) {
      debtMap.set(ld.id, ld);
    }
  }

  const ls = local.settings;
  const cs = cloud.settings;
  const mergedSettings: Settings = {
    ...cs,
    ...ls,
    openingBank: ls.openingBank !== 0 ? ls.openingBank : cs.openingBank,
    openingCash: ls.openingCash !== 0 ? ls.openingCash : cs.openingCash,
    monthlyBudget: ls.monthlyBudget !== 0 ? ls.monthlyBudget : cs.monthlyBudget,
    safetyFloor: ls.safetyFloor !== 0 ? ls.safetyFloor : cs.safetyFloor,
    hourlyWage: ls.hourlyWage !== 0 ? ls.hourlyWage : cs.hourlyWage,
    bentoPrice: ls.bentoPrice !== 0 ? ls.bentoPrice : cs.bentoPrice,
    ownAccountSuffix: ls.ownAccountSuffix || cs.ownAccountSuffix || '83151',
    piggyBankSaved: Math.max(ls.piggyBankSaved ?? 0, cs.piggyBankSaved ?? 0),
    resistedImpulseTotal: Math.max(ls.resistedImpulseTotal ?? 0, cs.resistedImpulseTotal ?? 0),
  };

  const merged: LedgerData = sanitizeLedgerData({
    settings: mergedSettings,
    transactions: Array.from(txById.values()),
    events: Array.from(eventById.values()).slice(-120),
    payees: mergeById(local.payees, cloud.payees),
    subscriptions: mergeById(local.subscriptions, cloud.subscriptions),
    debts: Array.from(debtMap.values()),
  });

  return { merged, newlySyncedTxs };
}

/**
 * Pure in-memory implementation of the ledger, mirroring the Worker. Used by
 * the App when no cloud URL is configured, and by the test-suite.
 */
export class MemoryLedger {
  constructor(public data: LedgerData = emptyLedger()) {
    this.data = sanitizeLedgerData(this.data);
  }

  get debts(): DebtRecord[] {
    if (!Array.isArray(this.data.debts)) {
      this.data.debts = [];
    }
    return this.data.debts;
  }

  summary(now: string): DashboardSummary {
    return buildSummary(this.data.settings, this.data.transactions, this.data.subscriptions, now);
  }

  ingest(sourceHint: EventSource | null, rawInput: RawInput, now: string): IngestResult {
    const raw = normalizeRawInput(rawInput);
    const source =
      sourceHint ??
      guessSource(raw.text ?? '') ??
      (raw.amount || raw.merchant ? 'wallet' : 'efingo');
    const parsed = parseEvent(source, raw, now, this.data.settings.ownAccountSuffix);
    const fingerprint = fingerprintOf(raw);
    const eventId = uuid();
    const at = Date.parse(parsed.occurredAt);
    const windowMs = (PAIR_WINDOW_MIN + 1) * 60000;
    const candidates = this.data.transactions.filter(
      (t) => !t.deletedAt && Math.abs(Date.parse(t.occurredAt) - at) <= windowMs,
    );
    const recentEvents: RecentEvent[] = this.data.events
      .filter((e) => Math.abs(Date.parse(e.receivedAt) - Date.parse(now)) <= 60000)
      .filter((e) => e.status !== 'discarded_otp' && e.status !== 'ignored' && e.status !== 'parse_failed')
      .map((e) => ({ id: e.id, source: e.source, fingerprint: e.fingerprint, receivedAt: e.receivedAt, transactionId: e.transactionId }));
    const key = idempotencyKeyFor(parsed);
    const keyMatch = key
      ? this.data.transactions.find(
          (t) => !t.deletedAt && (t.idempotencyKey === key || t.idempotencyKey?.startsWith(`${key}#`)),
        ) ?? null
      : null;

    const decision = decideIngest({
      event: { id: eventId, parsed, fingerprint, receivedAt: now },
      recentEvents,
      candidates,
      keyMatch,
      payees: this.data.payees,
      history: this.data.transactions,
      newTransactionId: uuid(),
      now,
    });

    let tx: Transaction | null = null;
    let debtAutoSettledNote = '';
    if (decision.action === 'create') {
      tx = decision.transaction;
      if (tx.idempotencyKey) {
        tx.idempotencyKey = `${tx.idempotencyKey}#${eventId.slice(0, 6)}`;
      }
      if (parsed.kind === 'card_spend') {
        const m = matchSubscription(this.data.subscriptions, tx.amount, tx.occurredAt);
        if (m) {
          tx.merchant = tx.merchant ?? m.sub.name;
          tx.category = '訂閱';
          m.sub.lastChargedMonth = m.month;
        }
      } else if (parsed.kind === 'transfer_out' && parsed.payeeSuffix) {
        // Idea 6: Smart matching between transfer screenshot suffix and open 'i_owe' debts
        const matchedPayee = this.data.payees.find((p) => p.accountSuffix === parsed.payeeSuffix);
        const matchingDebts = this.debts
          .filter(
            (d) =>
              d.status === 'open' &&
              d.direction === 'i_owe' &&
              d.remainingAmount > 0 &&
              (d.accountSuffix === parsed.payeeSuffix ||
                (matchedPayee && d.personName.trim() === matchedPayee.displayName.trim())),
          )
          .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

        if (matchingDebts.length > 0) {
          let leftToOffset = tx.amount;
          let totalOffset = 0;
          const personName = matchingDebts[0].personName;
          for (const d of matchingDebts) {
            if (leftToOffset <= 0) break;
            const take = Math.min(d.remainingAmount, leftToOffset);
            if (take <= 0) continue;
            d.remainingAmount -= take;
            leftToOffset -= take;
            totalOffset += take;
            d.settlements.push({
              id: uuid(),
              amount: take,
              accountId: 'bank',
              linkedTxId: tx.id,
              note: `⚡ 轉帳截圖 (****${parsed.payeeSuffix}) 自動沖銷`,
              settledAt: now,
            });
            if (d.remainingAmount <= 0) {
              d.remainingAmount = 0;
              d.status = 'settled';
              d.settledAt = now;
            }
          }
          if (totalOffset > 0) {
            tx.isAdvance = true; // Repayment does not eat into personal monthly spending budget
            tx.category = '欠款歸還';
            tx.merchant = `歸還 ${personName}`;
            tx.note = `⚡ 轉帳截圖自動沖銷欠款 $${totalOffset}`;
            debtAutoSettledNote = `（🤝 已自動沖銷對「${personName}」欠款 $${totalOffset}，不扣個人預算）`;
          }
        }
      }
      this.data.transactions.push(tx);
    } else if (decision.action === 'merge') {
      const idx = this.data.transactions.findIndex((t) => t.id === decision.transactionId);
      tx = { ...this.data.transactions[idx], ...decision.patch };
      this.data.transactions[idx] = tx;
    } else if (decision.action === 'duplicate' && decision.transactionId) {
      tx = this.data.transactions.find((t) => t.id === decision.transactionId) ?? null;
    }

    const status = statusOf(decision, parsed);
    const rawPreviewSource = (raw.text && raw.text.trim()) ? raw.text : fingerprint;
    const maskedRaw =
      parsed.kind === 'otp' ? null : maskSensitiveText(rawPreviewSource.slice(0, 2000));
    this.data.events.push({
      id: eventId,
      source: parsed.source,
      rawText: maskedRaw,
      fingerprint: parsed.kind === 'otp' ? '' : maskSensitiveText(fingerprint),
      receivedAt: now,
      parsed,
      transactionId: tx?.id ?? null,
      status,
      reason: decision.reason,
    });
    // Prune events older than 30 days and cap at 300 entries
    const cutoffMs = Date.parse(now) - 30 * 24 * 60 * 60 * 1000;
    if (Number.isFinite(cutoffMs)) {
      this.data.events = this.data.events.filter((e) => {
        const ms = Date.parse(e.receivedAt);
        return !Number.isFinite(ms) || ms >= cutoffMs;
      });
    }
    if (this.data.events.length > 300) this.data.events.splice(0, this.data.events.length - 300);

    const summary = this.summary(now);
    const baseMsg = messageFor(decision, tx, summary);
    return {
      status,
      reason: decision.reason,
      transaction: tx,
      message: debtAutoSettledNote ? `${baseMsg} ${debtAutoSettledNote}` : baseMsg,
      summary,
    };
  }

  upsert(tx: Transaction): void {
    const idx = this.data.transactions.findIndex((t) => t.id === tx.id);
    if (idx >= 0) this.data.transactions[idx] = tx;
    else this.data.transactions.push(tx);
  }

  update(id: string, patch: Partial<Transaction>): Transaction | null {
    const idx = this.data.transactions.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    this.data.transactions[idx] = { ...this.data.transactions[idx], ...patch, id };
    return this.data.transactions[idx];
  }

  remove(id: string, now: string) {
    return this.update(id, { deletedAt: now });
  }

  restore(id: string) {
    return this.update(id, { deletedAt: null });
  }

  hardDelete(id: string): Transaction | null {
    const target = this.data.transactions.find((t) => t.id === id) ?? null;
    if (!target) return null;
    this.data.transactions = this.data.transactions.filter((t) => t.id !== id);
    this.data.events = this.data.events.filter((e) => e.transactionId !== id);
    return target;
  }

  emptyTrash(): number {
    const trashedIds = new Set(
      this.data.transactions.filter((t) => Boolean(t.deletedAt)).map((t) => t.id),
    );
    if (trashedIds.size === 0) return 0;
    this.data.transactions = this.data.transactions.filter((t) => !t.deletedAt);
    this.data.events = this.data.events.filter(
      (e) => !e.transactionId || !trashedIds.has(e.transactionId),
    );
    return trashedIds.size;
  }

  split(id: string, now: string): boolean {
    const tx = this.data.transactions.find((t) => t.id === id);
    if (!tx) return false;
    const res = splitTransaction(tx, uuid(), now);
    if (!res) return false;
    this.upsert(res.updated);
    this.upsert(res.created);
    return true;
  }

  reconcile(accountId: AccountId, actual: number, affectsBudget: boolean, now: string): Transaction | null {
    const bal = computeBalances(this.data.settings, this.data.transactions)[accountId];
    const adj = createAdjustment(uuid(), accountId, bal, actual, affectsBudget, now);
    if (adj) this.data.transactions.push(adj);
    return adj;
  }

  /** Post subscriptions that are due. Returns the created transactions. */
  chargeSubscriptions(now: string): Transaction[] {
    const out: Transaction[] = [];
    for (const { sub, month, due } of dueSubscriptions(this.data.subscriptions, now)) {
      const tx: Transaction = {
        id: `sub:${sub.id}:${month}`,
        amount: sub.amount,
        type: 'expense',
        method: 'other',
        category: '訂閱',
        merchant: sub.name,
        note: '固定扣款（自動）',
        accountId: sub.accountId,
        toAccountId: null,
        payeeId: null,
        frontendSlot: null,
        bankSlot: null,
        idempotencyKey: `sub:${sub.id}:${month}`,
        isLocked: true,
        mergedMetadata: null,
        timeSource: 'manual',
        affectsBudget: true,
        isAdvance: false,
        deletedAt: null,
        occurredAt: `${due}T04:00:00.000Z`, // noon Taipei
        createdAt: now,
      };
      if (!this.data.transactions.some((t) => t.id === tx.id)) {
        this.data.transactions.push(tx);
        out.push(tx);
      }
      sub.lastChargedMonth = month;
    }
    return out;
  }

  /**
   * Add a new debt record ('owed_to_me' or 'i_owe').
   * If `syncAccountId` is provided, also records the corresponding balance movement
   * without affecting the user's personal monthly spending budget.
   */
  addDebt(
    input: {
      personName: string;
      direction: DebtDirection;
      amount: number;
      title: string;
      note?: string | null;
      accountSuffix?: string | null;
      dueDate?: string | null;
      syncAccountId?: AccountId | null;
      sourceTxId?: string | null;
      occurredAt?: string;
    },
    now: string,
  ): DebtRecord {
    const cleanAmount = Math.max(1, Math.round(input.amount));
    const cleanName = input.personName.trim() || '朋友';
    const cleanTitle = input.title.trim() || (input.direction === 'owed_to_me' ? '代墊款項' : '借入款項');
    const cleanSuffix = input.accountSuffix?.trim()
      ? input.accountSuffix.trim().replace(/\D/g, '').slice(-5) || null
      : null;
    const occurredAt = input.occurredAt ?? now;

    let linkedTxId = input.sourceTxId ?? null;
    if (input.syncAccountId && !linkedTxId) {
      if (input.direction === 'owed_to_me') {
        const tx = createManualExpense({
          id: uuid(),
          amount: cleanAmount,
          method: input.syncAccountId === 'bank' ? 'bank_transfer' : 'cash',
          category: '代墊借出',
          merchant: `${cleanName}（${cleanTitle}）`,
          note: input.note?.trim() || '新增別人欠我（代墊／借出）',
          occurredAt,
          now,
        });
        tx.isAdvance = true;
        this.upsert(tx);
        linkedTxId = tx.id;
      } else {
        const tx = createIncome(
          uuid(),
          cleanAmount,
          input.syncAccountId,
          `向 ${cleanName} 借入（${cleanTitle}）`,
          now,
        );
        tx.merchant = `向 ${cleanName} 借入（${cleanTitle}）`;
        tx.category = '借入款項';
        tx.occurredAt = occurredAt;
        this.upsert(tx);
        linkedTxId = tx.id;
      }
    }

    const record: DebtRecord = {
      id: uuid(),
      personName: cleanName,
      direction: input.direction,
      originalAmount: cleanAmount,
      remainingAmount: cleanAmount,
      title: cleanTitle,
      note: input.note?.trim() || null,
      accountSuffix: cleanSuffix,
      sourceTxId: linkedTxId,
      dueDate: input.dueDate?.trim() || null,
      status: 'open',
      settlements: [],
      occurredAt,
      createdAt: now,
      settledAt: null,
    };

    this.debts.push(record);
    return record;
  }

  /**
   * Idea 5: Partial or full debt repayment with optional bank/cash balance sync.
   */
  settleDebt(
    debtId: string,
    amount: number,
    accountId: AccountId | null,
    note: string | null,
    now: string,
  ): { debt: DebtRecord; transaction: Transaction | null; paidAmount: number } | null {
    const debt = this.debts.find((d) => d.id === debtId);
    if (!debt || debt.status === 'settled' || debt.remainingAmount <= 0) return null;

    const paidAmount = Math.min(debt.remainingAmount, Math.max(1, Math.round(amount)));
    let linkedTx: Transaction | null = null;

    if (accountId) {
      if (debt.direction === 'owed_to_me') {
        linkedTx = createIncome(
          uuid(),
          paidAmount,
          accountId,
          `${debt.personName} 歸還（${debt.title}）`,
          now,
        );
        linkedTx.merchant = `${debt.personName} 歸還（${debt.title}）`;
        linkedTx.category = '欠款收回';
        this.upsert(linkedTx);
      } else {
        linkedTx = createManualExpense({
          id: uuid(),
          amount: paidAmount,
          method: accountId === 'bank' ? 'bank_transfer' : 'cash',
          category: '欠款歸還',
          merchant: `歸還 ${debt.personName}（${debt.title}）`,
          note: note?.trim() || '結清／歸還欠款',
          occurredAt: now,
          now,
        });
        linkedTx.isAdvance = true;
        this.upsert(linkedTx);
      }
    }

    const settlement: DebtSettlement = {
      id: uuid(),
      amount: paidAmount,
      accountId,
      linkedTxId: linkedTx?.id ?? null,
      note: note?.trim() || null,
      settledAt: now,
    };

    debt.settlements.push(settlement);
    debt.remainingAmount = Math.max(0, debt.remainingAmount - paidAmount);
    if (debt.remainingAmount === 0) {
      debt.status = 'settled';
      debt.settledAt = now;
    }

    return { debt, transaction: linkedTx, paidAmount };
  }

  /**
   * Idea 1: Auto-Netting for a specific person.
   * Offsets mutual open debts ('owed_to_me' vs 'i_owe') for the same person.
   */
  netPersonDebts(
    personName: string,
    now: string,
  ): { offsetAmount: number; affectedCount: number } {
    const key = personName.trim();
    const owedToMeList = this.debts
      .filter((d) => d.status === 'open' && d.direction === 'owed_to_me' && d.personName.trim() === key && d.remainingAmount > 0)
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    const iOweList = this.debts
      .filter((d) => d.status === 'open' && d.direction === 'i_owe' && d.personName.trim() === key && d.remainingAmount > 0)
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

    const totalOwedToMe = owedToMeList.reduce((acc, d) => acc + d.remainingAmount, 0);
    const totalIOwe = iOweList.reduce((acc, d) => acc + d.remainingAmount, 0);
    const offsetAmount = Math.min(totalOwedToMe, totalIOwe);
    if (offsetAmount <= 0) {
      return { offsetAmount: 0, affectedCount: 0 };
    }

    let affectedCount = 0;
    const applyOffset = (list: DebtRecord[], targetOffset: number) => {
      let left = targetOffset;
      for (const d of list) {
        if (left <= 0) break;
        const take = Math.min(d.remainingAmount, left);
        if (take <= 0) continue;
        d.remainingAmount -= take;
        left -= take;
        d.settlements.push({
          id: uuid(),
          amount: take,
          accountId: null,
          linkedTxId: null,
          note: `⚡ 與「${key}」雙向欠款自動互抵`,
          settledAt: now,
        });
        if (d.remainingAmount <= 0) {
          d.remainingAmount = 0;
          d.status = 'settled';
          d.settledAt = now;
        }
        affectedCount += 1;
      }
    };

    applyOffset(owedToMeList, offsetAmount);
    applyOffset(iOweList, offsetAmount);
    return { offsetAmount, affectedCount };
  }

  /**
   * Idea 2: Convert or AA-split an existing expense transaction into 1 or more 'owed_to_me' debt records,
   * while protecting the user's personal monthly budget from friends' shares!
   */
  convertTxToDebtSplit(
    txId: string,
    splits: Array<{ personName: string; amount: number; accountSuffix?: string | null }>,
    now: string,
  ): DebtRecord[] {
    const tx = this.data.transactions.find((t) => t.id === txId && !t.deletedAt);
    if (!tx || tx.type !== 'expense') return [];

    const validSplits = splits
      .map((s) => ({
        personName: s.personName.trim() || '朋友',
        amount: Math.max(0, Math.round(s.amount)),
        accountSuffix: s.accountSuffix?.trim() || null,
      }))
      .filter((s) => s.amount > 0);
    if (validSplits.length === 0) return [];

    const totalAdvance = validSplits.reduce((sum, s) => sum + s.amount, 0);
    const originalTitle = tx.merchant ?? tx.category ?? '代墊消費';

    let advanceTxId = tx.id;
    if (totalAdvance >= tx.amount) {
      tx.isAdvance = true;
      tx.note = `🤝 全額代墊（${validSplits.map((s) => `${s.personName} $${s.amount}`).join('、')}）`;
    } else {
      const personalShare = tx.amount - totalAdvance;
      tx.amount = personalShare;
      tx.isAdvance = false;
      tx.note = `🧮 AA拆帳個人自付 $${personalShare}（另幫朋友代墊 $${totalAdvance}）`;

      const advTx: Transaction = {
        ...tx,
        id: uuid(),
        amount: totalAdvance,
        merchant: `${originalTitle}（代墊拆帳）`,
        note: `🤝 幫 ${validSplits.map((s) => `${s.personName} $${s.amount}`).join('、')} 代墊`,
        idempotencyKey: null,
        isLocked: true,
        mergedMetadata: null,
        isAdvance: true,
        createdAt: now,
      };
      this.data.transactions.push(advTx);
      advanceTxId = advTx.id;
    }

    const createdDebts: DebtRecord[] = [];
    for (const s of validSplits) {
      const rec = this.addDebt(
        {
          personName: s.personName,
          direction: 'owed_to_me',
          amount: s.amount,
          title: originalTitle,
          note: `由消費明細「${originalTitle}」轉入代墊`,
          accountSuffix: s.accountSuffix,
          syncAccountId: null,
          sourceTxId: advanceTxId,
          occurredAt: tx.occurredAt,
        },
        now,
      );
      createdDebts.push(rec);
    }
    return createdDebts;
  }

  deleteDebt(debtId: string): boolean {
    const before = this.debts.length;
    this.data.debts = this.debts.filter((d) => d.id !== debtId);
    return this.data.debts.length < before;
  }
}
