import { describe, expect, it } from 'vitest';
import {
  computeBalances,
  computeMicroRadar,
  computeSafeToSpend,
  createAtm,
  createManualExpense,
  looksLikeOtp,
  MemoryLedger,
  parseEvent,
  budgetCycle,
  DEFAULT_SETTINGS,
} from '../index';
import type { Settings } from '../index';

// Real samples from the user's screenshots.
const WALLET_81 = '玉山銀行 E.SUN BANK\n樂家康, 新北市新店區\n$81.00';
const EFINGO_81 = '玉山銀行\n簽帳金融卡消費 81元通知';
const TRANSFER_100 = [
  '交易成功',
  '2026-10-26 02:07:37',
  '轉帳金額',
  '100',
  '轉入對象',
  '808 玉山商業銀行',
  '********24126',
  '自己帳號',
  '808 玉山商業銀行',
  '********83151',
].join('\n');

const T0 = '2026-10-27T04:00:00.000Z'; // 12:00 Taipei
const plus = (iso: string, sec: number) => new Date(Date.parse(iso) + sec * 1000).toISOString();

function ledger(settings: Partial<Settings> = {}) {
  const l = new MemoryLedger();
  l.data.settings = { ...DEFAULT_SETTINGS, openingBank: 20000, openingCash: 1000, ...settings };
  return l;
}

