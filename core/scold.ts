import { computeMicroRadar, computeSafeToSpend, convertToFeelings } from './ledger';
import type { Settings, Subscription, Transaction } from './types';

export type ScoldMode = 'friend' | 'data' | 'mom';

export interface ScoldResult {
  verdict: 'stop' | 'think' | 'ok';
  headline: string;
  lines: string[];
  afterTodayLeft: number;
  afterDailyAllowance: number;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/**
 * 🛑 "罵醒我": roast the user with their REAL numbers. Deterministic templates,
 * so it works offline and costs nothing. (An AI version can be layered on later.)
 */
export function scold(
  item: string,
  price: number,
  mode: ScoldMode,
  settings: Settings,
  txs: Transaction[],
  subs: Subscription[],
  now: string,
): ScoldResult {
  const s = computeSafeToSpend(settings, txs, subs, now);
  const radar = computeMicroRadar(txs, now);
  const feel = convertToFeelings(price, settings);
  const afterAvailable = s.trueAvailable - price;
  const afterDaily = Math.max(0, Math.floor((afterAvailable - settings.safetyFloor) / s.daysRemaining));
  const afterTodayLeft = s.todayLeft - price;
  const seed = Math.round(price) + item.length;
  const name = item.trim() || '這個東西';

  let verdict: ScoldResult['verdict'] = 'ok';
  if (afterAvailable < settings.safetyFloor || price > s.dailyAllowance * 3) verdict = 'stop';
  else if (afterTodayLeft < 0 || price > s.dailyAllowance) verdict = 'think';

  const facts: string[] = [
    `$${price} ＝ 你要工作 ${feel.hours} 小時 ＝ ${feel.bentos} 個雞腿便當`,
    `買下去後，今天剩 $${Math.floor(afterTodayLeft)} 可以花`,
    `之後 ${s.daysRemaining} 天，每天只剩 $${afterDaily}`,
  ];
  if (radar.monthCount > 0) facts.push(`這個月光小額消費就已經 ${radar.monthCount} 筆了`);
  if (s.pendingSubscriptions > 0) facts.push(`還有 $${s.pendingSubscriptions} 的固定扣款還沒扣`);

  const headlines: Record<ScoldMode, Record<ScoldResult['verdict'], string[]>> = {
    friend: {
      stop: [`醒醒！${name}買下去你就要喝西北風了`, `${name}？你是忘記自己帳戶剩多少了嗎`],
      think: [`${name}……你確定不是一時衝動？`, `先放進購物車冷靜 24 小時好嗎`],
      ok: [`好啦，預算內，${name}可以買，但別養成習慣`],
    },
    data: {
      stop: [`系統判定：購買 ${name} 將跌破安全底線`],
      think: [`系統判定：購買 ${name} 將使今日超支`],
      ok: [`系統判定：${name} 在今日額度內`],
    },
    mom: {
      stop: [`又要買${name}？家裡是有礦嗎！`, `${name}${name}，你上次買的那個用了幾次？`],
      think: [`買${name}之前，先想想月底吃什麼`, `你這個月是不是已經買很多了？`],
      ok: [`好啦好啦，這次就讓你買，下不為例`],
    },
  };
  const tails: Record<ScoldMode, string[]> = {
    friend: ['把錢留給未來的自己吧。', '你的存款會感謝你的。'],
    data: ['建議：延後購買。', '建議：重新評估需求。'],
    mom: ['錢不是大風吹來的！', '存起來，以後你就知道了。'],
  };

  return {
    verdict,
    headline: pick(headlines[mode][verdict], seed),
    lines: verdict === 'ok' ? [facts[0], facts[1]] : [...facts, pick(tails[mode], seed)],
    afterTodayLeft: Math.floor(afterTodayLeft),
    afterDailyAllowance: afterDaily,
  };
}
