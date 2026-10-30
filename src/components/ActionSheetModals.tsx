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
              {active === 'expense' && '💵 極速記收支 / 轉帳'}
              {active === 'atm' && '🏧 ATM 存提款一鍵同步'}
              {active === 'scold' && '🛑 救命！我想亂買東西，罵醒我'}
              {active === 'reconcile' && '⚖️ 魔術平帳（與現實餘額對齊）'}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕ 關閉</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* 1. EXPENSE / INCOME MODAL */}
            {active === 'expense' && (
              <View style={styles.section}>
                {/* Natural language 1-line input */}
                <View style={styles.nlBox}>
                  <TextInput
                    value={quickSentence}
                    onChangeText={setQuickSentence}
                    placeholder="⚡ 一句話快記（例：現金買鹽酥雞 135）"
                    placeholderTextColor="#64748B"
                    style={styles.nlInput}
                    onSubmitEditing={parseSentenceAndSubmit}
                  />
                  <Pressable onPress={parseSentenceAndSubmit} style={styles.nlBtn}>
                    <Text style={styles.nlBtnText}>秒記</Text>
                  </Pressable>
                </View>

                {/* Expense vs Income switch */}
                <View style={styles.segmentRow}>
                  <Pressable
                    onPress={() => setEntryMode('expense')}
                    style={[styles.segmentBtn, entryMode === 'expense' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, entryMode === 'expense' && styles.segmentTextActive]}>
                      💸 記支出 / 轉帳
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setEntryMode('income')}
                    style={[styles.segmentBtn, entryMode === 'income' && styles.segmentActiveGreen]}
                  >
                    <Text style={[styles.segmentText, entryMode === 'income' && styles.segmentTextActive]}>
                      💰 記收入（薪水/還錢）
                    </Text>
                  </Pressable>
                </View>

                {entryMode === 'expense' ? (
                  <>
                    <Text style={styles.label}>扣款方式</Text>
                    <View style={styles.segmentRow}>
                      {(
                        [
                          ['cash', '💵 現金'],
                          ['debit_card', '💳 玉山金融卡'],
                          ['bank_transfer', '🏦 網銀轉帳'],
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
                          ['bank', '🏦 玉山銀行帳戶'],
                          ['cash', '💵 現金錢包'],
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
                    placeholderTextColor="#64748B"
                    style={styles.amountInput}
                    onSubmitEditing={handleExpenseSubmit}
                  />
                  {amountStr.length > 0 && (
                    <SafeConfirmButton
                      label="清空"
                      confirmLabel="確定清空?"
                      compact
                      onConfirm={() => setAmountStr('')}
                    />
                  )}
                </View>

                {Number(amountStr) >= 200 && (
                  <Text style={styles.feelingHint}>
                    ⏳ 體感換算：約等於工作 {feelings.hours} 小時 ／ {feelings.bentos} 個雞腿便當
                  </Text>
                )}

                <Text style={styles.label}>品項 / 商店備註（選填）</Text>
                <TextInput
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder={entryMode === 'income' ? '例：10月薪資 / 小明還錢' : '例：7-ELEVEN / 雞腿便當'}
                  placeholderTextColor="#64748B"
                  style={styles.textInput}
                />

                <Pressable onPress={handleExpenseSubmit} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>
                    {entryMode === 'income' ? '✅ 確認入帳' : '✅ 確認記帳'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* 2. ATM MODAL */}
            {active === 'atm' && (
              <View style={styles.section}>
                <Text style={styles.helperText}>
                  ATM 提款與存款屬於「資產內部移轉」，只會同步增減你的玉山銀行與現金餘額，**絕對不會算成把錢花掉**！
                </Text>

                <View style={styles.segmentRow}>
                  <Pressable
                    onPress={() => setAtmDir('withdraw')}
                    style={[styles.segmentBtn, atmDir === 'withdraw' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, atmDir === 'withdraw' && styles.segmentTextActive]}>
                      📤 ATM 提款（玉山 ➔ 現金）
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAtmDir('deposit')}
                    style={[styles.segmentBtn, atmDir === 'deposit' && styles.segmentActiveGreen]}
                  >
                    <Text style={[styles.segmentText, atmDir === 'deposit' && styles.segmentTextActive]}>
                      📥 ATM 存款（現金 ➔ 玉山）
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.label}>一鍵選擇常用面額</Text>
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

                <Text style={styles.label}>或自訂金額</Text>
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
                    🏧 同步更新餘額（{atmDir === 'withdraw' ? `玉山 -$${Number(atmAmountStr) + (atmHasFee ? 5 : 0)} / 現金 +$${atmAmountStr}` : `現金 -$${atmAmountStr} / 玉山 +$${atmAmountStr}`}）
                  </Text>
                </Pressable>
              </View>
            )}

            {/* 3. SCOLD ME MODAL */}
            {active === 'scold' && (
              <View style={styles.section}>
                <Text style={styles.label}>選擇毒舌風格</Text>
                <View style={styles.segmentRow}>
                  {(
                    [
                      ['friend', '🤬 毒舌損友'],
                      ['data', '📊 殘酷數據'],
                      ['mom', '👵 暴躁老媽'],
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

                <Text style={styles.label}>你現在心癢想買什麼？</Text>
                <TextInput
                  value={scoldItem}
                  onChangeText={setScoldItem}
                  placeholder="例：限量球鞋 / 新耳機 / 課金禮包"
                  placeholderTextColor="#64748B"
                  style={styles.textInput}
                />

                <Text style={styles.label}>多少錢？ (NT$)</Text>
                <TextInput
                  value={scoldPriceStr}
                  onChangeText={setScoldPriceStr}
                  keyboardType="numeric"
                  placeholder="輸入商品價格"
                  placeholderTextColor="#64748B"
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
                        • {line}
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
                        😤 我被罵醒了！忍住不買（存入省錢榮譽榜 +${scoldPrice}）
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
                      <Text style={styles.buyAnywayText}>💸 我不管，剁手也要買（直接記帳扣款）</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {/* 4. RECONCILE MODAL */}
            {active === 'reconcile' && (
              <View style={styles.section}>
                <Text style={styles.helperText}>
                  輸入帳戶實際餘額，系統將自動平帳補差額。
                </Text>

                <View style={styles.segmentRow}>
                  <Pressable
                    onPress={() => setRecAccount('cash')}
                    style={[styles.segmentBtn, recAccount === 'cash' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, recAccount === 'cash' && styles.segmentTextActive]}>
                      💵 校正現金（帳面 ${summary.balances.cash}）
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRecAccount('bank')}
                    style={[styles.segmentBtn, recAccount === 'bank' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, recAccount === 'bank' && styles.segmentTextActive]}>
                      🏦 校正玉山（帳面 ${summary.balances.bank}）
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.label}>
                  你現在實際看到的{recAccount === 'bank' ? '玉山銀行' : '手頭現金'}餘額是多少？
                </Text>
                <TextInput
                  value={recActualStr}
                  onChangeText={setRecActualStr}
                  keyboardType="numeric"
                  placeholder={`目前帳面為 $${currentAccountBal}`}
                  placeholderTextColor="#64748B"
                  style={styles.amountInput}
                />

                {recActualStr.trim() !== '' && (
                  <View style={styles.deltaBox}>
                    <Text style={styles.deltaText}>
                      自動計算差額：{recDelta >= 0 ? `+$${recDelta}（多出來的錢）` : `-$${Math.abs(recDelta)}（遺忘黑洞支出）`}
                    </Text>
                  </View>
                )}

                {recDelta < 0 && (
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>將差額計入本月消費預算（關閉則僅校正餘額、不扣今日額度）</Text>
                    <Switch value={recAffectsBudget} onValueChange={setRecAffectsBudget} />
                  </View>
                )}

                <Pressable onPress={handleReconcileSubmit} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>✨ 一鍵魔術平帳對齊</Text>
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
    backgroundColor: 'rgba(8, 7, 5, 0.78)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    backgroundColor: 'rgba(24, 20, 16, 0.95)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '88%',
    borderWidth: 0.8,
    borderTopColor: 'rgba(255, 230, 190, 0.38)',
    borderLeftColor: 'rgba(255, 230, 190, 0.20)',
    borderRightColor: 'rgba(212, 175, 55, 0.06)',
    borderBottomColor: 'rgba(212, 175, 55, 0.06)',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    color: '#FAF6F0',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  closeBtnText: {
    color: '#E6D5B8',
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    paddingBottom: 12,
  },
  section: {
    gap: 10,
    paddingBottom: 16,
  },
  helperText: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    lineHeight: 18,
  },
  nlBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(28, 24, 20, 0.6)',
    borderRadius: 999,
    padding: 5,
    borderWidth: 0.8,
    borderTopColor: 'rgba(255, 230, 190, 0.38)',
    borderLeftColor: 'rgba(255, 230, 190, 0.20)',
    borderRightColor: 'rgba(212, 175, 55, 0.06)',
    borderBottomColor: 'rgba(212, 175, 55, 0.06)',
  },
  nlInput: {
    flex: 1,
    minWidth: 0,
    color: '#FAF6F0',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  nlBtn: {
    backgroundColor: '#FBBF24',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  nlBtnText: {
    color: '#080705',
    fontWeight: '700',
    fontSize: 12,
  },
  label: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    fontWeight: '600',
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
    borderRadius: 999,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  segmentActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  segmentActiveGreen: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  segmentText: {
    color: '#E6D5B8',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  chipBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  chipBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  chipText: {
    color: '#E6D5B8',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  tagBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  tagText: {
    color: '#E6D5B8',
    fontSize: 12,
    fontWeight: '600',
  },
  tagTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  amountInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(28, 24, 20, 0.65)',
    color: '#FAF6F0',
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 0.8,
    borderTopColor: 'rgba(255, 230, 190, 0.38)',
    borderLeftColor: 'rgba(255, 230, 190, 0.20)',
    borderRightColor: 'rgba(212, 175, 55, 0.06)',
    borderBottomColor: 'rgba(212, 175, 55, 0.06)',
  },
  textInput: {
    minWidth: 0,
    backgroundColor: 'rgba(28, 24, 20, 0.65)',
    color: '#FAF6F0',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  feelingHint: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '500',
  },
  primaryBtn: {
    backgroundColor: '#FBBF24',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    color: '#080705',
    fontSize: 14,
    fontWeight: '800',
  },
  atmChip: {
    flex: 1,
    minWidth: '22%',
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  atmChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  atmChipText: {
    color: '#E6D5B8',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(28, 24, 20, 0.6)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.2)',
  },
  switchLabel: {
    color: '#E6D5B8',
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  scoldCard: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 0.8,
    borderTopColor: 'rgba(255, 230, 190, 0.38)',
    borderLeftColor: 'rgba(255, 230, 190, 0.20)',
    borderRightColor: 'rgba(212, 175, 55, 0.06)',
    borderBottomColor: 'rgba(212, 175, 55, 0.06)',
    backgroundColor: 'rgba(28, 24, 20, 0.7)',
    gap: 6,
  },
  scoldStop: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  scoldThink: {
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
  },
  scoldOk: {
    backgroundColor: 'rgba(28, 24, 20, 0.6)',
  },
  scoldHeadline: {
    color: '#FAF6F0',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  scoldLine: {
    color: '#E6D5B8',
    fontSize: 13,
    lineHeight: 20,
  },
  scoldActions: {
    gap: 8,
    marginTop: 6,
  },
  resistBtn: {
    backgroundColor: '#FBBF24',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  resistBtnText: {
    color: '#080705',
    fontWeight: '800',
    fontSize: 13,
  },
  buyAnywayBtn: {
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  buyAnywayText: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontWeight: '600',
    fontSize: 12,
  },
  deltaBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  deltaText: {
    color: '#FAF6F0',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
