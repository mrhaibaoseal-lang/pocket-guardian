import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { convertToFeelings } from '../../core';
import type { AccountId, PayMethod, ScoldMode } from '../../core';
import { useLedger } from '../store/useLedger';
import { theme } from '../theme/tokens';
import { AppSymbol } from './AppSymbol';
import { SafeConfirmButton } from './SafeConfirmButton';

export type ActiveModal = 'none' | 'expense' | 'atm' | 'scold' | 'reconcile';

interface ActionSheetModalsProps {
  active: ActiveModal;
  presetCategory?: string;
  onClose: () => void;
}

const CATEGORIES = ['超商', '食物', '飲料', '車費', '早餐', '午餐/便當', '晚餐/宵夜', '日用品', '轉帳', '娛樂'];
const ATM_AMOUNTS = [1000, 2000, 3000, 5000];

export function ActionSheetModals({ active, presetCategory, onClose }: ActionSheetModalsProps) {
  const {
    data,
    summary,
    addQuickExpense,
    addIncome,
    addAtmTransfer,
    reconcileAccount,
    runScold,
    recordResistedImpulse,
  } = useLedger();

  // --- Expense / Income state ---
  const [entryMode, setEntryMode] = useState<'expense' | 'income'>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [payMethod, setPayMethod] = useState<Exclude<PayMethod, 'atm' | 'other'>>('cash');
  const [category, setCategory] = useState('超商');
  const [merchant, setMerchant] = useState('');
  const [quickSentence, setQuickSentence] = useState('');
  const [incomeAccount, setIncomeAccount] = useState<AccountId>('bank');

  useEffect(() => {
    if (active === 'expense' && presetCategory) {
      setEntryMode('expense');
      setPayMethod('cash');
      setCategory(presetCategory);
      setAmountStr('');
      setMerchant('');
    }
  }, [active, presetCategory]);

  // --- ATM state ---
  const [atmDir, setAtmDir] = useState<'withdraw' | 'deposit'>('withdraw');
  const [atmAmountStr, setAtmAmountStr] = useState('3000');
  const [atmHasFee, setAtmHasFee] = useState(false);

  // --- Scold Me state ---
  const [scoldItem, setScoldItem] = useState('');
  const [scoldPriceStr, setScoldPriceStr] = useState('');
  const [scoldMode, setScoldMode] = useState<ScoldMode>('friend');

  // --- Reconcile state ---
  const [recAccount, setRecAccount] = useState<AccountId>('cash');
  const [recActualStr, setRecActualStr] = useState('');
  const [recAffectsBudget, setRecAffectsBudget] = useState(false);

  const parseSentenceAndSubmit = () => {
    // e.g. "現金買鹽酥雞 135" or "刷卡咖啡 65"
    const s = quickSentence.trim();
    const numMatch = s.match(/(\d+(?:\.\d+)?)/);
    if (!numMatch) return;
    const amt = Number(numMatch[1]);
    const isCard = /(刷卡|金融卡|玉山|Apple\s*Pay)/i.test(s);
    const isTransfer = /(轉帳)/.test(s);
    const detectedMethod: Exclude<PayMethod, 'atm' | 'other'> = isTransfer
      ? 'bank_transfer'
      : isCard
        ? 'debit_card'
        : 'cash';
    const cleanName = s
      .replace(numMatch[0], '')
      .replace(/(現金|刷卡|金融卡|轉帳|買|花了|元|\$)/g, '')
      .trim();
    addQuickExpense(amt, detectedMethod, cleanName || '快速記帳', cleanName || '快速記帳');
    setQuickSentence('');
    onClose();
  };

  const handleExpenseSubmit = () => {
    const amt = Number(amountStr);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (entryMode === 'income') {
      addIncome(amt, incomeAccount, merchant || '薪資/收入');
    } else {
      addQuickExpense(amt, payMethod, category, merchant || category);
    }
    setAmountStr('');
    setMerchant('');
    onClose();
  };

  const handleAtmSubmit = () => {
    const amt = Number(atmAmountStr);
    if (!Number.isFinite(amt) || amt <= 0) return;
    addAtmTransfer(atmDir, amt, atmHasFee ? 5 : 0);
    onClose();
  };

  const handleReconcileSubmit = () => {
    const actual = Number(recActualStr);
    if (!Number.isFinite(actual) || actual < 0) return;
    reconcileAccount(recAccount, actual, recAffectsBudget);
    setRecActualStr('');
    onClose();
  };

  const scoldPrice = Number(scoldPriceStr) || 0;
  const scoldOutput = scoldPrice > 0 ? runScold(scoldItem || '這個東西', scoldPrice, scoldMode) : null;
  const feelings = convertToFeelings(Number(amountStr) || scoldPrice || 0, data.settings);

  const currentAccountBal = recAccount === 'bank' ? summary.balances.bank : summary.balances.cash;
  const recDelta =
    recActualStr.trim() !== '' && Number.isFinite(Number(recActualStr))
      ? Math.round((Number(recActualStr) - currentAccountBal) * 100) / 100
      : 0;

  return (
    <Modal visible={active !== 'none'} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {active === 'expense' && '記收支 / 轉帳'}
              {active === 'atm' && 'ATM 存提款同步'}
              {active === 'scold' && '衝動消費評估'}
              {active === 'reconcile' && '餘額校正平帳'}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <AppSymbol name="xmark" size={13} color={theme.colors.text.secondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* 1. EXPENSE / INCOME MODAL */}
            {active === 'expense' && (
              <View style={styles.section}>
                <View style={styles.nlBox}>
                  <TextInput
                    value={quickSentence}
                    onChangeText={setQuickSentence}
                    placeholder="一句話快記（例：現金買鹽酥雞 135）"
                    placeholderTextColor={theme.colors.text.tertiary}
                    style={styles.nlInput}
                    onSubmitEditing={parseSentenceAndSubmit}
                  />
                  <Pressable onPress={parseSentenceAndSubmit} style={styles.nlBtn}>
                    <Text style={styles.nlBtnText}>快記</Text>
                  </Pressable>
                </View>

                <View style={styles.segmentRow}>
                  <Pressable
                    onPress={() => setEntryMode('expense')}
                    style={[styles.segmentBtn, entryMode === 'expense' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, entryMode === 'expense' && styles.segmentTextActive]}>
                      記支出 / 轉帳
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setEntryMode('income')}
                    style={[styles.segmentBtn, entryMode === 'income' && styles.segmentActiveGreen]}
                  >
                    <Text style={[styles.segmentText, entryMode === 'income' && styles.segmentTextActive]}>
                      記收入（薪水/還款）
                    </Text>
                  </Pressable>
                </View>

                {entryMode === 'expense' ? (
                  <>
                    <Text style={styles.label}>扣款方式</Text>
                    <View style={styles.segmentRow}>
                      {(
                        [
                          ['cash', '現金'],
                          ['debit_card', '玉山金融卡'],
                          ['bank_transfer', '網銀轉帳'],
                        ] as const
                      ).map(([m, title]) => (
                        <Pressable
                          key={m}
                          onPress={() => setPayMethod(m)}
                          style={[styles.chipBtn, payMethod === m && styles.chipBtnActive]}
                        >
                          <Text style={[styles.chipText, payMethod === m && styles.chipTextActive]}>{title}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.label}>消費分類</Text>
                    <View style={styles.wrapRow}>
                      {CATEGORIES.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => setCategory(c)}
                          style={[styles.tagBtn, category === c && styles.tagBtnActive]}
                        >
                          <Text style={[styles.tagText, category === c && styles.tagTextActive]}>{c}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>入帳帳戶</Text>
                    <View style={styles.segmentRow}>
                      {(
                        [
                          ['bank', '玉山銀行帳戶'],
                          ['cash', '現金錢包'],
                        ] as const
                      ).map(([acc, title]) => (
                        <Pressable
                          key={acc}
                          onPress={() => setIncomeAccount(acc)}
                          style={[styles.chipBtn, incomeAccount === acc && styles.chipBtnActive]}
                        >
                          <Text style={[styles.chipText, incomeAccount === acc && styles.chipTextActive]}>{title}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

                <Text style={styles.label}>金額 (NT$)</Text>
                <View style={styles.amountInputRow}>
                  <TextInput
                    value={amountStr}
                    onChangeText={setAmountStr}
                    keyboardType="numeric"
                    placeholder="輸入金額"
                    placeholderTextColor={theme.colors.text.tertiary}
                    style={styles.amountInput}
                    onSubmitEditing={handleExpenseSubmit}
                  />
                  {amountStr.length > 0 && (
                    <SafeConfirmButton
                      label="清空"
                      confirmLabel="確定清空"
                      compact
                      onConfirm={() => setAmountStr('')}
                    />
                  )}
                </View>

                {Number(amountStr) >= 200 && (
                  <Text style={styles.feelingHint}>
                    體感換算：約等於工作 {feelings.hours} 小時 ／ {feelings.bentos} 個便當
                  </Text>
                )}

                <Text style={styles.label}>品項 / 商店備註（選填）</Text>
                <TextInput
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder={entryMode === 'income' ? '例：10月薪資 / 小明還錢' : '例：7-ELEVEN / 雞腿便當'}
                  placeholderTextColor={theme.colors.text.tertiary}
                  style={styles.textInput}
                />

                <Pressable onPress={handleExpenseSubmit} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>
                    {entryMode === 'income' ? '確認入帳' : '確認記帳'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* 2. ATM MODAL */}
            {active === 'atm' && (
              <View style={styles.section}>
                <Text style={styles.helperText}>
                  ATM 提款與存款屬於資產內部移轉，僅同步增減玉山銀行與現金餘額，不會計入支出。
                </Text>

                <View style={styles.segmentRow}>
                  <Pressable
                    onPress={() => setAtmDir('withdraw')}
                    style={[styles.segmentBtn, atmDir === 'withdraw' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, atmDir === 'withdraw' && styles.segmentTextActive]}>
                      ATM 提款（玉山 → 現金）
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAtmDir('deposit')}
                    style={[styles.segmentBtn, atmDir === 'deposit' && styles.segmentActiveGreen]}
                  >
                    <Text style={[styles.segmentText, atmDir === 'deposit' && styles.segmentTextActive]}>
                      ATM 存款（現金 → 玉山）
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.label}>常用面額</Text>
                <View style={styles.wrapRow}>
                  {ATM_AMOUNTS.map((amt) => (
                    <Pressable
                      key={amt}
                      onPress={() => setAtmAmountStr(String(amt))}
                      style={[styles.atmChip, atmAmountStr === String(amt) && styles.atmChipActive]}
                    >
                      <Text style={[styles.atmChipText, atmAmountStr === String(amt) && styles.chipTextActive]}>
                        ${amt.toLocaleString()}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>自訂金額</Text>
                <TextInput
                  value={atmAmountStr}
                  onChangeText={setAtmAmountStr}
                  keyboardType="numeric"
                  style={styles.amountInput}
                />

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>包含跨行手續費 $5（僅手續費計入支出）</Text>
                  <Switch value={atmHasFee} onValueChange={setAtmHasFee} />
                </View>

                <Pressable onPress={handleAtmSubmit} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>
                    同步更新餘額（{atmDir === 'withdraw' ? `玉山 -$${Number(atmAmountStr) + (atmHasFee ? 5 : 0)} / 現金 +$${atmAmountStr}` : `現金 -$${atmAmountStr} / 玉山 +$${atmAmountStr}`}）
                  </Text>
                </Pressable>
              </View>
            )}

            {/* 3. SCOLD ME MODAL */}
            {active === 'scold' && (
              <View style={styles.section}>
                <Text style={styles.label}>評估視角</Text>
                <View style={styles.segmentRow}>
                  {(
                    [
                      ['friend', '直白損友'],
                      ['data', '數據分析'],
                      ['mom', '嚴格長輩'],
                    ] as const
                  ).map(([m, label]) => (
                    <Pressable
                      key={m}
                      onPress={() => setScoldMode(m)}
                      style={[styles.chipBtn, scoldMode === m && styles.chipBtnActive]}
                    >
                      <Text style={[styles.chipText, scoldMode === m && styles.chipTextActive]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>想買的商品</Text>
                <TextInput
                  value={scoldItem}
                  onChangeText={setScoldItem}
                  placeholder="例：限量球鞋 / 新耳機"
                  placeholderTextColor={theme.colors.text.tertiary}
                  style={styles.textInput}
                />

                <Text style={styles.label}>價格 (NT$)</Text>
                <TextInput
                  value={scoldPriceStr}
                  onChangeText={setScoldPriceStr}
                  keyboardType="numeric"
                  placeholder="輸入商品價格"
                  placeholderTextColor={theme.colors.text.tertiary}
                  style={styles.amountInput}
                />

                {scoldOutput && (
                  <View
                    style={[
                      styles.scoldCard,
                      scoldOutput.verdict === 'stop'
                        ? styles.scoldStop
                        : scoldOutput.verdict === 'think'
                          ? styles.scoldThink
                          : styles.scoldOk,
                    ]}
                  >
                    <Text style={styles.scoldHeadline}>{scoldOutput.headline}</Text>
                    {scoldOutput.lines.map((line, idx) => (
                      <Text key={idx} style={styles.scoldLine}>
                        · {line}
                      </Text>
                    ))}
                  </View>
                )}

                {scoldPrice > 0 && (
                  <View style={styles.scoldActions}>
                    <Pressable
                      onPress={() => {
                        recordResistedImpulse(scoldItem || '衝動商品', scoldPrice);
                        setScoldItem('');
                        setScoldPriceStr('');
                        onClose();
                      }}
                      style={styles.resistBtn}
                    >
                      <Text style={styles.resistBtnText}>
                        克制不買（計入省下紀錄 +${scoldPrice}）
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        addQuickExpense(scoldPrice, 'debit_card', '娛樂', scoldItem || '衝動購物');
                        setScoldItem('');
                        setScoldPriceStr('');
                        onClose();
                      }}
                      style={styles.buyAnywayBtn}
                    >
                      <Text style={styles.buyAnywayText}>確認購買並直接記帳扣款</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {/* 4. RECONCILE MODAL */}
            {active === 'reconcile' && (
              <View style={styles.section}>
                <Text style={styles.helperText}>
                  輸入帳戶實際餘額，系統將自動計算並補齊差額。
                </Text>

                <View style={styles.segmentRow}>
                  <Pressable
                    onPress={() => setRecAccount('cash')}
                    style={[styles.segmentBtn, recAccount === 'cash' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, recAccount === 'cash' && styles.segmentTextActive]}>
                      校正現金（帳面 ${summary.balances.cash}）
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRecAccount('bank')}
                    style={[styles.segmentBtn, recAccount === 'bank' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, recAccount === 'bank' && styles.segmentTextActive]}>
                      校正玉山（帳面 ${summary.balances.bank}）
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.label}>
                  目前實際看到的{recAccount === 'bank' ? '玉山銀行' : '手頭現金'}餘額
                </Text>
                <TextInput
                  value={recActualStr}
                  onChangeText={setRecActualStr}
                  keyboardType="numeric"
                  placeholder={`目前帳面為 $${currentAccountBal}`}
                  placeholderTextColor={theme.colors.text.tertiary}
                  style={styles.amountInput}
                />

                {recActualStr.trim() !== '' && (
                  <View style={styles.deltaBox}>
                    <Text style={styles.deltaText}>
                      計算差額：{recDelta >= 0 ? `+$${recDelta}` : `-$${Math.abs(recDelta)}`}
                    </Text>
                  </View>
                )}

                {recDelta < 0 && (
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>將差額計入本月消費預算（關閉則僅校正餘額）</Text>
                    <Switch value={recAffectsBudget} onValueChange={setRecAffectsBudget} />
                  </View>
                )}

                <Pressable onPress={handleReconcileSubmit} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>確認平帳對齊</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 6, 8, 0.78)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    backgroundColor: theme.colors.background.elevatedSurface,
    borderTopLeftRadius: theme.radii.outerCard,
    borderTopRightRadius: theme.radii.outerCard,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: theme.colors.glass.fallbackBorder,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    color: theme.colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.background.subtleSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingBottom: 12,
  },
  section: {
    gap: 10,
    paddingBottom: 16,
  },
  helperText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  nlBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: theme.colors.background.base,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    padding: 5,
    borderWidth: 1,
    borderColor: theme.colors.glass.fallbackBorder,
  },
  nlInput: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text.primary,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  nlBtn: {
    backgroundColor: theme.colors.accent.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.chip,
  },
  nlBtnText: {
    color: theme.colors.text.inverse,
    fontWeight: '600',
    fontSize: 12,
  },
  label: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.subtleSurface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  segmentActive: {
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
  },
  segmentActiveGreen: {
    backgroundColor: theme.colors.semantic.remainingSubtle,
    borderColor: theme.colors.accent.subtleBorder,
  },
  segmentText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  chipBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: theme.radii.chip,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.subtleSurface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  chipBtnActive: {
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
  },
  chipText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  chipTextActive: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.background.subtleSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  tagBtnActive: {
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
  },
  tagText: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  tagTextActive: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  amountInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.colors.background.base,
    color: theme.colors.text.primary,
    fontSize: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.glass.fallbackBorder,
  },
  textInput: {
    minWidth: 0,
    backgroundColor: theme.colors.background.base,
    color: theme.colors.text.primary,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.glass.fallbackBorder,
  },
  feelingHint: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  primaryBtn: {
    backgroundColor: theme.colors.accent.primary,
    paddingVertical: 13,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    color: theme.colors.text.inverse,
    fontSize: 14,
    fontWeight: '600',
  },
  atmChip: {
    flex: 1,
    minWidth: '22%',
    paddingVertical: 10,
    borderRadius: theme.radii.chip,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.subtleSurface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  atmChipActive: {
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
  },
  atmChipText: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background.subtleSurface,
    padding: 12,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  switchLabel: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  scoldCard: {
    padding: 14,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.glass.fallbackBorder,
    backgroundColor: theme.colors.background.subtleSurface,
    gap: 6,
  },
  scoldStop: {
    backgroundColor: theme.colors.semantic.dangerSubtle,
    borderColor: 'rgba(181, 90, 82, 0.32)',
  },
  scoldThink: {
    backgroundColor: theme.colors.semantic.warningSubtle,
    borderColor: 'rgba(184, 134, 72, 0.32)',
  },
  scoldOk: {
    backgroundColor: theme.colors.background.subtleSurface,
  },
  scoldHeadline: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  scoldLine: {
    color: theme.colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  scoldActions: {
    gap: 8,
    marginTop: 6,
  },
  resistBtn: {
    backgroundColor: theme.colors.accent.primary,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  resistBtnText: {
    color: theme.colors.text.inverse,
    fontWeight: '600',
    fontSize: 13,
  },
  buyAnywayBtn: {
    backgroundColor: theme.colors.background.subtleSurface,
    paddingVertical: 11,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  buyAnywayText: {
    color: theme.colors.text.tertiary,
    fontWeight: '500',
    fontSize: 12,
  },
  deltaBox: {
    backgroundColor: theme.colors.accent.subtleBg,
    padding: 12,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.accent.subtleBorder,
  },
  deltaText: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
