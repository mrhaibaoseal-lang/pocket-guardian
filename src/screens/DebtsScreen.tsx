import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import {
  computeDebtAging,
  convertToFeelings,
  type AccountId,
  type DebtDirection,
  type DebtRecord,
} from '../../core';
import { AnimatedRollingNumber, LiquidLightTube, TactilePressable } from '../components/iosAnimations';
import { SafeConfirmButton } from '../components/SafeConfirmButton';
import { Field } from '../components/ui/Field';
import { CellBox, Chip, FormRow } from '../components/ui/FormRow';
import { Icon } from '../components/ui/Icon';
import { Badge, Button, LargeTitle, Section } from '../components/ui/List';
import { Segmented } from '../components/ui/Segmented';
import { stripEmoji } from '../components/ui/txVisual';
import { useLedger } from '../store/useLedger';
import { tabular, type, usePalette, useThemedStyles, type Palette } from '../theme';

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso.slice(0, 10);
  }
}

const QUICK_TITLES = ['聚餐代墊', '飲料', '電影票', '合購', '借現金'];

type AccountChoice = 'none' | 'bank' | 'cash';
const toAccount = (v: AccountChoice): AccountId | null => (v === 'none' ? null : v);

interface PersonGroup {
  personName: string;
  owedToMeOpen: number;
  iOweOpen: number;
  netAmount: number;
  canAutoNet: boolean;
  openRecords: DebtRecord[];
  settledRecords: DebtRecord[];
  accountSuffix: string | null;
}

interface ScreenProps {
  topInsetPadding?: number;
  bottomInsetPadding?: number;
}

