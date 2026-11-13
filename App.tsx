import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheetModals, type ActiveModal } from './src/components/ActionSheetModals';
import { triggerHaptic } from './src/components/iosAnimations';
import { SafeConfirmButton } from './src/components/SafeConfirmButton';
import { Icon, type IconName } from './src/components/ui/Icon';
import { PushedPage } from './src/components/ui/PushedPage';
import { stripEmoji } from './src/components/ui/txVisual';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DebtsScreen } from './src/screens/DebtsScreen';
import { SettingsAndSubsScreen } from './src/screens/SettingsAndSubsScreen';
import { ShortcutsTestBenchScreen } from './src/screens/ShortcutsTestBenchScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { LedgerProvider, useLedger } from './src/store/useLedger';
import { type, usePalette, useThemedStyles, type Palette } from './src/theme';

export type TabKey = 'dashboard' | 'transactions' | 'debts' | 'settings';

const TABS: ReadonlyArray<{ key: TabKey; icon: IconName; label: string }> = [
  { key: 'dashboard', icon: 'overview', label: '總覽' },
  { key: 'transactions', icon: 'list', label: '明細' },
  { key: 'debts', icon: 'people', label: '欠款' },
  { key: 'settings', icon: 'settings', label: '設定' },
];

const TAB_BAR_HEIGHT = 62;

/** Web dev preview has no real safe area; emulate an iPhone 16 Pro. */
function useInsets() {
  const raw = useSafeAreaInsets();
  if (Platform.OS === 'web') return { top: 54, bottom: 34 };
  return { top: Math.max(raw.top, 20), bottom: Math.max(raw.bottom, 16) };
}

/* ------------------------------------------------------------------ */
/* Notification banner (swipe up or tap ✕ to dismiss)                  */
/* ------------------------------------------------------------------ */

