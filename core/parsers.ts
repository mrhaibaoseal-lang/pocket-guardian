import { taipeiLocalToIso } from './time';
import type { EventSource, ParsedEvent } from './types';

export interface RawInput {
  text?: string | null;
  /** Structured fields, e.g. from the iOS 27 Wallet ("錢包") automation. */
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

/**
 * Mask long bank account numbers (9-16 digits) in raw text before saving to the
 * event inbox, keeping only the last 5 digits (e.g. "0123456724126" -> "****24126").
 */
export function maskSensitiveText(text: string): string {
  return text.replace(/\b\d{4,11}(\d{5})\b/g, '****$1');
}

/** Detect non-TWD foreign currency tokens (e.g. US$10.00, ¥1,000, EUR 20). */
const FOREIGN_CURRENCY_RE =
  /(?:US\$|USD|HK\$|HKD|JP¥|JPY|¥|￥|EUR|€|GBP|£|KRW|₩|AUD|A\$|CAD|C\$|SGD|S\$|CHF|CNY|RMB)\s*\d[\d,]*(?:\.\d{1,2})?/i;

export function detectForeignCurrency(input: string | number | null | undefined): string | null {
  if (input === null || input === undefined || typeof input === 'number') return null;
  const norm = normalizeText(String(input));
  const m = norm.match(FOREIGN_CURRENCY_RE);
  return m ? m[0].trim() : null;
}

/** Convert a numeric or standalone TWD string to an integer amount in TWD, avoiding float drift or multi-line OCR digit concatenation. */
function toNumber(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') {
    const rounded = Math.round(s);
    return Number.isFinite(rounded) && rounded > 0 && rounded <= 10_000_000 ? rounded : null;
  }
  const str = normalizeText(String(s)).trim();
  if (!str || str.includes('\n')) return null;
  if (detectForeignCurrency(str)) return null;
  // Match only a standalone amount / TWD currency token, never clock times (10:29) or full sentences
  const m = str.match(
    /^(?:NT\$|NTD|TWD|新[台臺]幣|[台臺]幣|\$)?\s*(\d{1,3}(?:,\d{3})+|\d{1,7})(?:\.\d{1,2})?\s*(?:元|TWD|NTD)?$/i,
  );
  if (!m) return null;
  const n = Math.round(Number(m[1].replace(/,/g, '')));
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? n : null;
}

/**
 * True when a string passed into `merchant` is actually full OCR text, a bank notification,
 * or a combined "商家 數量" block rather than a bare store name.
 */
function looksLikeFullTextPayload(s: string): boolean {
  if (!s) return false;
  if (s.includes('\n') || s.length > 24) return true;
  if (
    /(交易成功|轉帳|消費|扣款|付款|通知|擷取|螢幕|快照|智慧入帳|Cloudflare|Webhook|執行時顯示|搜尋|自己帳號|轉入對象|玉山|星期[一二三四五六日天]|上午|下午|晚上|凌晨|\d{1,2}:\d{2})/i.test(
      s,
    )
  ) {
    return true;
  }
  if (/^(.+?)\s+(?:NT\$|NTD|TWD|新[台臺]幣|[台臺]幣|\$)?\s*(\d{1,3}(?:,\d{3})+|\d{1,7})(?:\.\d{1,2})?\s*元?$/i.test(s)) {
    return true;
  }
  return false;
}

/**
 * Normalise Shortcut inputs so that even if the user passes `螢幕上的文字`, `已擷取的文字`,
 * `通知`, or `文字 (商家 數量)` into `amount` and/or `merchant` while leaving `text` empty,
 * the parser routes the full text accurately without concatenating OCR digits.
 */
