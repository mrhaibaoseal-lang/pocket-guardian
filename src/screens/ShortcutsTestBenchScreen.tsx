import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { EventSource, IngestResult } from '../../core';
import { useLedger } from '../store/useLedger';

interface PresetSample {
  id: string;
  title: string;
  subtitle: string;
  source: EventSource | null;
  text: string;
  badgeColor: string;
}

const PRESET_SAMPLES: PresetSample[] = [
  {
    id: 'wallet-81',
    title: '① 模擬 Apple Pay 錢包通知 ($81)',
    subtitle: '填入 frontend_slot (含店名：樂家康, 新北市新店區)',
    source: 'wallet',
    text: '玉山銀行 E.SUN BANK\n樂家康, 新北市新店區\n$81.00',
    badgeColor: '#38BDF8',
  },
  {
    id: 'efingo-81',
    title: '② 模擬玉山 e.Fingo 簽帳卡通知 (81元)',
    subtitle: '自動配對第①筆並補齊 bank_slot → 立即上鎖，絕不扣兩次錢！',
    source: 'efingo',
    text: '玉山銀行\n簽帳金融卡消費 81元通知',
    badgeColor: '#10B981',
  },
  {
    id: 'second-buy-81',
    title: '③ 模擬 1 分鐘後「再買第二次 $81」',
    subtitle: '因第①②筆已配對上鎖（或同來源連發），自動建立第 2 筆獨立交易，不吃帳！',
    source: 'wallet',
    text: '玉山銀行 E.SUN BANK\n樂家康, 新北市新店區\n$81.00',
    badgeColor: '#F59E0B',
  },
  {
    id: 'transfer-24126',
    title: '④ 模擬玉山轉帳成功頁截圖 OCR ($100 → 24126)',
    subtitle: '自動辨識朋友帳號 ****24126，且具備時間+金額+末五碼防重複鍵',
    source: 'transfer_page',
    text: '交易成功\n2026-10-27 18:30:15\n轉帳金額\n100\n轉入對象\n808 玉山商業銀行\n********24126\n自己帳號\n808 玉山商業銀行\n********83151',
    badgeColor: '#A78BFA',
  },
  {
    id: 'otp-filter',
    title: '⑤ 模擬含 OTP 驗證碼簡訊/通知攔截',
    subtitle: '資安白名單過濾：偵測到驗證碼/OTP 立即丟棄，絕不入帳或上傳',
    source: 'efingo',
    text: '【玉山銀行】您刷卡消費 NT$3,600 元之動態驗證碼 OTP 為 839201，請勿提供他人。',
    badgeColor: '#F43F5E',
  },
];

