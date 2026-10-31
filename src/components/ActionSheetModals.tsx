import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { convertToFeelings } from '../../core';
import type { AccountId, PayMethod, ScoldMode } from '../../core';
import { useLedger } from '../store/useLedger';
import { triggerHaptic } from './iosAnimations';
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

  // --- Swipe Up / Swipe Down Sheet Gesture & Fluid Physics ---
  const sheetY = useSharedValue(0);
  const sheetScale = useSharedValue(1);
  const sheetOpacity = useSharedValue(1);
  const isClosingRef = useRef(false);

  useEffect(() => {
    if (active !== 'none') {
      isClosingRef.current = false;
      sheetY.value = 36;
      sheetScale.value = 0.97;
      sheetOpacity.value = 0;
      sheetY.value = withSpring(0, { damping: 18, stiffness: 250, mass: 0.75 });
      sheetScale.value = withSpring(1, { damping: 18, stiffness: 250, mass: 0.75 });
      sheetOpacity.value = withTiming(1, { duration: 160 });
    }
  }, [active, sheetOpacity, sheetScale, sheetY]);

  const animateDismiss = useCallback(
    (direction: 'up' | 'down' = 'down') => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      triggerHaptic('selection');
      const targetY = direction === 'up' ? -440 : 440;
      sheetY.value = withTiming(targetY, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
      });
      sheetScale.value = withTiming(0.95, { duration: 180 });
      sheetOpacity.value = withTiming(0, { duration: 165 });
      setTimeout(() => {
        onClose();
        sheetY.value = 0;
        sheetScale.value = 1;
        sheetOpacity.value = 1;
        isClosingRef.current = false;
      }, 170);
    },
    [onClose, sheetOpacity, sheetScale, sheetY],
  );

  const sheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.35,
      onPanResponderGrant: () => {
        triggerHaptic('light');
      },
      onPanResponderMove: (_, g) => {
        sheetY.value = g.dy;
        const progress = Math.min(Math.abs(g.dy) / 360, 1);
        sheetScale.value = 1 - progress * 0.04;
        sheetOpacity.value = 1 - progress * 0.35;
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 42 || g.vy > 0.5) {
          animateDismiss('down');
        } else if (g.dy < -42 || g.vy < -0.5) {
          animateDismiss('up');
        } else {
          sheetY.value = withSpring(0, { damping: 16, stiffness: 260 });
          sheetScale.value = withSpring(1, { damping: 16, stiffness: 260 });
          sheetOpacity.value = withTiming(1, { duration: 140 });
        }
      },
      onPanResponderTerminate: () => {
        sheetY.value = withSpring(0, { damping: 16, stiffness: 260 });
        sheetScale.value = withSpring(1, { damping: 16, stiffness: 260 });
        sheetOpacity.value = withTiming(1, { duration: 140 });
      },
    }),
  ).current;

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement, velocity } = e.nativeEvent;
      const maxScroll = Math.max(0, contentSize.height - layoutMeasurement.height);
      if (contentOffset.y < -30 || (contentOffset.y <= 0 && (velocity?.y ?? 0) < -0.6)) {
        animateDismiss('down');
      } else if (
        contentOffset.y - maxScroll > 32 ||
        (contentOffset.y >= maxScroll && (velocity?.y ?? 0) > 0.6)
      ) {
        animateDismiss('up');
      }
    },
    [animateDismiss],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
    transform: [{ translateY: sheetY.value }, { scale: sheetScale.value }],
  }));

  return (
    <Modal visible={active !== 'none'} animationType="fade" transparent onRequestClose={() => animateDismiss('down')}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => animateDismiss('down')} />
        <Animated.View
          style={[styles.sheet, sheetAnimStyle]}
          {...sheetPanResponder.panHandlers}
        >
          {/* Top Grabber Handle for Swipe Up / Down */}
          <View style={styles.grabberRow}>
            <View style={styles.grabberPill} />
          </View>

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {active === 'expense' && '💵 極速記收支 / 轉帳'}
              {active === 'atm' && '🏧 ATM 存提款一鍵同步'}
              {active === 'scold' && '🛑 救命！我想亂買東西，罵醒我'}
              {active === 'reconcile' && '⚖️ 魔術平帳（與現實餘額對齊）'}
            </Text>
            <Pressable onPress={() => animateDismiss('down')} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕ 關閉</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            onScrollEndDrag={handleScrollEndDrag}
            scrollEventThrottle={16}
          >
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
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 7, 9, 0.80)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    backgroundColor: 'rgba(12, 17, 21, 0.96)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '88%',
    borderWidth: 0.8,
    borderTopColor: 'rgba(255, 255, 255, 0.22)',
    borderLeftColor: 'rgba(255, 255, 255, 0.13)',
    borderRightColor: 'rgba(52, 211, 153, 0.08)',
    borderBottomColor: 'rgba(52, 211, 153, 0.08)',
  },
  grabberRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginBottom: 4,
  },
  grabberPill: {
    width: 40,
    height: 4.5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  closeBtnText: {
    color: '#CBD5E1',
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
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 12,
    lineHeight: 18,
  },
  nlBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(8, 12, 15, 0.72)',
    borderRadius: 999,
    padding: 5,
    borderWidth: 0.8,
    borderTopColor: 'rgba(255, 255, 255, 0.22)',
    borderLeftColor: 'rgba(255, 255, 255, 0.13)',
    borderRightColor: 'rgba(52, 211, 153, 0.08)',
    borderBottomColor: 'rgba(52, 211, 153, 0.08)',
  },
  nlInput: {
    flex: 1,
    minWidth: 0,
    color: '#F8FAFC',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  nlBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  nlBtnText: {
    color: '#04120C',
    fontWeight: '700',
    fontSize: 12,
  },
  label: {
    color: 'rgba(148, 163, 184, 0.72)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  segmentActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(52, 211, 153, 0.42)',
  },
  segmentActiveGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(52, 211, 153, 0.42)',
  },
  segmentText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#34D399',
    fontWeight: '700',
  },
  chipBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  chipBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(52, 211, 153, 0.42)',
  },
  chipText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#34D399',
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
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  tagBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(52, 211, 153, 0.42)',
  },
  tagText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  tagTextActive: {
    color: '#34D399',
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
    backgroundColor: 'rgba(8, 12, 15, 0.72)',
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 0.8,
    borderTopColor: 'rgba(255, 255, 255, 0.22)',
    borderLeftColor: 'rgba(255, 255, 255, 0.13)',
    borderRightColor: 'rgba(52, 211, 153, 0.08)',
    borderBottomColor: 'rgba(52, 211, 153, 0.08)',
  },
  textInput: {
    minWidth: 0,
    backgroundColor: 'rgba(8, 12, 15, 0.72)',
    color: '#F8FAFC',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  feelingHint: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '500',
  },
  primaryBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    color: '#04120C',
    fontSize: 14,
    fontWeight: '800',
  },
  atmChip: {
    flex: 1,
    minWidth: '22%',
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  atmChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(52, 211, 153, 0.42)',
  },
  atmChipText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(8, 12, 15, 0.65)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  switchLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  scoldCard: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 0.8,
    borderTopColor: 'rgba(255, 255, 255, 0.22)',
    borderLeftColor: 'rgba(255, 255, 255, 0.13)',
    borderRightColor: 'rgba(52, 211, 153, 0.08)',
    borderBottomColor: 'rgba(52, 211, 153, 0.08)',
    backgroundColor: 'rgba(10, 15, 19, 0.78)',
    gap: 6,
  },
  scoldStop: {
    backgroundColor: 'rgba(244, 63, 94, 0.14)',
  },
  scoldThink: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
  },
  scoldOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
  },
  scoldHeadline: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  scoldLine: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 20,
  },
  scoldActions: {
    gap: 8,
    marginTop: 6,
  },
  resistBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  resistBtnText: {
    color: '#04120C',
    fontWeight: '800',
    fontSize: 13,
  },
  buyAnywayBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  buyAnywayText: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontWeight: '600',
    fontSize: 12,
  },
  deltaBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 0.8,
    borderColor: 'rgba(52, 211, 153, 0.32)',
  },
  deltaText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