export function DebtsScreen({ topInsetPadding = 54, bottomInsetPadding = 120 }: ScreenProps) {
  const { data, addDebt, settleDebt, netPersonDebts, deleteDebt, addQuickExpense } = useLedger();
  const c = usePalette();
  const s = useThemedStyles(makeStyles);

  const debts = useMemo(() => data.debts ?? [], [data.debts]);
  const nowIso = new Date().toISOString();

  const [viewTab, setViewTab] = useState<'people' | 'list' | 'settled'>('people');
  const [composerMode, setComposerMode] = useState<'none' | 'single' | 'aa_split'>('none');

  const [direction, setDirection] = useState<DebtDirection>('owed_to_me');
  const [personName, setPersonName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [suffixInput, setSuffixInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [syncAccount, setSyncAccount] = useState<AccountChoice>('none');

  const [aaTotalInput, setAaTotalInput] = useState('');
  const [aaTitleInput, setAaTitleInput] = useState('聚餐');
  const [aaPeopleCountInput, setAaPeopleCountInput] = useState('4');
  const [aaFriendsInput, setAaFriendsInput] = useState('');
  const [aaIncludeSelf] = useState(true);
  const [aaSyncAccount, setAaSyncAccount] = useState<AccountChoice>('bank');

  const [settlingDebtId, setSettlingDebtId] = useState<string | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState('');
  const [settleAccount, setSettleAccount] = useState<AccountChoice>('bank');
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);

  const openDebts = useMemo(
    () =>
      debts
        .filter((d) => d.status === 'open' && d.remainingAmount > 0)
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
    [debts],
  );

  const settledDebts = useMemo(
    () =>
      debts
        .filter((d) => d.status === 'settled' || d.remainingAmount <= 0)
        .sort((a, b) => Date.parse(b.settledAt ?? b.occurredAt) - Date.parse(a.settledAt ?? a.occurredAt)),
    [debts],
  );

  const totals = useMemo(() => {
    let owedToMe = 0;
    let iOwe = 0;
    const owedPeople = new Set<string>();
    const owePeople = new Set<string>();
    for (const d of openDebts) {
      if (d.direction === 'owed_to_me') {
        owedToMe += d.remainingAmount;
        owedPeople.add(d.personName.trim());
      } else {
        iOwe += d.remainingAmount;
        owePeople.add(d.personName.trim());
      }
    }
    return { owedToMe, iOwe, net: owedToMe - iOwe, owedToMeCount: owedPeople.size, iOweCount: owePeople.size };
  }, [openDebts]);

  const peopleGroups = useMemo<PersonGroup[]>(() => {
    const map = new Map<string, PersonGroup>();
    for (const d of debts) {
      const key = d.personName.trim() || '朋友';
      let g = map.get(key);
      if (!g) {
        g = {
          personName: key,
          owedToMeOpen: 0,
          iOweOpen: 0,
          netAmount: 0,
          canAutoNet: false,
          openRecords: [],
          settledRecords: [],
          accountSuffix: d.accountSuffix ?? null,
        };
        map.set(key, g);
      }
      if (d.accountSuffix && !g.accountSuffix) g.accountSuffix = d.accountSuffix;
      if (d.status === 'open' && d.remainingAmount > 0) {
        g.openRecords.push(d);
        if (d.direction === 'owed_to_me') g.owedToMeOpen += d.remainingAmount;
        else g.iOweOpen += d.remainingAmount;
      } else {
        g.settledRecords.push(d);
      }
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, netAmount: g.owedToMeOpen - g.iOweOpen, canAutoNet: g.owedToMeOpen > 0 && g.iOweOpen > 0 }))
      .sort((a, b) => {
        if ((a.openRecords.length > 0) !== (b.openRecords.length > 0)) return b.openRecords.length - a.openRecords.length;
        return Math.abs(b.netAmount) - Math.abs(a.netAmount);
      });
  }, [debts]);

  const knownContacts = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of data.payees) map.set(p.displayName.trim(), p.accountSuffix);
    for (const d of debts) {
      const name = d.personName.trim();
      if (!map.has(name) || d.accountSuffix) map.set(name, d.accountSuffix ?? map.get(name) ?? null);
    }
    return Array.from(map.entries()).slice(0, 8);
  }, [data.payees, debts]);

  const aaPreview = useMemo(() => {
    const total = Math.max(0, Math.round(Number(aaTotalInput) || 0));
    const names = aaFriendsInput
      .split(/[,，、\s]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    const countFromInput = Math.max(2, Math.round(Number(aaPeopleCountInput) || 2));
    const friendCount = names.length > 0 ? names.length : Math.max(1, countFromInput - (aaIncludeSelf ? 1 : 0));
    const totalPeople = friendCount + (aaIncludeSelf ? 1 : 0);
    const perPerson = total > 0 ? Math.round(total / totalPeople) : 0;
    const friendList = names.length > 0 ? names : Array.from({ length: friendCount }, (_, i) => `朋友${i + 1}`);
    return {
      total,
      totalPeople,
      friendCount,
      perPerson,
      selfShare: aaIncludeSelf ? Math.max(0, total - perPerson * friendCount) : 0,
      advanceTotal: perPerson * friendCount,
      friendList,
    };
  }, [aaFriendsInput, aaIncludeSelf, aaPeopleCountInput, aaTotalInput]);

  const handleCreateSingleDebt = () => {
    const amt = Math.round(Number(amountInput) || 0);
    if (!personName.trim() || amt <= 0) return;
    addDebt({
      personName: personName.trim(),
      direction,
      amount: amt,
      title: titleInput.trim() || (direction === 'owed_to_me' ? '代墊款項' : '借入款項'),
      note: noteInput.trim() || null,
      accountSuffix: suffixInput.trim() || null,
      syncAccountId: toAccount(syncAccount),
    });
    setPersonName('');
    setAmountInput('');
    setTitleInput('');
    setNoteInput('');
    setComposerMode('none');
  };

  const handleCreateAaSplit = () => {
    if (aaPreview.total <= 0 || aaPreview.perPerson <= 0) return;
    const cleanTitle = aaTitleInput.trim() || '聚餐';
    const acct = toAccount(aaSyncAccount);
    if (acct && aaPreview.selfShare > 0) {
      addQuickExpense(
        aaPreview.selfShare,
        acct === 'bank' ? 'bank_transfer' : 'cash',
        '餐飲',
        `${cleanTitle}（個人自付）`,
        `AA 拆帳 ${aaPreview.totalPeople} 人平分，只計個人負擔 $${aaPreview.selfShare}`,
      );
    }
    for (const friend of aaPreview.friendList) {
      addDebt({
        personName: friend,
        direction: 'owed_to_me',
        amount: aaPreview.perPerson,
        title: `${cleanTitle} (${aaPreview.totalPeople}人AA)`,
        note: `總額 $${aaPreview.total} ÷ ${aaPreview.totalPeople} 人`,
        syncAccountId: acct,
      });
    }
    setAaTotalInput('');
    setAaFriendsInput('');
    setComposerMode('none');
  };

  const openSettle = (d: DebtRecord) => {
    if (settlingDebtId === d.id) {
      setSettlingDebtId(null);
      return;
    }
    setSettlingDebtId(d.id);
    setSettleAmountInput(String(d.remainingAmount));
    setSettleAccount('bank');
  };

  const confirmSettle = (d: DebtRecord) => {
    const amt = Math.round(Number(settleAmountInput) || 0);
    if (amt <= 0) return;
    settleDebt(d.id, amt, toAccount(settleAccount), null);
    setSettlingDebtId(null);
  };

  const accountOptions = (first: 'none' | 'bank') =>
    first === 'none'
      ? ([
          { value: 'none', label: '只記欠款' },
          { value: 'bank', label: '玉山' },
          { value: 'cash', label: '現金' },
        ] as const)
      : ([
          { value: 'bank', label: '玉山' },
          { value: 'cash', label: '現金' },
          { value: 'none', label: '只記欠款' },
        ] as const);

  /* ---------------- one debt record ---------------- */
  const renderRecord = (d: DebtRecord, showPerson: boolean) => {
    const owedToMe = d.direction === 'owed_to_me';
    const settled = d.status === 'settled' || d.remainingAmount <= 0;
    const paid = Math.max(0, d.originalAmount - d.remainingAmount);
    const pct = d.originalAmount > 0 ? Math.min(100, Math.round((paid / d.originalAmount) * 100)) : 100;
    const aging = computeDebtAging(d.direction, d.occurredAt, nowIso);
    const feelings = convertToFeelings(d.remainingAmount, data.settings);
    const settling = settlingDebtId === d.id;
    const tone = owedToMe ? c.positive : c.negative;

    return (
      <View key={d.id} style={s.record}>
        <View style={s.recordTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.recordTitle} numberOfLines={1}>
              {showPerson ? `${owedToMe ? `${d.personName} 欠我` : `我欠 ${d.personName}`} · ${d.title}` : d.title}
            </Text>
            <View style={s.recordMetaRow}>
              <Text style={s.recordMeta}>{formatShortDate(d.occurredAt)}</Text>
              {!settled ? (
                <Badge
                  label={stripEmoji(aging.badge)}
                  tone={aging.level === 'frozen' || aging.level === 'urgent' ? 'negative' : aging.level === 'warm' ? 'warning' : 'neutral'}
                />
              ) : (
                <Badge label="已結清" tone="accent" />
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.recordAmount, { color: settled ? c.secondaryLabel : tone }]}>
              {owedToMe ? '+' : '−'}${(settled ? d.originalAmount : d.remainingAmount).toLocaleString()}
            </Text>
            {!settled ? <Text style={s.recordHint}>約 {feelings.bentos} 個便當</Text> : null}
          </View>
        </View>

        {paid > 0 && !settled ? (
          <View style={{ marginTop: 10, gap: 6 }}>
            <LiquidLightTube percent={pct} height={4} color={tone} trackColor={c.fillStrong} />
            <Text style={s.recordMeta}>
              已{owedToMe ? '收回' : '還'} ${paid.toLocaleString()}，共 ${d.originalAmount.toLocaleString()}
            </Text>
          </View>
        ) : null}

        {d.settlements.length > 0 ? (
          <View style={{ marginTop: 6 }}>
            {d.settlements.map((st) => (
              <Text key={st.id} style={s.recordMeta}>
                {formatShortDate(st.settledAt)} {owedToMe ? '收回' : '還款'} ${st.amount.toLocaleString()}
                {st.accountId === 'bank' ? ' · 玉山' : st.accountId === 'cash' ? ' · 現金' : ''}
                {st.note ? ` · ${st.note}` : ''}
              </Text>
            ))}
          </View>
        ) : null}

        {d.note ? <Text style={[s.recordMeta, { marginTop: 4 }]}>{d.note}</Text> : null}
        {d.accountSuffix ? <Text style={[s.recordMeta, { marginTop: 2 }]}>帳號末五碼 {d.accountSuffix}</Text> : null}

        <View style={s.recordActions}>
          {!settled ? (
            <Button
              title={settling ? '取消' : owedToMe ? '記錄收款' : '記錄還款'}
              variant={settling ? 'gray' : 'tinted'}
              size="small"
              onPress={() => openSettle(d)}
            />
          ) : null}
          <SafeConfirmButton label="刪除" confirmLabel="確認刪除" onConfirm={() => deleteDebt(d.id)} compact />
        </View>

        {settling && !settled ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={s.settleBox}>
            <View style={s.chipRow}>
              <Chip label="一半" onPress={() => setSettleAmountInput(String(Math.max(1, Math.round(d.remainingAmount / 2))))} />
              <Chip
                label={`全額 $${d.remainingAmount.toLocaleString()}`}
                selected={settleAmountInput === String(d.remainingAmount)}
                onPress={() => setSettleAmountInput(String(d.remainingAmount))}
              />
            </View>
            <Field value={settleAmountInput} onChangeText={setSettleAmountInput} keyboardType="numeric" placeholder="金額" />
            <Segmented options={accountOptions('bank')} value={settleAccount} onChange={setSettleAccount} />
            <Text style={s.recordMeta}>選擇帳戶會同步更新餘額，不影響本月預算。</Text>
            <Button
              title={`確認${owedToMe ? '收回' : '還款'} $${(Number(settleAmountInput) || 0).toLocaleString()}`}
              size="medium"
              onPress={() => confirmSettle(d)}
            />
          </Animated.View>
        ) : null}
      </View>
    );
  };

  const netLabel =
    totals.net > 0
      ? `整體來說別人還要給你 $${totals.net.toLocaleString()}`
      : totals.net < 0
      ? `整體來說你還要付 $${Math.abs(totals.net).toLocaleString()}`
      : '目前兩清';

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingTop: topInsetPadding, paddingBottom: bottomInsetPadding }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <LargeTitle
        title="欠款"
        right={
          <TactilePressable
            onPress={() => setComposerMode(composerMode === 'none' ? 'single' : 'none')}
            contentStyle={[s.addButton, composerMode !== 'none' && { backgroundColor: c.fill }]}
          >
            <Icon
              name={composerMode === 'none' ? 'plus' : 'close'}
              size={16}
              color={composerMode === 'none' ? c.onAccent : c.label}
              weight="bold"
            />
          </TactilePressable>
        }
      />

      {/* ---------- summary ---------- */}
      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.summaryLabel}>別人欠我</Text>
            <AnimatedRollingNumber value={totals.owedToMe} style={[s.summaryValue, { color: c.positive }]} />
            <Text style={s.summarySub}>{totals.owedToMeCount} 人</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={{ flex: 1 }}>
            <Text style={s.summaryLabel}>我欠別人</Text>
            <AnimatedRollingNumber value={totals.iOwe} style={[s.summaryValue, { color: totals.iOwe > 0 ? c.negative : c.label }]} />
            <Text style={s.summarySub}>{totals.iOweCount} 人</Text>
          </View>
        </View>
        <View style={s.hairline} />
        <Text style={s.summaryNet}>{netLabel}</Text>
      </View>

      {/* ---------- composer ---------- */}
      {composerMode !== 'none' ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(140)}>
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <Segmented
              options={[
                { value: 'single', label: '一筆欠款' },
                { value: 'aa_split', label: '聚餐分帳' },
              ]}
              value={composerMode}
              onChange={setComposerMode}
            />
          </View>

          {composerMode === 'single' ? (
            <>
              <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
                <Segmented
                  options={[
                    { value: 'owed_to_me', label: '別人欠我' },
                    { value: 'i_owe', label: '我欠別人' },
                  ]}
                  value={direction}
                  onChange={setDirection}
                />
              </View>
              {knownContacts.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.contactRow}>
                  {knownContacts.map(([name, suf]) => (
                    <Chip
                      key={name}
                      label={name}
                      selected={personName === name}
                      onPress={() => {
                        setPersonName(name);
                        if (suf) setSuffixInput(suf);
                      }}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <Section>
                <FormRow label="對象" value={personName} onChangeText={setPersonName} placeholder="名字" />
                <FormRow label="金額" value={amountInput} onChangeText={setAmountInput} keyboardType="numeric" placeholder="$0" />
                <FormRow label="項目" value={titleInput} onChangeText={setTitleInput} placeholder="代墊款項" />
                <CellBox>
                  <View style={s.chipRow}>
                    {QUICK_TITLES.map((t) => (
                      <Chip key={t} label={t} selected={titleInput === t} onPress={() => setTitleInput(t)} />
                    ))}
                  </View>
                </CellBox>
              </Section>
              <Section footer="填入對方帳號末五碼，之後掃到轉帳截圖會自動沖銷。">
                <FormRow
                  label="末五碼"
                  value={suffixInput}
                  onChangeText={setSuffixInput}
                  keyboardType="numeric"
                  maxLength={5}
                  placeholder="選填"
                />
                <FormRow label="備註" value={noteInput} onChangeText={setNoteInput} placeholder="選填" />
              </Section>
              <Section header="同步帳戶餘額" footer="代墊的錢不會算進你的本月預算。">
                <CellBox>
                  <Segmented options={accountOptions('none')} value={syncAccount} onChange={setSyncAccount} />
                </CellBox>
              </Section>
              <View style={s.submit}>
                <Button title="儲存" onPress={handleCreateSingleDebt} disabled={!personName.trim() || !(Number(amountInput) > 0)} />
              </View>
            </>
          ) : (
            <>
              <Section>
                <FormRow label="總金額" value={aaTotalInput} onChangeText={setAaTotalInput} keyboardType="numeric" placeholder="$0" />
                <FormRow
                  label="人數"
                  value={aaPeopleCountInput}
                  onChangeText={setAaPeopleCountInput}
                  keyboardType="numeric"
                  placeholder="含自己"
                />
                <FormRow label="名稱" value={aaTitleInput} onChangeText={setAaTitleInput} placeholder="聚餐" />
                <FormRow label="朋友" value={aaFriendsInput} onChangeText={setAaFriendsInput} placeholder="用逗號分隔（選填）" />
              </Section>
              <Section header="誰先付的">
                <CellBox>
                  <Segmented options={accountOptions('bank')} value={aaSyncAccount} onChange={setAaSyncAccount} />
                </CellBox>
              </Section>
              <Section header="試算">
                <View style={s.previewLine}>
                  <Text style={s.previewLabel}>每人</Text>
                  <Text style={s.previewValue}>${aaPreview.perPerson.toLocaleString()}</Text>
                </View>
                <View style={s.previewLine}>
                  <Text style={s.previewLabel}>你自己負擔（算進預算）</Text>
                  <Text style={s.previewValue}>${aaPreview.selfShare.toLocaleString()}</Text>
                </View>
                <View style={s.previewLine}>
                  <Text style={s.previewLabel}>幫 {aaPreview.friendCount} 位朋友代墊</Text>
                  <Text style={s.previewValue}>${aaPreview.advanceTotal.toLocaleString()}</Text>
                </View>
              </Section>
              <View style={s.submit}>
                <Button
                  title={`建立 ${aaPreview.friendCount} 筆欠款`}
                  onPress={handleCreateAaSplit}
                  disabled={aaPreview.total <= 0}
                />
              </View>
            </>
          )}
        </Animated.View>
      ) : null}

      {/* ---------- lists ---------- */}
      <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
        <Segmented
          options={[
            { value: 'people', label: '依對象' },
            { value: 'list', label: `未結清 ${openDebts.length}` },
            { value: 'settled', label: `已結清 ${settledDebts.length}` },
          ]}
          value={viewTab}
          onChange={setViewTab}
        />
      </View>

      {viewTab === 'people' ? (
        peopleGroups.length === 0 ? (
          <Empty title="沒有欠款紀錄" sub="按右上角的 + 新增，或在明細裡把一筆消費分帳給朋友。" />
        ) : (
          <Section separatorInset={64}>
            {peopleGroups.map((g) => {
              const expanded = expandedPerson === g.personName || peopleGroups.length <= 2;
              const overlap = Math.min(g.owedToMeOpen, g.iOweOpen);
              return (
                <Animated.View key={g.personName} layout={LinearTransition.duration(220)}>
                  <Pressable
                    onPress={() => setExpandedPerson(expandedPerson === g.personName ? null : g.personName)}
                    style={({ pressed }) => [s.personRow, pressed && { backgroundColor: c.fillStrong }]}
                  >
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{g.personName.slice(0, 1)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.personName} numberOfLines={1}>
                        {g.personName}
                      </Text>
                      <Text style={s.recordMeta}>
                        {g.openRecords.length > 0 ? `${g.openRecords.length} 筆未結清` : '都結清了'}
                        {g.accountSuffix ? ` · 末五碼 ${g.accountSuffix}` : ''}
                      </Text>
                    </View>
                    <Text
                      style={[
                        s.personNet,
                        { color: g.netAmount > 0 ? c.positive : g.netAmount < 0 ? c.negative : c.secondaryLabel },
                      ]}
                    >
                      {g.netAmount > 0
                        ? `+$${g.netAmount.toLocaleString()}`
                        : g.netAmount < 0
                        ? `−$${Math.abs(g.netAmount).toLocaleString()}`
                        : '$0'}
                    </Text>
                    <Icon
                      name="chevronDown"
                      size={11}
                      color={c.tertiaryLabel}
                      weight="semibold"
                      style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
                    />
                  </Pressable>

                  {g.canAutoNet ? (
                    <View style={s.netBox}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.netTitle}>可以互相抵銷 ${overlap.toLocaleString()}</Text>
                        <Text style={s.recordMeta}>
                          {g.netAmount > 0
                            ? `抵銷後 ${g.personName} 只要再給你 $${g.netAmount.toLocaleString()}`
                            : g.netAmount < 0
                            ? `抵銷後你只要再給 ${g.personName} $${Math.abs(g.netAmount).toLocaleString()}`
                            : '抵銷後剛好兩清'}
                        </Text>
                      </View>
                      <Button title="抵銷" variant="tinted" size="small" onPress={() => netPersonDebts(g.personName)} />
                    </View>
                  ) : null}

                  {expanded && g.openRecords.length > 0 ? (
                    <View style={s.nested}>{g.openRecords.map((r) => renderRecord(r, false))}</View>
                  ) : null}
                </Animated.View>
              );
            })}
          </Section>
        )
      ) : null}

      {viewTab === 'list' ? (
        openDebts.length === 0 ? (
          <Empty title="沒有未結清的欠款" sub="所有往來都結清了。" />
        ) : (
          <Section>{openDebts.map((d) => renderRecord(d, true))}</Section>
        )
      ) : null}

      {viewTab === 'settled' ? (
        settledDebts.length === 0 ? (
          <Empty title="還沒有已結清的紀錄" sub="結清或互相抵銷的欠款會留在這裡。" />
        ) : (
          <Section>{settledDebts.map((d) => renderRecord(d, true))}</Section>
        )
      ) : null}
    </ScrollView>
  );
}

