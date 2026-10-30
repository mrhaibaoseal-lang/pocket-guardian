import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  computeDebtAging,
  convertToFeelings,
  type AccountId,
  type DebtDirection,
  type DebtRecord,
} from '../../core';
import { LiquidGlassCard } from '../components/LiquidGlassView';
import { SafeConfirmButton } from '../components/SafeConfirmButton';
import { useLedger } from '../store/useLedger';

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso.slice(0, 10);
  }
}

const QUICK_TITLES = ['🍱 聚餐代墊', '🧋 飲料外送', '🎬 電影門票', '🛍️ 合購湊單', '💵 借現金'];

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

export function DebtsScreen() {
  const {
    data,
    addDebt,
    settleDebt,
    netPersonDebts,
    deleteDebt,
    addQuickExpense,
  } = useLedger();

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
  const [syncAccount, setSyncAccount] = useState<AccountId | null>(null);

  const [aaTotalInput, setAaTotalInput] = useState('');
  const [aaTitleInput, setAaTitleInput] = useState('聚餐 AA 拆帳');
  const [aaPeopleCountInput, setAaPeopleCountInput] = useState('4');
  const [aaFriendsInput, setAaFriendsInput] = useState('');
  const [aaIncludeSelf, setAaIncludeSelf] = useState(true);
  const [aaSyncAccount, setAaSyncAccount] = useState<AccountId | null>('bank');

  const [settlingDebtId, setSettlingDebtId] = useState<string | null>(null);
  const [settleAmountInput, setSettleAmountInput] = useState('');
  const [settleAccount, setSettleAccount] = useState<AccountId | null>('bank');
  const [settleNote, setSettleNote] = useState('');
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
    const owedToMePeople = new Set<string>();
    const iOwePeople = new Set<string>();

    for (const d of openDebts) {
      if (d.direction === 'owed_to_me') {
        owedToMe += d.remainingAmount;
        owedToMePeople.add(d.personName.trim());
      } else {
        iOwe += d.remainingAmount;
        iOwePeople.add(d.personName.trim());
      }
    }
    return {
      owedToMe,
      iOwe,
      net: owedToMe - iOwe,
      owedToMeCount: owedToMePeople.size,
      iOweCount: iOwePeople.size,
    };
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
      .map((g) => ({
        ...g,
        netAmount: g.owedToMeOpen - g.iOweOpen,
        canAutoNet: g.owedToMeOpen > 0 && g.iOweOpen > 0,
      }))
      .sort((a, b) => {
        const aOpen = a.openRecords.length > 0 ? 1 : 0;
        const bOpen = b.openRecords.length > 0 ? 0 : -1;
        if (aOpen !== bOpen) return b.openRecords.length - a.openRecords.length;
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
      .map((s) => s.trim())
      .filter(Boolean);
    const countFromInput = Math.max(2, Math.round(Number(aaPeopleCountInput) || 2));
    const friendCount = names.length > 0 ? names.length : Math.max(1, countFromInput - (aaIncludeSelf ? 1 : 0));
    const totalPeople = friendCount + (aaIncludeSelf ? 1 : 0);
    const perPerson = total > 0 ? Math.round(total / totalPeople) : 0;
    const friendList =
      names.length > 0
        ? names
        : Array.from({ length: friendCount }, (_, i) => `朋友${i + 1}`);
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
      syncAccountId: syncAccount,
    });
    setPersonName('');
    setAmountInput('');
    setTitleInput('');
    setNoteInput('');
    setComposerMode('none');
  };

  const handleCreateAaSplit = () => {
    if (aaPreview.total <= 0 || aaPreview.perPerson <= 0) return;
    const cleanTitle = aaTitleInput.trim() || '聚餐 AA 拆帳';
    if (aaSyncAccount && aaPreview.selfShare > 0) {
      addQuickExpense(
        aaPreview.selfShare,
        aaSyncAccount === 'bank' ? 'bank_transfer' : 'cash',
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
        syncAccountId: aaSyncAccount,
      });
    }
    setAaTotalInput('');
    setAaFriendsInput('');
    setComposerMode('none');
  };

  const openSettleDrawer = (d: DebtRecord) => {
    if (settlingDebtId === d.id) {
      setSettlingDebtId(null);
      return;
    }
    setSettlingDebtId(d.id);
    setSettleAmountInput(String(d.remainingAmount));
    setSettleAccount('bank');
    setSettleNote('');
  };

  const handleConfirmSettle = (d: DebtRecord) => {
    const amt = Math.round(Number(settleAmountInput) || 0);
    if (amt <= 0) return;
    settleDebt(d.id, amt, settleAccount, settleNote.trim() || null);
    setSettlingDebtId(null);
  };

  const renderDebtRecordCard = (d: DebtRecord, compact = false) => {
    const isOwedToMe = d.direction === 'owed_to_me';
    const isSettled = d.status === 'settled' || d.remainingAmount <= 0;
    const paidSoFar = Math.max(0, d.originalAmount - d.remainingAmount);
    const progressPct =
      d.originalAmount > 0 ? Math.min(100, Math.round((paidSoFar / d.originalAmount) * 100)) : 100;
    const aging = computeDebtAging(d.direction, d.occurredAt, nowIso);
    const feelings = convertToFeelings(d.remainingAmount, data.settings);
    const isSettlingThis = settlingDebtId === d.id;

    return (
      <View
        key={d.id}
        style={[
          styles.recordCard,
          compact && styles.recordCardCompact,
          isSettled && styles.recordCardSettled,
        ]}
      >
        <View style={styles.recordTopRow}>
          <View style={styles.recordTitleCol}>
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.dirBadge,
                  isOwedToMe ? styles.dirBadgeGreen : styles.dirBadgeCoral,
                ]}
              >
                <Text
                  style={[
                    styles.dirBadgeText,
                    isOwedToMe ? styles.dirBadgeTextGreen : styles.dirBadgeTextCoral,
                  ]}
                >
                  {isOwedToMe ? `🟢 ${d.personName} 欠我` : `🔴 我欠 ${d.personName}`}
                </Text>
              </View>

              {!isSettled && (
                <View
                  style={[
                    styles.agingBadge,
                    aging.level === 'frozen' || aging.level === 'urgent'
                      ? styles.agingBadgeAlert
                      : aging.level === 'warm'
                      ? styles.agingBadgeWarm
                      : styles.agingBadgeFresh,
                  ]}
                >
                  <Text style={styles.agingBadgeText}>{aging.badge}</Text>
                </View>
              )}

              {d.accountSuffix ? (
                <View style={styles.suffixBadge}>
                  <Text style={styles.suffixBadgeText}>⚡ 末碼 {d.accountSuffix}</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.recordTitle}>{d.title}</Text>
            <Text style={styles.recordMeta}>
              {formatShortDate(d.occurredAt)}
              {!isSettled
                ? ` · 約 ${feelings.bentos} 個便當 🍱 / ${feelings.hours} 小時工時 ⏱️`
                : ' · ✅ 已結清'}
            </Text>
          </View>

          <View style={styles.recordAmountCol}>
            <Text
              style={[
                styles.recordAmount,
                isSettled
                  ? styles.amountSettled
                  : isOwedToMe
                  ? styles.amountGreen
                  : styles.amountCoral,
              ]}
            >
              {isOwedToMe ? '+' : '-'}$
              {(isSettled ? d.originalAmount : d.remainingAmount).toLocaleString()}
            </Text>
            {paidSoFar > 0 && !isSettled && (
              <Text style={styles.originalAmtHint}>
                原始 ${d.originalAmount.toLocaleString()}
              </Text>
            )}
          </View>
        </View>

        {(paidSoFar > 0 || d.settlements.length > 0) && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressText}>
                已{isOwedToMe ? '收回' : '歸還'} ${paidSoFar.toLocaleString()} / $
                {d.originalAmount.toLocaleString()} ({progressPct}%)
              </Text>
              {!isSettled && (
                <Text style={styles.progressRemainText}>
                  還差 ${d.remainingAmount.toLocaleString()}
                </Text>
              )}
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  isOwedToMe ? styles.progressFillGreen : styles.progressFillCoral,
                  { width: `${progressPct}%` },
                ]}
              />
            </View>
            {d.settlements.map((s) => (
              <Text key={s.id} style={styles.settlementHistoryItem}>
                ↳ {formatShortDate(s.settledAt)}：{isOwedToMe ? '收回' : '歸還'} $
                {s.amount.toLocaleString()}
                {s.accountId === 'bank'
                  ? '（玉山銀行）'
                  : s.accountId === 'cash'
                  ? '（現金錢包）'
                  : ''}
                {s.note ? ` · ${s.note}` : ''}
              </Text>
            ))}
          </View>
        )}

        {d.note ? <Text style={styles.recordNote}>備註：{d.note}</Text> : null}

        {!isSettled ? (
          <View style={styles.recordActionsRow}>
            <Pressable
              style={[
                styles.settleTriggerBtn,
                isOwedToMe ? styles.settleTriggerGreen : styles.settleTriggerCoral,
              ]}
              onPress={() => openSettleDrawer(d)}
            >
              <Text style={styles.settleTriggerText}>
                {isSettlingThis
                  ? '✕ 收起面板'
                  : isOwedToMe
                  ? '💰 收款／部分收回'
                  : '💸 還款／部分歸還'}
              </Text>
            </Pressable>

            <SafeConfirmButton
              label="刪除"
              confirmLabel="確認刪除"
              onConfirm={() => deleteDebt(d.id)}
              compact
            />
          </View>
        ) : (
          <View style={styles.recordActionsRow}>
            <Text style={styles.settledDateHint}>
              結清於 {d.settledAt ? formatShortDate(d.settledAt) : '近期'}
            </Text>
            <SafeConfirmButton
              label="刪除紀錄"
              confirmLabel="確認刪除"
              onConfirm={() => deleteDebt(d.id)}
              compact
            />
          </View>
        )}

        {isSettlingThis && !isSettled && (
          <View style={styles.settleDrawer}>
            <Text style={styles.drawerTitle}>
              {isOwedToMe
                ? `🟢 紀錄「${d.personName}」還錢給我`
                : `🔴 紀錄我還錢給「${d.personName}」`}
            </Text>

            <View style={styles.drawerAmountRow}>
              <TextInput
                style={styles.drawerInput}
                keyboardType="numeric"
                value={settleAmountInput}
                onChangeText={setSettleAmountInput}
                placeholder="輸入金額"
                placeholderTextColor="rgba(235, 225, 210, 0.35)"
              />
              <Pressable
                style={styles.quickPctChip}
                onPress={() =>
                  setSettleAmountInput(String(Math.max(1, Math.round(d.remainingAmount / 2))))
                }
              >
                <Text style={styles.quickPctChipText}>先還一半</Text>
              </Pressable>
              <Pressable
                style={styles.quickPctChip}
                onPress={() => setSettleAmountInput(String(d.remainingAmount))}
              >
                <Text style={styles.quickPctChipText}>全額 ${d.remainingAmount}</Text>
              </Pressable>
            </View>

            <Text style={styles.drawerLabel}>同步更新帳戶餘額（不影響個人消費預算）：</Text>
            <View style={styles.accountSelectorRow}>
              {(
                [
                  { id: 'bank' as const, label: '🏦 玉山銀行' },
                  { id: 'cash' as const, label: '💵 現金錢包' },
                  { id: null, label: '📝 僅勾銷狀態' },
                ] as const
              ).map((opt) => {
                const active = settleAccount === opt.id;
                return (
                  <Pressable
                    key={String(opt.id)}
                    style={[styles.acctOptionBtn, active && styles.acctOptionBtnActive]}
                    onPress={() => setSettleAccount(opt.id)}
                  >
                    <Text
                      style={[
                        styles.acctOptionText,
                        active && styles.acctOptionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={styles.confirmSettleBtn}
              onPress={() => handleConfirmSettle(d)}
            >
              <Text style={styles.confirmSettleBtnText}>
                ✅ 確認{isOwedToMe ? '收回' : '歸還'} ${Number(settleAmountInput) || 0}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const owedFeelings = convertToFeelings(totals.owedToMe, data.settings);
  const iOweFeelings = convertToFeelings(totals.iOwe, data.settings);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.screenTitle}>人情欠款與代墊拆帳</Text>
          <Text style={styles.screenSub}>
            支援同人雙向自動互抵、分次還款進度、AA 拆帳保護個人預算與轉帳末 5 碼沖銷
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Dual Summary Cards: Owed To Me vs I Owe */}
        <View style={styles.summaryTwinRow}>
          <LiquidGlassCard style={styles.summaryHalfCard} contentStyle={styles.summaryHalfInner}>
            <Text style={styles.summaryTagGreen}>🟢 別人欠我（待收回）</Text>
            <Text style={styles.summaryBigGreen}>${totals.owedToMe.toLocaleString()}</Text>
            <Text style={styles.summarySubText}>
              {totals.owedToMeCount} 人未結清 · 約 {owedFeelings.bentos} 個便當 🍱
            </Text>
          </LiquidGlassCard>

          <LiquidGlassCard style={styles.summaryHalfCard} contentStyle={styles.summaryHalfInner}>
            <Text style={styles.summaryTagCoral}>🔴 我欠別人（待歸還）</Text>
            <Text style={styles.summaryBigCoral}>${totals.iOwe.toLocaleString()}</Text>
            <Text style={styles.summarySubText}>
              {totals.iOweCount} 人待還 · 約 {iOweFeelings.hours} 小時工時 ⏱️
            </Text>
          </LiquidGlassCard>
        </View>

        {/* Net Balance Strip & Quick Composer Triggers */}
        <LiquidGlassCard contentStyle={styles.netStripInner}>
          <View style={styles.netStripTop}>
            <Text style={styles.netStripLabel}>⚖️ 雙向相抵淨額</Text>
            <Text
              style={[
                styles.netStripValue,
                totals.net > 0
                  ? styles.amountGreen
                  : totals.net < 0
                  ? styles.amountCoral
                  : styles.amountNeutral,
              ]}
            >
              {totals.net > 0
                ? `+$${totals.net.toLocaleString()}（淨收回）`
                : totals.net < 0
                ? `-$${Math.abs(totals.net).toLocaleString()}（淨待還）`
                : '$0（目前兩清）'}
            </Text>
          </View>

          <View style={styles.composerTriggerRow}>
            <Pressable
              style={[
                styles.composerBtnPrimary,
                composerMode === 'single' && styles.composerBtnActive,
              ]}
              onPress={() =>
                setComposerMode(composerMode === 'single' ? 'none' : 'single')
              }
            >
              <Text style={styles.composerBtnPrimaryText}>
                {composerMode === 'single' ? '✕ 收起新增' : '＋ 新增欠款（誰欠誰）'}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.composerBtnSecondary,
                composerMode === 'aa_split' && styles.composerBtnActive,
              ]}
              onPress={() =>
                setComposerMode(composerMode === 'aa_split' ? 'none' : 'aa_split')
              }
            >
              <Text style={styles.composerBtnSecondaryText}>
                {composerMode === 'aa_split' ? '✕ 收起拆帳' : '🧮 聚餐 AA 拆帳'}
              </Text>
            </Pressable>
          </View>
        </LiquidGlassCard>

        {composerMode === 'single' && (
          <LiquidGlassCard contentStyle={styles.composerCard}>
            <Text style={styles.composerHeaderTitle}>✍️ 新增一筆欠款紀錄</Text>

            <View style={styles.dirSwitchRow}>
              <Pressable
                style={[
                  styles.dirSwitchBtn,
                  direction === 'owed_to_me' && styles.dirSwitchBtnGreenActive,
                ]}
                onPress={() => setDirection('owed_to_me')}
              >
                <Text
                  style={[
                    styles.dirSwitchText,
                    direction === 'owed_to_me' && styles.dirSwitchTextGreenActive,
                  ]}
                >
                  🟢 別人欠我（我先墊／借出）
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.dirSwitchBtn,
                  direction === 'i_owe' && styles.dirSwitchBtnCoralActive,
                ]}
                onPress={() => setDirection('i_owe')}
              >
                <Text
                  style={[
                    styles.dirSwitchText,
                    direction === 'i_owe' && styles.dirSwitchTextCoralActive,
                  ]}
                >
                  🔴 我欠別人（朋友墊／借入）
                </Text>
              </Pressable>
            </View>

            {knownContacts.length > 0 && (
              <View style={styles.quickChipRow}>
                {knownContacts.map(([name, suf]) => (
                  <Pressable
                    key={name}
                    style={[
                      styles.contactChip,
                      personName === name && styles.contactChipActive,
                    ]}
                    onPress={() => {
                      setPersonName(name);
                      if (suf) setSuffixInput(suf);
                    }}
                  >
                    <Text style={styles.contactChipText}>
                      👤 {name}
                      {suf ? ` (${suf})` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.inputRow2Col}>
              <View style={styles.inputCol}>
                <Text style={styles.fieldLabel}>對象稱呼 *</Text>
                <TextInput
                  style={styles.textInput}
                  value={personName}
                  onChangeText={setPersonName}
                  placeholder="例如：阿明、小華"
                  placeholderTextColor="rgba(235, 225, 210, 0.35)"
                />
              </View>
              <View style={styles.inputCol}>
                <Text style={styles.fieldLabel}>金額 (NT$) *</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={amountInput}
                  onChangeText={setAmountInput}
                  placeholder="例如：350"
                  placeholderTextColor="rgba(235, 225, 210, 0.35)"
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>事由／項目（點選快速帶入）</Text>
            <View style={styles.quickChipRow}>
              {QUICK_TITLES.map((t) => (
                <Pressable
                  key={t}
                  style={styles.contactChip}
                  onPress={() => setTitleInput(t.slice(2).trim())}
                >
                  <Text style={styles.contactChipText}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.textInput}
              value={titleInput}
              onChangeText={setTitleInput}
              placeholder="例如：火鍋聚餐代墊、電影票"
              placeholderTextColor="rgba(235, 225, 210, 0.35)"
            />

            <View style={styles.inputRow2Col}>
              <View style={styles.inputCol}>
                <Text style={styles.fieldLabel}>對方帳號末 5 碼（選填）</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  maxLength={5}
                  value={suffixInput}
                  onChangeText={setSuffixInput}
                  placeholder="轉帳截圖自動沖銷用"
                  placeholderTextColor="rgba(235, 225, 210, 0.35)"
                />
              </View>
              <View style={styles.inputCol}>
                <Text style={styles.fieldLabel}>備註（選填）</Text>
                <TextInput
                  style={styles.textInput}
                  value={noteInput}
                  onChangeText={setNoteInput}
                  placeholder="例如：月底還"
                  placeholderTextColor="rgba(235, 225, 210, 0.35)"
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>是否同步目前帳戶餘額（代墊不扣個人預算）：</Text>
            <View style={styles.accountSelectorRow}>
              {(
                [
                  { id: null, label: '📝 僅記欠款' },
                  { id: 'bank' as const, label: '🏦 同步玉山' },
                  { id: 'cash' as const, label: '💵 同步現金' },
                ] as const
              ).map((opt) => {
                const active = syncAccount === opt.id;
                return (
                  <Pressable
                    key={String(opt.id)}
                    style={[styles.acctOptionBtn, active && styles.acctOptionBtnActive]}
                    onPress={() => setSyncAccount(opt.id)}
                  >
                    <Text
                      style={[
                        styles.acctOptionText,
                        active && styles.acctOptionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.submitBtn} onPress={handleCreateSingleDebt}>
              <Text style={styles.submitBtnText}>
                💾 儲存這筆{direction === 'owed_to_me' ? '「別人欠我」' : '「我欠別人」'}
              </Text>
            </Pressable>
          </LiquidGlassCard>
        )}

        {/* Idea 2: AA Split Calculator Composer */}
        {composerMode === 'aa_split' && (
          <LiquidGlassCard contentStyle={styles.composerCard}>
            <Text style={styles.composerHeaderTitle}>
              🧮 聚餐代墊 AA 拆帳（保護個人預算不被朋友吃掉）
            </Text>

            <View style={styles.inputRow2Col}>
              <View style={styles.inputCol}>
                <Text style={styles.fieldLabel}>帳單總金額 *</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={aaTotalInput}
                  onChangeText={setAaTotalInput}
                  placeholder="例如：2000"
                  placeholderTextColor="rgba(235, 225, 210, 0.35)"
                />
              </View>
              <View style={styles.inputCol}>
                <Text style={styles.fieldLabel}>總人數（含自己）*</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={aaPeopleCountInput}
                  onChangeText={setAaPeopleCountInput}
                  placeholder="例如：4"
                  placeholderTextColor="rgba(235, 225, 210, 0.35)"
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>聚餐／代墊項目名稱</Text>
            <TextInput
              style={styles.textInput}
              value={aaTitleInput}
              onChangeText={setAaTitleInput}
              placeholder="例如：海底撈聚餐"
              placeholderTextColor="rgba(235, 225, 210, 0.35)"
            />

            <Text style={styles.fieldLabel}>
              朋友名單（以逗號或空白分隔；未填則自動產生朋友1、朋友2...）
            </Text>
            <TextInput
              style={styles.textInput}
              value={aaFriendsInput}
              onChangeText={setAaFriendsInput}
              placeholder="例如：阿明, 小華, 阿哲"
              placeholderTextColor="rgba(235, 225, 210, 0.35)"
            />

            <View style={styles.aaPreviewBox}>
              <Text style={styles.aaPreviewTitle}>
                ⚡ 即時拆帳試算：{aaPreview.totalPeople} 人平分，每人 ${aaPreview.perPerson}
              </Text>
              <Text style={styles.aaPreviewSub}>
                · 個人自付：${aaPreview.selfShare}（僅這筆計入個人消費預算）
              </Text>
              <Text style={styles.aaPreviewSub}>
                · 幫 {aaPreview.friendCount} 位朋友代墊：共 ${aaPreview.advanceTotal}（不扣個人預算！）
              </Text>
            </View>

            <Text style={styles.fieldLabel}>先付款帳戶（若已由捷徑入帳可選「僅建欠款」）：</Text>
            <View style={styles.accountSelectorRow}>
              {(
                [
                  { id: 'bank' as const, label: '🏦 玉山先付' },
                  { id: 'cash' as const, label: '💵 現金先付' },
                  { id: null, label: '📝 僅建欠款' },
                ] as const
              ).map((opt) => {
                const active = aaSyncAccount === opt.id;
                return (
                  <Pressable
                    key={String(opt.id)}
                    style={[styles.acctOptionBtn, active && styles.acctOptionBtnActive]}
                    onPress={() => setAaSyncAccount(opt.id)}
                  >
                    <Text
                      style={[
                        styles.acctOptionText,
                        active && styles.acctOptionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.submitBtn} onPress={handleCreateAaSplit}>
              <Text style={styles.submitBtnText}>
                🧮 一鍵建立 {aaPreview.friendCount} 筆代墊欠款（每人 ${aaPreview.perPerson}）
              </Text>
            </Pressable>
          </LiquidGlassCard>
        )}

        <View style={styles.segmentRow}>
          <Pressable
            style={[styles.segmentBtn, viewTab === 'people' && styles.segmentBtnActive]}
            onPress={() => setViewTab('people')}
          >
            <Text style={[styles.segmentText, viewTab === 'people' && styles.segmentTextActive]}>
              👤 依對象歸戶 ({peopleGroups.length})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.segmentBtn, viewTab === 'list' && styles.segmentBtnActive]}
            onPress={() => setViewTab('list')}
          >
            <Text style={[styles.segmentText, viewTab === 'list' && styles.segmentTextActive]}>
              📋 未結清 ({openDebts.length})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.segmentBtn, viewTab === 'settled' && styles.segmentBtnActive]}
            onPress={() => setViewTab('settled')}
          >
            <Text style={[styles.segmentText, viewTab === 'settled' && styles.segmentTextActive]}>
              ✅ 已結清 ({settledDebts.length})
            </Text>
          </Pressable>
        </View>

        {viewTab === 'people' && (
          <View style={styles.listStack}>
            {peopleGroups.length === 0 ? (
              <LiquidGlassCard contentStyle={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🤝</Text>
                <Text style={styles.emptyTitle}>目前沒有任何欠款或借貸紀錄</Text>
                <Text style={styles.emptyDesc}>
                  點選上方「＋ 新增欠款」或「🧮 聚餐 AA 拆帳」，也可以從「☰ 明細」把既有消費一鍵轉為朋友代墊！
                </Text>
              </LiquidGlassCard>
            ) : (
              peopleGroups.map((g) => {
                const isExpanded =
                  expandedPerson === g.personName || peopleGroups.length <= 2;
                const overlap = Math.min(g.owedToMeOpen, g.iOweOpen);

                return (
                  <LiquidGlassCard key={g.personName} contentStyle={styles.personCard}>
                    <Pressable
                      style={styles.personHeaderRow}
                      onPress={() =>
                        setExpandedPerson(
                          expandedPerson === g.personName ? null : g.personName,
                        )
                      }
                    >
                      <View style={styles.personLeft}>
                        <View style={styles.personAvatar}>
                          <Text style={styles.personAvatarText}>
                            {g.personName.slice(0, 1)}
                          </Text>
                        </View>
                        <View>
                          <View style={styles.personNameRow}>
                            <Text style={styles.personName}>{g.personName}</Text>
                            {g.accountSuffix && (
                              <View style={styles.suffixBadge}>
                                <Text style={styles.suffixBadgeText}>
                                  末碼 {g.accountSuffix}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.personSubStats}>
                            他欠我 ${g.owedToMeOpen.toLocaleString()} · 我欠他 $
                            {g.iOweOpen.toLocaleString()}（未結 {g.openRecords.length} 筆）
                          </Text>
                        </View>
                      </View>

                      <View style={styles.personRight}>
                        <Text
                          style={[
                            styles.personNetAmt,
                            g.netAmount > 0
                              ? styles.amountGreen
                              : g.netAmount < 0
                              ? styles.amountCoral
                              : styles.amountSettled,
                          ]}
                        >
                          {g.netAmount > 0
                            ? `+$${g.netAmount.toLocaleString()}`
                            : g.netAmount < 0
                            ? `-$${Math.abs(g.netAmount).toLocaleString()}`
                            : '已兩清'}
                        </Text>
                        <Text style={styles.expandHint}>
                          {isExpanded ? '▲ 收起明細' : '▼ 展開明細'}
                        </Text>
                      </View>
                    </Pressable>

                    {g.canAutoNet && (
                      <View style={styles.autoNetBanner}>
                        <View style={styles.autoNetInfo}>
                          <Text style={styles.autoNetTitle}>
                            ⚡ 發現雙向欠款！可自動對沖 ${overlap.toLocaleString()}
                          </Text>
                          <Text style={styles.autoNetDesc}>
                            {g.netAmount > 0
                              ? `互抵後「${g.personName}」只需再還你 $${g.netAmount.toLocaleString()}`
                              : g.netAmount < 0
                              ? `互抵後你只需再還「${g.personName}」$${Math.abs(g.netAmount).toLocaleString()}`
                              : '互抵後雙邊剛好完全兩清 $0！'}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.autoNetBtn}
                          onPress={() => netPersonDebts(g.personName)}
                        >
                          <Text style={styles.autoNetBtnText}>⚡ 一鍵互抵</Text>
                        </Pressable>
                      </View>
                    )}

                    {isExpanded && (
                      <View style={styles.personRecordsList}>
                        {g.openRecords.map((r) => renderDebtRecordCard(r, true))}
                        {g.openRecords.length === 0 && g.settledRecords.length > 0 && (
                          <Text style={styles.allSettledText}>
                            ✨ 與 {g.personName} 的 {g.settledRecords.length} 筆往來皆已結清
                          </Text>
                        )}
                      </View>
                    )}
                  </LiquidGlassCard>
                );
              })
            )}
          </View>
        )}

        {viewTab === 'list' && (
          <View style={styles.listStack}>
            {openDebts.length === 0 ? (
              <LiquidGlassCard contentStyle={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🎉</Text>
                <Text style={styles.emptyTitle}>太棒了！目前沒有未結清的欠款</Text>
                <Text style={styles.emptyDesc}>所有往來帳目都已結清囉。</Text>
              </LiquidGlassCard>
            ) : (
              openDebts.map((d) => (
                <LiquidGlassCard key={d.id} contentStyle={styles.singleRecordCardWrap}>
                  {renderDebtRecordCard(d, false)}
                </LiquidGlassCard>
              ))
            )}
          </View>
        )}

        {viewTab === 'settled' && (
          <View style={styles.listStack}>
            {settledDebts.length === 0 ? (
              <LiquidGlassCard contentStyle={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🗂️</Text>
                <Text style={styles.emptyTitle}>尚無已結清歷史紀錄</Text>
                <Text style={styles.emptyDesc}>結清或自動互抵後的欠款會保存在這裡供日後查帳。</Text>
              </LiquidGlassCard>
            ) : (
              settledDebts.map((d) => (
                <LiquidGlassCard key={d.id} contentStyle={styles.singleRecordCardWrap}>
                  {renderDebtRecordCard(d, false)}
                </LiquidGlassCard>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  headerRow: {
    marginBottom: 10,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 34,
    gap: 10,
  },
  summaryTwinRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryHalfCard: {
    flex: 1,
  },
  summaryHalfInner: {
    padding: 13,
    gap: 4,
  },
  summaryTagGreen: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  summaryBigGreen: {
    color: '#34D399',
    fontSize: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
  },
  summaryTagCoral: {
    color: '#FB7185',
    fontSize: 11,
    fontWeight: '700',
  },
  summaryBigCoral: {
    color: '#FB7185',
    fontSize: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
  },
  summarySubText: {
    color: 'rgba(235, 225, 210, 0.55)',
    fontSize: 10.5,
  },
  netStripInner: {
    padding: 12,
    gap: 10,
  },
  netStripTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netStripLabel: {
    color: '#E6D5B8',
    fontSize: 13,
    fontWeight: '700',
  },
  netStripValue: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  composerTriggerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  composerBtnPrimary: {
    flex: 1.15,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.4)',
    alignItems: 'center',
  },
  composerBtnSecondary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
    alignItems: 'center',
  },
  composerBtnActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.28)',
    borderColor: '#FBBF24',
  },
  composerBtnPrimaryText: {
    color: '#FBBF24',
    fontSize: 12.5,
    fontWeight: '700',
  },
  composerBtnSecondaryText: {
    color: '#FAF6F0',
    fontSize: 12.5,
    fontWeight: '700',
  },
  composerCard: {
    padding: 15,
    gap: 10,
  },
  composerHeaderTitle: {
    color: '#FAF6F0',
    fontSize: 15,
    fontWeight: '700',
  },
  dirSwitchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dirSwitchBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(214, 195, 165, 0.1)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.22)',
    alignItems: 'center',
  },
  dirSwitchBtnGreenActive: {
    backgroundColor: 'rgba(52, 211, 153, 0.16)',
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  dirSwitchBtnCoralActive: {
    backgroundColor: 'rgba(251, 113, 133, 0.16)',
    borderColor: 'rgba(251, 113, 133, 0.45)',
  },
  dirSwitchText: {
    color: 'rgba(235, 225, 210, 0.65)',
    fontSize: 11.5,
    fontWeight: '600',
  },
  dirSwitchTextGreenActive: {
    color: '#34D399',
    fontWeight: '700',
  },
  dirSwitchTextCoralActive: {
    color: '#FB7185',
    fontWeight: '700',
  },
  quickChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  contactChip: {
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderColor: 'rgba(230, 213, 184, 0.25)',
    borderWidth: 0.8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  contactChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: '#FBBF24',
  },
  contactChipText: {
    color: '#E6D5B8',
    fontSize: 11,
    fontWeight: '600',
  },
  inputRow2Col: {
    flexDirection: 'row',
    gap: 8,
  },
  inputCol: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    color: 'rgba(235, 225, 210, 0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: 'rgba(12, 10, 8, 0.65)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    color: '#FAF6F0',
    fontSize: 13,
  },
  accountSelectorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  acctOptionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(214, 195, 165, 0.1)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.22)',
    alignItems: 'center',
  },
  acctOptionBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#FBBF24',
  },
  acctOptionText: {
    color: 'rgba(235, 225, 210, 0.65)',
    fontSize: 11,
    fontWeight: '600',
  },
  acctOptionTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#F59E0B',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#080705',
    fontSize: 13.5,
    fontWeight: '800',
  },
  aaPreviewBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    borderRadius: 12,
    padding: 10,
    gap: 3,
  },
  aaPreviewTitle: {
    color: '#FBBF24',
    fontSize: 12.5,
    fontWeight: '700',
  },
  aaPreviewSub: {
    color: '#E6D5B8',
    fontSize: 11,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: 'rgba(251, 191, 36, 0.38)',
  },
  segmentText: {
    color: '#E6D5B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  listStack: {
    gap: 10,
  },
  emptyBox: {
    padding: 26,
    alignItems: 'center',
    gap: 6,
  },
  emptyEmoji: {
    fontSize: 30,
    marginBottom: 2,
  },
  emptyTitle: {
    color: '#FAF6F0',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyDesc: { color: 'rgba(235, 225, 210, 0.55)', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  personCard: { padding: 14, gap: 10 },
  personHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  personLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  personAvatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: { color: '#FBBF24', fontSize: 16, fontWeight: '800' },
  personNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  personName: { color: '#FAF6F0', fontSize: 16, fontWeight: '700' },
  personSubStats: { color: 'rgba(235, 225, 210, 0.55)', fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
  personRight: { alignItems: 'flex-end' },
  personNetAmt: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  expandHint: { color: 'rgba(235, 225, 210, 0.45)', fontSize: 10, marginTop: 2 },
  autoNetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 8,
  },
  autoNetInfo: { flex: 1, gap: 2 },
  autoNetTitle: { color: '#FBBF24', fontSize: 12, fontWeight: '700' },
  autoNetDesc: { color: '#E6D5B8', fontSize: 11 },
  autoNetBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  autoNetBtnText: { color: '#080705', fontSize: 11.5, fontWeight: '800' },
  personRecordsList: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(230, 213, 184, 0.18)',
    paddingTop: 10,
  },
  allSettledText: { color: 'rgba(235, 225, 210, 0.5)', fontSize: 11.5, textAlign: 'center', paddingVertical: 4 },
  singleRecordCardWrap: { padding: 14 },
  recordCard: { gap: 8 },
  recordCardCompact: {
    backgroundColor: 'rgba(12, 10, 8, 0.45)',
    borderRadius: 12,
    padding: 11,
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.14)',
  },
  recordCardSettled: { opacity: 0.72 },
  recordTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  recordTitleCol: { flex: 1, gap: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 2 },
  dirBadge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 999, borderWidth: 0.8 },
  dirBadgeGreen: { backgroundColor: 'rgba(52, 211, 153, 0.14)', borderColor: 'rgba(52, 211, 153, 0.35)' },
  dirBadgeCoral: { backgroundColor: 'rgba(251, 113, 133, 0.14)', borderColor: 'rgba(251, 113, 133, 0.35)' },
  dirBadgeText: { fontSize: 10.5, fontWeight: '700' },
  dirBadgeTextGreen: { color: '#34D399' },
  dirBadgeTextCoral: { color: '#FB7185' },
  agingBadge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 999, borderWidth: 0.8 },
  agingBadgeFresh: { backgroundColor: 'rgba(214, 195, 165, 0.12)', borderColor: 'rgba(230, 213, 184, 0.25)' },
  agingBadgeWarm: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(251, 191, 36, 0.35)' },
  agingBadgeAlert: { backgroundColor: 'rgba(244, 63, 94, 0.18)', borderColor: 'rgba(251, 113, 133, 0.45)' },
  agingBadgeText: { color: '#FAF6F0', fontSize: 10, fontWeight: '600' },
  suffixBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.35)',
    borderWidth: 0.8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  suffixBadgeText: { color: '#FBBF24', fontSize: 10, fontWeight: '700' },
  recordTitle: { color: '#FAF6F0', fontSize: 15, fontWeight: '700' },
  recordMeta: { color: 'rgba(235, 225, 210, 0.5)', fontSize: 11, fontVariant: ['tabular-nums'] },
  recordAmountCol: { alignItems: 'flex-end' },
  recordAmount: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  amountGreen: { color: '#34D399' },
  amountCoral: { color: '#FB7185' },
  amountNeutral: { color: '#E6D5B8' },
  amountSettled: { color: 'rgba(235, 225, 210, 0.45)' },
  originalAmtHint: { color: 'rgba(235, 225, 210, 0.45)', fontSize: 10, marginTop: 2 },
  progressSection: { backgroundColor: 'rgba(18, 15, 12, 0.55)', borderRadius: 10, padding: 8, gap: 5 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { color: '#E6D5B8', fontSize: 11, fontWeight: '600' },
  progressRemainText: { color: '#FBBF24', fontSize: 11, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: 'rgba(230, 213, 184, 0.14)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  progressFillGreen: { backgroundColor: '#34D399' },
  progressFillCoral: { backgroundColor: '#FB7185' },
  settlementHistoryItem: { color: 'rgba(235, 225, 210, 0.6)', fontSize: 10.5 },
  recordNote: { color: '#E6D5B8', fontSize: 11.5 },
  recordActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  settleTriggerBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 0.8 },
  settleTriggerGreen: { backgroundColor: 'rgba(52, 211, 153, 0.16)', borderColor: 'rgba(52, 211, 153, 0.4)' },
  settleTriggerCoral: { backgroundColor: 'rgba(251, 113, 133, 0.16)', borderColor: 'rgba(251, 113, 133, 0.4)' },
  settleTriggerText: { color: '#FAF6F0', fontSize: 11.5, fontWeight: '700' },
  settledDateHint: { color: 'rgba(235, 225, 210, 0.45)', fontSize: 11 },
  settleDrawer: {
    backgroundColor: 'rgba(18, 15, 12, 0.82)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    borderRadius: 12,
    padding: 11,
    gap: 8,
    marginTop: 4,
  },
  drawerTitle: { color: '#FAF6F0', fontSize: 12.5, fontWeight: '700' },
  drawerAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  drawerInput: {
    flex: 1,
    backgroundColor: 'rgba(8, 7, 5, 0.8)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.3)',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FAF6F0',
    fontSize: 13,
    fontWeight: '700',
  },
  quickPctChip: {
    backgroundColor: 'rgba(214, 195, 165, 0.14)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.28)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  quickPctChipText: { color: '#E6D5B8', fontSize: 11, fontWeight: '600' },
  drawerLabel: { color: 'rgba(235, 225, 210, 0.65)', fontSize: 11 },
  confirmSettleBtn: { backgroundColor: '#34D399', paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  confirmSettleBtnText: { color: '#062016', fontSize: 12.5, fontWeight: '800' },
});

