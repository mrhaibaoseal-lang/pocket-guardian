import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppSymbol } from '../components/AppSymbol';
import { TactilePressable } from '../components/iosAnimations';
import { LiquidGlassCard } from '../components/LiquidGlassView';
import { useLedger } from '../store/useLedger';
import { theme } from '../theme/tokens';

export function ShortcutsTestBenchScreen() {
  const { data, meta, syncFromCloud, deleteInboxEvent, resolveInboxEvent } = useLedger();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState<string>('');
  const [draftMerchant, setDraftMerchant] = useState<string>('');
  const [inboxExpanded, setInboxExpanded] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);

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
          <Text style={styles.screenTitle}>捷徑與收件匣</Text>
          <Text style={styles.screenSub}>
            雲端 Webhook 狀態、待確認事件與自動化設定
          </Text>
        </View>
        <TactilePressable
          onPress={() => {
            syncFromCloud().catch(() => undefined);
          }}
          contentStyle={styles.syncBtn}
        >
          <Text style={styles.syncBtnText}>同步雲端</Text>
        </TactilePressable>
      </View>

      {/* Single Focal Glass Card: Cloud Endpoint Status */}
      <LiquidGlassCard shape="card" glassStyle="regular" contentStyle={styles.endpointCard}>
        <Text style={styles.endpointLabel}>雲端捷徑接收端點</Text>
        <Text style={styles.endpointUrl} selectable>
          {meta.workerUrl.replace(/\/+$/, '')}/api/ingest
        </Text>
      </LiquidGlassCard>

      {/* Unbooked / Skipped Inbox (Non-Glass Matte Surface) */}
      <View style={styles.surfaceSection}>
        <Pressable
          style={styles.collapsibleHeaderRow}
          onPress={() => setInboxExpanded((prev) => !prev)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>
              未入帳收件匣 ({inboxEvents.length})
            </Text>
            <Text style={styles.screenSub}>
              {inboxExpanded ? '點選收起' : '外幣、缺金額或略過事件 · 點選展開'}
            </Text>
          </View>
          <View style={styles.collapseChevronBtn}>
            <AppSymbol
              name={inboxExpanded ? 'chevron.down' : 'chevron.right'}
              size={12}
              color={theme.colors.text.secondary}
            />
          </View>
        </Pressable>

        {inboxExpanded && (
          inboxEvents.length === 0 ? (
            <Text style={styles.emptyText}>目前沒有待確認或未入帳的事件</Text>
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
                          {isEditing ? '取消' : '補記'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.inboxDeleteBtn}
                        onPress={() => deleteInboxEvent(ev.id)}
                        hitSlop={6}
                      >
                        <AppSymbol name="xmark" size={11} color={theme.colors.text.tertiary} />
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
                        placeholderTextColor={theme.colors.text.tertiary}
                        keyboardType="numeric"
                        value={draftAmount}
                        onChangeText={setDraftAmount}
                      />
                      <TextInput
                        style={[styles.inlineInput, { flex: 1 }]}
                        placeholder="商家或備註"
                        placeholderTextColor={theme.colors.text.tertiary}
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
          )
        )}
      </View>

      {/* iOS Shortcuts Setup Guide (Non-Glass Matte Surface) */}
      <View style={styles.surfaceSection}>
        <Pressable
          style={styles.collapsibleHeaderRow}
          onPress={() => setGuideExpanded((prev) => !prev)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>捷徑設定指南</Text>
            <Text style={styles.screenSub}>
              {guideExpanded ? '點選收起' : 'Apple Pay、銀行通知與截圖捷徑 · 點選展開'}
            </Text>
          </View>
          <View style={styles.collapseChevronBtn}>
            <AppSymbol
              name={guideExpanded ? 'chevron.down' : 'chevron.right'}
              size={12}
              color={theme.colors.text.secondary}
            />
          </View>
        </Pressable>

        {guideExpanded && (
          <>
            <View style={styles.guideStep}>
              <Text style={styles.guideStepTitle}>Apple Pay 感應自動記帳</Text>
              <Text style={styles.guideStepText}>
                1. 自動化觸發：「感應卡片時」{'\n'}
                2. 加入「文字」模塊，選取捷徑輸入的「商家」與「數量」{'\n'}
                3. 加入「智慧入帳」，傳入該文字
              </Text>
            </View>

            <View style={styles.guideStep}>
              <Text style={styles.guideStepTitle}>玉山銀行推播自動記帳</Text>
              <Text style={styles.guideStepText}>
                1. 自動化觸發：「收到玉山銀行通知時」{'\n'}
                2. 加入「智慧入帳」，選取「通知」
              </Text>
            </View>

            <View style={styles.guideStep}>
              <Text style={styles.guideStepTitle}>轉帳／存摺截圖記帳（動作按鈕）</Text>
              <Text style={styles.guideStepText}>
                1. 加入「拍攝螢幕快照」{'\n'}
                2. 加入「智慧入帳」，在「畫面截圖影像」選取「螢幕快照」原圖
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Recent Raw Event Log (Non-Glass Matte Surface) */}
      <View style={styles.surfaceSection}>
        <Text style={styles.sectionTitle}>
          近期收訊紀錄 ({data.events.length})
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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 10,
    paddingBottom: 32,
    gap: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  screenTitle: {
    color: theme.colors.text.primary,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  screenSub: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
    marginTop: 2,
  },
  syncBtn: {
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.pill,
    borderCurve: 'continuous',
  },
  syncBtnText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '500',
  },
  endpointCard: {
    padding: theme.spacing.md,
    gap: 4,
  },
  endpointLabel: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: '500',
  },
  endpointUrl: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  surfaceSection: {
    padding: theme.spacing.md,
    gap: 10,
    borderRadius: theme.radii.listGroup,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.listSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  sectionTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.bodyMedium.fontSize,
    fontWeight: '600',
  },
  collapsibleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  collapseChevronBtn: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.background.subtleSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideStep: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderColor: theme.colors.glass.subtleBorder,
    borderWidth: 1,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
    padding: 12,
    gap: 4,
  },
  guideStepTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '600',
  },
  guideStepText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.caption.fontSize,
    lineHeight: 18,
  },
  emptyText: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
    paddingVertical: 8,
  },
  eventRow: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderColor: theme.colors.glass.subtleBorder,
    borderWidth: 1,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
    padding: 10,
    gap: 3,
  },
  eventMeta: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  eventReason: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.micro.fontSize,
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
    backgroundColor: theme.colors.accent.subtleBg,
    borderColor: theme.colors.accent.subtleBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radii.pill,
  },
  inboxActionText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: '500',
  },
  inboxDeleteBtn: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderColor: theme.colors.glass.subtleBorder,
    borderWidth: 1,
    width: 24,
    height: 24,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rawPreview: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.micro.fontSize,
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
    backgroundColor: theme.colors.background.base,
    borderColor: theme.colors.glass.fallbackBorder,
    borderWidth: 1,
    borderRadius: theme.radii.chip,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: theme.colors.text.primary,
    fontSize: theme.typography.caption.fontSize,
    fontVariant: ['tabular-nums'],
  },
  confirmBookBtn: {
    backgroundColor: theme.colors.accent.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radii.chip,
  },
  confirmBookText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '600',
  },
});
