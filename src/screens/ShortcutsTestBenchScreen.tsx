import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LiquidGlassCard } from '../components/LiquidGlassView';
import { useLedger } from '../store/useLedger';

export function ShortcutsTestBenchScreen() {
  const { data, meta, syncFromCloud } = useLedger();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>iOS 26/27 捷徑與雲端收訊紀錄</Text>
          <Text style={styles.screenSub}>
            檢視手機捷徑傳入的真實通知紀錄與設定步驟
          </Text>
        </View>
        <Pressable
          style={styles.syncBtn}
          onPress={() => {
            syncFromCloud().catch(() => undefined);
          }}
        >
          <Text style={styles.syncBtnText}>同步雲端</Text>
        </Pressable>
      </View>

      {/* Cloud Endpoint Status Card */}
      <LiquidGlassCard shape="card" elevated contentStyle={styles.endpointCard}>
        <Text style={styles.endpointLabel}>目前綁定的 Cloudflare 捷徑接收網址</Text>
        <Text style={styles.endpointUrl} selectable>
          {meta.workerUrl.replace(/\/+$/, '')}/api/ingest
        </Text>
      </LiquidGlassCard>

      {/* iOS Native AppIntents Setup Guide */}
      <LiquidGlassCard shape="card" contentStyle={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          iPhone 16 Plus 捷徑自動化設定指南
        </Text>

        <View style={styles.guideStep}>
          <Text style={styles.guideStepTitle}>
            捷徑一（全自動）：Apple Pay 錢包交易
          </Text>
          <Text style={styles.guideStepText}>
            捷徑 App → 自動化 → 「交易 (Transaction)」→ 勾選玉山簽帳卡 → 立即執行 → 加入【智慧入帳】積木。
          </Text>
        </View>

        <View style={styles.guideStep}>
          <Text style={styles.guideStepTitle}>
            捷徑二（全自動）：收到玉山銀行通知時
          </Text>
          <Text style={styles.guideStepText}>
            捷徑 App → 自動化 → 「當我收到來自 [玉山銀行] 的通知」→ 立即執行 → 加入【智慧入帳】積木，將「通知內容」傳入文字欄位。
          </Text>
        </View>

        <View style={styles.guideStep}>
          <Text style={styles.guideStepTitle}>
            捷徑三（動作按鈕 1 秒觸發）：玉山轉帳成功頁截圖
          </Text>
          <Text style={styles.guideStepText}>
            設定 → 「動作按鈕 (Action Button)」→ 綁定捷徑「擷取螢幕畫面 → 從影像擷取文字 → 傳給【智慧入帳】」。
          </Text>
        </View>
      </LiquidGlassCard>

      {/* Recent Raw Event Log */}
      <LiquidGlassCard shape="card" contentStyle={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          最近收到的捷徑事件紀錄 ({data.events.length})
        </Text>
        {data.events.length === 0 ? (
          <Text style={styles.emptyText}>尚無收訊紀錄</Text>
        ) : (
          data.events
            .slice(-15)
            .reverse()
            .map((ev, idx) => (
              <View key={idx} style={styles.eventRow}>
                <Text style={styles.eventMeta}>
                  [{ev.source}] {ev.parsed.kind} ·{' '}
                  {ev.parsed.amount !== null ? `$${ev.parsed.amount}` : '無金額'}
                </Text>
                <Text style={styles.eventReason}>{ev.reason}</Text>
              </View>
            ))
        )}
      </LiquidGlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  screenTitle: {
    color: '#FAF6F0',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  screenSub: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  syncBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderWidth: 0.8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  syncBtnText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
  },
  endpointCard: {
    padding: 15,
    gap: 4,
  },
  endpointLabel: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  endpointUrl: {
    color: '#FAF6F0',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sectionCard: {
    padding: 15,
    gap: 10,
  },
  sectionTitle: {
    color: '#FAF6F0',
    fontSize: 15,
    fontWeight: '700',
  },
  guideStep: {
    backgroundColor: 'rgba(214, 195, 165, 0.08)',
    borderColor: 'rgba(230, 213, 184, 0.18)',
    borderWidth: 0.8,
    borderRadius: 16,
    padding: 11,
    gap: 3,
  },
  guideStepTitle: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '700',
  },
  guideStepText: {
    color: '#E6D5B8',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyText: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    paddingVertical: 8,
  },
  eventRow: {
    backgroundColor: 'rgba(214, 195, 165, 0.08)',
    borderColor: 'rgba(230, 213, 184, 0.18)',
    borderWidth: 0.8,
    borderRadius: 14,
    padding: 10,
    gap: 2,
  },
  eventMeta: {
    color: '#FAF6F0',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  eventReason: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
  },
});
