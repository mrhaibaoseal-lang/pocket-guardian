import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

  return (
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
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  topHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    fontSize: 16,
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
    fontSize: 11,
    fontWeight: '700',
  },
  toastBanner: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: '#065F46',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
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
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: '#1E293B',
  },
  tabIcon: {
    fontSize: 18,
  },
  tabLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#38BDF8',
  },
});
