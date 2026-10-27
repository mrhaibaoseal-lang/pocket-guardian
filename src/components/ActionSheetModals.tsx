import React, { useState } from 'react';
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
  onClose: () => void;
}

const CATEGORIES = ['早餐', '午餐/便當', '晚餐/宵夜', '飲料', '超商', '交通', '日用品', '轉帳', '娛樂'];
const ATM_AMOUNTS = [1000, 2000, 3000, 5000];

export function ActionSheetModals({ active, onClose }: ActionSheetModalsProps) {
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
  const [category, setCategory] = useState('午餐/便當');
  const [merchant, setMerchant] = useState('');
  const [quickSentence, setQuickSentence] = useState('');
  const [incomeAccount, setIncomeAccount] = useState<AccountId>('bank');

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
                    <Text style={styles.label}>扣款方式（實體卡與轉帳會自動等待玉山通知配對，不重複扣款）</Text>
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
                  發現錢包或玉山 App 裡的實際金額跟帳本對不上？直接輸入你現在看到的真實數字，系統幫你一鍵柔性抹平！
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
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: '#1E293B',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
    paddingBottom: 12,
  },
  section: {
    gap: 10,
    paddingBottom: 16,
  },
  helperText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
  nlBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  nlInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  nlBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  nlBtnText: {
    color: '#052E16',
    fontWeight: '800',
    fontSize: 13,
  },
  label: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
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
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  segmentActive: {
    backgroundColor: '#2563EB',
    borderColor: '#60A5FA',
  },
  segmentActiveGreen: {
    backgroundColor: '#059669',
    borderColor: '#34D399',
  },
  segmentText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  chipBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipBtnActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#60A5FA',
  },
  chipText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tagBtnActive: {
    backgroundColor: '#0EA5E9',
    borderColor: '#7DD3FC',
  },
  tagText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  tagTextActive: {
    color: '#082F49',
    fontWeight: '800',
  },
  amountInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    backgroundColor: '#020617',
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  textInput: {
    backgroundColor: '#020617',
    color: '#F8FAFC',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  feelingHint: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    color: '#022C22',
    fontSize: 15,
    fontWeight: '900',
  },
  atmChip: {
    flex: 1,
    minWidth: '22%',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  atmChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#60A5FA',
  },
  atmChipText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 12,
  },
  switchLabel: {
    color: '#E2E8F0',
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  scoldCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  scoldStop: {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderColor: '#EF4444',
  },
  scoldThink: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: '#F59E0B',
  },
  scoldOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderColor: '#10B981',
  },
  scoldHeadline: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  scoldLine: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 20,
  },
  scoldActions: {
    gap: 10,
    marginTop: 6,
  },
  resistBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  resistBtnText: {
    color: '#022C22',
    fontWeight: '900',
    fontSize: 14,
  },
  buyAnywayBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  buyAnywayText: {
    color: '#FCA5A5',
    fontWeight: '700',
    fontSize: 13,
  },
  deltaBox: {
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  deltaText: {
    color: '#FBBF24',
    fontSize: 14,
    fontWeight: '800',
  },
});