describe('parsers (real samples)', () => {
  it('parses the Apple Pay wallet notification', () => {
    const p = parseEvent('wallet', { text: WALLET_81 }, T0, '83151');
    expect(p).toMatchObject({ kind: 'card_spend', amount: 81, merchant: '樂家康', location: '新北市新店區' });
  });

  it('parses structured wallet input from the Transaction automation', () => {
    const p = parseEvent('wallet', { merchant: '7-ELEVEN', amount: '65' }, T0, '83151');
    expect(p).toMatchObject({ kind: 'card_spend', amount: 65, merchant: '7-ELEVEN' });
  });

  it('parses the e.Fingo debit card notification', () => {
    const p = parseEvent('efingo', { text: EFINGO_81 }, T0, '83151');
    expect(p).toMatchObject({ kind: 'card_spend', amount: 81, merchant: null });
  });

  it('parses e.Fingo amounts with thousands separators', () => {
    expect(parseEvent('efingo', { text: '簽帳金融卡消費 1,280元通知' }, T0, '83151').amount).toBe(1280);
  });

  it('parses the transfer success page with absolute time and payee', () => {
    const p = parseEvent('transfer_page', { text: TRANSFER_100 }, T0, '83151');
    expect(p).toMatchObject({
      kind: 'transfer_out',
      amount: 100,
      payeeSuffix: '24126',
      payeeBankCode: '808',
      ownSuffix: '83151',
      timeSource: 'absolute',
      occurredAt: '2026-10-25T18:07:37.000Z', // 02:07:37 Taipei
    });
  });

  it('parses the transfer page when OCR puts the amount on the label line', () => {
    const text = '交易成功\n2026-10-26 02:07:37\n轉帳金額 1,500\n轉入對象 808 玉山商業銀行 ********24126\n自己帳號 808 玉山商業銀行 ********83151';
    expect(parseEvent('transfer_page', { text }, T0, '83151')).toMatchObject({ amount: 1500, payeeSuffix: '24126' });
  });

  it('parses iOS Vision two-column OCR where labels are grouped before the 3-digit amount 100 and status bar has 100', () => {
    const realIphoneOcr = [
      '10:50 ₩',
      '* 100•',
      '生期一',
      'PSE_L 10:29',
      '交易成功',
      '2026-10-26 02:07:37',
      '轉帳金額',
      '轉入對象',
      '自己帳號',
      '100',
      '808玉山商業銀行',
      '********24126',
      '808玉山商業銀行',
      '********83151',
      'พิ',
    ].join('\n');
    expect(parseEvent('transfer_page', { text: realIphoneOcr }, T0, '83151')).toMatchObject({
      kind: 'transfer_out',
      source: 'transfer_page',
      amount: 100,
      payeeSuffix: '24126',
      payeeBankCode: '808',
      ownSuffix: '83151',
      timeSource: 'absolute',
      occurredAt: '2026-10-25T18:07:37.000Z',
    });
  });

  it('self-heals when Apple Pay or e.Fingo text is sent with source="transfer_page"', () => {
    expect(parseEvent('transfer_page', { text: WALLET_81 }, T0, '83151')).toMatchObject({
      kind: 'card_spend',
      source: 'wallet',
      amount: 81,
      merchant: '樂家康',
    });
    expect(parseEvent('transfer_page', { text: EFINGO_81 }, T0, '83151')).toMatchObject({
      kind: 'card_spend',
      source: 'efingo',
      amount: 81,
    });
  });

  it('drops OTP and ignores marketing', () => {
    expect(looksLikeOtp('您的驗證碼為 123456，請勿告知他人')).toBe(true);
    expect(looksLikeOtp('登入碼 482913')).toBe(true);
    expect(looksLikeOtp('轉帳金額 100000')).toBe(false);
    expect(parseEvent('efingo', { text: '您的驗證碼為 123456' }, T0, '83151').kind).toBe('otp');
    expect(parseEvent('efingo', { text: '雙11 刷卡享 5% 回饋，立即登錄！' }, T0, '83151').kind).toBe('ignored');
  });

  it('handles full-width digits from OCR', () => {
    expect(parseEvent('efingo', { text: '簽帳金融卡消費 ８１元通知' }, T0, '83151').amount).toBe(81);
  });

  it('covers transfer amounts 20 / 100 / 1,000 in both single-column and two-column OCR layouts with status bar noise', () => {
    for (const rawAmt of ['20', '100', '1,000']) {
      const expected = Number(rawAmt.replace(/,/g, ''));
      const singleCol = [
        '10:50',
        '* 100•',
        '交易成功',
        '2026-10-26 02:07:37',
        `轉帳金額 ${rawAmt}`,
        '轉入對象 808 玉山商業銀行 ********24126',
        '自己帳號 808 玉山商業銀行 ********83151',
      ].join('\n');
      const twoCol = [
        '10:50 5G 100',
        '轉帳金額',
        '轉入對象',
        '自己帳號',
        rawAmt,
        '808玉山商業銀行',
        '********24126',
        '808玉山商業銀行',
        '********83151',
      ].join('\n');

      expect(parseEvent('transfer_page', { text: singleCol }, T0, '83151')).toMatchObject({
        kind: 'transfer_out',
        amount: expected,
        payeeSuffix: '24126',
      });
      expect(parseEvent('transfer_page', { text: twoCol }, T0, '83151')).toMatchObject({
        kind: 'transfer_out',
        amount: expected,
        payeeSuffix: '24126',
      });
    }
  });

  it('ignores promotional "滿 1,000 送 100" across all channels without falling back to wallet, while booking real spend with cashback wording', () => {
    const promo = '雙11 刷卡滿 1,000 元送 100 元刷卡金，立即登錄';
    expect(parseEvent('efingo', { text: promo }, T0, '83151').kind).toBe('ignored');
    expect(parseEvent('wallet', { text: promo }, T0, '83151').kind).toBe('ignored');

    const realWithCashback = '消費 NT$320，享 1% 回饋';
    const parsedReal = parseEvent('efingo', { text: realWithCashback }, T0, '83151');
    expect(parsedReal).toMatchObject({
      kind: 'card_spend',
      amount: 320,
    });
  });

  it('extracts transfer amount 1,000 and ignores fee 15 in both single-column and two-column layouts', () => {
    const singleWithFee = [
      '轉帳成功',
      '2026-10-28 14:20:00',
      '轉帳金額 1,000 元',
      '手續費 15 元',
      '轉入帳號 013 國泰世華 ********55667',
    ].join('\n');
    const twoColWithFee = [
      '轉帳結果',
      '轉帳金額',
      '手續費',
      '轉入帳號',
      '自己帳號',
      '1,000',
      '15',
      '013 國泰世華銀行',
      '********55667',
      '808 玉山商業銀行',
      '********83151',
    ].join('\n');

    expect(parseEvent('transfer_page', { text: singleWithFee }, T0, '83151')).toMatchObject({
      kind: 'transfer_out',
      amount: 1000,
      payeeSuffix: '55667',
    });
    expect(parseEvent('transfer_page', { text: twoColWithFee }, T0, '83151')).toMatchObject({
      kind: 'transfer_out',
      amount: 1000,
      payeeSuffix: '55667',
    });
  });

  it('never mistakes dates (2026-10-28, 2026/10/28, 115/10/28, 115年10月28日, 10/26 02:07) for amounts and parses transaction dates', () => {
    const dateBelowLabel = [
      '轉帳成功',
      '轉帳金額',
      '2026-10-28',
      '115/10/28',
      '1,000',
      '轉入對象 812 台新銀行 ********99887',
    ].join('\n');
    expect(parseEvent('transfer_page', { text: dateBelowLabel }, T0, '83151')).toMatchObject({
      kind: 'transfer_out',
      amount: 1000,
      payeeSuffix: '99887',
    });

    const rocDateTransfer = [
      '交易完成',
      '115/10/26 02:07:37',
      '轉帳金額 500',
      '轉入帳號 700 中華郵政 ********11223',
    ].join('\n');
    const parsedRoc = parseEvent('transfer_page', { text: rocDateTransfer }, T0, '83151');
    expect(parsedRoc.amount).toBe(500);
    expect(parsedRoc.occurredAt.startsWith('2026-10-25T18:07')).toBe(true);

    const shortDateTransfer = [
      '轉帳成功',
      '10/26 14:30',
      '轉帳金額 250',
      '轉入帳號 004 臺灣銀行 ********33445',
    ].join('\n');
    const parsedShort = parseEvent('transfer_page', { text: shortDateTransfer }, T0, '83151');
    expect(parsedShort.amount).toBe(250);
    expect(parsedShort.occurredAt.startsWith('2026-10-26T')).toBe(true);
  });

  it('ignores self-transfers when the destination account belongs to the user', () => {
    const selfTransfer = [
      '交易成功',
      '2026-10-26 02:07:37',
      '轉帳金額 1,000',
      '轉入對象 013 國泰世華 ********99999',
      '自己帳號 808 玉山商業銀行 ********83151',
    ].join('\n');
    const parsed = parseEvent('transfer_page', { text: selfTransfer }, T0, '83151, 99999');
    expect(parsed.kind).toBe('ignored');

    const l = ledger({ ownAccountSuffix: '83151, 99999' });
    const res = l.ingest('transfer_page', { text: selfTransfer }, T0);
    expect(res.status).toBe('ignored');
    expect(l.data.transactions).toHaveLength(0);
  });

  it('handles Apple Pay (iOS 27 Wallet) currency formats, flags foreign currency for review, and sends empty inputs to inbox', () => {
    expect(parseEvent('wallet', { merchant: '全家', amount: '$81.00' }, T0, '83151')).toMatchObject({
      kind: 'card_spend',
      amount: 81,
      merchant: '全家',
    });
    expect(parseEvent('wallet', { merchant: '全聯', amount: 'NT$81' }, T0, '83151')).toMatchObject({
      kind: 'card_spend',
      amount: 81,
      merchant: '全聯',
    });
    expect(parseEvent('wallet', { merchant: '好市多', amount: 'NT$1,234.00' }, T0, '83151')).toMatchObject({
      kind: 'card_spend',
      amount: 1234,
      merchant: '好市多',
    });

    // Foreign currency must NOT be booked as TWD
    const foreignUsd = parseEvent('wallet', { merchant: 'App Store', amount: 'US$10.00' }, T0, '83151');
    expect(foreignUsd.kind).toBe('unknown');
    expect(foreignUsd.amount).toBeNull();

    const foreignJpy = parseEvent('wallet', { text: 'Lawson\n¥1,000' }, T0, '83151');
    expect(foreignJpy.kind).toBe('unknown');
    expect(foreignJpy.amount).toBeNull();

    // Merchant without amount or empty string must go to inbox, never book $0
    const l = ledger();
    const onlyMerchant = l.ingest('wallet', { merchant: '星巴克', amount: '' }, T0);
    expect(onlyMerchant.transaction).toBeNull();
    expect(l.data.transactions).toHaveLength(0);
    expect(l.data.events.length).toBeGreaterThan(0);

    const bothEmpty = l.ingest('wallet', { text: '' }, T0);
    expect(bothEmpty.transaction).toBeNull();
    expect(l.data.transactions).toHaveLength(0);
  });

  it('masks full bank account numbers in stored inbox events', () => {
    const l = ledger();
    l.ingest('transfer_page', { text: '交易成功\n轉帳金額 200\n轉入帳號 808 0123456724126' }, T0);
    expect(l.data.events[0].rawText).not.toContain('0123456724126');
    expect(l.data.events[0].rawText).toContain('24126');
  });
});

