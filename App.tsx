import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ActionSheetModals, type ActiveModal } from './src/components/ActionSheetModals';
import { AppSymbol, type AppIconName } from './src/components/AppSymbol';
import { ScreenTransitionView, triggerHaptic } from './src/components/iosAnimations';
import { LiquidGlassCard, LiquidGlassGroup } from './src/components/LiquidGlassView';
import { SafeConfirmButton } from './src/components/SafeConfirmButton';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DebtsScreen } from './src/screens/DebtsScreen';
import { SettingsAndSubsScreen } from './src/screens/SettingsAndSubsScreen';
import { ShortcutsTestBenchScreen } from './src/screens/ShortcutsTestBenchScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { LedgerProvider, useLedger } from './src/store/useLedger';
import { theme } from './src/theme/tokens';

type TabKey = 'dashboard' | 'transactions' | 'debts' | 'testbench' | 'settings';

const TABS: ReadonlyArray<{ key: TabKey; icon: AppIconName; label: string }> = [
  { key: 'dashboard', icon: 'chart.bar', label: '總覽' },
  { key: 'transactions', icon: 'list.bullet', label: '明細' },
  { key: 'debts', icon: 'arrow.left.arrow.right', label: '欠款' },
  { key: 'testbench', icon: 'bolt', label: '捷徑' },
  { key: 'settings', icon: 'slider.horizontal.3', label: '設定' },
];

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
 * Cold Charcoal (#0B0C0F) Ambient Canvas with 3 large, low-saturation,
 * low-opacity (0.11~0.16) radial light fields rendered via `react-native-svg`
 * RadialGradient for 60fps refraction behind native Liquid Glass.
 */
function AmbientLightCanvas() {
  return (
    <View style={styles.ambientCanvas} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 430 932"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient id="orb1" cx="22%" cy="16%" rx="62%" ry="38%">
            <Stop offset="0%" stopColor={theme.colors.ambientOrbs.orbPrimary} stopOpacity="0.16" />
            <Stop offset="55%" stopColor={theme.colors.ambientOrbs.orbPrimary} stopOpacity="0.06" />
            <Stop offset="100%" stopColor={theme.colors.background.base} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="orb2" cx="82%" cy="48%" rx="58%" ry="36%">
            <Stop offset="0%" stopColor={theme.colors.ambientOrbs.orbSecondary} stopOpacity="0.14" />
            <Stop offset="60%" stopColor={theme.colors.ambientOrbs.orbSecondary} stopOpacity="0.05" />
            <Stop offset="100%" stopColor={theme.colors.background.base} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="orb3" cx="35%" cy="86%" rx="64%" ry="36%">
            <Stop offset="0%" stopColor={theme.colors.ambientOrbs.orbTertiary} stopOpacity="0.12" />
            <Stop offset="60%" stopColor={theme.colors.ambientOrbs.orbTertiary} stopOpacity="0.04" />
            <Stop offset="100%" stopColor={theme.colors.background.base} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="430" height="932" fill={theme.colors.background.base} />
        <Rect x="0" y="0" width="430" height="932" fill="url(#orb1)" />
        <Rect x="0" y="0" width="430" height="932" fill="url(#orb2)" />
        <Rect x="0" y="0" width="430" height="932" fill="url(#orb3)" />
      </Svg>
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

  useEffect(() => {
    shrinkProgress.value = withSpring(navShrunk ? 1 : 0, theme.motion.springRestrained);
  }, [navShrunk, shrinkProgress]);

  useEffect(() => {
    const layout = tabLayouts[activeTab];
    if (layout && layout.width > 0) {
      pillX.value = withSpring(layout.x, theme.motion.springRestrained);
      pillW.value = withSpring(layout.width, theme.motion.springRestrained);
    }
  }, [activeTab, tabLayouts, pillX, pillW]);

  const handleSelectTab = (tab: TabKey) => {
    if (tab !== activeTab) {
      triggerHaptic('selection');
    }
    setNavShrunk(false);
    setActiveTab(tab);
  };

  const floatingBarAnimStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: 1 - shrinkProgress.value * 0.06 }],
      opacity: 1 - shrinkProgress.value * 0.08,
    };
  });

  const slidingPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
  }));

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleEl = document.createElement('style');
    styleEl.id = 'ios-simulator-reset';
    styleEl.textContent = `
      html, body, #root {
        margin: 0;
        padding: 0;
        height: 100%;
        background-color: #050608;
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

  const topSafePad = safeInsets.top + 16;
  const bottomTotalPad = safeInsets.bottom + 68;

  const content = (
    <View style={styles.rootViewport}>
      <AmbientLightCanvas />

      <View style={styles.safeArea}>
        <StatusBar style="light" />

        <ScreenTransitionView tabKey={activeTab} style={styles.screenBody}>
          {activeTab === 'dashboard' && (
            <DashboardScreen
              topInsetPadding={topSafePad + 8}
              bottomInsetPadding={bottomTotalPad + 20}
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
                  paddingTop: topSafePad,
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
                  paddingTop: topSafePad,
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
                  paddingTop: topSafePad,
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
                  paddingTop: topSafePad,
                  paddingBottom: bottomTotalPad,
                },
              ]}
            >
              <SettingsAndSubsScreen />
            </View>
          )}
        </ScreenTransitionView>

        {lastToast || lastUndoableTx ? (
          <View style={[styles.stickyHeaderContainer, { top: safeInsets.top + 4 }]} pointerEvents="box-none">
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
                glassStyle="regular"
                interactive
                contentStyle={styles.toastInner}
              >
                <Pressable
                  style={styles.undoTextWrap}
                  onPress={() => {
                    clearToast();
                    clearUndo();
                  }}
                >
                  <AppSymbol name="bolt" size={13} color={theme.colors.accent.primary} />
                  <Text style={styles.toastText} numberOfLines={2}>
                    {(
                      lastToast ??
                      `新增 ${lastUndoableTx?.merchant || lastUndoableTx?.category || '交易'} $${Math.abs(
                        lastUndoableTx?.amount ?? 0,
                      )}`
                    )
                      .replace(/^[^\u4e00-\u9fa5A-Za-z0-9$+-]+/, '')
                      .trim()}
                  </Text>
                </Pressable>
                {lastUndoableTx ? (
                  <SafeConfirmButton
                    label="撤銷"
                    confirmLabel="確認"
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
                  <AppSymbol name="xmark" size={12} color={theme.colors.text.secondary} />
                </Pressable>
              </LiquidGlassCard>
            </DismissibleBanner>
          </View>
        ) : null}

        <View
          style={[
            styles.floatingBarOuter,
            { bottom: safeInsets.bottom - 4 },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.floatingBarAnimWrap, floatingBarAnimStyle]}>
            <LiquidGlassGroup spacing={6}>
              <LiquidGlassCard
                shape="pill"
                glassStyle="regular"
                interactive
                contentStyle={[
                  styles.floatingBarInner,
                  navShrunk && styles.floatingBarInnerShrunk,
                ]}
              >
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
                  const iconColor = isFocused ? theme.colors.text.primary : theme.colors.text.tertiary;
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
                      <AppSymbol
                        name={tab.icon}
                        size={15}
                        color={iconColor}
                        weight={isFocused ? 'semibold' : 'regular'}
                      />
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
            </LiquidGlassGroup>
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
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    backgroundColor: theme.colors.background.base,
    position: 'relative',
    overflow: 'hidden',
  },
  ambientCanvas: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.background.base,
    overflow: 'hidden',
  },
  webDesktopBackdrop: {
    flex: 1,
    width: '100%',
    backgroundColor: theme.colors.background.base,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  iphone16PlusFrame: {
    flex: 1,
    width: 393,
    maxWidth: '100%',
    maxHeight: 852,
    backgroundColor: theme.colors.background.base,
    overflow: 'hidden',
  },
  iphoneInnerScreen: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
  },
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
    color: theme.colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  statusBarMuteIcon: {
    fontSize: 12,
    opacity: 0,
  },
  dynamicIsland: {
    width: 122,
    height: 35,
    borderRadius: 999,
    backgroundColor: '#000000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  statusBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    width: 82,
  },
  statusBarSignal: {
    color: theme.colors.text.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusBarWifi: {
    color: theme.colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  batteryPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
  },
  batteryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
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
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
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
    left: 0,
    right: 0,
    zIndex: 20,
  },
  toastWrap: {
    marginHorizontal: 16,
  },
  toastInner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toastText: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  undoTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
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
    paddingVertical: 5,
    gap: 2,
    position: 'relative',
  },
  floatingBarInnerShrunk: {
    paddingHorizontal: 5,
    paddingVertical: 4,
    gap: 2,
  },
  fluidSlidingPill: {
    position: 'absolute',
    left: 0,
    top: 5,
    bottom: 5,
    borderRadius: theme.radii.pill,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.accent.subtleBg,
    borderWidth: 1,
    borderColor: theme.colors.accent.subtleBorder,
  },
  fluidSlidingPillShrunk: {
    top: 4,
    bottom: 4,
  },
  tabPillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radii.pill,
    gap: 5,
    zIndex: 2,
  },
  tabPillItemShrunk: {
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  tabPillItemActive: {
    backgroundColor: theme.colors.accent.subtleBg,
    borderWidth: 1,
    borderColor: theme.colors.accent.subtleBorder,
  },
  tabLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
});
