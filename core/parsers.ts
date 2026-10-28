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
const MONEY_KEYWORDS = /(消費|轉帳|金額|元|\$|入帳|扣款|付款|交易成功|轉帳成功)/;

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
const MARKETING_KEYWORDS =
  /(回饋|登錄|滿額|抽獎|優惠券|折扣碼|禮券|購物金|刷卡金|活動期間|立即申請|立即登錄|享\s*\d+\s*%|紅利點數|好禮|免費領|限時優惠)/;
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
    reason: '',
  };
}

/**
 * Wallet (Apple Pay) notification or Shortcut Transaction input, e.g.
 *   玉山銀行 E.SUN BANK
 *   樂家康, 新北市新店區
 *   $81.00
 * or plain Shortcut Transaction variables like "7-ELEVEN 65" or "81".
 */
function parseWallet(p: ParsedEvent, text: string, raw: RawInput): ParsedEvent {
  const res: ParsedEvent = { ...p, source: 'wallet' };
  const structuredAmount = toNumber(raw.amount ?? null);
  if (structuredAmount) {
    return {
      ...res,
      kind: 'card_spend',
      amount: structuredAmount,
      merchant: raw.merchant?.trim() || null,
      reason: '錢包交易（結構化欄位）',
    };
  }

  const cleaned = stripShortcutDialogNoise(text);
  const amountMatch =
    cleaned.match(/(?:NT\$|NTD|TWD|新[台臺]幣|[台臺]幣|\$)\s*([\d,]+(?:\.\d{1,2})?)/i) ??
    cleaned.match(/([\d,]+(?:\.\d{1,2})?)\s*元/) ??
    cleaned.match(/(?:消費|付款|扣款|金額)\s*[:：]?\s*([\d,]+(?:\.\d{1,2})?)/);

  let amount = toNumber(amountMatch?.[1]);
  let matchedToken = amountMatch?.[0] ?? null;

  // Fallback for iOS "Transaction (交易)" automation where user passed "商家 金額" or just "金額"
  if (!amount) {
    const tailNum = cleaned.match(/^(?:([^\d\n]+?)\s+)?(\d[\d,]*(?:\.\d{1,2})?)$/);
    if (tailNum) {
      amount = toNumber(tailNum[2]);
      matchedToken = tailNum[2];
      if (!raw.merchant && tailNum[1]) {
        const candidate = tailNum[1].trim();
        if (!/(銀行|BANK)/i.test(candidate)) {
          return {
            ...res,
            kind: 'card_spend',
            amount,
            merchant: candidate,
            reason: '錢包通知',
          };
        }
      }
    }
  }

  if (!amount) return { ...res, reason: '錢包通知中找不到金額' };

  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/(銀行|BANK|Apple\s*Pay|Wallet|錢包)/i.test(l))
    .filter((l) => !matchedToken || !l.includes(matchedToken));
  let merchant: string | null = raw.merchant?.trim() || null;
  let location: string | null = null;
  if (!merchant && lines.length > 0) {
    const [head, ...rest] = lines[0].split(',');
    merchant = head.trim() || null;
    location = rest.join(',').trim() || null;
  }
  return { ...res, kind: 'card_spend', amount, merchant, location, reason: '錢包通知' };
}

/**
 * e.Fingo / Bank push notification, e.g.
 * - "簽帳金融卡消費 81元通知"
 * - "【玉山銀行】您於 10/28 簽帳金融卡消費新臺幣 81 元"
 * - "您的帳戶轉出新臺幣 100 元"
 */
