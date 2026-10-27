import { minutesBetween } from './time';
import type {
  AccountId,
  EventSource,
  MergedMetadata,
  ParsedEvent,
  ParsedSnapshot,
  Payee,
  PayMethod,
  Transaction,
} from './types';

/** Wallet + e.Fingo for the same purchase may arrive up to this far apart. */
export const PAIR_WINDOW_MIN = 30;
/** Same source + identical text within this window = iOS fired the automation twice. */
export const REPEAT_WINDOW_SEC = 10;

export interface IncomingEvent {
  id: string;
  parsed: ParsedEvent;
  /** Text used for repeat detection (already normalised). */
  fingerprint: string;
  receivedAt: string;
}

export interface RecentEvent {
  id: string;
  source: EventSource;
  fingerprint: string;
  receivedAt: string;
  transactionId: string | null;
}

export type IngestDecision =
  | { action: 'discard'; reason: string }
  | { action: 'duplicate'; reason: string; transactionId: string | null }
  | { action: 'merge'; reason: string; transactionId: string; patch: Partial<Transaction> }
  | { action: 'create'; reason: string; transaction: Transaction };

export interface DecideInput {
  event: IncomingEvent;
  /** Events received in the last minute or so (for repeat detection). */
  recentEvents: RecentEvent[];
  /** Non-deleted transactions within ±PAIR_WINDOW_MIN of the event. */
  candidates: Transaction[];
  /** Transaction already holding this event's idempotency key, if any. */
  keyMatch: Transaction | null;
  payees: Payee[];
  /** Older transactions, used to learn categories from merchant names. */
  history: Transaction[];
  newTransactionId: string;
  now: string;
}

export function idempotencyKeyFor(p: ParsedEvent): string | null {
  if (p.source === 'transfer_page' && p.timeSource === 'absolute' && p.amount) {
    return `tp:${p.occurredAt}|${p.amount}|${p.payeeSuffix ?? ''}`;
  }
  return null;
}

export function snapshotOf(event: IncomingEvent): ParsedSnapshot {
  return {
    eventId: event.id,
    source: event.parsed.source,
    amount: event.parsed.amount ?? 0,
    merchant: event.parsed.merchant,
    occurredAt: event.parsed.occurredAt,
  };
}

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/(7-?ELEVEN|統一超商|全家|FamilyMart|萊爾富|Hi-?Life|OK\s?mart|來來超商)/i, '超商'],
  [/(星巴克|Starbucks|路易莎|Louisa|50嵐|清心|可不可|麻古|迷客夏|CoCo|五十嵐|茶湯會|龜記|得正|大苑子|cama|咖啡|飲料|茶)/i, '飲料'],
  [/(麥當勞|McDonald|肯德基|KFC|摩斯|MOS|漢堡王|Burger King|Subway|頂呱呱|拿坡里|必勝客|達美樂)/i, '速食'],
  [/(全聯|家樂福|Carrefour|好市多|Costco|美廉社|愛買|大潤發)/i, '超市'],
  [/(中油|台塑石油|全國加油|加油站|台鐵|高鐵|捷運|Uber|悠遊|一卡通|iPASS|計程車|停車)/i, '交通'],
  [/(屈臣氏|Watsons|康是美|Cosmed|寶雅|POYA|藥局|樂家康)/i, '日用品'],
  [/(Netflix|Spotify|Apple\.com|iCloud|YouTube|Disney|Google)/i, '訂閱'],
  [/(Uber\s?Eats|foodpanda|熊貓)/i, '外送'],
];

export function guessCategory(merchant: string | null, history: Transaction[]): string | null {
  if (!merchant) return null;
  const learned = history.find((t) => t.merchant === merchant && t.category && !t.deletedAt);
  if (learned) return learned.category;
  for (const [re, cat] of CATEGORY_RULES) if (re.test(merchant)) return cat;
  return null;
}

