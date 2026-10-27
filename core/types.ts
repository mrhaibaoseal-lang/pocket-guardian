// Shared domain types used by both the App and the Cloudflare Worker.

export type EventSource = 'wallet' | 'efingo' | 'transfer_page' | 'manual';

/** Which payment channel filled the "frontend" side of a transaction. */
export type FrontendSlot = 'apple_pay' | 'manual';
/** Which bank-side signal filled the "bank" side of a transaction. */
export type BankSlot = 'efingo_push' | 'transfer_page';

export type TxType = 'expense' | 'income' | 'transfer' | 'adjustment';

/**
 * How the money moved.
 * - apple_pay / debit_card / bank_transfer: from the bank account
 * - cash: from the cash wallet
 * - atm: internal transfer between bank and cash (never counted as spending)
 * - other: income, adjustments, subscriptions
 */
export type PayMethod = 'apple_pay' | 'debit_card' | 'bank_transfer' | 'cash' | 'atm' | 'other';

export type AccountId = 'bank' | 'cash';

export interface Transaction {
  id: string;
  /** Always positive, except for `adjustment` where the sign is the balance delta. */
  amount: number;
  type: TxType;
  method: PayMethod;
  category: string | null;
  merchant: string | null;
  note: string | null;
  accountId: AccountId;
  /** Only for `transfer` (e.g. ATM withdraw: bank -> cash). */
  toAccountId: AccountId | null;
  payeeId: string | null;
  frontendSlot: FrontendSlot | null;
  bankSlot: BankSlot | null;
  idempotencyKey: string | null;
  isLocked: boolean;
  /** Raw events merged into this transaction, used by "split into two". */
  mergedMetadata: MergedMetadata | null;
  timeSource: 'absolute' | 'notification_received' | 'manual';
  /** For adjustments: whether the delta counts toward the monthly budget. */
  affectsBudget: boolean;
  /** Payable placeholder (P3 代墊). Kept so the schema doesn't need to change later. */
  isAdvance: boolean;
  deletedAt: string | null;
  occurredAt: string; // ISO 8601 (UTC)
  createdAt: string;
}

export interface MergedMetadata {
  frontendEvent?: ParsedSnapshot;
  bankEvent?: ParsedSnapshot;
}

export interface ParsedSnapshot {
  eventId: string;
  source: EventSource;
  amount: number;
  merchant: string | null;
  occurredAt: string;
}

export type ParsedKind = 'card_spend' | 'transfer_out' | 'otp' | 'ignored' | 'unknown';

export interface ParsedEvent {
  kind: ParsedKind;
  source: EventSource;
  amount: number | null;
  merchant: string | null;
  location: string | null;
  occurredAt: string;
  timeSource: 'absolute' | 'notification_received';
  payeeBankCode: string | null;
  payeeSuffix: string | null;
  ownSuffix: string | null;
  /** Human readable reason, useful in the shortcut test bench. */
  reason: string;
}

export interface Payee {
  id: string;
  bankCode: string | null;
  accountSuffix: string;
  displayName: string;
  defaultCategory: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  billingDay: number; // 1-31 (clamped to month length)
  accountId: AccountId;
  isActive: boolean;
  /**
   * false (default): charged to the debit card, so the e.Fingo notification records
   * it — we only reserve the money and label the matching transaction.
   * true: no notification will come, so post it automatically on the due day.
   */
  autoPost: boolean;
  /** YYYY-MM of the last month it was charged (matched or auto-posted). */
  lastChargedMonth: string | null;
}

export interface Settings {
  openingBank: number;
  openingCash: number;
  /** Balances are computed from this point in time. */
  openingAt: string;
  monthlyBudget: number;
  cycleStartDay: number; // 1-28
  safetyFloor: number;
  hourlyWage: number;
  bentoPrice: number;
  ownAccountSuffix: string;
  piggyBankSaved: number;
  resistedImpulseTotal: number;
  /** Date (YYYY-MM-DD, Taipei) of the last evening settlement, to avoid double counting. */
  lastSettledDate: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  openingBank: 0,
  openingCash: 0,
  openingAt: '1970-01-01T00:00:00.000Z',
  monthlyBudget: 15000,
  cycleStartDay: 1,
  safetyFloor: 3000,
  hourlyWage: 200,
  bentoPrice: 120,
  ownAccountSuffix: '83151',
  piggyBankSaved: 0,
  resistedImpulseTotal: 0,
  lastSettledDate: null,
};