function parseEfingo(p: ParsedEvent, text: string): ParsedEvent {
  const res: ParsedEvent = { ...p, source: 'efingo' };
  const cleaned = stripShortcutDialogNoise(text);

  const transfer =
    cleaned.match(
      /(?:轉帳|轉出|匯款)[^\d\n]{0,24}?(?:新[台臺]幣|[台臺]幣|NT\$?|TWD|NTD|\$)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:元)?/i,
    ) ??
    cleaned.match(
      /(?:轉帳|轉出|匯款)[\s\S]{0,30}?(?:金額)\s*[:：]?\s*(?:新[台臺]幣|[台臺]幣|NT\$?|TWD|NTD|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    );
  if (transfer) {
    const amt = toNumber(transfer[1]);
    if (amt) return { ...res, kind: 'transfer_out', amount: amt, reason: '玉山轉帳通知' };
  }

  const spend =
    cleaned.match(
      /(?:消費|刷卡|簽帳|扣款|付款)[^\d\n]{0,20}?(?:新[台臺]幣|[台臺]幣|NT\$?|TWD|NTD|\$)?\s*([\d,]+(?:\.\d{1,2})?)\s*元/i,
    ) ??
    cleaned.match(
      /(?:消費|刷卡|簽帳|扣款|付款)[^\d\n]{0,20}?(?:新[台臺]幣|[台臺]幣|NT\$|TWD|NTD|\$)\s*([\d,]+(?:\.\d{1,2})?)/i,
    );
  if (spend) {
    const amt = toNumber(spend[1]);
    if (amt) return { ...res, kind: 'card_spend', amount: amt, reason: '玉山金融卡消費通知' };
  }

  return { ...res, kind: 'ignored', reason: '不是消費或轉帳通知（可能是行銷訊息），已略過' };
}

const TRANSFER_PAGE_KEYWORDS =
  /(交易成功|轉帳成功|付款成功|扣款成功|轉出成功|已完成轉帳|轉帳結果|交易結果|轉帳明細|交易明細|轉帳金額|交易金額|付款金額|扣款金額|轉出金額|實付金額|轉入對象|轉入帳號|收款帳號|對方帳號|自己帳號|轉出帳號|扣款帳號)/;

const BANK_NAME_RE =
  /(銀行|商銀|郵政|信用合作社|信合社|農會|漁會|玉山|國泰|中信|中國信託|台新|富邦|第一|華南|兆豐|合庫|合作金庫|彰銀|彰化|土地|臺灣|台灣|中華郵政|永豐|元大|凱基|星展|滙豐|匯豐|渣打|新光|遠東|聯邦|陽信|三信|台中|京城|高雄|瑞興|華泰|板信|王道|將來|樂天|LINE\s*Bank|街口|一卡通|iPASS|全支付|全盈)/i;

/**
 * Transfer / payment success page OCR, e.g.
 *   交易成功 / 2026-10-26 02:07:37 / 轉帳金額 100 /
 *   轉入對象 808 玉山商業銀行 ********24126 / 自己帳號 808 玉山商業銀行 ********83151
 * Also handles iOS Vision two-column OCR where all left labels ("轉帳金額\n轉入對象\n自己帳號")
 * are read before the right column values ("100\n808玉山商業銀行\n********24126"),
 * as well as other Taiwan bank transfer / payment confirmation pages.
 */
