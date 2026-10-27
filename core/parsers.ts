import { taipeiLocalToIso } from './time';
import type { EventSource, ParsedEvent } from './types';

export interface RawInput {
  text?: string | null;
  /** Structured fields, e.g. from the Wallet "Transaction" automation. */
  merchant?: string | null;
  amount?: number | string | null;
}

const FULLWIDTH_DIGITS = /[０-９]/g;

/** Normalise OCR / notification text: full-width digits & symbols, CRLF. */
export function normalizeText(text: string): string {
  return text
    .replace(FULLWIDTH_DIGITS, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[＄]/g, '$')
    .replace(/[，]/g, ',')
    .replace(/[：]/g, ':')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function toNumber(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') return Number.isFinite(s) && s > 0 ? s : null;
  const n = Number(String(s).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const OTP_KEYWORDS = /(驗證碼|認證碼|動態密碼|一次性密碼|OTP|交易密碼|安全碼)/i;
const MONEY_KEYWORDS = /(消費|轉帳|金額|元|\$|入帳|扣款)/;

/**
 * True if the text looks like a one-time password. OTP messages are dropped
 * and never stored. A standalone 6-digit number alone is only treated as OTP
 * when there is no money-related wording (so "轉帳金額 100000" is safe).
 */
export function looksLikeOtp(text: string): boolean {
  if (OTP_KEYWORDS.test(text)) return true;
  const sixDigits = /(?<![\d*])\d{6}(?!\d)/.test(text);
  return sixDigits && !MONEY_KEYWORDS.test(text);
}

const REFUND = /(退款|退貨|退刷|取消交易|沖正)/;

function base(source: EventSource, receivedAt: string): ParsedEvent {
  return {
    kind: 'unknown',
    source,
    amount: null,
    merchant: null,
    location: null,
    occurredAt: receivedAt,
    timeSource: 'notification_received',
    payeeBankCode: null,
    payeeSuffix: null,
    ownSuffix: null,
    reason: '',
  };
}

/**
 * Wallet (Apple Pay) notification, e.g.
 *   玉山銀行 E.SUN BANK
 *   樂家康, 新北市新店區
 *   $81.00
 */
function parseWallet(p: ParsedEvent, text: string, raw: RawInput): ParsedEvent {
  const structuredAmount = toNumber(raw.amount ?? null);
  if (structuredAmount) {
    return {
      ...p,
      kind: 'card_spend',
      amount: structuredAmount,
      merchant: raw.merchant?.trim() || null,
      reason: '錢包交易（結構化欄位）',
    };
  }
  const amountMatch =
    text.match(/(?:NT\$|\$)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? text.match(/([\d,]+(?:\.\d{1,2})?)\s*元/);
  const amount = toNumber(amountMatch?.[1]);
  if (!amount) return { ...p, reason: '錢包通知中找不到金額' };

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/(銀行|BANK)/i.test(l))
    .filter((l) => !amountMatch || !l.includes(amountMatch[0]));
  let merchant: string | null = raw.merchant?.trim() || null;
  let location: string | null = null;
  if (!merchant && lines.length > 0) {
    const [head, ...rest] = lines[0].split(',');
    merchant = head.trim() || null;
    location = rest.join(',').trim() || null;
  }
  return { ...p, kind: 'card_spend', amount, merchant, location, reason: '錢包通知' };
}

/** e.Fingo push, e.g. "簽帳金融卡消費 81元通知". */
function parseEfingo(p: ParsedEvent, text: string): ParsedEvent {
  const spend = text.match(/消費\s*(?:新?台幣|NT\$?)?\s*([\d,]+(?:\.\d{1,2})?)\s*元/);
  if (spend) {
    return { ...p, kind: 'card_spend', amount: toNumber(spend[1]), reason: '玉山金融卡消費通知' };
  }
  const transfer = text.match(/(?:轉帳|轉出)[^\d]{0,12}([\d,]+(?:\.\d{1,2})?)\s*元/);
  if (transfer) {
    return { ...p, kind: 'transfer_out', amount: toNumber(transfer[1]), reason: '玉山轉帳通知' };
  }
  return { ...p, kind: 'ignored', reason: '不是消費或轉帳通知（可能是行銷訊息），已略過' };
}

/**
 * Transfer success page OCR, e.g.
 *   交易成功 / 2026-10-26 02:07:37 / 轉帳金額 100 /
 *   轉入對象 808 玉山商業銀行 ********24126 / 自己帳號 808 玉山商業銀行 ********83151
 * OCR may read the two columns in a different order, so we parse defensively.
 */
function parseTransferPage(p: ParsedEvent, text: string, ownSuffix: string): ParsedEvent {
  if (!/(交易成功|轉帳金額|轉入對象)/.test(text)) {
    return { ...p, reason: '不像玉山轉帳成功畫面' };
  }
  const timeMatch = text.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?/);
  const iso = timeMatch ? taipeiLocalToIso(timeMatch[0]) : null;

  // Account suffixes: "********24126"
  const suffixes = [...text.matchAll(/\*{3,}\s*(\d{3,6})/g)].map((m) => m[1]);
  const bankCodes = [...text.matchAll(/(?<!\d)(\d{3})\s*[^\d\n]{0,8}銀行/g)].map((m) => m[1]);
  let payeeSuffix: string | null = null;
  let ownFound: string | null = null;
  let payeeIdx = -1;
  suffixes.forEach((s, i) => {
    if (s === ownSuffix && !ownFound) ownFound = s;
    else if (!payeeSuffix) {
      payeeSuffix = s;
      payeeIdx = i;
    }
  });

  // Amount: number on the same line as 轉帳金額, else the first plain-number line.
  let amount: number | null = null;
  const sameLine = text.match(/轉帳金額\s*:?\s*(?:NT\$|\$)?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (sameLine) amount = toNumber(sameLine[1]);
  if (!amount) {
    const plain = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /^(?:NT\$|\$)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:元)?$/.test(l) && !/^\d{3}$/.test(l));
    amount = toNumber(plain ?? null);
  }
  if (!amount) return { ...p, reason: '轉帳畫面中找不到金額' };

  return {
    ...p,
    kind: 'transfer_out',
    amount,
    occurredAt: iso ?? p.occurredAt,
    timeSource: iso ? 'absolute' : 'notification_received',
    payeeSuffix,
    payeeBankCode: payeeIdx >= 0 ? bankCodes[payeeIdx] ?? bankCodes[0] ?? null : null,
    ownSuffix: ownFound,
    reason: iso ? '玉山轉帳成功畫面' : '玉山轉帳成功畫面（找不到時間，改用收到時間）',
  };
}

export function parseEvent(
  source: EventSource,
  raw: RawInput,
  receivedAt: string,
  ownSuffix: string,
): ParsedEvent {
  const text = normalizeText(raw.text ?? '');
  const p = base(source, receivedAt);

  if (text && looksLikeOtp(text)) {
    return { ...p, kind: 'otp', reason: '疑似驗證碼，已丟棄且不保存內容' };
  }
  if (text && REFUND.test(text)) {
    return { ...p, reason: '偵測到退款／取消交易，請在 App 內手動處理' };
  }
  switch (source) {
    case 'wallet':
      return parseWallet(p, text, raw);
    case 'efingo':
      return parseEfingo(p, text);
    case 'transfer_page':
      return parseTransferPage(p, text, ownSuffix);
    default:
      return { ...p, reason: '手動來源不經過解析器' };
  }
}

/**
 * Guess the source when a shortcut didn't say. Lets one generic shortcut work.
 */
export function guessSource(text: string): EventSource | null {
  const t = normalizeText(text);
  if (/(交易成功|轉帳金額|轉入對象)/.test(t)) return 'transfer_page';
  if (/簽帳金融卡|e\.?Fingo/i.test(t)) return 'efingo';
  if (/(?:NT\$|\$)\s*[\d,]+/.test(t)) return 'wallet';
  if (/消費\s*[\d,]+\s*元/.test(t)) return 'efingo';
  return null;
}