export function normalizeRawInput(raw: RawInput): RawInput {
  const t = normalizeText(raw.text ?? '');
  const amtStr =
    raw.amount !== null && raw.amount !== undefined ? normalizeText(String(raw.amount)) : '';
  const merchStr = normalizeText(raw.merchant ?? '');

  if (!t) {
    // 1. User selected the exact same variable (e.g. 已擷取的文字 / 通知 / 文字) in both amount & merchant
    if (amtStr && merchStr && amtStr === merchStr) {
      return { text: amtStr, amount: null, merchant: null };
    }
    // 2. User passed full text / "商家 數量" into `amount` (not a standalone number)
    if (amtStr && toNumber(raw.amount) === null && !detectForeignCurrency(amtStr)) {
      const keepMerchant =
        merchStr && merchStr !== amtStr && !looksLikeFullTextPayload(merchStr) ? merchStr : null;
      return { text: amtStr, amount: null, merchant: keepMerchant };
    }
    // 3. User passed full OCR / notification / "商家 數量" into `merchant` while `amount` is empty
    if (!amtStr && merchStr && looksLikeFullTextPayload(merchStr)) {
      return { text: merchStr, amount: null, merchant: null };
    }
  }

  return {
    text: t || null,
    amount: raw.amount ?? null,
    merchant: merchStr || null,
  };
}

const OTP_KEYWORDS = /(驗證碼|認證碼|動態密碼|一次性密碼|OTP|交易密碼|安全碼)/i;
const MONEY_KEYWORDS = /(消費|轉帳|金額|元|\$|入帳|扣款|付款|交易成功|轉帳成功)/;

/**
 * True if the text looks like a one-time password. OTP messages are dropped
 * and never stored. Uses standard non-lookbehind regex for Hermes compatibility.
 */
export function looksLikeOtp(text: string): boolean {
  if (OTP_KEYWORDS.test(text)) return true;
  const sixDigits = /(?:^|[^\d*])\d{6}(?!\d)/.test(text);
  return sixDigits && !MONEY_KEYWORDS.test(text);
}

const REFUND = /(退款|退貨|退刷|取消交易|沖正)/;

/**
 * Promotional campaign patterns: matches conditional promos ("滿 1,000 送 100")
 * or registration/lottery ads ("立即登錄", "抽獎"), without blocking real
 * spend notifications that happen to mention cashback ("消費 NT$320，享 1% 回饋").
 */
const PROMO_CAMPAIGN_RE =
  /(?:滿\s*[\d,]+\s*(?:元)?\s*(?:送|贈|享|折)|立即登錄|活動登錄|登錄活動|抽獎|優惠券|折扣碼|禮券|購物金|刷卡金|活動期間|立即申請|紅利點數|免費領|限時優惠)/;

const REAL_TX_MARKERS =
  /(簽帳金融卡消費|金融卡消費|信用卡消費|消費通知|扣款通知|轉帳通知|交易成功|轉帳成功|轉帳金額|轉入對象|轉入帳號|自己帳號)/;

/** Strip previous shortcut dialog banners if the user took a screenshot while an alert was on screen. */
function stripShortcutDialogNoise(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/(未入帳\s*:|已記\s+|已合併\s+|已略過重複|轉帳畫面中找不到金額|錢包通知中找不到金額)/.test(l))
    .join('\n');
}

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
    confidence: 'high',
    evidence: null,
    reason: '',
  };
}

function isInvalidMerchantCandidate(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 28) return true;
  if (/(銀行|BANK|Apple\s*Pay|Wallet|錢包|智慧入帳|擷取|螢幕|快照|通知|Cloudflare|Webhook|執行時顯示|搜尋)/i.test(t)) {
    return true;
  }
  if (/(?:^|\s)(?:星期[一二三四五六日天]|週[一二三四五六日天]|上午|下午|晚上|凌晨|充電中)(?:\s|$)/.test(t)) {
    return true;
  }
  if (/\d{1,2}:\d{2}/.test(t) || /^\d+$/.test(t)) return true;
  return false;
}

/**
 * Wallet (Apple Pay / iOS 27 "錢包" automation) notification or Shortcut input.
 * Supports:
 * 1. Structured fields (`amount` + `merchant`)
 * 2. Combined "文字" block containing `商家 數量` on 1 or 2 lines (e.g. "7-ELEVEN 85", "全家 NT$85")
 * 3. Currency-prefixed lines ($81.00 / NT$81)
 */