describe('dedupe: Apple Pay + e.Fingo never double charge', () => {
  it('merges wallet then e.Fingo into one transaction keeping the merchant', () => {
    const l = ledger();
    const a = l.ingest('wallet', { text: WALLET_81 }, T0);
    const b = l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 1));
    expect(a.status).toBe('new_tx');
    expect(b.status).toBe('merged');
    expect(l.data.transactions).toHaveLength(1);
    expect(l.data.transactions[0]).toMatchObject({ amount: 81, merchant: '樂家康', isLocked: true, method: 'apple_pay' });
    expect(computeBalances(l.data.settings, l.data.transactions).bank).toBe(20000 - 81);
  });

  it('merges when e.Fingo arrives first (order does not matter)', () => {
    const l = ledger();
    l.ingest('efingo', { text: EFINGO_81 }, T0);
    const b = l.ingest('wallet', { text: WALLET_81 }, plus(T0, 2));
    expect(b.status).toBe('merged');
    expect(l.data.transactions).toHaveLength(1);
    expect(l.data.transactions[0]).toMatchObject({ merchant: '樂家康', method: 'apple_pay' });
  });

  it('merges when the bank push is delayed 20 minutes (basement / poor signal)', () => {
    const l = ledger();
    l.ingest('wallet', { text: WALLET_81 }, T0);
    expect(l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 20 * 60)).status).toBe('merged');
    expect(l.data.transactions).toHaveLength(1);
  });

  it('does NOT merge beyond the 30 minute window', () => {
    const l = ledger();
    l.ingest('wallet', { text: WALLET_81 }, T0);
    expect(l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 31 * 60)).status).toBe('new_tx');
    expect(l.data.transactions).toHaveLength(2);
  });

  it('buying the same thing twice with Apple Pay = two transactions', () => {
    const l = ledger();
    l.ingest('wallet', { text: WALLET_81 }, T0);
    l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 1));
    l.ingest('wallet', { text: WALLET_81 }, plus(T0, 180));
    l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 181));
    expect(l.data.transactions).toHaveLength(2);
    expect(l.data.transactions.every((t) => t.isLocked && t.merchant === '樂家康')).toBe(true);
    expect(computeBalances(l.data.settings, l.data.transactions).bank).toBe(20000 - 162);
  });

  it('two physical card swipes of the same amount = two transactions', () => {
    const l = ledger();
    l.ingest('efingo', { text: EFINGO_81 }, T0);
    l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 60));
    expect(l.data.transactions).toHaveLength(2);
  });

  it('iOS firing the same automation twice within 10s is ignored', () => {
    const l = ledger();
    l.ingest('efingo', { text: EFINGO_81 }, T0);
    const r = l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 3));
    expect(r.status).toBe('duplicate');
    expect(l.data.transactions).toHaveLength(1);
  });

  it('different amounts are never merged', () => {
    const l = ledger();
    l.ingest('wallet', { text: WALLET_81 }, T0);
    l.ingest('efingo', { text: '簽帳金融卡消費 82元通知' }, plus(T0, 1));
    expect(l.data.transactions).toHaveLength(2);
  });

  it('split "我真的買了兩次" restores two locked transactions', () => {
    const l = ledger();
    l.ingest('wallet', { text: WALLET_81 }, T0);
    l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 1));
    expect(l.split(l.data.transactions[0].id, plus(T0, 100))).toBe(true);
    expect(l.data.transactions).toHaveLength(2);
    expect(l.data.transactions.every((t) => t.isLocked)).toBe(true);
    // a third e.Fingo must not be absorbed by either half
    l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 120));
    expect(l.data.transactions).toHaveLength(3);
  });

  it('manual debit card entry merges with a late e.Fingo push instead of double counting', () => {
    const l = ledger();
    l.upsert(createManualExpense({ id: 'm1', amount: 81, method: 'debit_card', occurredAt: T0, now: T0 }));
    expect(l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 300)).status).toBe('merged');
    expect(l.data.transactions).toHaveLength(1);
  });

  it('cash entries never merge with card notifications', () => {
    const l = ledger();
    l.upsert(createManualExpense({ id: 'c1', amount: 81, method: 'cash', occurredAt: T0, now: T0 }));
    l.ingest('efingo', { text: EFINGO_81 }, plus(T0, 30));
    expect(l.data.transactions).toHaveLength(2);
  });

  it('OTP is discarded and its text is not stored', () => {
    const l = ledger();
    const r = l.ingest('efingo', { text: '您的驗證碼為 123456' }, T0);
    expect(r.status).toBe('discarded_otp');
    expect(l.data.events[0].rawText).toBeNull();
    expect(l.data.transactions).toHaveLength(0);
  });
});