function Empty({ title, sub }: { title: string; sub: string }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptySub}>{sub}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 4,
  },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 18,
    borderRadius: 20,
    borderCurve: 'continuous' as const,
    backgroundColor: c.card,
  },
  summaryRow: { flexDirection: 'row' as const },
  summaryDivider: { width: 0.5, backgroundColor: c.separator, marginHorizontal: 16 },
  summaryLabel: { ...type.subheadline, color: c.secondaryLabel },
  summaryValue: { ...type.title1, ...tabular, marginTop: 4 },
  summarySub: { ...type.caption1, color: c.secondaryLabel, marginTop: 2 },
  hairline: { height: 0.5, backgroundColor: c.separator, marginVertical: 14 },
  summaryNet: { ...type.footnote, color: c.secondaryLabel },
  contactRow: { paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  submit: { paddingHorizontal: 16, marginTop: -8, marginBottom: 32 },
  previewLine: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  previewLabel: { ...type.body, color: c.label },
  previewValue: { ...type.body, ...tabular, color: c.secondaryLabel },
  personRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 60,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.scheme === 'dark' ? '#636366' : '#AEAEB2',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { ...type.headline, color: '#FFFFFF' },
  personName: { ...type.body, color: c.label },
  personNet: { ...type.body, ...tabular, fontWeight: '600' as const },
  netBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginLeft: 64,
    marginRight: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: c.cardRaised,
  },
  netTitle: { ...type.subheadline, color: c.label, fontWeight: '600' as const },
  nested: { marginLeft: 48 },
  record: { paddingHorizontal: 16, paddingVertical: 12 },
  recordTop: { flexDirection: 'row' as const, gap: 12 },
  recordTitle: { ...type.body, color: c.label },
  recordMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 3 },
  recordMeta: { ...type.footnote, color: c.secondaryLabel },
  recordAmount: { ...type.body, ...tabular, fontWeight: '600' as const },
  recordHint: { ...type.caption1, color: c.tertiaryLabel, marginTop: 2 },
  recordActions: { flexDirection: 'row' as const, gap: 8, marginTop: 10 },
  settleBox: { marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: c.cardRaised, gap: 10 },
  empty: { paddingVertical: 48, paddingHorizontal: 40, alignItems: 'center' as const },
  emptyTitle: { ...type.title3, color: c.label },
  emptySub: { ...type.subheadline, color: c.secondaryLabel, marginTop: 6, textAlign: 'center' as const },
});
