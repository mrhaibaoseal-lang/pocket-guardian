import type { Transaction } from '../../../core';
import type { Palette } from '../../theme';
import type { IconName } from './Icon';

export interface TxVisual {
  icon: IconName;
  color: string;
}

/** Category → icon + system color. One mapping used by every list in the app. */
export function categoryVisual(category: string | null | undefined, c: Palette): TxVisual {
  const cat = category ?? '';
  if (/超商|便利/.test(cat)) return { icon: 'store', color: c.blue };
  if (/食物|早餐|午餐|晚餐|便當|餐/.test(cat)) return { icon: 'food', color: c.warning };
  if (/飲料|咖啡/.test(cat)) return { icon: 'drink', color: c.brown };
  if (/車費|交通|捷運|公車|油/.test(cat)) return { icon: 'transport', color: c.teal };
  if (/日用品|購物/.test(cat)) return { icon: 'basket', color: c.purple };
  if (/娛樂/.test(cat)) return { icon: 'fun', color: c.pink };
  if (/手續費/.test(cat)) return { icon: 'fee', color: c.gray };
  if (/欠款|代墊/.test(cat)) return { icon: 'people', color: c.indigo };
  if (/轉帳|移轉/.test(cat)) return { icon: 'transfer', color: c.indigo };
  if (/收入|薪/.test(cat)) return { icon: 'income', color: c.positive };
  return { icon: 'card', color: c.gray };
}

export function txVisual(tx: Transaction, c: Palette): TxVisual {
  if (tx.type === 'adjustment') return { icon: 'adjust', color: c.gray };
  if (tx.type === 'transfer') return { icon: 'transfer', color: c.cyan };
  if (tx.type === 'income') {
    if (/欠款|代墊/.test(tx.category ?? '')) return { icon: 'people', color: c.positive };
    return { icon: 'income', color: c.positive };
  }
  const byCat = categoryVisual(tx.category, c);
  if (byCat.icon !== 'card') return byCat;
  if (tx.method === 'bank_transfer') return { icon: 'outgoing', color: c.indigo };
  return byCat;
}

export function isPositiveTx(tx: Transaction): boolean {
  return tx.type === 'income' || (tx.type === 'adjustment' && tx.amount > 0);
}

/** "−$1,234" / "+$1,234" / "$1,234" (transfer). Uses a real minus sign like iOS Wallet. */
export function formatTxAmount(tx: Transaction): string {
  const abs = `$${Math.abs(tx.amount).toLocaleString()}`;
  if (tx.type === 'transfer') return abs;
  return isPositiveTx(tx) ? `+${abs}` : `−${abs}`;
}

export function txTitle(tx: Transaction): string {
  return tx.merchant || tx.category || '未命名交易';
}

export function accountLabel(accountId: string): string {
  return accountId === 'bank' ? '玉山' : '現金';
}

export function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-TW', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

export function formatGroupDateTitle(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return '今天';
  const [y, m, d] = todayStr.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  if (dateStr === yesterday) return '昨天';
  const [, mm, dd] = dateStr.split('-');
  return `${Number(mm)}月${Number(dd)}日`;
}

/** Remove emoji / pictographs from system copy (toasts, badges) so the UI stays typographic. */
export function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