describe('transfers', () => {
  it('records a transfer to a friend as spending and dedupes a second screenshot', () => {
    const l = ledger();
    const a = l.ingest('transfer_page', { text: TRANSFER_100 }, T0);
    expect(a.transaction).toMatchObject({ amount: 100, method: 'bank_transfer', merchant: '轉帳給 ****24126', category: '轉帳' });
    expect(l.ingest('transfer_page', { text: TRANSFER_100 }, plus(T0, 60)).status).toBe('duplicate');
    expect(l.data.transactions).toHaveLength(1);
  });

  it('uses a known payee name', () => {
    const l = ledger();
    l.data.payees.push({ id: 'p1', bankCode: '808', accountSuffix: '24126', displayName: '小明', defaultCategory: '朋友' });
    const r = l.ingest('transfer_page', { text: TRANSFER_100 }, T0);
    expect(r.transaction).toMatchObject({ merchant: '小明', category: '朋友', payeeId: 'p1' });
  });

  it('a manual transfer entry merges with the later screenshot', () => {
    const l = ledger();
    l.upsert(createManualExpense({ id: 'm1', amount: 100, method: 'bank_transfer', occurredAt: '2026-10-25T18:05:00.000Z', now: T0 }));
    expect(l.ingest('transfer_page', { text: TRANSFER_100 }, T0).status).toBe('merged');
    expect(l.data.transactions).toHaveLength(1);
  });

  it('dedupes a transfer without timestamp or across efingo + screenshot within ±3 minutes', () => {
    const l = ledger();
    const noTimeScreenshot = '交易成功\n轉帳金額 350\n轉入對象 808 玉山商業銀行 ********24126';
    expect(l.ingest('transfer_page', { text: noTimeScreenshot }, T0).status).toBe('new_tx');
    expect(l.ingest('transfer_page', { text: noTimeScreenshot }, plus(T0, 45)).status).toBe('duplicate');
    expect(l.data.transactions).toHaveLength(1);
  });
});