function blankTx(id: string, now: string): Transaction {
  return {
    id,
    amount: 0,
    type: 'expense',
    method: 'other',
    category: null,
    merchant: null,
    note: null,
    accountId: 'bank',
    toAccountId: null,
    payeeId: null,
    frontendSlot: null,
    bankSlot: null,
    idempotencyKey: null,
    isLocked: false,
    mergedMetadata: null,
    timeSource: 'manual',
    affectsBudget: true,
    isAdvance: false,
    deletedAt: null,
    occurredAt: now,
    createdAt: now,
  };
}

function closest(event: IncomingEvent, list: Transaction[]): Transaction | null {
  let best: Transaction | null = null;
  let bestDiff = Infinity;
  for (const t of list) {
    const d = minutesBetween(t.occurredAt, event.parsed.occurredAt);
    if (d < bestDiff) {
      best = t;
      bestDiff = d;
    }
  }
  return best;
}

function earlier(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

/**
 * Decide what one incoming event does to the ledger. Pure function: the caller
 * must run it under a lock (the Worker uses a Durable Object) so two events that
 * arrive in the same 100 ms can't both decide "create".
 */
export function decideIngest(input: DecideInput): IngestDecision {
  const { event, recentEvents, candidates, keyMatch, payees, history, newTransactionId, now } = input;
  const p = event.parsed;

  if (p.kind === 'otp' || p.kind === 'ignored' || p.kind === 'unknown' || !p.amount) {
    return { action: 'discard', reason: p.reason || '無法辨識' };
  }

  // Rule 0a: iOS fired the same automation twice.
  const repeat = recentEvents.find(
    (e) =>
      e.source === p.source &&
      e.fingerprint === event.fingerprint &&
      Math.abs(Date.parse(e.receivedAt) - Date.parse(event.receivedAt)) <= REPEAT_WINDOW_SEC * 1000,
  );
  if (repeat) {
    return {
      action: 'duplicate',
      reason: `${REPEAT_WINDOW_SEC} 秒內收到完全相同的通知，視為重複觸發`,
      transactionId: repeat.transactionId,
    };
  }

  // Rule 0b: same transfer screenshot captured twice.
  if (keyMatch) {
    return { action: 'duplicate', reason: '這張轉帳畫面已經記過了', transactionId: keyMatch.id };
  }

  const inWindow = candidates.filter(
    (t) =>
      !t.deletedAt &&
      !t.isLocked &&
      t.type === 'expense' &&
      t.amount === p.amount &&
      minutesBetween(t.occurredAt, p.occurredAt) <= PAIR_WINDOW_MIN,
  );

  if (p.kind === 'card_spend') {
    // Rules 1 + 2: only fill an EMPTY slot on an UNLOCKED transaction.
    // A second identical purchase from the same source finds its slot taken
    // (or the transaction locked) and therefore creates a new transaction.
    const matches =
      p.source === 'wallet'
        ? inWindow.filter((t) => t.frontendSlot === null && t.bankSlot === 'efingo_push')
        : inWindow.filter(
            (t) =>
              t.bankSlot === null &&
              (t.frontendSlot === 'apple_pay' || (t.frontendSlot === 'manual' && t.method === 'debit_card')),
          );
    const target = closest(event, matches);
    if (target) {
      const meta: MergedMetadata = { ...(target.mergedMetadata ?? {}) };
      const patch: Partial<Transaction> = { isLocked: true };
      if (p.source === 'wallet') {
        meta.frontendEvent = snapshotOf(event);
        patch.frontendSlot = 'apple_pay';
        patch.method = 'apple_pay';
        patch.merchant = target.merchant ?? p.merchant;
        patch.category = target.category ?? guessCategory(p.merchant, history);
        patch.occurredAt = earlier(target.occurredAt, p.occurredAt);
      } else {
        meta.bankEvent = snapshotOf(event);
        patch.bankSlot = 'efingo_push';
      }
      patch.mergedMetadata = meta;
      return {
        action: 'merge',
        reason: p.source === 'wallet' ? '與玉山通知合併為同一筆（補上商店名稱）' : '與 Apple Pay 合併為同一筆',
        transactionId: target.id,
        patch,
      };
    }

    const tx = blankTx(newTransactionId, now);
    tx.amount = p.amount;
    tx.occurredAt = p.occurredAt;
    tx.timeSource = p.timeSource;
    tx.accountId = 'bank';
    if (p.source === 'wallet') {
      tx.method = 'apple_pay';
      tx.frontendSlot = 'apple_pay';
      tx.merchant = p.merchant;
      tx.category = guessCategory(p.merchant, history);
      tx.mergedMetadata = { frontendEvent: snapshotOf(event) };
    } else {
      // Could be a physical card, or Apple Pay whose wallet event hasn't arrived yet.
      tx.method = 'debit_card';
      tx.bankSlot = 'efingo_push';
      tx.mergedMetadata = { bankEvent: snapshotOf(event) };
    }
    return { action: 'create', reason: p.source === 'wallet' ? 'Apple Pay 新消費' : '金融卡新消費', transaction: tx };
  }

  // transfer_out
  const payee = p.payeeSuffix ? payees.find((x) => x.accountSuffix === p.payeeSuffix) ?? null : null;
  const transferMatches = inWindow.filter(
    (t) =>
      t.method === 'bank_transfer' &&
      ((t.frontendSlot === 'manual' && t.bankSlot === null) ||
        (t.bankSlot !== null && t.bankSlot !== (p.source === 'transfer_page' ? 'transfer_page' : 'efingo_push'))),
  );
  const target = closest(event, transferMatches);
  const key = idempotencyKeyFor(p);
  const label = payee ? payee.displayName : p.payeeSuffix ? `轉帳給 ****${p.payeeSuffix}` : '轉帳';

  if (target) {
    const meta: MergedMetadata = { ...(target.mergedMetadata ?? {}), bankEvent: snapshotOf(event) };
    const patch: Partial<Transaction> = { isLocked: true, mergedMetadata: meta };
    if (target.bankSlot === null) patch.bankSlot = p.source === 'transfer_page' ? 'transfer_page' : 'efingo_push';
    if (p.timeSource === 'absolute') {
      patch.occurredAt = p.occurredAt;
      patch.timeSource = 'absolute';
    }
    if (key) patch.idempotencyKey = key;
    if (payee && !target.payeeId) {
      patch.payeeId = payee.id;
      patch.merchant = payee.displayName;
      patch.category = target.category ?? payee.defaultCategory;
    } else if (!target.merchant) {
      patch.merchant = label;
    }
    return { action: 'merge', reason: '與已記錄的轉帳合併為同一筆', transactionId: target.id, patch };
  }

  const tx = blankTx(newTransactionId, now);
  tx.amount = p.amount;
  tx.method = 'bank_transfer';
  tx.accountId = 'bank';
  tx.bankSlot = p.source === 'transfer_page' ? 'transfer_page' : 'efingo_push';
  tx.occurredAt = p.occurredAt;
  tx.timeSource = p.timeSource;
  tx.idempotencyKey = key;
  tx.payeeId = payee?.id ?? null;
  tx.merchant = label;
  tx.category = payee?.defaultCategory ?? '轉帳';
  tx.mergedMetadata = { bankEvent: snapshotOf(event) };
  return {
    action: 'create',
    reason: payee ? `轉帳給 ${payee.displayName}` : p.payeeSuffix ? '轉帳給新對象（可在 App 內命名）' : '轉帳',
    transaction: tx,
  };
}

/**
 * "✂️ 我真的買了兩次" — undo an automatic merge. Both halves are locked so the
 * engine will never merge them again.
 */
export function splitTransaction(
  tx: Transaction,
  newId: string,
  now: string,
): { updated: Transaction; created: Transaction } | null {
  const meta = tx.mergedMetadata;
  if (!meta?.frontendEvent || !meta?.bankEvent) return null;
  const updated: Transaction = {
    ...tx,
    bankSlot: null,
    isLocked: true,
    amount: meta.frontendEvent.amount || tx.amount,
    occurredAt: meta.frontendEvent.occurredAt,
    mergedMetadata: { frontendEvent: meta.frontendEvent },
  };
  const created: Transaction = {
    ...tx,
    id: newId,
    frontendSlot: null,
    method: tx.method === 'bank_transfer' ? 'bank_transfer' : 'debit_card',
    merchant: tx.method === 'bank_transfer' ? tx.merchant : null,
    category: tx.method === 'bank_transfer' ? tx.category : null,
    idempotencyKey: null,
    isLocked: true,
    amount: meta.bankEvent.amount || tx.amount,
    occurredAt: meta.bankEvent.occurredAt,
    mergedMetadata: { bankEvent: meta.bankEvent },
    createdAt: now,
  };
  return { updated, created };
}

export interface ManualInput {
  id: string;
  amount: number;
  method: Exclude<PayMethod, 'atm' | 'other'>;
  category?: string | null;
  merchant?: string | null;
  note?: string | null;
  payeeId?: string | null;
  occurredAt: string;
  now: string;
}

/**
 * Manual entry. Debit-card / transfer entries stay UNLOCKED so that if the
 * bank notification shows up later it merges instead of double counting.
 */
export function createManualExpense(input: ManualInput): Transaction {
  const tx = blankTx(input.id, input.now);
  tx.amount = input.amount;
  tx.method = input.method;
  tx.accountId = input.method === 'cash' ? 'cash' : 'bank';
  tx.category = input.category ?? null;
  tx.merchant = input.merchant ?? null;
  tx.note = input.note ?? null;
  tx.payeeId = input.payeeId ?? null;
  tx.occurredAt = input.occurredAt;
  tx.timeSource = 'manual';
  const pairable = input.method === 'debit_card' || input.method === 'bank_transfer';
  tx.frontendSlot = pairable ? 'manual' : null;
  tx.isLocked = !pairable;
  return tx;
}

export function createIncome(id: string, amount: number, accountId: AccountId, note: string | null, at: string): Transaction {
  const tx = blankTx(id, at);
  tx.type = 'income';
  tx.amount = amount;
  tx.accountId = accountId;
  tx.note = note;
  tx.category = '收入';
  tx.isLocked = true;
  tx.occurredAt = at;
  return tx;
}

/** ATM withdraw (bank -> cash) or deposit (cash -> bank). Never counted as spending. */
export function createAtm(
  ids: { transfer: string; fee: string },
  direction: 'withdraw' | 'deposit',
  amount: number,
  fee: number,
  at: string,
): Transaction[] {
  const t = blankTx(ids.transfer, at);
  t.type = 'transfer';
  t.method = 'atm';
  t.amount = amount;
  t.accountId = direction === 'withdraw' ? 'bank' : 'cash';
  t.toAccountId = direction === 'withdraw' ? 'cash' : 'bank';
  t.merchant = direction === 'withdraw' ? 'ATM 提款' : 'ATM 存款';
  t.category = '內部移轉';
  t.isLocked = true;
  t.occurredAt = at;
  const out = [t];
  if (fee > 0) {
    const f = blankTx(ids.fee, at);
    f.amount = fee;
    f.method = 'bank_transfer';
    f.accountId = 'bank';
    f.merchant = 'ATM 跨行手續費';
    f.category = '手續費';
    f.isLocked = true;
    f.occurredAt = at;
    out.push(f);
  }
  return out;
}

/**
 * ⚖️ Reconcile: make `accountId` equal `actual` by adding one adjustment.
 * `affectsBudget` decides whether an unexplained loss eats this month's budget.
 */
export function createAdjustment(
  id: string,
  accountId: AccountId,
  currentBalance: number,
  actual: number,
  affectsBudget: boolean,
  at: string,
): Transaction | null {
  const delta = Math.round((actual - currentBalance) * 100) / 100;
  if (delta === 0) return null;
  const tx = blankTx(id, at);
  tx.type = 'adjustment';
  tx.amount = delta;
  tx.accountId = accountId;
  tx.merchant = delta < 0 ? '對帳：未記錄支出' : '對帳：未記錄收入';
  tx.category = delta < 0 ? '未歸類支出' : '未歸類收入';
  tx.affectsBudget = affectsBudget;
  tx.isLocked = true;
  tx.occurredAt = at;
  return tx;
}
