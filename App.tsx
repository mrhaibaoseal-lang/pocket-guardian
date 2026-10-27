import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ActionSheetModals, type ActiveModal } from './src/components/ActionSheetModals';
import { LiquidGlassCard } from './src/components/LiquidGlassView';
import { SafeConfirmButton } from './src/components/SafeConfirmButton';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { SettingsAndSubsScreen } from './src/screens/SettingsAndSubsScreen';
import { ShortcutsTestBenchScreen } from './src/screens/ShortcutsTestBenchScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { LedgerProvider, useLedger } from './src/store/useLedger';

type TabKey = 'dashboard' | 'transactions' | 'testbench' | 'settings';

const TABS: ReadonlyArray<{ key: TabKey; glyph: string; label: string }> = [
  { key: 'dashboard', glyph: '◈', label: '總覽' },
  { key: 'transactions', glyph: '☰', label: '明細' },
  { key: 'testbench', glyph: '⚡', label: '捷徑' },
  { key: 'settings', glyph: '⚙', label: '設定' },
];

/**
 * 【一、底層暖調環境光畫布 (Ambient Canvas)】
 * - 主背景色：極深曜石暖黑 #080705
 * - 左上角：古銅琥珀色 #422B18 (380x380px, borderRadius: 999, opacity: 0.5)
 * - 右下角：深邃大漠金 #2E2318 (380x380px, borderRadius: 999, opacity: 0.55)
 * - 上方覆蓋全螢幕 BlurView (intensity={95}, tint="dark")，呈現溫潤暗金微光
 */
