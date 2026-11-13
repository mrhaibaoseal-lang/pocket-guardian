import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type GestureResponderEvent,
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
import { tabular, type, usePalette, useThemedStyles, type Palette } from '../theme';
import { triggerHaptic } from './iosAnimations';
import { AmountField, Field } from './ui/Field';
import { Chip, FormRow } from './ui/FormRow';
import { Icon } from './ui/Icon';
import { Button, Row, Section } from './ui/List';
import { Segmented } from './ui/Segmented';
import { categoryVisual } from './ui/txVisual';

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
  const c = usePalette();
  const s = useThemedStyles(makeStyles);

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
    const sentence = quickSentence.trim();
    const numMatch = sentence.match(/(\d+(?:\.\d+)?)/);
    if (!numMatch) return;
    const amt = Number(numMatch[1]);
    const isCard = /(刷卡|金融卡|玉山|Apple\s*Pay)/i.test(sentence);
    const isTransfer = /(轉帳)/.test(sentence);
    const detectedMethod: Exclude<PayMethod, 'atm' | 'other'> = isTransfer
      ? 'bank_transfer'
      : isCard
        ? 'debit_card'
        : 'cash';
    const cleanName = sentence
      .replace(numMatch[0], '')
      .replace(/(現金|刷卡|金融卡|轉帳|買|花了|元|\$)/g, '')
      .trim();
    addQuickExpense(amt, detectedMethod, cleanName || '快速記帳', cleanName || '快速記帳');
    setQuickSentence('');
    animateDismiss('down');
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
    animateDismiss('down');
  };

  const handleAtmSubmit = () => {
    const amt = Number(atmAmountStr);
    if (!Number.isFinite(amt) || amt <= 0) return;
    addAtmTransfer(atmDir, amt, atmHasFee ? 5 : 0);
    animateDismiss('down');
  };

  const handleReconcileSubmit = () => {
    const actual = Number(recActualStr);
    if (!Number.isFinite(actual) || actual < 0) return;
    reconcileAccount(recAccount, actual, recAffectsBudget);
    setRecActualStr('');
    animateDismiss('down');
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
  const [renderedActive, setRenderedActive] = useState<ActiveModal>(active);
  const sheetY = useSharedValue(380);
  const sheetScale = useSharedValue(0.96);
  const sheetOpacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);
  const grabberScaleX = useSharedValue(1);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Only enable internal ScrollView scrolling when content genuinely exceeds 68% of screen height.
  // For all 4 sheets on iPhone 16 Pro / Plus, content fits comfortably, so keeping scrollEnabled=false
  // prevents native UIScrollView from cancelling vertical sheet drag touches!
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const maxBodyHeight = Math.round(Dimensions.get('window').height * 0.68);
  const isScrollable = scrollContentHeight > maxBodyHeight;
  const isScrollableRef = useRef(false);
  isScrollableRef.current = isScrollable;
  const scrollOffsetYRef = useRef(0);
  const maxScrollYRef = useRef(0);

  const dragStateRef = useRef({
    startX: 0,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    vy: 0,
    lastDy: 0,
    active: false,
    touchActive: false,
    startedInHeader: false,
    hapticFired: false,
  });

  useEffect(() => {
    if (active !== 'none') {
      setRenderedActive(active);
      isClosingRef.current = false;
      scrollOffsetYRef.current = 0;
      maxScrollYRef.current = 0;
      setScrollContentHeight(0);
      dragStateRef.current.active = false;
      dragStateRef.current.touchActive = false;
      dragStateRef.current.startedInHeader = false;
      dragStateRef.current.hapticFired = false;
      dragStateRef.current.vy = 0;

      backdropOpacity.value = 0;
      sheetY.value = 360;
      sheetScale.value = 0.96;
      sheetOpacity.value = 1;
      grabberScaleX.value = 1;

      const raf = requestAnimationFrame(() => {
        backdropOpacity.value = withTiming(1, { duration: 190, easing: Easing.out(Easing.quad) });
        sheetY.value = withSpring(0, { damping: 30, stiffness: 300, mass: 1 });
        sheetScale.value = withSpring(1, { damping: 20, stiffness: 240, mass: 0.78 });
      });
      return () => cancelAnimationFrame(raf);
    } else if (!isClosingRef.current) {
      setRenderedActive('none');
    }
  }, [active, backdropOpacity, grabberScaleX, sheetOpacity, sheetScale, sheetY]);

  const springBackSheet = useCallback(() => {
    sheetY.value = withSpring(0, { damping: 28, stiffness: 320, mass: 1 });
    sheetScale.value = withSpring(1, { damping: 17, stiffness: 270, mass: 0.72 });
    sheetOpacity.value = withTiming(1, { duration: 150 });
    backdropOpacity.value = withTiming(1, { duration: 150 });
    grabberScaleX.value = withSpring(1, { damping: 16, stiffness: 260 });
  }, [backdropOpacity, grabberScaleX, sheetOpacity, sheetScale, sheetY]);

  const animateDismiss = useCallback(
    (direction: 'up' | 'down' = 'down') => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      dragStateRef.current.active = false;
      dragStateRef.current.touchActive = false;
      Keyboard.dismiss();
      triggerHaptic('selection');
      const targetY = direction === 'up' ? -640 : 640;
      sheetY.value = withTiming(targetY, {
        duration: 240,
        easing: Easing.in(Easing.quad),
      });
      sheetScale.value = withTiming(0.94, { duration: 210 });
      sheetOpacity.value = withTiming(0, { duration: 195 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
      grabberScaleX.value = withTiming(1, { duration: 150 });
      setTimeout(() => {
        setRenderedActive('none');
        onCloseRef.current();
        isClosingRef.current = false;
      }, 215);
    },
    [backdropOpacity, grabberScaleX, sheetOpacity, sheetScale, sheetY],
  );

  const animateDismissRef = useRef(animateDismiss);
  animateDismissRef.current = animateDismiss;
  const springBackRef = useRef(springBackSheet);
  springBackRef.current = springBackSheet;

  const applySheetDrag = useCallback(
    (dy: number) => {
      if (isClosingRef.current) return;
      dragStateRef.current.active = true;
      dragStateRef.current.lastDy = dy;
      if (!dragStateRef.current.hapticFired && Math.abs(dy) > 8) {
        dragStateRef.current.hapticFired = true;
        Keyboard.dismiss();
        triggerHaptic('light');
      }
      sheetY.value = dy;
      const progress = Math.min(Math.abs(dy) / 300, 1);
      sheetScale.value = 1;
      backdropOpacity.value = 1 - progress * 0.65;
      grabberScaleX.value = 1 + Math.min(Math.abs(dy) / 220, 0.15);
    },
    [backdropOpacity, grabberScaleX, sheetOpacity, sheetScale, sheetY],
  );

  const applySheetDragRef = useRef(applySheetDrag);
  applySheetDragRef.current = applySheetDrag;

  const finishSheetDrag = useCallback((dy: number, vy: number) => {
    if (isClosingRef.current) return;
    const wasActive = dragStateRef.current.active;
    dragStateRef.current.active = false;
    dragStateRef.current.hapticFired = false;
    if (!wasActive && Math.abs(dy) < 8) return;

    if (dy > 26 || (dy > 10 && vy > 0.25)) {
      animateDismissRef.current('down');
    } else if (dy < -28 || (dy < -10 && vy < -0.28)) {
      animateDismissRef.current('up');
    } else {
      springBackRef.current();
    }
  }, []);

  const finishSheetDragRef = useRef(finishSheetDrag);
  finishSheetDragRef.current = finishSheetDrag;

  const canDragSheetWithDelta = (dx: number, dy: number) => {
    if (Math.abs(dy) < 4 || Math.abs(dy) <= Math.abs(dx) * 1.05) return false;
    if (!isScrollableRef.current || dragStateRef.current.startedInHeader) return true;
    if (dy > 0 && scrollOffsetYRef.current <= 2) return true;
    if (dy < 0 && scrollOffsetYRef.current >= maxScrollYRef.current - 2) return true;
    return false;
  };

  const sheetPanResponder = useRef(
    PanResponder.create({
      // Initialize PanResponder touch history on every touchStart without blocking child Pressables
      onStartShouldSetPanResponderCapture: () => false,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => canDragSheetWithDelta(g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) => canDragSheetWithDelta(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStateRef.current.lastDy = 0;
      },
      onPanResponderMove: (_, g) => {
        if (canDragSheetWithDelta(g.dx, g.dy) || dragStateRef.current.active) {
          applySheetDragRef.current(g.dy);
        }
      },
      onPanResponderRelease: (_, g) => {
        finishSheetDragRef.current(g.dy, g.vy);
      },
      onPanResponderTerminate: () => {
        if (!dragStateRef.current.touchActive && !isClosingRef.current) {
          dragStateRef.current.active = false;
          springBackRef.current();
        }
      },
    }),
  ).current;

  const headerTouchTimeRef = useRef(0);

  // Direct hardware touch handlers on the sheet container ensure 100% real-time finger tracking
  // on iOS even if touch started inside a child input or native view.
  const handleSheetTouchStart = useCallback((e: GestureResponderEvent, inHeader = false) => {
    if (isClosingRef.current) return;
    const now = Date.now();
    if (inHeader) {
      headerTouchTimeRef.current = now;
    }
    const isFromHeader = inHeader || now - headerTouchTimeRef.current < 50;
    const pageY = e.nativeEvent.pageY;
    dragStateRef.current.startX = e.nativeEvent.pageX;
    dragStateRef.current.startY = pageY;
    dragStateRef.current.lastY = pageY;
    dragStateRef.current.lastTime = now;
    dragStateRef.current.vy = 0;
    dragStateRef.current.lastDy = 0;
    dragStateRef.current.active = false;
    dragStateRef.current.touchActive = true;
    dragStateRef.current.startedInHeader = isFromHeader;
    dragStateRef.current.hapticFired = false;
  }, []);

  const handleSheetTouchMove = useCallback((e: GestureResponderEvent) => {
    if (!dragStateRef.current.touchActive || isClosingRef.current) return;
    const now = Date.now();
    const pageY = e.nativeEvent.pageY;
    const dt = now - dragStateRef.current.lastTime;
    if (dt > 0) {
      dragStateRef.current.vy = (pageY - dragStateRef.current.lastY) / dt;
      dragStateRef.current.lastY = pageY;
      dragStateRef.current.lastTime = now;
    }
    const dx = e.nativeEvent.pageX - dragStateRef.current.startX;
    const dy = pageY - dragStateRef.current.startY;
    if (dragStateRef.current.active || canDragSheetWithDelta(dx, dy)) {
      applySheetDragRef.current(dy);
    }
  }, []);

  const handleSheetTouchEnd = useCallback((e: GestureResponderEvent) => {
    if (!dragStateRef.current.touchActive) return;
    dragStateRef.current.touchActive = false;
    const dy = e.nativeEvent.pageY - dragStateRef.current.startY;
    const vy = dragStateRef.current.vy;
    if (dragStateRef.current.active) {
      finishSheetDragRef.current(dy, vy);
    }
  }, []);

  const handleSheetTouchCancel = useCallback(() => {
    dragStateRef.current.touchActive = false;
    if (dragStateRef.current.active && !isClosingRef.current) {
      dragStateRef.current.active = false;
      springBackRef.current();
    }
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      scrollOffsetYRef.current = contentOffset.y;
      const maxScroll = Math.max(0, contentSize.height - layoutMeasurement.height);
      maxScrollYRef.current = maxScroll;
      if (contentOffset.y < 0) {
        applySheetDragRef.current(-contentOffset.y * 1.15);
      } else if (contentOffset.y > maxScroll) {
        applySheetDragRef.current(-(contentOffset.y - maxScroll) * 1.15);
      }
    },
    [],
  );

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement, velocity } = e.nativeEvent;
      const maxScroll = Math.max(0, contentSize.height - layoutMeasurement.height);
      if (contentOffset.y < -28 || (contentOffset.y <= 0 && (velocity?.y ?? 0) < -0.45)) {
        animateDismissRef.current('down');
      } else if (
        contentOffset.y - maxScroll > 28 ||
        (contentOffset.y >= maxScroll && (velocity?.y ?? 0) > 0.45)
      ) {
        animateDismissRef.current('up');
      } else if (dragStateRef.current.active) {
        dragStateRef.current.active = false;
        springBackRef.current();
      }
    },
    [],
  );

  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    setScrollContentHeight(h);
  }, []);

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetAnimStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
    transform: [{ translateY: sheetY.value }],
  }));

  const grabberAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: grabberScaleX.value }],
  }));

  if (renderedActive === 'none' && active === 'none') {
    return null;
  }

  const currentModal = renderedActive !== 'none' ? renderedActive : active;

  const SHEET_TITLES: Record<Exclude<ActiveModal, 'none'>, string> = {
    expense: entryMode === 'income' ? '記收入' : '記一筆',
    atm: 'ATM 存提款',
    scold: '罵醒我',
    reconcile: '校正餘額',
  };

  const doneAction: (() => void) | null =
    currentModal === 'expense'
      ? handleExpenseSubmit
      : currentModal === 'atm'
      ? handleAtmSubmit
      : currentModal === 'reconcile'
      ? handleReconcileSubmit
      : null;

  const doneEnabled =
    currentModal === 'expense'
      ? Number(amountStr) > 0
      : currentModal === 'atm'
      ? Number(atmAmountStr) > 0
      : currentModal === 'reconcile'
      ? recActualStr.trim() !== '' && Number(recActualStr) >= 0
      : false;

  const atmAmount = Number(atmAmountStr) || 0;
  const switchColors = { true: c.accent, false: c.fillStrong };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
      <Animated.View style={[StyleSheet.absoluteFill, s.scrim, backdropAnimStyle]} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => animateDismiss('down')} />
      <Animated.View
        style={[s.sheet, sheetAnimStyle]}
        {...sheetPanResponder.panHandlers}
        onTouchStart={(e) => handleSheetTouchStart(e, false)}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
        onTouchCancel={handleSheetTouchCancel}
      >
        {/* Grabber + nav bar: dragging here always moves the sheet */}
        <View onTouchStart={(e) => handleSheetTouchStart(e, true)}>
          <View style={s.grabberRow}>
            <Animated.View style={[s.grabber, grabberAnimStyle]} />
          </View>
          <View style={s.navBar}>
            <Pressable onPress={() => animateDismiss('down')} hitSlop={10} style={s.navSide}>
              <Text style={s.navCancel}>取消</Text>
            </Pressable>
            <Text style={s.navTitle} numberOfLines={1}>
              {currentModal !== 'none' ? SHEET_TITLES[currentModal] : ''}
            </Text>
            <View style={[s.navSide, { alignItems: 'flex-end' }]}>
              {doneAction ? (
                <Pressable onPress={doneAction} disabled={!doneEnabled} hitSlop={10}>
                  <Text style={[s.navDone, !doneEnabled && { color: c.tertiaryLabel }]}>完成</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <ScrollView
          style={s.body}
          contentContainerStyle={s.bodyContent}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={isScrollable}
          bounces={isScrollable}
          alwaysBounceVertical={isScrollable}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
          onScrollEndDrag={handleScrollEndDrag}
          scrollEventThrottle={16}
        >
          {/* ---------------- 1. expense / income ---------------- */}
          {currentModal === 'expense' && (
            <>
              <View style={s.padded}>
                <Segmented
                  options={[
                    { value: 'expense', label: '支出' },
                    { value: 'income', label: '收入' },
                  ]}
                  value={entryMode}
                  onChange={setEntryMode}
                />
              </View>

              <AmountField
                value={amountStr}
                onChangeText={setAmountStr}
                autoFocus={Platform.OS !== 'web'}
                color={entryMode === 'income' ? c.positive : undefined}
              />
              <Text style={s.hint}>
                {Number(amountStr) >= 200
                  ? `等於工作 ${feelings.hours} 小時，或 ${feelings.bentos} 個便當`
                  : ' '}
              </Text>

              {entryMode === 'expense' ? (
                <>
                  <Section header="付款方式">
                    <View style={s.cellPad}>
                      <Segmented
                        options={[
                          { value: 'cash', label: '現金' },
                          { value: 'debit_card', label: '金融卡' },
                          { value: 'bank_transfer', label: '轉帳' },
                        ]}
                        value={payMethod as 'cash' | 'debit_card' | 'bank_transfer'}
                        onChange={setPayMethod}
                      />
                    </View>
                  </Section>
                  <Section header="分類">
                    <View style={s.categoryGrid}>
                      {CATEGORIES.map((cat) => {
                        const v = categoryVisual(cat, c);
                        const selected = category === cat;
                        return (
                          <Pressable
                            key={cat}
                            onPress={() => {
                              triggerHaptic('selection');
                              setCategory(cat);
                            }}
                            style={[s.categoryCell, selected && { backgroundColor: c.fill }]}
                          >
                            <View style={[s.categoryDot, { backgroundColor: selected ? v.color : c.fill }]}>
                              <Icon name={v.icon} size={15} color={selected ? '#FFFFFF' : v.color} weight="semibold" />
                            </View>
                            <Text style={[s.categoryLabel, selected && { fontWeight: '600' }]} numberOfLines={1}>
                              {cat}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Section>
                </>
              ) : (
                <Section header="存入">
                  <View style={s.cellPad}>
                    <Segmented
                      options={[
                        { value: 'bank', label: '玉山銀行' },
                        { value: 'cash', label: '現金' },
                      ]}
                      value={incomeAccount}
                      onChange={setIncomeAccount}
                    />
                  </View>
                </Section>
              )}

              <Section>
                <FormRow
                  label="備註"
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder={entryMode === 'income' ? '薪水、還錢' : '7-ELEVEN、便當'}
                  returnKeyType="done"
                  onSubmitEditing={handleExpenseSubmit}
                />
              </Section>

              {entryMode === 'expense' ? (
                <Section header="一句話記帳" footer="例如「現金買鹽酥雞 135」或「刷卡咖啡 65」。">
                  <View style={[s.cellPad, s.inlineRow]}>
                    <Field
                      style={{ flex: 1 }}
                      value={quickSentence}
                      onChangeText={setQuickSentence}
                      placeholder="現金買鹽酥雞 135"
                      returnKeyType="done"
                      onSubmitEditing={parseSentenceAndSubmit}
                    />
                    <Button title="記" size="medium" onPress={parseSentenceAndSubmit} disabled={!/\d/.test(quickSentence)} />
                  </View>
                </Section>
              ) : null}
            </>
          )}

          {/* ---------------- 2. ATM ---------------- */}
          {currentModal === 'atm' && (
            <>
              <View style={s.padded}>
                <Segmented
                  options={[
                    { value: 'withdraw', label: '提款' },
                    { value: 'deposit', label: '存款' },
                  ]}
                  value={atmDir}
                  onChange={setAtmDir}
                />
              </View>
              <AmountField value={atmAmountStr} onChangeText={setAtmAmountStr} />
              <View style={s.chipRow}>
                {ATM_AMOUNTS.map((amt) => (
                  <Chip
                    key={amt}
                    label={`$${amt.toLocaleString()}`}
                    selected={atmAmountStr === String(amt)}
                    onPress={() => setAtmAmountStr(String(amt))}
                  />
                ))}
              </View>
              <Section footer="存提款只是在帳戶間移動，不算花費；只有手續費會記成支出。">
                <Row
                  title="跨行手續費 $5"
                  trailing={<Switch value={atmHasFee} onValueChange={setAtmHasFee} trackColor={switchColors} />}
                />
                <Row
                  title={atmDir === 'withdraw' ? '玉山' : '現金'}
                  value={`−$${(atmAmount + (atmDir === 'withdraw' && atmHasFee ? 5 : 0)).toLocaleString()}`}
                />
                <Row
                  title={atmDir === 'withdraw' ? '現金' : '玉山'}
                  value={`+$${atmAmount.toLocaleString()}`}
                  valueStyle={{ color: c.positive }}
                />
              </Section>
            </>
          )}

          {/* ---------------- 3. scold me ---------------- */}
          {currentModal === 'scold' && (
            <>
              <View style={s.padded}>
                <Segmented
                  options={[
                    { value: 'friend', label: '損友' },
                    { value: 'data', label: '數據' },
                    { value: 'mom', label: '老媽' },
                  ]}
                  value={scoldMode}
                  onChange={setScoldMode}
                />
              </View>
              <Section>
                <FormRow label="想買" value={scoldItem} onChangeText={setScoldItem} placeholder="新耳機" />
                <FormRow
                  label="價格"
                  value={scoldPriceStr}
                  onChangeText={setScoldPriceStr}
                  keyboardType="numeric"
                  placeholder="$0"
                />
              </Section>

              {scoldOutput ? (
                <View style={s.verdictCard}>
                  <View style={s.verdictHead}>
                    <Icon
                      name={scoldOutput.verdict === 'ok' ? 'check' : 'warning'}
                      size={18}
                      color={
                        scoldOutput.verdict === 'stop'
                          ? c.negative
                          : scoldOutput.verdict === 'think'
                          ? c.warning
                          : c.positive
                      }
                      weight="semibold"
                    />
                    <Text style={s.verdictTitle}>{scoldOutput.headline}</Text>
                  </View>
                  {scoldOutput.lines.map((line, idx) => (
                    <Text key={idx} style={s.verdictLine}>
                      {line}
                    </Text>
                  ))}
                </View>
              ) : null}

              {scoldPrice > 0 ? (
                <View style={s.decision}>
                  <Button
                    title={`忍住不買，存下 $${scoldPrice.toLocaleString()}`}
                    onPress={() => {
                      recordResistedImpulse(scoldItem || '衝動商品', scoldPrice);
                      setScoldItem('');
                      setScoldPriceStr('');
                      animateDismiss('down');
                    }}
                  />
                  <Button
                    title="還是要買，記一筆"
                    variant="plain"
                    onPress={() => {
                      addQuickExpense(scoldPrice, 'debit_card', '娛樂', scoldItem || '衝動購物');
                      setScoldItem('');
                      setScoldPriceStr('');
                      animateDismiss('down');
                    }}
                  />
                </View>
              ) : null}
            </>
          )}

          {/* ---------------- 4. reconcile ---------------- */}
          {currentModal === 'reconcile' && (
            <>
              <View style={s.padded}>
                <Segmented
                  options={[
                    { value: 'cash', label: '現金' },
                    { value: 'bank', label: '玉山銀行' },
                  ]}
                  value={recAccount}
                  onChange={setRecAccount}
                />
              </View>
              <Text style={s.hint}>現在實際有多少？</Text>
              <AmountField value={recActualStr} onChangeText={setRecActualStr} placeholder={String(Math.round(currentAccountBal))} />
              <Section footer="差額會自動補一筆校正紀錄。">
                <Row title="帳面餘額" value={`$${Math.round(currentAccountBal).toLocaleString()}`} />
                <Row
                  title="差額"
                  value={
                    recActualStr.trim() === ''
                      ? '—'
                      : `${recDelta >= 0 ? '+' : '−'}$${Math.abs(recDelta).toLocaleString()}`
                  }
                  valueStyle={recDelta > 0 ? { color: c.positive } : recDelta < 0 ? { color: c.negative } : undefined}
                />
                {recDelta < 0 ? (
                  <Row
                    title="算進本月預算"
                    trailing={
                      <Switch value={recAffectsBudget} onValueChange={setRecAffectsBudget} trackColor={switchColors} />
                    }
                  />
                ) : null}
              </Section>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => ({
  backdrop: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'flex-end' as const,
  },
  scrim: { backgroundColor: c.scrim },
  sheet: {
    width: '100%' as const,
    maxWidth: 430,
    alignSelf: 'center' as const,
    backgroundColor: c.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous' as const,
    paddingBottom: 24,
    maxHeight: '92%' as const,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
  },
  grabberRow: { alignItems: 'center' as const, paddingTop: 6, paddingBottom: 2 },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: c.tertiaryLabel },
  navBar: {
    height: 48,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
  },
  navSide: { width: 72 },
  navCancel: { ...type.body, color: c.positive },
  navTitle: { ...type.headline, color: c.label, flex: 1, textAlign: 'center' as const },
  navDone: { ...type.body, color: c.positive, fontWeight: '600' as const },
  body: { flexGrow: 0 },
  bodyContent: { paddingTop: 8, paddingBottom: 12 },
  padded: { paddingHorizontal: 16, marginBottom: 8 },
  cellPad: { paddingHorizontal: 12, paddingVertical: 10 },
  inlineRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  hint: {
    ...type.footnote,
    color: c.secondaryLabel,
    textAlign: 'center' as const,
    marginBottom: 20,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 4,
    marginBottom: 24,
  },
  categoryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    padding: 6,
  },
  categoryCell: {
    width: '20%' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  categoryDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  categoryLabel: { ...type.caption1, color: c.label },
  verdictCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    borderRadius: 20,
    borderCurve: 'continuous' as const,
    backgroundColor: c.card,
    gap: 6,
  },
  verdictHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 2 },
  verdictTitle: { ...type.headline, color: c.label, flex: 1 },
  verdictLine: { ...type.subheadline, ...tabular, color: c.secondaryLabel },
  decision: { paddingHorizontal: 16, gap: 4 },
});