export function ShortcutsTestBenchScreen() {
  const { data, ingestShortcut } = useLedger();
  const [customSource, setCustomSource] = useState<EventSource | null>(null);
  const [customText, setCustomText] = useState(
    '玉山銀行 E.SUN BANK\n全聯福利中心, 新北市\n$158.00',
  );
  const [lastResult, setLastResult] = useState<IngestResult | null>(null);

  const runSample = (source: EventSource | null, text: string) => {
    // Advance timestamp slightly past the 10-second identical push guard when testing consecutive clicks
    const res = ingestShortcut(source, { text }, new Date().toISOString());
    setLastResult(res);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>⚡ iOS 27 捷徑與雙源防重複測試台</Text>
      <Text style={styles.screenSub}>
        直接點擊下方真實通知範本，驗證「錢包 + 玉山雙捷徑不重複扣款」與「連買兩次不吃帳」
      </Text>

      {/* Live Result Banner */}
      {lastResult && (
        <View
          style={[
            styles.resultBox,
            lastResult.status === 'discarded_otp' && styles.resultBoxWarn,
          ]}
        >
          <View style={styles.resultHeader}>
            <Text style={styles.resultStatusTag}>
              引擎判定：{lastResult.status.toUpperCase()}
            </Text>
            <Text style={styles.resultSourceTag}>
              交易ID：{lastResult.transaction?.id.slice(0, 8) ?? '無'}
            </Text>
          </View>
          <Text style={styles.resultMessage}>{lastResult.message}</Text>
          <Text style={styles.resultReason}>原因：{lastResult.reason}</Text>
        </View>
      )}

      {/* 1-Tap Real Notification Simulators */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🧪 一鍵實測你的真實通知情境</Text>
        <Text style={styles.sectionHint}>
          提示：依序點擊 ① → ② 可觀察「合併成 1 筆並上鎖」；再點 ③ 可驗證「連買第二次自動開新帳」！
        </Text>

        {PRESET_SAMPLES.map((sample) => (
          <Pressable
            key={sample.id}
            style={({ pressed }) => [
              styles.sampleBtn,
              { borderLeftColor: sample.badgeColor },
              pressed && styles.sampleBtnPressed,
            ]}
            onPress={() => runSample(sample.source, sample.text)}
          >
            <Text style={styles.sampleTitle}>{sample.title}</Text>
            <Text style={styles.sampleSub}>{sample.subtitle}</Text>
            <View style={styles.sampleCodeBox}>
              <Text style={styles.sampleCodeText}>{sample.text}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Custom Notification / OCR Text Tester */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>✍️ 自訂通知 / 截圖 OCR 文字測試</Text>
        <View style={styles.sourcePills}>
          {(
            [
              { key: null, label: '🤖 自動辨識' },
              { key: 'wallet', label: '💳 Apple Pay' },
              { key: 'efingo', label: '🏦 玉山通知' },
              { key: 'transfer_page', label: '📲 轉帳頁 OCR' },
            ] as const
          ).map((item) => (
            <Pressable
              key={String(item.key)}
              style={[
                styles.sourcePill,
                customSource === item.key && styles.sourcePillActive,
              ]}
              onPress={() => setCustomSource(item.key)}
            >
              <Text
                style={[
                  styles.sourcePillText,
                  customSource === item.key && styles.sourcePillTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.customInput}
          value={customText}
          onChangeText={setCustomText}
          multiline
          placeholder="貼上任何通知或截圖文字..."
          placeholderTextColor="#64748B"
        />

        <Pressable
          style={styles.runCustomBtn}
          onPress={() => runSample(customSource, customText)}
        >
          <Text style={styles.runCustomBtnText}>🚀 送入去重引擎測試</Text>
        </Pressable>
      </View>

      {/* iOS 27 Native AppIntents Setup Guide */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          📱 iPhone 16 Plus (iOS 27) 專屬捷徑積木設定指南
        </Text>

        <View style={styles.guideStep}>
          <Text style={styles.guideStepTitle}>
            捷徑一（L1 全自動）：Apple Pay 錢包交易
          </Text>
          <Text style={styles.guideStepText}>
            自動化 → 「錢包 (交易)」→ 選擇玉山簽帳卡 → 立即執行 → 加入【守財靈：⚡ 智慧記帳（自動去重）】積木（或傳送至 Cloudflare `/api/ingest`）。
          </Text>
        </View>

        <View style={styles.guideStep}>
          <Text style={styles.guideStepTitle}>
            捷徑二（L1 全自動）：iOS 27 原生「收到玉山銀行通知時」
          </Text>
          <Text style={styles.guideStepText}>
            自動化 → 「🔔 當我收到來自 [玉山銀行] 的通知」→ 立即執行（關閉執行時通知）→ 加入【守財靈：⚡ 智慧記帳（自動去重）】積木，將「通知內容」傳入文字欄位。
          </Text>
        </View>

        <View style={styles.guideStep}>
          <Text style={styles.guideStepTitle}>
            捷徑三（L2 動作按鈕 1 秒觸發）：玉山轉帳成功頁截圖
          </Text>
          <Text style={styles.guideStepText}>
            設定 → 「動作按鈕 (Action Button)」→ 綁定捷徑「擷取螢幕畫面 → 從影像擷取文字 → 傳給【守財靈：⚡ 智慧記帳】」。轉帳完按一下左側動作按鈕即刻入帳！
          </Text>
        </View>
      </View>

      {/* Recent Raw Event Log */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          📡 最近收到的原始事件流 ({data.events.length})
        </Text>
        {data.events.slice(-6).reverse().map((ev, idx) => (
          <View key={idx} style={styles.eventRow}>
            <Text style={styles.eventMeta}>
              [{ev.source}] {ev.parsed.kind} · {ev.parsed.amount !== null ? `$${ev.parsed.amount}` : '無金額'}
            </Text>
            <Text style={styles.eventReason}>{ev.reason}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 14,
  },
  screenTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  screenSub: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
  },
  resultBox: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  resultBoxWarn: {
    backgroundColor: '#4C0519',
    borderColor: '#F43F5E',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultStatusTag: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '800',
  },
  resultSourceTag: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '700',
  },
  resultMessage: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  resultReason: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  sectionCard: {
    backgroundColor: '#131C2E',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHint: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
  },
  sampleBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderLeftWidth: 4,
    gap: 4,
  },
  sampleBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  sampleTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  sampleSub: {
    color: '#94A3B8',
    fontSize: 11,
  },
  sampleCodeBox: {
    backgroundColor: '#090D16',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  sampleCodeText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  sourcePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sourcePill: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  sourcePillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  sourcePillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  sourcePillTextActive: {
    color: '#F8FAFC',
    fontWeight: '800',
  },
  customInput: {
    backgroundColor: '#090D16',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 13,
    minHeight: 84,
    textAlignVertical: 'top',
  },
  runCustomBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  runCustomBtnText: {
    color: '#052E16',
    fontSize: 14,
    fontWeight: '900',
  },
  guideStep: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    gap: 3,
  },
  guideStepTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
  },
  guideStepText: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
  },
  eventRow: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 9,
    gap: 2,
  },
  eventMeta: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  eventReason: {
    color: '#94A3B8',
    fontSize: 11,
  },
});
