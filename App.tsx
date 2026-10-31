import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { ActionSheetModals, type ActiveModal } from './src/components/ActionSheetModals';
import { ScreenTransitionView, triggerHaptic } from './src/components/iosAnimations';
import { LiquidGlassCard } from './src/components/LiquidGlassView';
import { SafeConfirmButton } from './src/components/SafeConfirmButton';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DebtsScreen } from './src/screens/DebtsScreen';
import { SettingsAndSubsScreen } from './src/screens/SettingsAndSubsScreen';
import { ShortcutsTestBenchScreen } from './src/screens/ShortcutsTestBenchScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { LedgerProvider, useLedger } from './src/store/useLedger';

type TabKey = 'dashboard' | 'transactions' | 'debts' | 'testbench' | 'settings';

const TABS: ReadonlyArray<{ key: TabKey; glyph: string; label: string }> = [
  { key: 'dashboard', glyph: '◈', label: '總覽' },
  { key: 'transactions', glyph: '☰', label: '明細' },
  { key: 'debts', glyph: '🤝', label: '欠款' },
  { key: 'testbench', glyph: '⚡', label: '捷徑' },
  { key: 'settings', glyph: '⚙', label: '設定' },
];

// Hardware-accurate iPhone 16 Plus (6.7") Safe Area Insets:
// Top (Dynamic Island + Status Bar): 59pt | Bottom (Home Indicator): 34pt
const IPHONE_16_PLUS_TOP_INSET = 59;
const IPHONE_16_PLUS_BOTTOM_INSET = 34;

function useHardwareSafeInsets() {
  const rawInsets = useSafeAreaInsets();
  if (Platform.OS === 'web') {
    return {
      top: IPHONE_16_PLUS_TOP_INSET,
      bottom: IPHONE_16_PLUS_BOTTOM_INSET,
    };
  }
  return {
    top: Math.max(rawInsets.top, IPHONE_16_PLUS_TOP_INSET),
    bottom: Math.max(rawInsets.bottom, IPHONE_16_PLUS_BOTTOM_INSET),
  };
}

/**
 * 【一、底層暖調環境光畫布 (Ambient Canvas)】
 * - 主背景色：極深曜石暖黑 #080705
 * - 左上角：古銅琥珀色 #422B18 (380x380px, borderRadius: 999, opacity: 0.5)
 * - 右下角：深邃大漠金 #2E2318 (380x380px, borderRadius: 999, opacity: 0.55)
 * - 上方覆蓋全螢幕 BlurView (intensity={95}, tint="dark")，呈現溫潤暗金微光
 */