function parseWallet(p: ParsedEvent, text: string, raw: RawInput): ParsedEvent {
  const res: ParsedEvent = { ...p, source: 'wallet' };

  const foreignToken = detectForeignCurrency(raw.amount ?? null) ?? detectForeignCurrency(text);
  if (foreignToken) {
    return {
      ...res,
      kind: 'unknown',
      merchant: raw.merchant?.trim() ? raw.merchant.trim().slice(0, 24) : null,
      confidence: 'low',
      evidence: foreignToken,
      reason: `偵測到外幣交易（${foreignToken}），請於收件匣確認折合台幣金額後補記`,
    };
  }

  const structuredAmount = toNumber(raw.amount ?? null);
  if (structuredAmount) {
    const cleanMerch =
      raw.merchant?.trim() && !isInvalidMerchantCandidate(raw.merchant)
        ? raw.merchant.trim()
        : null;
    return {
      ...res,
      kind: 'card_spend',
      amount: structuredAmount,
      merchant: cleanMerch,
      confidence: 'high',
      evidence: String(raw.amount),
      reason: '錢包交易（結構化欄位）',
    };
  }

  if (raw.merchant?.trim() && !text.trim()) {
    const mTrim = raw.merchant.trim();
    if (/^(影像|圖片|照片|螢幕快照|Image|Photo|Screenshot)$/i.test(mTrim)) {
      return {
        ...res,
        kind: 'unknown',
        merchant: null,
        confidence: 'low',
        reason: '收到「影像」而非文字，請在捷徑變數選取「已擷取的文字」',
      };
    }
    const shortMerchant = mTrim.replace(/\s+/g, ' ').slice(0, 18);
    return {
      ...res,
      kind: 'unknown',
      merchant: shortMerchant,
      confidence: 'low',
      reason: `錢包自動化僅收到商家「${shortMerchant}」但缺少金額，已存入收件匣待補記`,
    };
  }

  const cleaned = stripShortcutDialogNoise(text);

  // 1. Single-line "商家 數量" from iOS 27 Wallet "文字 (商家 數量)" block (supports store names with digits like 7-ELEVEN, 85度C)
  const singleLineWallet = cleaned.match(
    /^([^\n]+?)\s+(?:NT\$|NTD|TWD|新[台臺]幣|[台臺]幣|\$)?\s*(\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.\d{1,2})?\s*(?:元|TWD|NTD)?$/i,
  );
  if (singleLineWallet) {
    const candidateMerchant = singleLineWallet[1].trim();
    const candidateAmount = toNumber(singleLineWallet[2]);
    if (candidateAmount && !isInvalidMerchantCandidate(candidateMerchant)) {
      return {
        ...res,
        kind: 'card_spend',
        amount: candidateAmount,
        merchant: raw.merchant?.trim() || candidateMerchant,
        confidence: 'high',
        evidence: singleLineWallet[0],
        reason: '錢包交易（商家＋數量）',
      };
    }
  }

  // 2. Two-line "商家\n數量" from iOS 27 Wallet "文字" block
  const rawLines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (rawLines.length === 2) {
    const line1Merchant = rawLines[0];
    const line2Amount = toNumber(rawLines[1]);
    if (line2Amount && !isInvalidMerchantCandidate(line1Merchant)) {
      return {
        ...res,
        kind: 'card_spend',
        amount: line2Amount,
        merchant: raw.merchant?.trim() || line1Merchant,
        confidence: 'high',
        evidence: rawLines[1],
        reason: '錢包交易（商家＋數量）',
      };
    }
  }

  const amountMatch =
    cleaned.match(/(?:NT\$|NTD|TWD|新[台臺]幣|[台臺]幣|\$)\s*(\d{1,3}(?:,\d{3})+|\d{1,7})(?:\.\d{1,2})?/i) ??
    cleaned.match(/(?:消費|付款|扣款|金額)\s*[:：]?\s*(?:NT\$|\$)\s*(\d{1,3}(?:,\d{3})+|\d{1,7})(?:\.\d{1,2})?/i);

  const amount = toNumber(amountMatch?.[1]);
  const matchedToken = amountMatch?.[0] ?? null;

  if (!amount) return { ...res, confidence: 'low', reason: '畫面中未偵測到交易或轉帳金額' };

  const lines = rawLines
    .filter((l) => !/(銀行|BANK|Apple\s*Pay|Wallet|錢包)/i.test(l))
    .map((l) => (matchedToken && l.includes(matchedToken) ? l.replace(matchedToken, '').trim() : l))
    .filter(Boolean);
  let merchant: string | null = raw.merchant?.trim() || null;
  let location: string | null = null;
  if (!merchant && lines.length > 0) {
    const [head, ...rest] = lines[0].split(',');
    const candidate = head.trim();
    if (candidate && !isInvalidMerchantCandidate(candidate)) {
      merchant = candidate;
      location = rest.join(',').trim() || null;
    }
  }
  return {
    ...res,
    kind: 'card_spend',
    amount,
    merchant,
    location,
    confidence: 'high',
    evidence: matchedToken,
    reason: '錢包通知',
  };
}