function parseTransferPage(p: ParsedEvent, text: string, ownSuffix: string): ParsedEvent {
  const res: ParsedEvent = { ...p, source: 'transfer_page' };
  const cleaned = stripShortcutDialogNoise(text);

  if (!TRANSFER_PAGE_KEYWORDS.test(cleaned)) {
    return { ...res, reason: '不像轉帳或交易成功畫面' };
  }

  const timeMatch = cleaned.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?/);
  const iso = timeMatch ? taipeiLocalToIso(timeMatch[0]) : null;

  // Slice from the transaction header or amount label so iOS status bar numbers
  // (e.g. "10:50", "* 100•", "5G 100") at the top of a screenshot are ignored.
  const headerMatch = cleaned.match(TRANSFER_PAGE_KEYWORDS);
  const bodyText =
    headerMatch && headerMatch.index !== undefined ? cleaned.slice(headerMatch.index) : cleaned;

  // Account suffixes: masked ("********24126", "••••24126") or full 10-16 digit account numbers
  const maskedSuffixes = [...bodyText.matchAll(/[*＊•·●xX\-]{2,}\s*(\d{3,6})/g)].map((m) => m[1]);
  const fullAccountSuffixes =
    maskedSuffixes.length > 0
      ? []
      : [...bodyText.matchAll(/(?<!\d)\d{5,11}(\d{5})(?!\d)/g)].map((m) => m[1]);
  const suffixes = maskedSuffixes.length > 0 ? maskedSuffixes : fullAccountSuffixes;

  const bankCodes = [
    ...bodyText.matchAll(
      /(?<!\d)(\d{3})\s*[^\d\n]{0,10}(?:銀行|商銀|郵政|信合社|玉山|國泰|中信|台新|富邦|永豐|兆豐|第一|華南|合庫|彰銀|郵局|LINE\s*Bank)/gi,
    ),
  ].map((m) => m[1]);
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

  // 1. Direct match on the same line (or immediately next line) after an amount label
  let amount: number | null = null;
  const labelAmount = bodyText.match(
    /(?<!手續費|優惠|折抵)(?:轉帳|交易|付款|扣款|轉出|實付|總|匯款|提款)?金額\s*[:：]?\s*(?:新[台臺]幣|[台臺]幣|NT\$?|TWD|NTD|\$)?\s*([\d,]+(?:\.\d{1,2})?)(?![-/.]\d{1,2}|\s*:\d{2})\s*(?:元)?/i,
  );
  if (labelAmount) {
    amount = toNumber(labelAmount[1]);
  }

  // 2. Explicit currency prefix/suffix in bodyText (excluding fee lines like "手續費 0 元")
  if (!amount) {
    const nonFeeLines = bodyText
      .split('\n')
      .filter((l) => !/(手續費|優惠|減免|折抵|餘額)/.test(l))
      .join('\n');
    const explicitCurrency =
      nonFeeLines.match(/(?:NT\$|NTD|TWD|新[台臺]幣|[台臺]幣|\$)\s*([\d,]+(?:\.\d{1,2})?)/i) ??
      nonFeeLines.match(/([\d,]+(?:\.\d{1,2})?)\s*元/);
    if (explicitCurrency) {
      amount = toNumber(explicitCurrency[1]);
    }
  }

  // 3. Two-column OCR fallback: standalone number line after the header/labels
  //    (including 3-digit amounts like "100" — only skip a 3-digit number if the very
  //    next line is a bank name without its own 3-digit code).
  if (!amount) {
    const lines = bodyText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      // Skip date/time lines, masked accounts, or lines with bank names
      if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}:\d{2}/.test(l)) continue;
      if (/[*＊•·●xX]{2,}/.test(l)) continue;
      if (BANK_NAME_RE.test(l)) continue;

      const m = l.match(/^(?:NT\$|NTD|TWD|\$|新[台臺]幣|[台臺]幣)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:元|TWD|NTD)?$/i);
      if (!m) continue;

      const rawDigits = m[1].replace(/,/g, '');
      // If it's a 3-digit number (e.g. 808) and the very next line is a bank name WITHOUT a 3-digit prefix,
      // then this line is a split bank code; otherwise (like "100" followed by "808玉山商業銀行"), it's the amount!
      if (/^\d{3}$/.test(rawDigits)) {
        const nextLine = lines[i + 1] ?? '';
        if (BANK_NAME_RE.test(nextLine) && !/^\d{3}/.test(nextLine)) {
          continue;
        }
      }

      const candidate = toNumber(m[1]);
      if (candidate !== null) {
        amount = candidate;
        break;
      }
    }
  }

  if (!amount) return { ...res, reason: '轉帳畫面中找不到金額' };

  return {
    ...res,
    kind: 'transfer_out',
    amount,
    occurredAt: iso ?? p.occurredAt,
    timeSource: iso ? 'absolute' : 'notification_received',
    payeeSuffix,
    payeeBankCode: payeeIdx >= 0 ? bankCodes[payeeIdx] ?? bankCodes[0] ?? null : bankCodes[0] ?? null,
    ownSuffix: ownFound,
    reason: iso ? '玉山轉帳成功畫面' : '轉帳成功畫面（以收到時間入帳）',
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
  if (source === 'manual') {
    return { ...p, reason: '手動來源不經過解析器' };
  }

  // Structured input from Wallet Transaction automation always wins immediately
  if (toNumber(raw.amount ?? null)) {
    return parseWallet(p, text, raw);
  }

  if (!text) {
    return {
      ...p,
      kind: 'ignored',
      reason: '未收到文字內容（請確認捷徑「通知或畫面文字」已選取變數）',
    };
  }

  if (MARKETING_KEYWORDS.test(text) && !REAL_TX_MARKERS.test(text)) {
    return {
      ...p,
      kind: 'ignored',
      reason: '偵測到行銷或回饋活動訊息，已自動略過',
    };
  }

  // Self-healing parser pipeline: try the primary parser for `source` first,
  // and if it fails to extract an amount, automatically try the other parsers
  // so Apple Pay, Bank Notifications, and Transfer Screenshots never fail even
  // if the user selected a different `source` option in iOS Shortcuts.
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

  // Determine the smartest try order based on actual content + source hint
  const detected = guessSource(text);
  const order: EventSource[] = [];
  const pushUnique = (s: EventSource | null) => {
    if (s && s !== 'manual' && !order.includes(s)) order.push(s);
  };

  // If the text clearly has transfer-table markers (轉入對象 / 自己帳號 / ****), prioritize transfer_page;
  // if it clearly has 簽帳金融卡, prioritize efingo; otherwise respect source then detected.
  if (/(轉入對象|轉入帳號|收款帳號|自己帳號|[*＊•·●]{3,}\s*\d{3,6})/.test(text)) {
    pushUnique('transfer_page');
  } else if (/簽帳金融卡|金融卡消費|信用卡消費|e\.?Fingo/i.test(text)) {
    pushUnique('efingo');
  }
  pushUnique(source);
  pushUnique(detected);
  pushUnique('efingo');
  pushUnique('wallet');
  pushUnique('transfer_page');

  let firstResult: ParsedEvent | null = null;
  for (const candidateSource of order) {
    const res = runParser(candidateSource);
    if (!firstResult) firstResult = res;
    if (res.amount !== null && res.kind !== 'unknown' && res.kind !== 'ignored') {
      return res;
    }
  }

  // Diagnostic hint if iOS Shortcut "Transaction (交易)" sent only the card name (e.g. "玉山銀行")
  if (/^(玉山銀行|玉山商業銀行|E\.?SUN\s*BANK)$/i.test(text.trim())) {
    return {
      ...p,
      kind: 'ignored',
      reason: '只收到卡片名稱「玉山銀行」，請在捷徑點選「捷徑輸入」並將屬性改為「金額」與「商家」',
    };
  }

  return firstResult ?? { ...p, reason: '無法辨識通知或畫面金額' };
}

/**
 * Guess the source when a shortcut didn't say. Lets one generic shortcut work.
 */
export function guessSource(text: string): EventSource | null {
  const t = normalizeText(text);
  if (/(轉入對象|轉入帳號|收款帳號|自己帳號|轉出帳號)/.test(t)) return 'transfer_page';
  if (/簽帳金融卡|金融卡消費|e\.?Fingo/i.test(t)) return 'efingo';
  if (/(交易成功|轉帳成功|轉帳金額|付款成功|轉帳結果|交易明細)/.test(t)) return 'transfer_page';
  if (/(?:NT\$|\$)\s*[\d,]+/.test(t)) return 'wallet';
  if (/(?:消費|刷卡|扣款|轉帳|轉出)\s*(?:新[台臺]幣|[台臺]幣|NT\$?)?\s*[\d,]+\s*元/.test(t)) return 'efingo';
  return null;
}
