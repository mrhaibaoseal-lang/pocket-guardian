import { createAdjustment, createIncome, createManualExpense, decideIngest, idempotencyKeyFor, PAIR_WINDOW_MIN, splitTransaction } from './dedupe';
import type { IngestDecision, RecentEvent } from './dedupe';
import { computeBalances, dueSubscriptions, matchSubscription } from './ledger';
import { guessSource, maskSensitiveText, normalizeText, parseEvent } from './parsers';
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
  constructor(public data: LedgerData = emptyLedger()) {
    if (!Array.isArray(this.data.debts)) {
      this.data.debts = [];
    }
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
    let debtAutoSettledNote = '';
    if (decision.action === 'create') {
      tx = decision.transaction;
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