function DismissibleBanner({
  bannerKey,
  onDismiss,
  onPauseChange,
  style,
  children,
}: {
  bannerKey?: string;
  onDismiss: () => void;
  onPauseChange?: (paused: boolean) => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const touchStartYRef = useRef<number | null>(null);
  const dropY = useSharedValue(-24);
  const opacity = useSharedValue(0);

  useEffect(() => {
    dropY.value = -24;
    opacity.value = 0;
    dropY.value = withSpring(0, { damping: 24, stiffness: 320 });
    opacity.value = withTiming(1, { duration: 180 });
    triggerHaptic('light');
  }, [bannerKey, dropY, opacity]);

  const animateOutAndDismiss = () => {
    dropY.value = withTiming(-60, { duration: 200, easing: Easing.in(Easing.quad) });
    opacity.value = withTiming(0, { duration: 180 });
    setTimeout(onDismiss, 190);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => onPauseChange?.(true),
      onPanResponderMove: (_, g) => {
        dropY.value = g.dy < 0 ? g.dy : g.dy * 0.2;
      },
      onPanResponderRelease: (_, g) => {
        onPauseChange?.(false);
        if (g.dy < -10) animateOutAndDismiss();
        else dropY.value = withSpring(0, { damping: 24, stiffness: 320 });
      },
      onPanResponderTerminate: () => {
        onPauseChange?.(false);
        dropY.value = withSpring(0, { damping: 24, stiffness: 320 });
      },
    }),
  ).current;

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: dropY.value }],
  }));

  return (
    <Animated.View
      style={[style, animStyle]}
      {...panResponder.panHandlers}
      onTouchStart={(e) => {
        onPauseChange?.(true);
        touchStartYRef.current = e.nativeEvent.pageY;
      }}
      onTouchEnd={(e) => {
        onPauseChange?.(false);
        if (touchStartYRef.current === null) return;
        const dy = e.nativeEvent.pageY - touchStartYRef.current;
        touchStartYRef.current = null;
        if (dy < -10) animateOutAndDismiss();
      }}
      onTouchCancel={() => {
        onPauseChange?.(false);
        touchStartYRef.current = null;
      }}
    >
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Main shell                                                          */
/* ------------------------------------------------------------------ */

function MainShell() {
  const { lastUndoableTx, lastToast, clearToast, clearUndo, setBannerPaused, softDeleteTx, syncFromCloud } = useLedger();
  const c = usePalette();
  const s = useThemedStyles(makeStyles);
  const insets = useInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [presetCategory, setPresetCategory] = useState<string>('超商');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tabLayouts, setTabLayouts] = useState<Partial<Record<TabKey, { x: number; width: number }>>>({});
  const [pageWidth, setPageWidth] = useState<number>(() => {
    if (Platform.OS === 'web') return 393;
    const w = Dimensions.get('window').width;
    return w > 0 ? w : 393;
  });

  const pagerScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const pageWidthRef = useRef(pageWidth);
  pageWidthRef.current = pageWidth;
  const isProgrammaticScrollRef = useRef(false);
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pillX = useSharedValue(4);
  const pillW = useSharedValue(80);

  const activeTabRef = useRef<TabKey>(activeTab);
  activeTabRef.current = activeTab;
  const activeModalRef = useRef<ActiveModal>(activeModal);
  activeModalRef.current = activeModal;
  const tabLayoutsRef = useRef(tabLayouts);
  tabLayoutsRef.current = tabLayouts;

  const pillSpring = { damping: 26, stiffness: 340, mass: 0.8 };

  const syncPillToActiveTab = useCallback(
    (tab: TabKey) => {
      const layout = tabLayoutsRef.current[tab];
      if (layout && layout.width > 0) {
        pillX.value = withSpring(layout.x, pillSpring);
        pillW.value = withSpring(layout.width, pillSpring);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pillX, pillW],
  );

  useEffect(() => {
    syncPillToActiveTab(activeTab);
  }, [activeTab, tabLayouts, syncPillToActiveTab]);

  const handleSelectTab = useCallback((tab: TabKey, fromPagerSwipe = false) => {
    const targetIndex = TABS.findIndex((t) => t.key === tab);
    if (tab !== activeTabRef.current) triggerHaptic('selection');
    activeTabRef.current = tab;
    setActiveTab(tab);

    if (!fromPagerSwipe && targetIndex >= 0 && pageWidthRef.current > 0) {
      isProgrammaticScrollRef.current = true;
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
      programmaticTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 380);
      pagerScrollRef.current?.scrollTo({ x: targetIndex * pageWidthRef.current, animated: true });
    }
  }, []);

  const handleSelectTabRef = useRef(handleSelectTab);
  handleSelectTabRef.current = handleSelectTab;

  // Deep links from iOS Home Screen / Lock Screen widgets (myledger://...)
  const handleDeepLink = useCallback(
    (rawUrl: string | null) => {
      if (!rawUrl || !rawUrl.toLowerCase().startsWith('myledger://')) return;
      syncFromCloud().catch(() => undefined);
      try {
        const withoutScheme = rawUrl.replace(/^myledger:\/\//i, '');
        const [pathPart, queryPart = ''] = withoutScheme.split('?');
        const action = pathPart.replace(/^\/+|\/+$/g, '').toLowerCase();
        if (queryPart) {
          const catMatch = queryPart.match(/(?:^|&)category=([^&]+)/i);
          if (catMatch && catMatch[1]) setPresetCategory(decodeURIComponent(catMatch[1]));
        }
        const openOnDashboard = (m: ActiveModal) => {
          handleSelectTabRef.current('dashboard');
          setActiveModal(m);
        };
        if (action === 'expense' || action === 'cash' || action === 'quick-add') openOnDashboard('expense');
        else if (action === 'atm') openOnDashboard('atm');
        else if (action === 'scold') openOnDashboard('scold');
        else if (action === 'reconcile') openOnDashboard('reconcile');
        else if (action === 'debts' || action === 'transactions' || action === 'settings' || action === 'dashboard') {
          setActiveModal('none');
          handleSelectTabRef.current(action);
        } else if (action === 'testbench' || action === 'shortcuts') {
          setActiveModal('none');
          handleSelectTabRef.current('settings');
          setShortcutsOpen(true);
        }
      } catch {
        // Ignore malformed deep link URLs
      }
    },
    [syncFromCloud],
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleDeepLink(url);
      })
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', (event) => handleDeepLink(event.url));
    return () => sub.remove();
  }, [handleDeepLink]);

  /* ---------------- swipe across the tab bar (and pages on web) ---------------- */

  const swipeStateRef = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastDx: 0,
    lastTime: 0,
    vx: 0,
    lock: 'undecided' as 'undecided' | 'horizontal' | 'vertical',
    touchActive: false,
    responderActive: false,
  });

  const evaluateSwipeLock = (dx: number, dy: number): 'undecided' | 'horizontal' | 'vertical' => {
    if (activeModalRef.current !== 'none') return 'vertical';
    if (swipeStateRef.current.lock !== 'undecided') return swipeStateRef.current.lock;
    if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx) * 0.85) {
      swipeStateRef.current.lock = 'vertical';
      return 'vertical';
    }
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      swipeStateRef.current.lock = 'horizontal';
      return 'horizontal';
    }
    return 'undecided';
  };

  const applyPageDrag = useCallback(
    (dx: number) => {
      if (activeModalRef.current !== 'none') return;
      swipeStateRef.current.lastDx = dx;
      const curIndex = TABS.findIndex((t) => t.key === activeTabRef.current);
      const targetIndex = dx < 0 ? curIndex + 1 : curIndex - 1;
      const curLayout = tabLayoutsRef.current[TABS[curIndex].key];
      if (curLayout && targetIndex >= 0 && targetIndex < TABS.length) {
        const nextLayout = tabLayoutsRef.current[TABS[targetIndex].key];
        if (nextLayout) {
          const progress = Math.min(Math.abs(dx) / 180, 1) * 0.6;
          pillX.value = curLayout.x + (nextLayout.x - curLayout.x) * progress;
          pillW.value = curLayout.width + (nextLayout.width - curLayout.width) * progress;
        }
      }
    },
    [pillX, pillW],
  );
  const applyPageDragRef = useRef(applyPageDrag);
  applyPageDragRef.current = applyPageDrag;

  const finishPageDrag = useCallback(
    (dx: number, vx: number) => {
      const wasHorizontal = swipeStateRef.current.lock === 'horizontal';
      swipeStateRef.current.lock = 'undecided';
      swipeStateRef.current.touchActive = false;
      if (!wasHorizontal) return;
      const curIndex = TABS.findIndex((t) => t.key === activeTabRef.current);
      if ((dx < -44 || (dx < -16 && vx < -0.25)) && curIndex < TABS.length - 1) {
        Keyboard.dismiss();
        handleSelectTabRef.current(TABS[curIndex + 1].key);
        return;
      }
      if ((dx > 44 || (dx > 16 && vx > 0.25)) && curIndex > 0) {
        Keyboard.dismiss();
        handleSelectTabRef.current(TABS[curIndex - 1].key);
        return;
      }
      syncPillToActiveTab(activeTabRef.current);
    },
    [syncPillToActiveTab],
  );
  const finishPageDragRef = useRef(finishPageDrag);
  finishPageDragRef.current = finishPageDrag;

  const pagePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) => evaluateSwipeLock(g.dx, g.dy) === 'horizontal',
      onMoveShouldSetPanResponderCapture: (_, g) => evaluateSwipeLock(g.dx, g.dy) === 'horizontal',
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        swipeStateRef.current.responderActive = true;
      },
      onPanResponderMove: (_, g) => {
        if (evaluateSwipeLock(g.dx, g.dy) === 'horizontal') applyPageDragRef.current(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        swipeStateRef.current.responderActive = false;
        finishPageDragRef.current(g.dx, g.vx);
      },
      onPanResponderTerminate: () => {
        swipeStateRef.current.responderActive = false;
        if (!swipeStateRef.current.touchActive) {
          finishPageDragRef.current(swipeStateRef.current.lastDx, swipeStateRef.current.vx);
        }
      },
    }),
  ).current;

  const handleBarTouchStart = useCallback((e: GestureResponderEvent) => {
    if (activeModalRef.current !== 'none') return;
    const { pageX, pageY } = e.nativeEvent;
    Object.assign(swipeStateRef.current, {
      startX: pageX,
      startY: pageY,
      lastX: pageX,
      lastDx: 0,
      lastTime: Date.now(),
      vx: 0,
      lock: 'undecided',
      touchActive: true,
    });
  }, []);

  const handleBarTouchMove = useCallback((e: GestureResponderEvent) => {
    if (!swipeStateRef.current.touchActive || activeModalRef.current !== 'none') return;
    const now = Date.now();
    const { pageX, pageY } = e.nativeEvent;
    const dt = now - swipeStateRef.current.lastTime;
    if (dt > 0) {
      swipeStateRef.current.vx = (pageX - swipeStateRef.current.lastX) / dt;
      swipeStateRef.current.lastX = pageX;
      swipeStateRef.current.lastTime = now;
    }
    const dx = pageX - swipeStateRef.current.startX;
    const dy = pageY - swipeStateRef.current.startY;
    if (evaluateSwipeLock(dx, dy) === 'horizontal') applyPageDragRef.current(dx);
  }, []);

  const handleBarTouchEnd = useCallback((e: GestureResponderEvent) => {
    if (!swipeStateRef.current.touchActive) return;
    finishPageDragRef.current(e.nativeEvent.pageX - swipeStateRef.current.startX, swipeStateRef.current.vx);
  }, []);

  const handleBarTouchCancel = useCallback(() => {
    swipeStateRef.current.touchActive = false;
    if (swipeStateRef.current.responderActive) return;
    if (swipeStateRef.current.lock === 'horizontal') {
      finishPageDragRef.current(swipeStateRef.current.lastDx, swipeStateRef.current.vx);
    } else {
      swipeStateRef.current.lock = 'undecided';
    }
  }, []);

  /* ---------------- native horizontal pager ---------------- */

  const handlePagerScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const w = pageWidthRef.current;
      if (w <= 0 || isProgrammaticScrollRef.current) return;
      const rawProgress = e.nativeEvent.contentOffset.x / w;
      const clamped = Math.max(0, Math.min(TABS.length - 1, rawProgress));
      const leftIdx = Math.floor(clamped);
      const rightIdx = Math.min(TABS.length - 1, leftIdx + 1);
      const frac = clamped - leftIdx;
      const leftLayout = tabLayoutsRef.current[TABS[leftIdx].key];
      const rightLayout = tabLayoutsRef.current[TABS[rightIdx].key];
      if (leftLayout && rightLayout) {
        pillX.value = leftLayout.x + (rightLayout.x - leftLayout.x) * frac;
        pillW.value = leftLayout.width + (rightLayout.width - leftLayout.width) * frac;
      }
      const nearestIdx = Math.max(0, Math.min(TABS.length - 1, Math.round(rawProgress)));
      const nearestTab = TABS[nearestIdx].key;
      if (nearestTab !== activeTabRef.current) {
        Keyboard.dismiss();
        handleSelectTabRef.current(nearestTab, true);
      }
    },
    [pillX, pillW],
  );

  const handlePagerMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isProgrammaticScrollRef.current = false;
      const w = pageWidthRef.current;
      if (w <= 0) return;
      const idx = Math.max(0, Math.min(TABS.length - 1, Math.round(e.nativeEvent.contentOffset.x / w)));
      const targetTab = TABS[idx].key;
      if (targetTab !== activeTabRef.current) {
        Keyboard.dismiss();
        handleSelectTabRef.current(targetTab, true);
      } else {
        syncPillToActiveTab(targetTab);
      }
    },
    [syncPillToActiveTab],
  );

  const slidingPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
  }));

  // Web dev preview: reset page chrome and hide scrollbars.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleEl = document.createElement('style');
    styleEl.id = 'ios-simulator-reset';
    styleEl.textContent = `
      html, body, #root { margin: 0; padding: 0; height: 100%; overflow: hidden; -webkit-font-smoothing: antialiased;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang TC", "Noto Sans TC", system-ui, sans-serif; }
      input, textarea { min-width: 0 !important; width: 100%; box-sizing: border-box !important; outline: none !important; }
      *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      * { scrollbar-width: none !important; box-sizing: border-box; }
    `;
    document.head.appendChild(styleEl);
    return () => styleEl.remove();
  }, []);

  const topInset = insets.top;
  const bottomInset = insets.bottom + TAB_BAR_HEIGHT + 12;
  const screenInsets = { topInsetPadding: topInset, bottomInsetPadding: bottomInset + 12 };
  const bannerVisible = Boolean(lastToast || lastUndoableTx);
  const bannerIsError = Boolean(lastToast?.startsWith('⚠️'));

  const content = (
    <View style={s.root}>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />

      <View
        style={s.flex}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && Math.abs(w - pageWidthRef.current) > 1) {
            pageWidthRef.current = w;
            setPageWidth(w);
            const curIdx = TABS.findIndex((t) => t.key === activeTabRef.current);
            if (curIdx > 0) pagerScrollRef.current?.scrollTo({ x: curIdx * w, animated: false });
          }
        }}
        {...(Platform.OS === 'web' ? pagePanResponder.panHandlers : {})}
      >
        <ScrollView
          ref={pagerScrollRef}
          horizontal
          pagingEnabled
          directionalLockEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={activeModal === 'none' && !shortcutsOpen}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            isProgrammaticScrollRef.current = false;
          }}
          onScroll={handlePagerScroll}
          onMomentumScrollEnd={handlePagerMomentumEnd}
          onScrollEndDrag={(e) => {
            const vx = e.nativeEvent.velocity?.x ?? 0;
            if (Math.abs(vx) < 0.05) handlePagerMomentumEnd(e);
          }}
          style={s.flex}
          contentContainerStyle={{ width: pageWidth * TABS.length }}
        >
          <View style={{ width: pageWidth, flex: 1 }}>
            <DashboardScreen
              {...screenInsets}
              onOpenModal={(m, cat) => {
                if (cat) setPresetCategory(cat);
                setActiveModal(m);
              }}
              onNavigateTab={(t) => handleSelectTab(t)}
            />
          </View>
          <View style={{ width: pageWidth, flex: 1 }}>
            <TransactionsScreen {...screenInsets} />
          </View>
          <View style={{ width: pageWidth, flex: 1 }}>
            <DebtsScreen {...screenInsets} />
          </View>
          <View style={{ width: pageWidth, flex: 1 }}>
            <SettingsAndSubsScreen {...screenInsets} onOpenShortcuts={() => setShortcutsOpen(true)} />
          </View>
        </ScrollView>

        {shortcutsOpen ? (
          <PushedPage
            title="捷徑與自動化"
            backLabel="設定"
            topInset={topInset}
            onBack={() => setShortcutsOpen(false)}
          >
            <ShortcutsTestBenchScreen bottomInsetPadding={bottomInset} />
          </PushedPage>
        ) : null}
      </View>

      {/* Top notification banner */}
      {bannerVisible ? (
        <DismissibleBanner
          bannerKey={`${lastToast ?? ''}_${lastUndoableTx?.id ?? ''}`}
          style={[s.bannerWrap, { top: topInset + 4 }]}
          onPauseChange={setBannerPaused}
          onDismiss={() => {
            clearToast();
            clearUndo();
          }}
        >
          <View style={s.banner}>
            <BlurView tint={c.scheme === 'dark' ? 'systemMaterialDark' : 'systemMaterialLight'} intensity={90} style={s.absFill} />
            <View style={[s.bannerIcon, { backgroundColor: bannerIsError ? c.negative : lastUndoableTx ? c.accent : c.gray }]}>
              <Icon name={bannerIsError ? 'warning' : lastUndoableTx ? 'check' : 'bell'} size={14} color="#FFFFFF" weight="bold" />
            </View>
            <Pressable
              style={s.flex}
              onPress={() => {
                clearToast();
                clearUndo();
              }}
            >
              <Text style={s.bannerText} numberOfLines={2}>
                {lastToast ? stripEmoji(lastToast) :
                  `已新增 ${lastUndoableTx?.merchant || lastUndoableTx?.category || '交易'} $${Math.abs(
                    lastUndoableTx?.amount ?? 0,
                  ).toLocaleString()}`}
              </Text>
            </Pressable>
            {lastUndoableTx ? (
              <SafeConfirmButton
                label="撤銷"
                confirmLabel="確認撤銷"
                onConfirm={() => softDeleteTx(lastUndoableTx.id)}
                compact
              />
            ) : null}
          </View>
        </DismissibleBanner>
      ) : null}

      {/* iOS 26-style floating tab bar */}
      <View style={[s.tabBarOuter, { bottom: Math.max(insets.bottom - 8, 8) }]} pointerEvents="box-none">
        <View
          style={s.tabBar}
          {...pagePanResponder.panHandlers}
          onTouchStart={handleBarTouchStart}
          onTouchMove={handleBarTouchMove}
          onTouchEnd={handleBarTouchEnd}
          onTouchCancel={handleBarTouchCancel}
        >
          <BlurView
            tint={c.scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
            intensity={90}
            style={s.absFill}
          />
          <Animated.View pointerEvents="none" style={[s.tabPill, slidingPillStyle]} />
          {TABS.map((tab) => {
            const focused = activeTab === tab.key;
            const tint = focused ? c.positive : c.label;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  setTabLayouts((prev) => {
                    const cur = prev[tab.key];
                    if (cur && Math.abs(cur.x - x) < 0.5 && Math.abs(cur.width - width) < 0.5) return prev;
                    return { ...prev, [tab.key]: { x, width } };
                  });
                }}
                style={s.tabItem}
                onPress={() => {
                  if (tab.key === 'settings' && activeTab === 'settings' && shortcutsOpen) {
                    setShortcutsOpen(false);
                  }
                  handleSelectTab(tab.key);
                }}
              >
                <Icon name={tab.icon} size={22} color={tint} weight={focused ? 'semibold' : 'regular'} />
                <Text style={[s.tabLabel, { color: tint }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ActionSheetModals active={activeModal} presetCategory={presetCategory} onClose={() => setActiveModal('none')} />
    </View>
  );

  if (Platform.OS === 'web') {
    // Desktop browser: center a 393-pt phone-width column; no fake hardware chrome.
    return (
      <View style={s.webBackdrop}>
        <View style={s.webColumn}>{content}</View>
      </View>
    );
  }
  return content;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LedgerProvider>
        <MainShell />
      </LedgerProvider>
    </SafeAreaProvider>
  );
}

const makeStyles = (c: Palette) => ({
  root: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  absFill: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  webBackdrop: { flex: 1, backgroundColor: c.scheme === 'dark' ? '#111' : '#E5E5EA', alignItems: 'center' as const },
  webColumn: { flex: 1, width: '100%' as const, maxWidth: 430, overflow: 'hidden' as const },
  bannerWrap: { position: 'absolute' as const, left: 10, right: 10, zIndex: 50 },
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 24,
    borderCurve: 'continuous' as const,
    overflow: 'hidden' as const,
    backgroundColor: c.chrome,
    shadowColor: '#000',
    shadowOpacity: c.scheme === 'dark' ? 0.5 : 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  bannerIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  bannerText: { ...type.subheadline, color: c.label, fontWeight: '500' as const },
  tabBarOuter: { position: 'absolute' as const, left: 0, right: 0, paddingHorizontal: 20, alignItems: 'center' as const, zIndex: 40 },
  tabBar: {
    width: '100%' as const,
    maxWidth: 380,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    borderCurve: 'continuous' as const,
    overflow: 'hidden' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 4,
    backgroundColor: c.chrome,
    borderWidth: 0.5,
    borderColor: c.separator,
    shadowColor: '#000',
    shadowOpacity: c.scheme === 'dark' ? 0.4 : 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  tabPill: {
    position: 'absolute' as const,
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: (TAB_BAR_HEIGHT - 8) / 2,
    backgroundColor: c.fill,
  },
  tabItem: {
    flex: 1,
    height: '100%' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 2,
  },
  tabLabel: { fontSize: 10, lineHeight: 12, fontWeight: '600' as const },
});
