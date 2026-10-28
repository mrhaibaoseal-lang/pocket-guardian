import { createAdjustment, decideIngest, idempotencyKeyFor, PAIR_WINDOW_MIN, splitTransaction } from './dedupe';
import type { IngestDecision, RecentEvent } from './dedupe';
import { computeBalances, dueSubscriptions, matchSubscription } from './ledger';
import { guessSource, maskSensitiveText, normalizeText, parseEvent } from './parsers';
import type { RawInput } from './parsers';
import { buildSummary, confirmationText } from './summary';
import type { DashboardSummary } from './summary';
import { DEFAULT_SETTINGS } from './types';
import type { AccountId, EventSource, ParsedEvent, Payee, Settings, Subscription, Transaction } from './types';

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
}

export interface IngestResult {
  status: StoredEvent['status'];
  reason: string;
  transaction: Transaction | null;
  message: string;
  summary: DashboardSummary;
}

export function emptyLedger(): LedgerData {
  return { settings: { ...DEFAULT_SETTINGS }, transactions: [], events: [], payees: [], subscriptions: [] };
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

export function fingerprintOf(raw: RawInput): string {
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

export function messageFor(decision: IngestDecision, tx: Transaction | null, summary: DashboardSummary): string {
  if (decision.action === 'discard') return `⚠️ 未入帳：${decision.reason}`;
  if (decision.action === 'duplicate') return confirmationText(`↩️ 已略過重複：${decision.reason}`, summary);
  const what = tx ? `${tx.merchant ?? tx.category ?? '消費'} $${tx.amount}` : '';
  const prefix = decision.action === 'merge' ? `🔗 已合併 ${what}` : `✅ 已記 ${what}`;
  return confirmationText(prefix, summary);
}

/**
 * Pure in-memory implementation of the ledger, mirroring the Worker. Used by
 * the App when no cloud URL is configured, and by the test-suite.
 */
export class MemoryLedger {
  constructor(public data: LedgerData = emptyLedger()) {}

  summary(now: string): DashboardSummary {
    return buildSummary(this.data.settings, this.data.transactions, this.data.subscriptions, now);
  }

  ingest(sourceHint: EventSource | null, raw: RawInput, now: string): IngestResult {
    const source = sourceHint ?? guessSource(raw.text ?? '') ?? (raw.amount ? 'wallet' : 'efingo');
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
    const keyMatch = key ? this.data.transactions.find((t) => t.idempotencyKey === key && !t.deletedAt) ?? null : null;

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
    if (decision.action === 'create') {
      tx = decision.transaction;
      if (parsed.kind === 'card_spend') {
        const m = matchSubscription(this.data.subscriptions, tx.amount, tx.occurredAt);
        if (m) {
          tx.merchant = tx.merchant ?? m.sub.name;
          tx.category = '訂閱';
          m.sub.lastChargedMonth = m.month;
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
    const maskedRaw =
      parsed.kind === 'otp' ? null : maskSensitiveText((raw.text ?? fingerprint).slice(0, 2000));
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
    return { status, reason: decision.reason, transaction: tx, message: messageFor(decision, tx, summary), summary };
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
}