function AmbientLightCanvas() {
  const orb1Progress = useSharedValue(0);
  const orb2Progress = useSharedValue(0);

  useEffect(() => {
    orb1Progress.value = withRepeat(
      withTiming(1, { duration: 7800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    orb2Progress.value = withRepeat(
      withTiming(1, { duration: 9600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [orb1Progress, orb2Progress]);

  const orb1AnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: orb1Progress.value * 28 },
      { translateY: orb1Progress.value * 20 },
      { scale: 1 + orb1Progress.value * 0.16 },
    ],
  }));

  const orb2AnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -orb2Progress.value * 30 },
      { translateY: -orb2Progress.value * 24 },
      { scale: 1 + orb2Progress.value * 0.18 },
    ],
  }));

  return (
    <View style={styles.ambientCanvas} pointerEvents="none">
      {/* Top-Left: Bronze Warm Amber (#422B18) 380x380 Breathing Orb */}
      <Animated.View
        style={[
          styles.orbBronzeAmber,
          Platform.OS === 'web' ? styles.webOrbBlur : null,
          orb1AnimStyle,
        ]}
      >
        <View style={styles.orbBronzeAmberCore} />
      </Animated.View>

      {/* Bottom-Right: Deep Desert Titanium Gold (#2E2318) 380x380 Breathing Orb */}
      <Animated.View
        style={[
          styles.orbDesertGold,
          Platform.OS === 'web' ? styles.webOrbBlur : null,
          orb2AnimStyle,
        ]}
      >
        <View style={styles.orbDesertGoldCore} />
      </Animated.View>

      {/* Full-Screen Frosted Diffusion Layer (intensity={95}, tint="dark") */}
      <BlurView
        intensity={95}
        tint="dark"
        style={[
          StyleSheet.absoluteFill,
          Platform.OS === 'web' ? styles.webCanvasBlur : null,
        ]}
      />
    </View>
  );
}

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
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  const touchStartYRef = useRef<number | null>(null);
  const dropY = useSharedValue(-36);
  const scale = useSharedValue(0.84);
  const opacity = useSharedValue(0);

  useEffect(() => {
    dropY.value = -36;
    scale.value = 0.84;
    opacity.value = 0;
    dropY.value = withSpring(0, { damping: 15, stiffness: 230, mass: 0.75 });
    scale.value = withSpring(1, { damping: 14, stiffness: 240, mass: 0.75 });
    opacity.value = withTiming(1, { duration: 160 });
    triggerHaptic('light');
  }, [bannerKey, dropY, scale, opacity]);

  const animateOutAndDismiss = () => {
    triggerHaptic('selection');
    dropY.value = withTiming(-38, { duration: 150, easing: Easing.in(Easing.quad) });
    scale.value = withTiming(0.86, { duration: 150 });
    opacity.value = withTiming(0, { duration: 140 });
    setTimeout(onDismiss, 140);
  };

  // Only allow upward swipe (dy < -10) and ✕ button to dismiss, avoiding iOS left-edge back gesture conflict.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        onPauseChange?.(true);
        scale.value = withSpring(1.025, { damping: 16, stiffness: 300 });
      },
      onPanResponderMove: (_, g) => {
        dropY.value = g.dy < 0 ? g.dy : g.dy * 0.22;
      },
      onPanResponderRelease: (_, g) => {
        onPauseChange?.(false);
        if (g.dy < -10) {
          animateOutAndDismiss();
        } else {
          dropY.value = withSpring(0, { damping: 15, stiffness: 240 });
          scale.value = withSpring(1, { damping: 15, stiffness: 240 });
        }
      },
      onPanResponderTerminate: () => {
        onPauseChange?.(false);
        dropY.value = withSpring(0, { damping: 15, stiffness: 240 });
        scale.value = withSpring(1, { damping: 15, stiffness: 240 });
      },
    }),
  ).current;

  const bannerAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: dropY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[style, bannerAnimStyle]}
      {...panResponder.panHandlers}
      onTouchStart={(e) => {
        onPauseChange?.(true);
        scale.value = withSpring(1.022, { damping: 16, stiffness: 300 });
        touchStartYRef.current = e.nativeEvent.pageY;
      }}
      onTouchEnd={(e) => {
        onPauseChange?.(false);
        scale.value = withSpring(1, { damping: 15, stiffness: 260 });
        if (touchStartYRef.current === null) return;
        const dy = e.nativeEvent.pageY - touchStartYRef.current;
        touchStartYRef.current = null;
        if (dy < -10) {
          animateOutAndDismiss();
        }
      }}
      onTouchCancel={() => {
        onPauseChange?.(false);
        scale.value = withSpring(1, { damping: 15, stiffness: 260 });
        touchStartYRef.current = null;
      }}
    >
      {children}
    </Animated.View>
  );
}

