import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Field } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { Badge, Button, Row, Section } from '../components/ui/List';
import { useLedger } from '../store/useLedger';
import { type, usePalette, useThemedStyles, type Palette } from '../theme';

const GUIDES: ReadonlyArray<{ title: string; steps: string[] }> = [
  {
    title: 'Apple Pay 感應',
    steps: ['自動化觸發選「感應卡片時」', '加入「文字」，放入捷徑輸入的「商家」和「數量」', '加入「智慧入帳」，傳入這段文字'],
  },
  {
    title: '玉山銀行通知',
    steps: ['自動化觸發選「收到玉山銀行通知時」', '加入「智慧入帳」，選取「通知」'],
  },
  {
    title: '轉帳或存摺截圖',
    steps: ['加入「拍攝螢幕快照」', '加入「智慧入帳」，在「畫面截圖影像」選取螢幕快照'],
  },
];

export function ShortcutsTestBenchScreen({ bottomInsetPadding = 120 }: { bottomInsetPadding?: number }) {
  const { data, meta, syncFromCloud, deleteInboxEvent, resolveInboxEvent } = useLedger();
  const c = usePalette();
  const s = useThemedStyles(makeStyles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState('');
  const [draftMerchant, setDraftMerchant] = useState('');
  const [openGuide, setOpenGuide] = useState<number | null>(null);

  const inboxEvents = useMemo(
    () =>
      data.events
        .filter((ev) => ev.status === 'parse_failed' || ev.status === 'ignored' || ev.status === 'duplicate')
        .slice(-20)
        .reverse(),
    [data.events],
  );

  const endpoint = `${meta.workerUrl.replace(/\/+$/, '')}/api/ingest`;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomInsetPadding }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Section header="接收網址" footer="在捷徑的「取得 URL 內容」裡使用這個網址。">
        <View style={s.cell}>
          <Text style={s.mono} selectable>
            {endpoint}
          </Text>
        </View>
        <Row title="立即同步" titleStyle={{ color: c.positive }} onPress={() => syncFromCloud().catch(() => undefined)} />
      </Section>

      <Section
        header={`待處理 ${inboxEvents.length}`}
        footer={inboxEvents.length > 0 ? '外幣、缺金額或被略過的通知。補上金額就能入帳。' : undefined}
      >
        {inboxEvents.length === 0 ? (
          <View style={s.cell}>
            <Text style={s.muted}>沒有需要處理的通知。</Text>
          </View>
        ) : (
          inboxEvents.map((ev) => {
            const editing = editingId === ev.id;
            const status = ev.status === 'duplicate' ? '重複' : ev.status === 'ignored' ? '已略過' : '待確認';
            return (
              <View key={ev.id} style={s.cell}>
                <View style={s.inboxTop}>
                  <Badge label={status} tone={ev.status === 'parse_failed' ? 'warning' : 'neutral'} />
                  <Text style={s.inboxSource} numberOfLines={1}>
                    {ev.source}
                    {ev.parsed.amount !== null ? ` · $${ev.parsed.amount.toLocaleString()}` : ''}
                  </Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      if (editing) {
                        setEditingId(null);
                      } else {
                        setEditingId(ev.id);
                        setDraftAmount(ev.parsed.amount ? String(ev.parsed.amount) : '');
                        setDraftMerchant(
                          ev.parsed.merchant ?? (ev.parsed.payeeSuffix ? `轉帳給 ****${ev.parsed.payeeSuffix}` : ''),
                        );
                      }
                    }}
                  >
                    <Text style={s.link}>{editing ? '取消' : '補記'}</Text>
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => deleteInboxEvent(ev.id)}>
                    <Icon name="trash" size={16} color={c.negative} />
                  </Pressable>
                </View>
                <Text style={s.reason}>{ev.reason}</Text>
                {ev.rawText ? (
                  <Text style={s.raw} numberOfLines={2}>
                    {ev.rawText}
                  </Text>
                ) : null}
                {editing ? (
                  <Animated.View entering={FadeIn.duration(160)} style={s.editor}>
                    <Field
                      style={{ width: 96 }}
                      placeholder="金額"
                      keyboardType="numeric"
                      value={draftAmount}
                      onChangeText={setDraftAmount}
                    />
                    <Field style={{ flex: 1 }} placeholder="商家或備註" value={draftMerchant} onChangeText={setDraftMerchant} />
                    <Button
                      title="入帳"
                      size="medium"
                      onPress={() => {
                        const amt = Number(draftAmount);
                        if (Number.isFinite(amt) && amt > 0) {
                          resolveInboxEvent(ev.id, amt, draftMerchant);
                          setEditingId(null);
                        }
                      }}
                    />
                  </Animated.View>
                ) : null}
              </View>
            );
          })
        )}
      </Section>

      <Section header="設定指南">
        {GUIDES.map((g, i) => (
          <View key={g.title}>
            <Row
              title={g.title}
              onPress={() => setOpenGuide(openGuide === i ? null : i)}
              trailing={
                <Icon
                  name="chevronDown"
                  size={12}
                  color={c.tertiaryLabel}
                  weight="semibold"
                  style={{ transform: [{ rotate: openGuide === i ? '180deg' : '0deg' }] }}
                />
              }
            />
            {openGuide === i ? (
              <Animated.View entering={FadeIn.duration(160)} style={s.steps}>
                {g.steps.map((step, n) => (
                  <View key={step} style={s.step}>
                    <View style={s.stepNum}>
                      <Text style={s.stepNumText}>{n + 1}</Text>
                    </View>
                    <Text style={s.stepText}>{step}</Text>
                  </View>
                ))}
              </Animated.View>
            ) : null}
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  cell: { paddingHorizontal: 16, paddingVertical: 12 },
  mono: { ...type.footnote, color: c.label, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  muted: { ...type.body, color: c.secondaryLabel },
  link: { ...type.subheadline, color: c.positive, fontWeight: '600' as const },
  inboxTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  inboxSource: { ...type.subheadline, color: c.label, flex: 1 },
  reason: { ...type.footnote, color: c.secondaryLabel, marginTop: 6 },
  raw: { ...type.caption1, color: c.tertiaryLabel, marginTop: 4 },
  editor: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 10 },
  steps: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  step: { flexDirection: 'row' as const, gap: 10, alignItems: 'flex-start' as const },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 1,
  },
  stepNumText: { ...type.caption1, color: c.label, fontWeight: '600' as const },
  stepText: { ...type.subheadline, color: c.label, flex: 1 },
});