function AmbientLightCanvas() {
  return (
    <View style={styles.ambientCanvas} pointerEvents="none">
      {/* Top-Left: Bronze Warm Amber (#422B18) 380x380 Orb (opacity: 0.5) */}
      <View
        style={[
          styles.orbBronzeAmber,
          Platform.OS === 'web' ? styles.webOrbBlur : null,
        ]}
      >
        <View style={styles.orbBronzeAmberCore} />
      </View>

      {/* Bottom-Right: Deep Desert Titanium Gold (#2E2318) 380x380 Orb (opacity: 0.55) */}
      <View
        style={[
          styles.orbDesertGold,
          Platform.OS === 'web' ? styles.webOrbBlur : null,
        ]}
      >
        <View style={styles.orbDesertGoldCore} />
      </View>

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

function MainShell() {
  const { lastUndoableTx, lastToast, clearToast, softDeleteTx } = useLedger();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [presetCategory, setPresetCategory] = useState<string>('超商');
  const [navShrunk, setNavShrunk] = useState(false);

  const shrinkProgress = useSharedValue(0);

  useEffect(() => {
    shrinkProgress.value = withSpring(navShrunk ? 1 : 0, {
      damping: 20,
      stiffness: 220,
    });
  }, [navShrunk, shrinkProgress]);

  const floatingBarAnimStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: 1 - shrinkProgress.value * 0.14 }],
      opacity: 1 - shrinkProgress.value * 0.1,
    };
  });

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
        background-color: #050403;
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

  const content = (
    <View style={styles.rootViewport}>
      {/* Layer 1: Desert Titanium & Warm Amber Ambient Canvas */}
      <AmbientLightCanvas />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style="light" />

        {/* Main Screen Content (Scrolls over the Ambient Light Canvas) */}
        <View style={styles.screenBody}>
          {activeTab === 'dashboard' && (
            <DashboardScreen
              onOpenModal={(m, cat) => {
                if (cat) setPresetCategory(cat);
                setActiveModal(m);
              }}
              onNavigateTab={(t) => {
                setNavShrunk(false);
                setActiveTab(t);
              }}
              onScrollShrinkChange={(shrunk) => setNavShrunk(shrunk)}
            />
          )}
          {activeTab === 'transactions' && (
            <View style={styles.subScreenPad}>
              <TransactionsScreen />
            </View>
          )}
          {activeTab === 'testbench' && (
            <View style={styles.subScreenPad}>
              <ShortcutsTestBenchScreen />
            </View>
          )}
          {activeTab === 'settings' && (
            <View style={styles.subScreenPad}>
              <SettingsAndSubsScreen />
            </View>
          )}
        </View>

        {/* ====================================================================
            STICKY FROSTED BLUR HEADER (浮動毛玻璃頂部列)
           ==================================================================== */}
        <View style={styles.stickyHeaderContainer} pointerEvents="box-none">
          <View
            style={[
              styles.stickyHeaderBlurWrap,
              Platform.OS === 'web' ? styles.webStickyBackdrop : null,
            ]}
          >
            <BlurView
              tint="systemChromeMaterialDark"
              intensity={75}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.brandRow}>
              <Text style={styles.brandTitle}>錢呢[BROKE AF]</Text>
              <View style={styles.iosBadge}>
                <Text style={styles.iosBadgeText}>Desert Titanium · iOS 26</Text>
              </View>
            </View>
          </View>

          {/* Liquid Glass Toast Banner */}
          {lastToast ? (
            <Pressable style={styles.toastWrap} onPress={clearToast}>
              <LiquidGlassCard
                shape="pill"
                elevated
                intensity={65}
                contentStyle={styles.toastInner}
              >
                <Text style={styles.toastText} numberOfLines={2}>
                  {lastToast}
                </Text>
                <Text style={styles.toastDismiss}>✕</Text>
              </LiquidGlassCard>
            </Pressable>
          ) : null}

          {/* Safe 2-Tap Undo Banner */}
          {lastUndoableTx ? (
            <View style={styles.undoWrap}>
              <LiquidGlassCard
                shape="pill"
                elevated
                intensity={65}
                contentStyle={styles.undoInner}
              >
                <View style={styles.undoTextWrap}>
                  <Text style={styles.undoLabel}>剛剛新增</Text>
                  <Text style={styles.undoTitle} numberOfLines={1}>
                    {lastUndoableTx.merchant || lastUndoableTx.category || '交易'}{' '}
                    ${Math.abs(lastUndoableTx.amount)}
                  </Text>
                </View>
                <SafeConfirmButton
                  label="撤銷上筆"
                  confirmLabel="再點確認"
                  onConfirm={() => softDeleteTx(lastUndoableTx.id)}
                  compact
                />
              </LiquidGlassCard>
            </View>
          ) : null}
        </View>

        {/* ====================================================================
            SHRINKING FLOATING LIQUID GLASS BAR (隨滾動縮放的懸浮導覽膠囊)
           ==================================================================== */}
        <View style={styles.floatingBarOuter} pointerEvents="box-none">
          <Animated.View style={[styles.floatingBarAnimWrap, floatingBarAnimStyle]}>
            <LiquidGlassCard
              shape="pill"
              elevated
              intensity={65}
              contentStyle={[
                styles.floatingBarInner,
                navShrunk && styles.floatingBarInnerShrunk,
              ]}
            >
              {TABS.map((tab) => {
                const isFocused = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={[
                      styles.tabPillItem,
                      navShrunk && styles.tabPillItemShrunk,
                      isFocused && styles.tabPillItemActive,
                    ]}
                    onPress={() => {
                      setNavShrunk(false);
                      setActiveTab(tab.key);
                    }}
                  >
                    <Text
                      style={[
                        styles.tabGlyph,
                        isFocused && styles.tabGlyphActive,
                      ]}
                    >
                      {tab.glyph}
                    </Text>
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
      </SafeAreaView>
    </View>
  );

  // On Windows PC Web Browser: Wrap inside an exact 1:1 iPhone 16 Plus (430x932 pt) Simulator Frame!
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webDesktopBackdrop}>
        <View style={styles.iphone16PlusFrame}>
          {/* Simulated iOS Status Bar + Dynamic Island */}
          <View style={styles.statusBarRow}>
            <Text style={styles.statusBarTime}>9:41</Text>
            <View style={styles.dynamicIsland} />
            <Text style={styles.statusBarIcons}>5G 🔋</Text>
          </View>

          {/* Inner Screen Viewport */}
          <View style={styles.iphoneInnerScreen}>{content}</View>

          {/* Simulated iOS Home Indicator */}
          <View style={styles.homeIndicatorRow}>
            <View style={styles.homeIndicatorPill} />
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
    backgroundColor: '#080705',
    position: 'relative',
  },
  ambientCanvas: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#080705',
    overflow: 'hidden',
  },
  orbBronzeAmber: {
    position: 'absolute',
    top: -50,
    left: -75,
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: '#422B18',
    opacity: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbBronzeAmberCore: {
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#694322',
    opacity: 0.55,
  },
  orbDesertGold: {
    position: 'absolute',
    bottom: -40,
    right: -80,
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: '#2E2318',
    opacity: 0.55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbDesertGoldCore: {
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#4D3924',
    opacity: 0.55,
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
    backgroundColor: '#040302',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  iphone16PlusFrame: {
    width: 430,
    height: 920,
    maxHeight: '97%',
    backgroundColor: '#080705',
    borderRadius: 48,
    borderWidth: 8,
    borderColor: 'rgba(230, 213, 184, 0.22)',
    overflow: 'hidden',
  },
  statusBarRow: {
    height: 36,
    backgroundColor: '#080705',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  statusBarTime: {
    color: '#FAF6F0',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    width: 48,
  },
  dynamicIsland: {
    width: 116,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#000000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 230, 190, 0.2)',
  },
  statusBarIcons: {
    color: '#FAF6F0',
    fontSize: 11,
    fontWeight: '600',
    width: 48,
    textAlign: 'right',
  },
  iphoneInnerScreen: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  homeIndicatorRow: {
    height: 18,
    backgroundColor: '#080705',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIndicatorPill: {
    width: 134,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(235, 225, 210, 0.35)',
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
    paddingTop: 52,
    paddingBottom: 78,
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
    paddingVertical: 11,
    backgroundColor: 'rgba(18, 15, 12, 0.56)',
    borderBottomWidth: 0.8,
    borderBottomColor: 'rgba(255, 230, 190, 0.16)',
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
  brandTitle: {
    color: '#FAF6F0',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  iosBadge: {
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  iosBadgeText: {
    color: '#E6D5B8',
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
    color: '#FAF6F0',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  toastDismiss: {
    color: 'rgba(235, 225, 210, 0.5)',
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
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
  },
  undoTitle: {
    color: '#FAF6F0',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  floatingBarOuter: {
    position: 'absolute',
    bottom: 12,
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
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  floatingBarInnerShrunk: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  tabPillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 5,
  },
  tabPillItemShrunk: {
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  tabPillItemActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  tabGlyph: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  tabGlyphActive: {
    color: '#FBBF24',
  },
  tabLabel: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  tabLabelActive: {
    color: '#FAF6F0',
    fontWeight: '700',
  },
});