function MainShell() {
  const { lastUndoableTx, lastToast, clearToast, clearUndo, setBannerPaused, softDeleteTx } = useLedger();
  const safeInsets = useHardwareSafeInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [presetCategory, setPresetCategory] = useState<string>('超商');
  const [navShrunk, setNavShrunk] = useState(false);
  const [tabLayouts, setTabLayouts] = useState<Partial<Record<TabKey, { x: number; width: number }>>>({});

  const shrinkProgress = useSharedValue(0);
  const pillX = useSharedValue(6);
  const pillW = useSharedValue(68);
  const activeIconBounce = useSharedValue(1);
  const pageDragX = useSharedValue(0);

  const activeTabRef = useRef<TabKey>(activeTab);
  activeTabRef.current = activeTab;
  const activeModalRef = useRef<ActiveModal>(activeModal);
  activeModalRef.current = activeModal;
  const tabLayoutsRef = useRef(tabLayouts);
  tabLayoutsRef.current = tabLayouts;

  useEffect(() => {
    shrinkProgress.value = withSpring(navShrunk ? 1 : 0, {
      damping: 20,
      stiffness: 220,
    });
  }, [navShrunk, shrinkProgress]);

  const syncPillToActiveTab = useCallback(
    (tab: TabKey) => {
      const layout = tabLayoutsRef.current[tab];
      if (layout && layout.width > 0) {
        pillX.value = withSpring(layout.x, { damping: 18, stiffness: 250, mass: 0.72 });
        pillW.value = withSpring(layout.width, { damping: 18, stiffness: 250, mass: 0.72 });
      }
    },
    [pillX, pillW],
  );

  useEffect(() => {
    const layout = tabLayouts[activeTab];
    if (layout && layout.width > 0) {
      pillX.value = withSpring(layout.x, {
        damping: 18,
        stiffness: 250,
        mass: 0.72,
      });
      pillW.value = withSpring(layout.width, {
        damping: 18,
        stiffness: 250,
        mass: 0.72,
      });
    }
  }, [activeTab, tabLayouts, pillX, pillW]);

  const handleSelectTab = useCallback(
    (tab: TabKey) => {
      if (tab !== activeTabRef.current) {
        triggerHaptic('selection');
        activeIconBounce.value = withSequence(
          withTiming(0.82, { duration: 65 }),
          withSpring(1.16, { damping: 10, stiffness: 320 }),
          withSpring(1, { damping: 14, stiffness: 260 }),
        );
      }
      setNavShrunk(false);
      setActiveTab(tab);
    },
    [activeIconBounce],
  );

  const handleSelectTabRef = useRef(handleSelectTab);
  handleSelectTabRef.current = handleSelectTab;

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
    hapticFired: false,
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
      const hasAdjacentTab = targetIndex >= 0 && targetIndex < TABS.length;

      pageDragX.value = hasAdjacentTab ? dx * 0.82 : dx * 0.2;

      if (!swipeStateRef.current.hapticFired && hasAdjacentTab && Math.abs(dx) > 44) {
        swipeStateRef.current.hapticFired = true;
        triggerHaptic('light');
      }

      const curLayout = tabLayoutsRef.current[TABS[curIndex].key];
      if (curLayout && hasAdjacentTab) {
        const nextLayout = tabLayoutsRef.current[TABS[targetIndex].key];
        if (nextLayout) {
          const progress = Math.min(Math.abs(dx) / 180, 1) * 0.72;
          pillX.value = curLayout.x + (nextLayout.x - curLayout.x) * progress;
          pillW.value = curLayout.width + (nextLayout.width - curLayout.width) * progress;
        }
      } else if (curLayout && !hasAdjacentTab) {
        pillX.value = curLayout.x + (dx > 0 ? -1 : 1) * Math.min(Math.abs(dx) * 0.08, 6);
      }
    },
    [pageDragX, pillX, pillW],
  );

  const applyPageDragRef = useRef(applyPageDrag);
  applyPageDragRef.current = applyPageDrag;

  const springBackPageDrag = useCallback(() => {
    pageDragX.value = withSpring(0, { damping: 20, stiffness: 280, mass: 0.7 });
    syncPillToActiveTab(activeTabRef.current);
  }, [pageDragX, syncPillToActiveTab]);

  const springBackPageDragRef = useRef(springBackPageDrag);
  springBackPageDragRef.current = springBackPageDrag;

  const finishPageDrag = useCallback((dx: number, vx: number) => {
    if (swipeStateRef.current.lock !== 'horizontal') {
      swipeStateRef.current.lock = 'undecided';
      swipeStateRef.current.touchActive = false;
      swipeStateRef.current.hapticFired = false;
      return;
    }
    swipeStateRef.current.lock = 'undecided';
    swipeStateRef.current.touchActive = false;
    swipeStateRef.current.hapticFired = false;

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
    springBackPageDragRef.current();
  }, []);

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
        if (evaluateSwipeLock(g.dx, g.dy) === 'horizontal') {
          applyPageDragRef.current(g.dx);
        }
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

  const handlePageTouchStart = useCallback((e: GestureResponderEvent) => {
    if (activeModalRef.current !== 'none') return;
    const pageX = e.nativeEvent.pageX;
    const pageY = e.nativeEvent.pageY;
    swipeStateRef.current.startX = pageX;
    swipeStateRef.current.startY = pageY;
    swipeStateRef.current.lastX = pageX;
    swipeStateRef.current.lastDx = 0;
    swipeStateRef.current.lastTime = Date.now();
    swipeStateRef.current.vx = 0;
    swipeStateRef.current.lock = 'undecided';
    swipeStateRef.current.touchActive = true;
    swipeStateRef.current.hapticFired = false;
  }, []);

  const handlePageTouchMove = useCallback((e: GestureResponderEvent) => {
    if (!swipeStateRef.current.touchActive || activeModalRef.current !== 'none') return;
    const now = Date.now();
    const pageX = e.nativeEvent.pageX;
    const pageY = e.nativeEvent.pageY;
    const dt = now - swipeStateRef.current.lastTime;
    if (dt > 0) {
      swipeStateRef.current.vx = (pageX - swipeStateRef.current.lastX) / dt;
      swipeStateRef.current.lastX = pageX;
      swipeStateRef.current.lastTime = now;
    }
    const dx = pageX - swipeStateRef.current.startX;
    const dy = pageY - swipeStateRef.current.startY;
    if (evaluateSwipeLock(dx, dy) === 'horizontal') {
      applyPageDragRef.current(dx);
    }
  }, []);

  const handlePageTouchEnd = useCallback((e: GestureResponderEvent) => {
    if (!swipeStateRef.current.touchActive) return;
    const dx = e.nativeEvent.pageX - swipeStateRef.current.startX;
    const vx = swipeStateRef.current.vx;
    finishPageDragRef.current(dx, vx);
  }, []);

  const handlePageTouchCancel = useCallback(() => {
    swipeStateRef.current.touchActive = false;
    if (swipeStateRef.current.responderActive) {
      return;
    }
    if (swipeStateRef.current.lock === 'horizontal') {
      finishPageDragRef.current(swipeStateRef.current.lastDx, swipeStateRef.current.vx);
    } else {
      swipeStateRef.current.lock = 'undecided';
    }
  }, []);

  const floatingBarAnimStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: 1 - shrinkProgress.value * 0.14 }],
      opacity: 1 - shrinkProgress.value * 0.1,
    };
  });

  const slidingPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
  }));

  const activeGlyphBounceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: activeIconBounce.value }],
  }));

  // Inject iOS-accurate CSS resets when running inside the PC Web Simulator
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleEl = document.createElement('style');
    styleEl.id = 'ios-simulator-reset';
    styleEl.textContent = `
      html, body, #root {
        margin: 0;
        padding: 0;
        height: 100%;
        background-color: #040302;
        overflow: hidden;
        user-select: none;
        -webkit-font-smoothing: antialiased;
      }
      input, textarea {
        min-width: 0 !important;
        width: 100%;
        box-sizing: border-box !important;
        outline: none !important;
      }
      *::-webkit-scrollbar {
        width: 0px !important;
        height: 0px !important;
        display: none !important;
      }
      * {
        scrollbar-width: none !important;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(styleEl);
    return () => {
      styleEl.remove();
    };
  }, []);

  // Total height of Sticky Header (59pt safe top + 46pt brand bar = 105pt)
  const headerTotalHeight = safeInsets.top + 46;
  // Space reserved at bottom for Floating Bar + Home Indicator (34pt + 66pt = 100pt)
  const bottomTotalPad = safeInsets.bottom + 68;

  const content = (
    <View style={styles.rootViewport}>
      {/* Layer 1: Desert Titanium & Warm Amber Ambient Canvas */}
      <AmbientLightCanvas />

      <View style={styles.safeArea}>
        <StatusBar style="light" />

        {/* Main Screen Content (Scrolls over the Ambient Light Canvas, supports left/right swipe page switching) */}
        <View
          style={styles.screenBody}
          {...pagePanResponder.panHandlers}
          onTouchStart={handlePageTouchStart}
          onTouchMove={handlePageTouchMove}
          onTouchEnd={handlePageTouchEnd}
          onTouchCancel={handlePageTouchCancel}
        >
          <ScreenTransitionView
            tabKey={activeTab}
            tabIndex={TABS.findIndex((t) => t.key === activeTab)}
            dragOffsetX={pageDragX}
            style={styles.screenBody}
          >
            {activeTab === 'dashboard' && (
              <DashboardScreen
                topInsetPadding={headerTotalHeight + 10}
                bottomInsetPadding={bottomTotalPad + 16}
                onOpenModal={(m, cat) => {
                  if (cat) setPresetCategory(cat);
                  setActiveModal(m);
                }}
                onNavigateTab={(t) => handleSelectTab(t)}
                onScrollShrinkChange={(shrunk) => setNavShrunk(shrunk)}
              />
            )}
            {activeTab === 'transactions' && (
              <View
                style={[
                  styles.subScreenPad,
                  {
                    paddingTop: headerTotalHeight + 6,
                    paddingBottom: bottomTotalPad,
                  },
                ]}
              >
                <TransactionsScreen />
              </View>
            )}
            {activeTab === 'debts' && (
              <View
                style={[
                  styles.subScreenPad,
                  {
                    paddingTop: headerTotalHeight + 6,
                    paddingBottom: bottomTotalPad,
                  },
                ]}
              >
                <DebtsScreen />
              </View>
            )}
            {activeTab === 'testbench' && (
              <View
                style={[
                  styles.subScreenPad,
                  {
                    paddingTop: headerTotalHeight + 6,
                    paddingBottom: bottomTotalPad,
                  },
                ]}
              >
                <ShortcutsTestBenchScreen />
              </View>
            )}
            {activeTab === 'settings' && (
              <View
                style={[
                  styles.subScreenPad,
                  {
                    paddingTop: headerTotalHeight + 6,
                    paddingBottom: bottomTotalPad,
                  },
                ]}
              >
                <SettingsAndSubsScreen />
              </View>
            )}
          </ScreenTransitionView>
        </View>

        {/* ====================================================================
            STICKY FROSTED BLUR HEADER (浮動毛玻璃頂部列 — 自動避開動態島 59pt)
           ==================================================================== */}
        <View style={styles.stickyHeaderContainer} pointerEvents="box-none">
          <View
            style={[
              styles.stickyHeaderBlurWrap,
              { paddingTop: safeInsets.top + 6 },
              Platform.OS === 'web' ? styles.webStickyBackdrop : null,
            ]}
          >
            <BlurView
              tint="systemChromeMaterialDark"
              intensity={75}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.brandRow}>
              <View style={styles.brandLeft}>
                <View style={styles.brandEmblem}>
                  <Image
                    source={require('./assets/icon.png')}
                    style={{ width: 26, height: 26 }}
                  />
                </View>
                <Text style={styles.brandTitle}>靠北我錢呢</Text>
                <Text style={styles.brandSubEn}>ImbrokeAF</Text>
              </View>
              <View style={styles.iosBadge}>
                <Text style={styles.iosBadgeText}>Obsidian Jade · iOS 26</Text>
              </View>
            </View>
          </View>

          {/* Unified Liquid Glass Notification & Undo Banner (Auto-hides in 4.5s/8s, pauses on hold, swipe up or tap ✕ to dismiss) */}
          {lastToast || lastUndoableTx ? (
            <DismissibleBanner
              bannerKey={`${lastToast ?? ''}_${lastUndoableTx?.id ?? ''}`}
              style={styles.toastWrap}
              onPauseChange={setBannerPaused}
              onDismiss={() => {
                clearToast();
                clearUndo();
              }}
            >
              <LiquidGlassCard
                shape="pill"
                elevated
                intensity={65}
                contentStyle={styles.toastInner}
              >
                <Pressable
                  style={styles.undoTextWrap}
                  onPress={() => {
                    clearToast();
                    clearUndo();
                  }}
                >
                  <Text style={styles.toastText} numberOfLines={2}>
                    {lastToast ??
                      `剛剛新增 ${lastUndoableTx?.merchant || lastUndoableTx?.category || '交易'} $${Math.abs(
                        lastUndoableTx?.amount ?? 0,
                      )}`}
                  </Text>
                </Pressable>
                {lastUndoableTx ? (
                  <SafeConfirmButton
                    label="撤銷上筆"
                    confirmLabel="再點確認"
                    onConfirm={() => softDeleteTx(lastUndoableTx.id)}
                    compact
                  />
                ) : null}
                <Pressable
                  onPress={() => {
                    clearToast();
                    clearUndo();
                  }}
                  hitSlop={12}
                  style={styles.undoDismissBtn}
                >
                  <Text style={styles.toastDismiss}>✕</Text>
                </Pressable>
              </LiquidGlassCard>
            </DismissibleBanner>
          ) : null}
        </View>

        {/* ====================================================================
            SHRINKING FLOATING LIQUID GLASS BAR (自動避開底部 Home 條 34pt)
           ==================================================================== */}
        <View
          style={[
            styles.floatingBarOuter,
            { bottom: safeInsets.bottom - 6 },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[styles.floatingBarAnimWrap, floatingBarAnimStyle]}
            {...pagePanResponder.panHandlers}
            onTouchStart={handlePageTouchStart}
            onTouchMove={handlePageTouchMove}
            onTouchEnd={handlePageTouchEnd}
            onTouchCancel={handlePageTouchCancel}
          >
            <LiquidGlassCard
              shape="pill"
              elevated
              intensity={65}
              contentStyle={[
                styles.floatingBarInner,
                navShrunk && styles.floatingBarInnerShrunk,
              ]}
            >
              {/* Fluid Sliding Amber Indicator Pill */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.fluidSlidingPill,
                  navShrunk && styles.fluidSlidingPillShrunk,
                  slidingPillStyle,
                ]}
              />

              {TABS.map((tab) => {
                const isFocused = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onLayout={(e) => {
                      const { x, width } = e.nativeEvent.layout;
                      setTabLayouts((prev) => {
                        const cur = prev[tab.key];
                        if (cur && Math.abs(cur.x - x) < 0.5 && Math.abs(cur.width - width) < 0.5) {
                          return prev;
                        }
                        return { ...prev, [tab.key]: { x, width } };
                      });
                    }}
                    style={[
                      styles.tabPillItem,
                      navShrunk && styles.tabPillItemShrunk,
                      !tabLayouts[activeTab] && isFocused && styles.tabPillItemActive,
                    ]}
                    onPress={() => handleSelectTab(tab.key)}
                  >
                    <Animated.View style={isFocused ? activeGlyphBounceStyle : undefined}>
                      <Text
                        style={[
                          styles.tabGlyph,
                          isFocused && styles.tabGlyphActive,
                        ]}
                      >
                        {tab.glyph}
                      </Text>
                    </Animated.View>
                    {!navShrunk && (
                      <Text
                        style={[
                          styles.tabLabel,
                          isFocused && styles.tabLabelActive,
                        ]}
                      >
                        {tab.label}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </LiquidGlassCard>
          </Animated.View>
        </View>

        {/* Bottom Action Sheet Modals */}
        <ActionSheetModals
          active={activeModal}
          presetCategory={presetCategory}
          onClose={() => setActiveModal('none')}
        />
      </View>
    </View>
  );

  // On Windows PC Web Browser: True-to-Hardware iPhone 16 Plus (430x932 pt) Simulator!
  // Crucially, the Status Bar + Dynamic Island (top 59pt) and Home Indicator (bottom 34pt)
  // are overlaid INSIDE the viewport with position: 'absolute', matching real iOS 1:1!
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webDesktopBackdrop}>
        <View style={styles.iphone16PlusFrame}>
          {/* Inner 430x932 Viewport */}
          <View style={styles.iphoneInnerScreen}>
            {content}

            {/* Overlay 1: Real iPhone 16 Plus Top 59pt Status Bar + Dynamic Island */}
            <View style={styles.statusBarOverlay} pointerEvents="none">
              <View style={styles.statusBarLeft}>
                <Text style={styles.statusBarTime}>4:04</Text>
                <Text style={styles.statusBarMuteIcon}>🔕</Text>
              </View>
              <View style={styles.dynamicIsland} />
              <View style={styles.statusBarRight}>
                <Text style={styles.statusBarSignal}>▂▄▆█</Text>
                <Text style={styles.statusBarWifi}>◔</Text>
                <View style={styles.batteryPill}>
                  <Text style={styles.batteryText}>54</Text>
                </View>
              </View>
            </View>

            {/* Overlay 2: Real iPhone 16 Plus Bottom 34pt Home Indicator Bar */}
            <View style={styles.homeIndicatorOverlay} pointerEvents="none">
              <View style={styles.homeIndicatorPill} />
            </View>
          </View>
        </View>
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

const styles = StyleSheet.create({
  rootViewport: {
    flex: 1,
    backgroundColor: '#06090B',
    position: 'relative',
  },
  ambientCanvas: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#06090B',
    overflow: 'hidden',
  },
  orbBronzeAmber: {
    position: 'absolute',
    top: -50,
    left: -75,
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: '#0B2E24',
    opacity: 0.48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbBronzeAmberCore: {
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#10B981',
    opacity: 0.34,
  },
  orbDesertGold: {
    position: 'absolute',
    bottom: -40,
    right: -80,
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: '#0F1A24',
    opacity: 0.52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbDesertGoldCore: {
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#1E293B',
    opacity: 0.45,
  },
  webOrbBlur: {
    filter: 'blur(64px)',
    // @ts-expect-error web CSS filter for ambient light orbs
    WebkitFilter: 'blur(64px)',
  },
  webCanvasBlur: {
    // @ts-expect-error web CSS backdropFilter for full-screen BlurView(intensity=95)
    backdropFilter: 'blur(76px)',
    WebkitBackdropFilter: 'blur(76px)',
  },
  webDesktopBackdrop: {
    flex: 1,
    backgroundColor: '#030507',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  iphone16PlusFrame: {
    width: 430,
    height: 932,
    maxHeight: '98%',
    backgroundColor: '#06090B',
    borderRadius: 52,
    borderWidth: 8,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
  },
  iphoneInnerScreen: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  // Overlaid inside the top 59pt of the viewport — 1:1 with real iPhone 16 Plus!
  statusBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: IPHONE_16_PLUS_TOP_INSET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
    paddingTop: 14,
    zIndex: 999,
  },
  statusBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    width: 82,
  },
  statusBarTime: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  statusBarMuteIcon: {
    fontSize: 12,
  },
  dynamicIsland: {
    width: 122,
    height: 35,
    borderRadius: 999,
    backgroundColor: '#000000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  statusBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    width: 82,
  },
  statusBarSignal: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBarWifi: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  batteryPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  batteryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  // Overlaid inside the bottom 34pt of the viewport — 1:1 with real iPhone 16 Plus!
  homeIndicatorOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    height: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  homeIndicatorPill: {
    width: 138,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  screenBody: {
    flex: 1,
    minHeight: 0,
  },
  subScreenPad: {
    flex: 1,
  },
  stickyHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  stickyHeaderBlurWrap: {
    paddingHorizontal: 16,
    paddingBottom: 11,
    backgroundColor: 'rgba(8, 12, 15, 0.62)',
    borderBottomWidth: 0.8,
    borderBottomColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
  },
  webStickyBackdrop: {
    // @ts-expect-error web CSS backdrop filter
    backdropFilter: 'blur(28px) saturate(165%)',
    WebkitBackdropFilter: 'blur(28px) saturate(165%)',
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandEmblem: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#0B1217',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandSubEn: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 1,
  },
  iosBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 0.8,
    borderColor: 'rgba(52, 211, 153, 0.32)',
  },
  iosBadgeText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700',
  },
  toastWrap: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  toastInner: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toastText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  toastDismiss: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 12,
    fontWeight: '700',
  },
  undoWrap: {
    marginHorizontal: 16,
    marginTop: 6,
  },
  undoInner: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  undoTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  undoLabel: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 11,
  },
  undoTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  undoDismissBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  floatingBarOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  floatingBarAnimWrap: {
    alignItems: 'center',
  },
  floatingBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 4,
    position: 'relative',
  },
  floatingBarInnerShrunk: {
    paddingHorizontal: 5,
    paddingVertical: 4,
    gap: 3,
  },
  fluidSlidingPill: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 0.8,
    borderColor: 'rgba(52, 211, 153, 0.38)',
  },
  fluidSlidingPillShrunk: {
    top: 4,
    bottom: 4,
  },
  tabPillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 4,
    zIndex: 2,
  },
  tabPillItemShrunk: {
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  tabPillItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderWidth: 0.8,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  tabGlyph: {
    color: 'rgba(148, 163, 184, 0.68)',
    fontSize: 14,
    fontWeight: '600',
  },
  tabGlyphActive: {
    color: '#34D399',
  },
  tabLabel: {
    color: 'rgba(148, 163, 184, 0.68)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  tabLabelActive: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
});
