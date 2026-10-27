import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ActionSheetModals, type ActiveModal } from './src/components/ActionSheetModals';
import { SafeConfirmButton } from './src/components/SafeConfirmButton';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { SettingsAndSubsScreen } from './src/screens/SettingsAndSubsScreen';
import { ShortcutsTestBenchScreen } from './src/screens/ShortcutsTestBenchScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { LedgerProvider, useLedger } from './src/store/useLedger';

type TabKey = 'dashboard' | 'transactions' | 'testbench' | 'settings';

function MainShell() {
  const { lastUndoableTx, lastToast, clearToast, softDeleteTx } = useLedger();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');

  const content = (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="light" />

      {/* Top Compact Brand Header */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <Text style={styles.brandTitle}>🛡️ 守財靈 PocketGuardian</Text>
          <View style={styles.iosBadge}>
            <Text style={styles.iosBadgeText}>iPhone 16 Plus · iOS 27</Text>
          </View>
        </View>
      </View>

      {/* Instant Toast Notification Banner */}
      {lastToast ? (
        <Pressable style={styles.toastBanner} onPress={clearToast}>
          <Text style={styles.toastText} numberOfLines={2}>
            {lastToast}
          </Text>
          <Text style={styles.toastDismiss}>✕</Text>
        </Pressable>
      ) : null}

      {/* 🛡️ Safe 2-Tap Undo Banner for the Most Recent Transaction */}
      {lastUndoableTx ? (
        <View style={styles.undoBanner}>
          <View style={styles.undoTextWrap}>
            <Text style={styles.undoLabel}>剛剛新增：</Text>
            <Text style={styles.undoTitle} numberOfLines={1}>
              {lastUndoableTx.merchant || lastUndoableTx.category || '交易'} $
              {Math.abs(lastUndoableTx.amount)}
            </Text>
          </View>
          <SafeConfirmButton
            label="↩️ 撤銷上筆"
            confirmLabel="⚠️ 再點確認撤銷"
            onConfirm={() => softDeleteTx(lastUndoableTx.id)}
            compact
          />
        </View>
      ) : null}

      {/* Main Screen Content */}
      <View style={styles.screenBody}>
        {activeTab === 'dashboard' && (
          <DashboardScreen
            onOpenModal={(m) => setActiveModal(m)}
            onNavigateTab={(t) => setActiveTab(t)}
          />
        )}
        {activeTab === 'transactions' && <TransactionsScreen />}
        {activeTab === 'testbench' && <ShortcutsTestBenchScreen />}
        {activeTab === 'settings' && <SettingsAndSubsScreen />}
      </View>

      {/* Bottom Ergonomic Thumb Tab Bar */}
      <View style={styles.tabBar}>
        {(
          [
            { key: 'dashboard', icon: '🏠', label: '戰情室' },
            { key: 'transactions', icon: '📋', label: '明細/拆單' },
            { key: 'testbench', icon: '⚡', label: '捷徑測試台' },
            { key: 'settings', icon: '👻', label: '訂閱/設定' },
          ] as const
        ).map((tab) => {
          const isFocused = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tabItem, isFocused && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Bottom Action Sheet Modals */}
      <ActionSheetModals
        active={activeModal}
        onClose={() => setActiveModal('none')}
      />
    </SafeAreaView>
  );

  // On Windows PC Web Browser: Wrap inside an exact 1:1 iPhone 16 Plus (430x932 pt) Simulator Frame!
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webDesktopBackdrop}>
        <View style={styles.webSimulatorHeader}>
          <Text style={styles.webSimulatorTitle}>
            📱 iPhone 16 Plus (6.7&quot; · 430×932 pt) 電腦即時模擬預覽器
          </Text>
        </View>
        <View style={styles.iphone16PlusFrame}>
          {/* Simulated Dynamic Island */}
          <View style={styles.dynamicIslandRow}>
            <View style={styles.dynamicIsland} />
          </View>
          <View style={styles.iphoneInnerScreen}>{content}</View>
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
  webDesktopBackdrop: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  webSimulatorHeader: {
    marginBottom: 8,
  },
  webSimulatorTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  iphone16PlusFrame: {
    width: 430,
    height: 900,
    maxHeight: '94%',
    backgroundColor: '#0B0F17',
    borderRadius: 44,
    borderWidth: 6,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  dynamicIslandRow: {
    height: 28,
    backgroundColor: '#0B0F17',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dynamicIsland: {
    width: 112,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#000000',
  },
  iphoneInnerScreen: {
    flex: 1,
    minHeight: 0,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  topHeader: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '900',
  },
  iosBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
  },
  iosBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  toastBanner: {
    marginHorizontal: 14,
    marginTop: 6,
    backgroundColor: '#065F46',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toastText: {
    color: '#ECFDF5',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  toastDismiss: {
    color: '#A7F3D0',
    fontSize: 13,
    fontWeight: '800',
  },
  undoBanner: {
    marginHorizontal: 14,
    marginTop: 6,
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  undoTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  undoLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  undoTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  screenBody: {
    flex: 1,
    minHeight: 0,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: '#1E293B',
  },
  tabIcon: {
    fontSize: 17,
  },
  tabLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#38BDF8',
  },
});