describe('ATM and reconcile', () => {
  it('ATM withdraw moves money without counting as spending', () => {
    const l = ledger();
    createAtm({ transfer: 'a', fee: 'f' }, 'withdraw', 3000, 5, T0).forEach((t) => l.upsert(t));
    const b = computeBalances(l.data.settings, l.data.transactions);
    expect(b).toEqual({ bank: 20000 - 3005, cash: 4000 });
    expect(computeSafeToSpend(l.data.settings, l.data.transactions, [], T0).spentToday).toBe(5);
  });

  it('reconcile adds one adjustment that makes the balance match', () => {
    const l = ledger();
    l.reconcile('cash', 300, true, T0);
    expect(computeBalances(l.data.settings, l.data.transactions).cash).toBe(300);
    expect(computeSafeToSpend(l.data.settings, l.data.transactions, [], T0).spentToday).toBe(700);
    l.reconcile('cash', 300, true, T0);
    expect(l.data.transactions).toHaveLength(1); // no-op when already equal
  });

  it('reconcile can be excluded from the budget', () => {
    const l = ledger();
    l.reconcile('cash', 300, false, T0);
    expect(computeSafeToSpend(l.data.settings, l.data.transactions, [], T0).spentToday).toBe(0);
  });
});

describe('safe to spend', () => {
  it('cycle boundaries handle month ends', () => {
    expect(budgetCycle('2026-10-27', 1)).toEqual({ start: '2026-10-01', end: '2026-11-01' });
    expect(budgetCycle('2026-10-03', 5)).toEqual({ start: '2026-09-05', end: '2026-10-05' });
    expect(budgetCycle('2026-12-20', 10)).toEqual({ start: '2026-12-10', end: '2027-01-10' });
  });

  it('uses current balance when monthlyBudget is 0, and configured budget when monthlyBudget > 0', () => {
    // 1. monthlyBudget = 0 -> computed from current balance (2000 - 500 safetyFloor = 1500, / 5 days = 300/day)
    const lBalance = ledger({ monthlyBudget: 0, openingBank: 2000, openingCash: 0, safetyFloor: 500 });
    const sBal = computeSafeToSpend(lBalance.data.settings, [], [], T0);
    expect(sBal.daysRemaining).toBe(5);
    expect(sBal.limitingTrack).toBe('balance');
    expect(sBal.remainingMonthlyBudget).toBe(1500);
    expect(sBal.dailyAllowance).toBe(300);

    // 2. monthlyBudget > 0 -> computed from configured monthlyBudget (15000 / 5 days = 3000/day)
    const lBudget = ledger({ monthlyBudget: 15000, openingBank: 2000, openingCash: 0, safetyFloor: 500 });
    const sBud = computeSafeToSpend(lBudget.data.settings, [], [], T0);
    expect(sBud.limitingTrack).toBe('budget');
    expect(sBud.remainingMonthlyBudget).toBe(15000);
    expect(sBud.dailyAllowance).toBe(3000);
  });

  it("today's spending reduces todayLeft but not the allowance", () => {
    const l = ledger({ monthlyBudget: 15000, openingBank: 100000 });
    const before = computeSafeToSpend(l.data.settings, [], [], T0);
    l.ingest('efingo', { text: '簽帳金融卡消費 500元通知' }, T0);
    const after = computeSafeToSpend(l.data.settings, l.data.transactions, [], T0);
    expect(after.dailyAllowance).toBe(before.dailyAllowance);
    expect(after.todayLeft).toBe(before.dailyAllowance - 500);
  });

  it('reserves upcoming subscriptions once per track', () => {
    const l = ledger({ monthlyBudget: 15000, openingBank: 100000, safetyFloor: 0 });
    const subs = [{ id: 's', name: 'Netflix', amount: 390, billingDay: 30, accountId: 'bank' as const, isActive: true, autoPost: false, lastChargedMonth: null }];
    const s = computeSafeToSpend(l.data.settings, [], subs, T0);
    expect(s.pendingSubscriptions).toBe(390);
    expect(s.trackA).toBe(Math.floor((15000 - 390) / 5));
    expect(s.trueAvailable).toBe(101000 - 390);
  });

  it('a card charge matching a subscription is labelled and stops being reserved', () => {
    const l = ledger({ openingBank: 100000 });
    l.data.subscriptions.push({ id: 's', name: 'Netflix', amount: 390, billingDay: 27, accountId: 'bank', isActive: true, autoPost: false, lastChargedMonth: null });
    const r = l.ingest('efingo', { text: '簽帳金融卡消費 390元通知' }, T0);
    expect(r.transaction).toMatchObject({ merchant: 'Netflix', category: '訂閱' });
    expect(computeSafeToSpend(l.data.settings, l.data.transactions, l.data.subscriptions, T0).pendingSubscriptions).toBe(0);
  });

  it('weather turns red when overspent', () => {
    const l = ledger({ monthlyBudget: 3000, openingBank: 100000 });
    l.ingest('efingo', { text: '簽帳金融卡消費 900元通知' }, T0);
    expect(computeSafeToSpend(l.data.settings, l.data.transactions, [], T0).weather).toBe('red');
  });
});

describe('micro spend radar', () => {
  it('detects a 3-day streak and weekly totals', () => {
    const l = ledger();
    for (const d of ['2026-10-25', '2026-10-26', '2026-10-27']) {
      l.upsert(createManualExpense({ id: d, amount: 55, method: 'cash', occurredAt: `${d}T03:00:00.000Z`, now: T0 }));
    }
    const r = computeMicroRadar(l.data.transactions, T0);
    expect(r.streakDays).toBe(3);
    expect(r.alerts.length).toBeGreaterThan(0);
  });
});
