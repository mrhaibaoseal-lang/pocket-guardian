import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LiquidGlassCard } from '../components/LiquidGlassView';
import { useLedger } from '../store/useLedger';

export function ShortcutsTestBenchScreen() {
  const { data, meta, syncFromCloud, deleteInboxEvent, resolveInboxEvent } = useLedger();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState<string>('');
  const [draftMerchant, setDraftMerchant] = useState<string>('');

  const inboxEvents = useMemo(
    () =>
      data.events
        .filter(
          (ev) =>
            ev.status === 'parse_failed' ||
            ev.status === 'ignored' ||
            ev.status === 'duplicate',
        )
        .slice(-20)
        .reverse(),
    [data.events],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>iOS 27 捷徑與未入帳收件匣</Text>
          <Text style={styles.screenSub}>
            支援 iOS 27 新版「錢包」自動化、AI 提示詞建模與漏記補救
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

      {/* Unbooked / Skipped Inbox (30-day retention, masked account numbers) */}
      <LiquidGlassCard shape="card" elevated contentStyle={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          📥 未入帳／已略過收件匣 ({inboxEvents.length})
        </Text>
        <Text style={styles.screenSub}>
          外幣消費、缺金額或被判定為行銷／重複的事件會保留於此 30 天（帳號已遮罩），可一鍵補記或刪除。
        </Text>
        {inboxEvents.length === 0 ? (
          <Text style={styles.emptyText}>目前沒有待確認或未入帳的事件 🎉</Text>
        ) : (
          inboxEvents.map((ev) => {
            const isEditing = editingId === ev.id;
            return (
              <View key={ev.id} style={styles.eventRow}>
                <View style={styles.inboxTopRow}>
                  <Text style={styles.eventMeta}>
                    [{ev.source}] {ev.status === 'duplicate' ? '重複略過' : ev.status === 'ignored' ? '已略過' : '待確認'}
                    {ev.parsed.amount !== null ? ` · $${ev.parsed.amount}` : ''}
                  </Text>
                  <View style={styles.inboxBtnGroup}>
                    <Pressable
                      style={styles.inboxActionBtn}
                      onPress={() => {
                        if (isEditing) {
                          setEditingId(null);
                        } else {
                          setEditingId(ev.id);
                          setDraftAmount(ev.parsed.amount ? String(ev.parsed.amount) : '');
                          setDraftMerchant(
                            ev.parsed.merchant ??
                              (ev.parsed.payeeSuffix ? `轉帳給 ****${ev.parsed.payeeSuffix}` : ''),
                          );
                        }
                      }}
                    >
                      <Text style={styles.inboxActionText}>
                        {isEditing ? '取消' : '✍️ 手動補記'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.inboxDeleteBtn}
                      onPress={() => deleteInboxEvent(ev.id)}
                    >
                      <Text style={styles.inboxDeleteText}>🗑️</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.eventReason}>{ev.reason}</Text>
                {ev.rawText ? (
                  <Text style={styles.rawPreview} numberOfLines={2}>
                    原文：{ev.rawText}
                  </Text>
                ) : null}
                {isEditing ? (
                  <View style={styles.inlineEditor}>
                    <TextInput
                      style={[styles.inlineInput, { width: 95 }]}
                      placeholder="台幣金額"
                      placeholderTextColor="rgba(235,225,210,0.4)"
                      keyboardType="numeric"
                      value={draftAmount}
                      onChangeText={setDraftAmount}
                    />
                    <TextInput
                      style={[styles.inlineInput, { flex: 1 }]}
                      placeholder="商家或備註"
                      placeholderTextColor="rgba(235,225,210,0.4)"
                      value={draftMerchant}
                      onChangeText={setDraftMerchant}
                    />
                    <Pressable
                      style={styles.confirmBookBtn}
                      onPress={() => {
                        const amt = Number(draftAmount);
                        if (Number.isFinite(amt) && amt > 0) {
                          resolveInboxEvent(ev.id, amt, draftMerchant);
                          setEditingId(null);
                        }
                      }}
                    >
                      <Text style={styles.confirmBookText}>入帳</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </LiquidGlassCard>

      {/* iOS 27 Native AppIntents + AI Prompt Setup Guide */}
      <LiquidGlassCard shape="card" contentStyle={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          iOS 27 捷徑模塊設定指南（完全對應實機截圖）
        </Text>

        <View style={styles.guideStep}>
          <Text style={styles.guideStepTitle}>
            捷徑一：錢包交易智慧入帳（感應 Apple Pay）
          </Text>
          <Text style={styles.guideStepText}>
            1. 第一個模塊：「感應 [玉山 Pi 拍兔簽帳金融卡] 時」（不需按立即執行，也沒有新增空白模塊）。{'\n'}
            2. 第二個模塊：加入【文字】模塊，在文字框內點選捷徑輸入的「商家」與「數量」。{'\n'}
            3. 第三個模塊：加入【🛡️ 智慧入帳】，在「錢包 / Apple Pay 金額 (選填)」與「錢包 / Apple Pay 商家 (選填)」都選取上一步的「文字」。
          </Text>
        </View>

        <View style={styles.guideStep}>
          <Text style={styles.guideStepTitle}>
            捷徑二：玉山銀行通知智慧入帳（收到銀行通知時）
          </Text>
          <Text style={styles.guideStepText}>
            1. 第一個模塊：「當我收到來自 [玉山銀行] 的通知時」。{'\n'}
            2. 第二個模塊：加入【🛡️ 智慧入帳】，在「錢包 / Apple Pay 金額 (選填)」與「錢包 / Apple Pay 商家 (選填)」都選取「通知」。
          </Text>
        </View>

        <View style={styles.guideStep}>
          <Text style={styles.guideStepTitle}>
            捷徑三：擷取畫面至 BrokeAF（只需 2 個模塊，直接看截圖原圖！）
          </Text>
          <Text style={styles.guideStepText}>
            1. 第一個模塊：加入「拍攝螢幕快照」（不需要再加「從螢幕快照擷取文字」！）。{'\n'}
            2. 第二個模塊：加入【🛡️ 智慧入帳】，在第一個欄位「畫面截圖影像」直接選取「螢幕快照」原圖。{'\n'}
            3. 原理：直接將原圖交給視覺引擎與雲端 AI 辨識（包含直接看圖辨識玉山存摺明細的青色「存」字圓圈與橘色「提」字圓圈），不會因為先擷取文字而漏字！
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
  inboxTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inboxBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inboxActionBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: 'rgba(251, 191, 36, 0.35)',
    borderWidth: 0.8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  inboxActionText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  inboxDeleteBtn: {
    backgroundColor: 'rgba(214, 195, 165, 0.1)',
    borderColor: 'rgba(230, 213, 184, 0.2)',
    borderWidth: 0.8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  inboxDeleteText: {
    color: '#E6D5B8',
    fontSize: 11,
  },
  rawPreview: {
    color: 'rgba(230, 213, 184, 0.72)',
    fontSize: 11,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  inlineEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  inlineInput: {
    backgroundColor: 'rgba(28, 24, 20, 0.75)',
    borderColor: 'rgba(230, 213, 184, 0.28)',
    borderWidth: 0.8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: '#FAF6F0',
    fontSize: 12,
  },
  confirmBookBtn: {
    backgroundColor: '#FBBF24',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  confirmBookText: {
    color: '#080705',
    fontSize: 12,
    fontWeight: '800',
  },
});