/**
 * e.Fingo / Bank push notification, e.g.
 * - "簽帳金融卡消費 81元通知"
 * - "【玉山銀行】您於 10/28 簽帳金融卡消費新臺幣 81 元"
 * - "消費 NT$320，享 1% 回饋"
 */
function parseEfingo(p: ParsedEvent, text: string): ParsedEvent {
  const res: ParsedEvent = { ...p, source: 'efingo' };
  const cleaned = stripShortcutDialogNoise(text);

  const foreignToken = detectForeignCurrency(cleaned);
  if (foreignToken) {
    return {
      ...res,
      kind: 'unknown',
      confidence: 'low',
      evidence: foreignToken,
      reason: `偵測到外幣交易（${foreignToken}），請於收件匣確認折合台幣金額後補記`,
    };
  }

  if (PROMO_CAMPAIGN_RE.test(cleaned) && !REAL_TX_MARKERS.test(cleaned)) {
    return {
      ...res,
      kind: 'ignored',
      confidence: 'high',
      reason: '偵測到行銷或回饋活動訊息，已自動略過',
    };
  }

  const transfer =
    cleaned.match(
      /(?:轉帳|轉出|匯款)[^\d\n]{0,24}?(?:新[台臺]幣|[台臺]幣|NT\$?|TWD|NTD|\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*(?:元)?/i,
    ) ??
    cleaned.match(
      /(?:轉帳|轉出|匯款)[\s\S]{0,30}?(?:金額)\s*[:：]?\s*(?:新[台臺]幣|[台臺]幣|NT\$?|TWD|NTD|\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/i,
    );
  if (transfer) {
    const amt = toNumber(transfer[1]);
    const suffix = cleaned.match(/(?:末[五四]碼|帳號)\s*[:：*]*\s*(\d{4,5})/)?.[1] ?? null;
    if (amt) {
      return {
        ...res,
        kind: 'transfer_out',
        amount: amt,
        payeeSuffix: suffix,
        confidence: 'high',
        evidence: transfer[0],
        reason: '玉山轉帳通知',
      };
    }
  }

  const spend =
    cleaned.match(
      /(?:消費|刷卡|簽帳|扣款|付款)[^\d\n]{0,20}?(?:新[台臺]幣|[台臺]幣|NT\$?|TWD|NTD|\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*元/i,
    ) ??
    cleaned.match(
      /(?:消費|刷卡|簽帳|扣款|付款)[^\d\n]{0,20}?(?:新[台臺]幣|[台臺]幣|NT\$|TWD|NTD|\$)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/i,
    );
  if (spend) {
    const amt = toNumber(spend[1]);
    if (amt) {
      return {
        ...res,
        kind: 'card_spend',
        amount: amt,
        confidence: 'high',
        evidence: spend[0],
        reason: '玉山金融卡消費通知',
      };
    }
  }

  return { ...res, kind: 'ignored', confidence: 'low', reason: '不是消費或轉帳通知（可能是行銷訊息），已略過' };
}

const TRANSFER_PAGE_KEYWORDS =
  /(交易成功|轉帳成功|交易完成|轉帳完成|付款成功|扣款成功|轉出成功|已完成轉帳|轉帳結果|交易結果|轉帳明細|交易明細|轉帳金額|交易金額|付款金額|扣款金額|轉出金額|實付金額|轉入對象|轉入帳號|收款帳號|對方帳號|自己帳號|轉出帳號|扣款帳號)/;

const TRANSFER_HEADER_ANCHOR =
  /(交易成功|轉帳成功|交易完成|轉帳完成|付款成功|扣款成功|轉出成功|已完成轉帳|轉帳結果|交易結果|轉帳明細|交易明細)/;

const TRANSFER_FIELD_ANCHOR =
  /(轉帳金額|交易金額|付款金額|扣款金額|轉出金額|實付金額|匯款金額|提款金額|總金額|轉入對象|轉入帳號|收款帳號|對方帳號|自己帳號|轉出帳號|扣款帳號)/;

function isBankCodeOrNameLine(line: string): boolean {
  const t = line.trim();
  if (
    /^\d{3}[ \t]*[\u4e00-\u9fa5A-Za-z]{2,}/.test(t) &&
    !/^\d{3}[ \t]*(?:轉帳|交易|轉入|自己|收款|扣款|手續費|金額|元)/.test(t)
  ) {
    return true;
  }
  if (/(?:銀行|商銀|郵政|中華郵政|郵局|信用合作社|信合社|農會|漁會|BANK|LINE\s*Bank|街口|一卡通|iPASS|全支付|全盈)/i.test(t)) {
    return true;
  }
  return false;
}

function isDateOrTimeLine(line: string): boolean {
  const t = line.trim();
  if (taipeiLocalToIso(t) !== null) return true;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(t)) return true;
  if (/(?:20\d{2}|1\d{2})\s*(?:[-/.]|年)\s*\d{1,2}\s*(?:[-/.]|月)\s*\d{1,2}/.test(t)) return true;
  if (/^\d{1,2}\s*(?:[/]|月)\s*\d{1,2}\s*日?(?:\s+\d{1,2}:\d{2})?$/.test(t)) return true;
  return false;
}

function isMaskedAccountLine(line: string): boolean {
  return /[*＊•·●xX\-]{2,}\s*\d{3,6}/.test(line) || /\b\d{9,16}\b/.test(line);
}

function isFeeOrOtherLabelLine(line: string): boolean {
  return /^(?:手續費|交易手續費|跨行手續費|優惠|手續費優惠|減免|折抵|點數折抵|可用餘額|帳戶餘額|餘額|交易序號|序號|備註|交易備註|留言)\b/.test(
    line.trim(),
  );
}

function isAmountLabelOnly(line: string): boolean {
  return /^(?:轉帳|交易|付款|扣款|轉出|實付|總|匯款|提款)?金額\s*[:：]?$/.test(line.trim());
}

function parseStandaloneAmountLine(line: string, nextLine?: string): number | null {
  const l = line.trim();
  if (!l) return null;
  if (isDateOrTimeLine(l) || isMaskedAccountLine(l) || isBankCodeOrNameLine(l) || isFeeOrOtherLabelLine(l)) {
    return null;
  }
  const m = l.match(/^(?:NT\$|NTD|TWD|\$|新[台臺]幣|[台臺]幣)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*(?:元|TWD|NTD)?$/i);
  if (!m) return null;
  const rawDigits = m[1].replace(/,/g, '');
  if (/^\d{3}$/.test(rawDigits) && nextLine && isBankCodeOrNameLine(nextLine) && !/^\d{3}/.test(nextLine.trim())) {
    return null;
  }
  return toNumber(m[1]);
}

function parseOwnSuffixList(ownSuffix: string): string[] {
  return ownSuffix
    .split(/[,，\s/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTransferPage(p: ParsedEvent, text: string, ownSuffix: string): ParsedEvent {
  const res: ParsedEvent = { ...p, source: 'transfer_page' };
  const cleaned = stripShortcutDialogNoise(text);

  if (!TRANSFER_PAGE_KEYWORDS.test(cleaned)) {
    return { ...res, confidence: 'low', reason: '不像轉帳或交易成功畫面' };
  }

  const headerMatch = cleaned.match(TRANSFER_HEADER_ANCHOR) ?? cleaned.match(TRANSFER_FIELD_ANCHOR);
  const bodyText =
    headerMatch && headerMatch.index !== undefined ? cleaned.slice(headerMatch.index) : cleaned;

  const iso = taipeiLocalToIso(bodyText, p.occurredAt) ?? taipeiLocalToIso(cleaned, p.occurredAt);

  const maskedSuffixes = [...bodyText.matchAll(/[*＊•·●xX\-]{2,}\s*(\d{3,6})/g)].map((m) => m[1]);
  const fullAccountSuffixes =
    maskedSuffixes.length > 0
      ? []
      : [...bodyText.matchAll(/(?:^|[^\d])\d{4,11}(\d{5})(?!\d)/g)].map((m) => m[1]);
  const suffixes = maskedSuffixes.length > 0 ? maskedSuffixes : fullAccountSuffixes;

  const bankCodes = [
    ...bodyText.matchAll(
      /(?:^|[^\d])(\d{3})[ \t]*(?!(?:元|轉帳|交易|轉入|自己|收款|扣款|手續費))[\u4e00-\u9fa5A-Za-z]{2,}/g,
    ),
  ].map((m) => m[1]);

  const ownSuffixes = parseOwnSuffixList(ownSuffix);
  const explicitTargetMatch = bodyText.match(
    /(?:轉入對象|轉入帳號|收款帳號|對方帳號)[^\n]*?(?:[*＊•·●xX\-]{2,}\s*(\d{3,6})|\b\d{4,11}(\d{5})\b)/,
  );
  const explicitTargetSuffix = explicitTargetMatch?.[1] ?? explicitTargetMatch?.[2] ?? null;

  let payeeSuffix: string | null = null;
  let ownFound: string | null = null;
  let payeeIdx = -1;
  suffixes.forEach((s, i) => {
    if (ownSuffixes.includes(s) && !ownFound && s !== explicitTargetSuffix) {
      ownFound = s;
    } else if (!payeeSuffix) {
      payeeSuffix = s;
      payeeIdx = i;
    }
  });
  if (explicitTargetSuffix) {
    payeeSuffix = explicitTargetSuffix;
  }

  const isSelfTransfer =
    (explicitTargetSuffix !== null && ownSuffixes.includes(explicitTargetSuffix)) ||
    (suffixes.length > 0 && suffixes.every((s) => ownSuffixes.includes(s)));

  const lines = bodyText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let amount: number | null = null;
  let evidence: string | null = null;

  for (const line of lines) {
    if (isFeeOrOtherLabelLine(line)) continue;
    const sameLineMatch = line.match(
      /^(?:轉帳|交易|付款|扣款|轉出|實付|總|匯款|提款)?金額\s*[:：]?\s*(.+)$/i,
    );
    if (sameLineMatch) {
      const rhs = sameLineMatch[1].trim();
      const val = parseStandaloneAmountLine(rhs);
      if (val !== null) {
        amount = val;
        evidence = line;
        break;
      }
    }
  }

  if (!amount) {
    const amtLabelIdx = lines.findIndex(isAmountLabelOnly);
    if (amtLabelIdx >= 0) {
      let unconsumedNumericLabelsBefore = 0;
      for (let i = 0; i < amtLabelIdx; i++) {
        if (/^(?:手續費|交易手續費|跨行手續費|優惠|減免|折抵)\s*[:：]?$/.test(lines[i])) {
          unconsumedNumericLabelsBefore++;
        } else if (parseStandaloneAmountLine(lines[i], lines[i + 1]) !== null && unconsumedNumericLabelsBefore > 0) {
          unconsumedNumericLabelsBefore--;
        }
      }
      const candidatesAfterLabel: Array<{ val: number; raw: string }> = [];
      for (let i = amtLabelIdx + 1; i < lines.length; i++) {
        const val = parseStandaloneAmountLine(lines[i], lines[i + 1]);
        if (val !== null) {
          candidatesAfterLabel.push({ val, raw: lines[i] });
        }
      }
      const picked = candidatesAfterLabel[unconsumedNumericLabelsBefore] ?? candidatesAfterLabel[0];
      if (picked) {
        amount = picked.val;
        evidence = picked.raw;
      }
    }
  }

  if (!amount) {
    for (let i = 0; i < lines.length; i++) {
      if (isFeeOrOtherLabelLine(lines[i])) continue;
      const val = parseStandaloneAmountLine(lines[i], lines[i + 1]);
      if (val !== null) {
        amount = val;
        evidence = lines[i];
        break;
      }
    }
  }

  if (isSelfTransfer) {
    return {
      ...res,
      kind: 'ignored',
      amount,
      occurredAt: iso ?? p.occurredAt,
      timeSource: iso ? 'absolute' : 'notification_received',
      payeeSuffix: payeeSuffix ?? suffixes[0] ?? null,
      payeeBankCode: bankCodes[0] ?? null,
      ownSuffix: ownFound ?? ownSuffixes[0] ?? null,
      confidence: 'high',
      evidence,
      reason: '轉入自己帳戶（內部移轉，不計入支出）',
    };
  }

  if (!amount) return { ...res, confidence: 'low', reason: '轉帳畫面中找不到金額' };

  return {
    ...res,
    kind: 'transfer_out',
    amount,
    occurredAt: iso ?? p.occurredAt,
    timeSource: iso ? 'absolute' : 'notification_received',
    payeeSuffix,
    payeeBankCode: payeeIdx >= 0 ? bankCodes[payeeIdx] ?? bankCodes[0] ?? null : bankCodes[0] ?? null,
    ownSuffix: ownFound,
    confidence: 'high',
    evidence,
    reason: iso ? '玉山轉帳成功畫面' : '轉帳成功畫面（以收到時間入帳）',
  };
}

export function parseEvent(
  source: EventSource,
  rawInput: RawInput,
  receivedAt: string,
  ownSuffix: string,
): ParsedEvent {
  const p = base(source, receivedAt);
  try {
    const raw = normalizeRawInput(rawInput);
    const text = normalizeText(raw.text ?? '');

    if (/^(影像|圖片|照片|螢幕快照|Image|Photo|Screenshot)$/i.test(text.trim())) {
      return {
        ...p,
        kind: 'unknown',
        confidence: 'low',
        reason: '收到「影像」而非文字，請在捷徑變數選取「已擷取的文字」',
      };
    }

    if (text && looksLikeOtp(text)) {
      return { ...p, kind: 'otp', reason: '疑似驗證碼，已丟棄且不保存內容' };
    }
    if (text && REFUND.test(text)) {
      return { ...p, reason: '偵測到退款／取消交易，請在 App 內手動處理' };
    }
    if (source === 'manual') {
      return { ...p, reason: '手動來源不經過解析器' };
    }

    const foreignInRaw = detectForeignCurrency(raw.amount ?? null);
    if (foreignInRaw) {
      return parseWallet(p, text, raw);
    }

    if (toNumber(raw.amount ?? null)) {
      return parseWallet(p, text, raw);
    }

    if (raw.merchant?.trim() && !text) {
      return parseWallet(p, text, raw);
    }

    if (!text) {
      return {
        ...p,
        kind: 'ignored',
        confidence: 'low',
        reason: '未收到文字內容（轉帳截圖請用「拍攝螢幕快照 → 從影像擷取文字」）',
      };
    }

    if (PROMO_CAMPAIGN_RE.test(text) && !REAL_TX_MARKERS.test(text)) {
      return {
        ...p,
        kind: 'ignored',
        confidence: 'high',
        reason: '偵測到行銷或回饋活動訊息，已自動略過',
      };
    }

    const foreignInText = detectForeignCurrency(text);
    if (foreignInText) {
      return {
        ...p,
        kind: 'unknown',
        confidence: 'low',
        evidence: foreignInText,
        reason: `偵測到外幣交易（${foreignInText}），請於收件匣確認折合台幣金額後補記`,
      };
    }

    const runParser = (s: EventSource): ParsedEvent => {
      switch (s) {
        case 'wallet':
          return parseWallet(p, text, raw);
        case 'efingo':
          return parseEfingo(p, text);
        case 'transfer_page':
          return parseTransferPage(p, text, ownSuffix);
        default:
          return { ...p, reason: '手動來源不經過解析器' };
      }
    };

    if (/(轉入對象|轉入帳號|收款帳號|自己帳號|轉出帳號|[*＊•·●]{3,}\s*\d{3,6})/.test(text)) {
      const res = runParser('transfer_page');
      if (res.kind === 'ignored' || res.amount !== null) return res;
    }

    if (/簽帳金融卡|金融卡消費|信用卡消費|e\.?Fingo/i.test(text)) {
      const res = runParser('efingo');
      if (res.kind === 'ignored' || res.amount !== null) return res;
    }

    const detected = guessSource(text);
    const primary = detected ?? source;
    const primaryRes = runParser(primary);
    if (primaryRes.amount !== null && primaryRes.kind !== 'unknown' && primaryRes.kind !== 'ignored') {
      return primaryRes;
    }
    if (primary === 'efingo' && primaryRes.kind === 'ignored' && detected === 'efingo' && !/(?:NT\$|\$)\s*\d/.test(text)) {
      return primaryRes;
    }

    const fallbackOrder: EventSource[] = ['transfer_page', 'efingo', 'wallet'];
    for (const candidateSource of fallbackOrder) {
      if (candidateSource === primary) continue;
      const res = runParser(candidateSource);
      if (res.amount !== null && res.kind !== 'unknown' && res.kind !== 'ignored') {
        return { ...res, confidence: candidateSource === detected ? 'high' : 'low' };
      }
    }

    if (/^(玉山銀行|玉山商業銀行|E\.?SUN\s*BANK)$/i.test(text.trim())) {
      return {
        ...p,
        kind: 'ignored',
        confidence: 'low',
        reason: '只收到卡片名稱「玉山銀行」，請加入「文字 (商家 數量)」模塊後傳入智慧入帳',
      };
    }

    // If it was a multi-line screenshot or unrecognized screen, return a concise 1-line reason
    if (text.includes('\n') || source === 'transfer_page') {
      return {
        ...p,
        kind: 'unknown',
        confidence: 'low',
        reason: '畫面中未偵測到交易或轉帳金額',
      };
    }

    return primaryRes ?? { ...p, confidence: 'low', reason: '畫面中未偵測到交易或轉帳金額' };
  } catch (err) {
    return {
      ...p,
      kind: 'unknown',
      confidence: 'low',
      reason: `解析器發生例外（已安全攔截並存入收件匣）：${err instanceof Error ? err.message : '未知錯誤'}`,
    };
  }
}

/**
 * Guess the source when a shortcut didn't say. Lets one generic shortcut work.
 */
export function guessSource(text: string): EventSource | null {
  const t = normalizeText(text);
  if (/(轉入對象|轉入帳號|收款帳號|自己帳號|轉出帳號)/.test(t)) return 'transfer_page';
  if (/簽帳金融卡|金融卡消費|e\.?Fingo/i.test(t)) return 'efingo';
  if (/(交易成功|轉帳成功|轉帳金額|付款成功|轉帳結果|交易明細)/.test(t)) return 'transfer_page';
  if (/(?:消費|刷卡|扣款|轉帳|轉出)\s*(?:新[台臺]幣|[台臺]幣|NT\$?)?\s*[\d,]+\s*元/.test(t)) return 'efingo';
  if (/(?:NT\$|\$)\s*[\d,]+/.test(t)) return 'wallet';
  const walletSingle = t.match(
    /^([^\n]+?)\s+(?:NT\$|NTD|TWD|新[台臺]幣|[台臺]幣|\$)?\s*(\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.\d{1,2})?\s*(?:元|TWD|NTD)?$/i,
  );
  if (walletSingle && !isInvalidMerchantCandidate(walletSingle[1]) && toNumber(walletSingle[2]) !== null) {
    return 'wallet';
  }
  return null;
}
