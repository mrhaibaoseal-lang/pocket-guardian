import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeConfirmButton } from '../components/SafeConfirmButton';
import { CellBox, FormRow } from '../components/ui/FormRow';
import { IconTile } from '../components/ui/Icon';
import { Button, LargeTitle, Row, Section } from '../components/ui/List';
import { PushedPage } from '../components/ui/PushedPage';
import { useLedger } from '../store/useLedger';
import { type, usePalette, useThemedStyles, type Palette } from '../theme';

type SubPage = 'none' | 'budget' | 'subs' | 'payees' | 'events' | 'cloud';

const PAGE_TITLES: Record<Exclude<SubPage, 'none'>, string> = {
  budget: '預算',
  subs: '固定扣款',
  payees: '常用轉帳對象',
  events: '收訊紀錄',
  cloud: '雲端同步',
};

type FieldKey = 'budget' | 'floor' | 'wage' | 'bento' | 'cycleDay' | 'ownSuffix';

interface ScreenProps {
  topInsetPadding?: number;
  bottomInsetPadding?: number;
  onOpenShortcuts?: () => void;
}

export function SettingsAndSubsScreen({
  topInsetPadding = 54,
  bottomInsetPadding = 120,
  onOpenShortcuts,
}: ScreenProps) {
  const {
    data,
    meta,
    addSubscription,
    toggleSubscription,
    deleteSubscription,
    addPayee,
    deletePayee,
    updateSettings,
    updateMeta,
    syncFromCloud,
    pushToCloud,
    resetDemoData,
  } = useLedger();
  const c = usePalette();
  const s = useThemedStyles(makeStyles);
  const [page, setPage] = useState<SubPage>('none');

  // --- New subscription form ---
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subDay, setSubDay] = useState('15');
  const [subAutoPost, setSubAutoPost] = useState(false);

  // --- New payee form ---
  const [payeeBankCode, setPayeeBankCode] = useState('808');
  const [payeeSuffix, setPayeeSuffix] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [payeeCategory] = useState('轉帳');

  // --- Core settings (auto-saved on blur) ---
  const [budgetStr, setBudgetStr] = useState(String(data.settings.monthlyBudget));
  const [floorStr, setFloorStr] = useState(String(data.settings.safetyFloor));
  const [wageStr, setWageStr] = useState(String(data.settings.hourlyWage));
  const [bentoStr, setBentoStr] = useState(String(data.settings.bentoPrice));
  const [cycleDayStr, setCycleDayStr] = useState(String(data.settings.cycleStartDay));
  const [ownSuffixStr, setOwnSuffixStr] = useState(data.settings.ownAccountSuffix);
  const focusedFieldRef = useRef<FieldKey | null>(null);
  const dirtyFieldsRef = useRef<Set<FieldKey>>(new Set());

  useEffect(() => {
    const sync = (key: FieldKey, apply: () => void) => {
      if (focusedFieldRef.current !== key && !dirtyFieldsRef.current.has(key)) apply();
    };
    sync('budget', () => setBudgetStr(String(data.settings.monthlyBudget)));
    sync('floor', () => setFloorStr(String(data.settings.safetyFloor)));
    sync('wage', () => setWageStr(String(data.settings.hourlyWage)));
    sync('bento', () => setBentoStr(String(data.settings.bentoPrice)));
    sync('cycleDay', () => setCycleDayStr(String(data.settings.cycleStartDay)));
    sync('ownSuffix', () => setOwnSuffixStr(data.settings.ownAccountSuffix));
  }, [
    data.settings.monthlyBudget,
    data.settings.safetyFloor,
    data.settings.hourlyWage,
    data.settings.bentoPrice,
    data.settings.cycleStartDay,
    data.settings.ownAccountSuffix,
  ]);

  const [workerUrlStr, setWorkerUrlStr] = useState(meta.workerUrl);
  const [tokenStr, setTokenStr] = useState(meta.ingestToken);

  const refreshedMs = Date.parse(meta.sidestoreRefreshedAt) || Date.now();
  const sidestoreDaysLeft = Math.max(0, 7 - Math.floor((Date.now() - refreshedMs) / 86400000));

  const handleSaveCoreSettings = () => {
    dirtyFieldsRef.current.clear();
    focusedFieldRef.current = null;
    const nextBudget = Math.max(0, Number(budgetStr) || 0);
    const nextFloor = Math.max(0, Number(floorStr) || 0);
    const nextWage = Math.max(0, Number(wageStr) || 0);
    const nextBento = Math.max(0, Number(bentoStr) || 0);
    const nextCycleDay = Math.min(28, Math.max(1, Number(cycleDayStr) || 1));
    const nextOwnSuffix = ownSuffixStr.trim() || '83151';
    setBudgetStr(String(nextBudget));
    setFloorStr(String(nextFloor));
    setWageStr(String(nextWage));
    setBentoStr(String(nextBento));
    setCycleDayStr(String(nextCycleDay));
    setOwnSuffixStr(nextOwnSuffix);
    updateSettings({
      monthlyBudget: nextBudget,
      safetyFloor: nextFloor,
      hourlyWage: nextWage,
      bentoPrice: nextBento,
      cycleStartDay: nextCycleDay,
      ownAccountSuffix: nextOwnSuffix,
    });
  };

  /** Props for an auto-saving settings field. */
  const bind = (key: FieldKey, value: string, setter: (v: string) => void) => ({
    value,
    onFocus: () => {
      focusedFieldRef.current = key;
    },
    onChangeText: (v: string) => {
      dirtyFieldsRef.current.add(key);
      setter(v);
    },
    onBlur: () => {
      if (focusedFieldRef.current === key) focusedFieldRef.current = null;
      handleSaveCoreSettings();
    },
  });

  const handleAddSub = () => {
    const amt = Number(subAmount);
    const day = Number(subDay);
    if (!subName.trim() || !Number.isFinite(amt) || amt <= 0) return;
    addSubscription(subName, amt, day || 1, subAutoPost);
    setSubName('');
    setSubAmount('');
  };

  const handleAddPayee = () => {
    if (!payeeSuffix.trim() || !payeeName.trim()) return;
    addPayee(payeeBankCode, payeeSuffix, payeeName, payeeCategory);
    setPayeeSuffix('');
    setPayeeName('');
  };

  const pageScroll = (children: React.ReactNode) => (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomInsetPadding }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );

  const renderPage = () => {
    switch (page) {
      case 'budget':
        return pageScroll(
          <>
            <Section footer="每月預算填 0 代表依照帳戶餘額自動計算。">
              <FormRow label="每月預算" keyboardType="numeric" {...bind('budget', budgetStr, setBudgetStr)} />
              <FormRow label="安全底線" keyboardType="numeric" {...bind('floor', floorStr, setFloorStr)} />
              <FormRow label="結算日" keyboardType="numeric" {...bind('cycleDay', cycleDayStr, setCycleDayStr)} />
            </Section>
            <Section header="換算" footer="用來把金額換算成「幾個便當」或「幾小時工時」。">
              <FormRow label="時薪" keyboardType="numeric" {...bind('wage', wageStr, setWageStr)} />
              <FormRow label="便當價格" keyboardType="numeric" {...bind('bento', bentoStr, setBentoStr)} />
            </Section>
            <Section header="帳戶" footer="用來辨識轉給自己的轉帳。">
              <FormRow
                label="帳號末五碼"
                keyboardType="numeric"
                placeholder="83151"
                {...bind('ownSuffix', ownSuffixStr, setOwnSuffixStr)}
              />
            </Section>
            <View style={s.pad}>
              <Button title="儲存" onPress={handleSaveCoreSettings} />
            </View>
          </>,
        );
      case 'subs':
        return pageScroll(
          <>
            {data.subscriptions.length > 0 ? (
              <Section footer="這些金額會在每月初先預留，扣款時自動配對，不會重複扣。">
                {data.subscriptions.map((sub) => (
                  <Row
                    key={sub.id}
                    title={sub.name}
                    titleStyle={!sub.isActive ? { color: c.secondaryLabel } : undefined}
                    subtitle={`每月 ${sub.billingDay} 號 · ${sub.autoPost ? '自動入帳' : '等銀行通知配對'}${sub.isActive ? '' : ' · 已暫停'}`}
                    value={`$${sub.amount.toLocaleString()}`}
                    trailing={
                      <View style={s.inlineActions}>
                        <Switch
                          value={sub.isActive}
                          onValueChange={() => toggleSubscription(sub.id)}
                          trackColor={{ true: c.accent, false: c.fillStrong }}
                        />
                        <SafeConfirmButton label="刪除" confirmLabel="確認" onConfirm={() => deleteSubscription(sub.id)} compact />
                      </View>
                    }
                  />
                ))}
              </Section>
            ) : null}
            <Section header="新增">
              <FormRow label="名稱" value={subName} onChangeText={setSubName} placeholder="Spotify" />
              <FormRow label="金額" value={subAmount} onChangeText={setSubAmount} keyboardType="numeric" placeholder="$0" />
              <FormRow label="扣款日" value={subDay} onChangeText={setSubDay} keyboardType="numeric" placeholder="15" />
              <Row
                title="沒有通知時自動入帳"
                trailing={
                  <Switch value={subAutoPost} onValueChange={setSubAutoPost} trackColor={{ true: c.accent, false: c.fillStrong }} />
                }
              />
            </Section>
            <View style={s.pad}>
              <Button title="新增固定扣款" onPress={handleAddSub} disabled={!subName.trim() || !(Number(subAmount) > 0)} />
            </View>
          </>,
        );
      case 'payees':
        return pageScroll(
          <>
            {data.payees.length > 0 ? (
              <Section footer="掃到轉帳截圖時，會用末五碼自動帶入對象名稱。">
                {data.payees.map((p) => (
                  <Row
                    key={p.id}
                    title={p.displayName}
                    subtitle={`${p.bankCode || '808'} · ****${p.accountSuffix} · ${p.defaultCategory}`}
                    trailing={<SafeConfirmButton label="刪除" confirmLabel="確認" onConfirm={() => deletePayee(p.id)} compact />}
                  />
                ))}
              </Section>
            ) : null}
            <Section header="新增">
              <FormRow label="暱稱" value={payeeName} onChangeText={setPayeeName} placeholder="室友房租" />
              <FormRow label="銀行代碼" value={payeeBankCode} onChangeText={setPayeeBankCode} keyboardType="numeric" placeholder="808" />
              <FormRow label="末五碼" value={payeeSuffix} onChangeText={setPayeeSuffix} keyboardType="numeric" maxLength={5} placeholder="24126" />
            </Section>
            <View style={s.pad}>
              <Button title="新增對象" onPress={handleAddPayee} disabled={!payeeSuffix.trim() || !payeeName.trim()} />
            </View>
          </>,
        );
      case 'events':
        return pageScroll(
          data.events.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>沒有收訊紀錄</Text>
              <Text style={s.emptySub}>捷徑或雲端送來的通知會顯示在這裡。</Text>
            </View>
          ) : (
            <Section header="最近 15 筆">
              {data.events
                .slice(-15)
                .reverse()
                .map((ev, idx) => (
                  <Row
                    key={ev.id || idx}
                    title={`${ev.parsed.kind}${ev.parsed.amount !== null ? ` · $${ev.parsed.amount.toLocaleString()}` : ''}`}
                    subtitle={`${ev.source} · ${ev.reason}`}
                  />
                ))}
            </Section>
          ),
        );
      case 'cloud':
        return pageScroll(
          <>
            <Section header="Cloudflare Worker" footer="金鑰留空代表不驗證，只建議測試時使用。">
              <CellBox>
                <Text style={s.fieldLabel}>網址</Text>
                <FieldInline
                  value={workerUrlStr}
                  onChangeText={(v) => {
                    setWorkerUrlStr(v);
                    updateMeta({ workerUrl: v });
                  }}
                  placeholder="https://your-worker.workers.dev"
                />
              </CellBox>
              <CellBox>
                <Text style={s.fieldLabel}>X-Ingest-Token</Text>
                <FieldInline
                  value={tokenStr}
                  onChangeText={(v) => {
                    setTokenStr(v);
                    updateMeta({ ingestToken: v });
                  }}
                  placeholder="選填"
                />
              </CellBox>
            </Section>
            <Section>
              <Row title="從雲端下載" titleStyle={{ color: c.positive }} onPress={() => syncFromCloud().catch(() => undefined)} />
              <Row title="備份到雲端" titleStyle={{ color: c.positive }} onPress={() => pushToCloud().catch(() => undefined)} />
            </Section>
            <Section header="SideStore" footer="憑證過期也不影響雲端捷徑記帳，重新簽署後就會接上。">
              <Row
                title="憑證剩餘"
                value={`${sidestoreDaysLeft} 天`}
                valueStyle={sidestoreDaysLeft <= 1 ? { color: c.negative } : undefined}
              />
              <Row
                title="我已重新簽署"
                titleStyle={{ color: c.positive }}
                onPress={() => updateMeta({ sidestoreRefreshedAt: new Date().toISOString() })}
              />
            </Section>
          </>,
        );
      default:
        return null;
    }
  };

  return (
    <View style={s.screen}>
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ paddingTop: topInsetPadding, paddingBottom: bottomInsetPadding }}
        showsVerticalScrollIndicator={false}
      >
        <LargeTitle title="設定" />

        <Section separatorInset={58}>
          <Row
            leading={<IconTile name="sliders" bg={c.accent} />}
            title="預算"
            value={data.settings.monthlyBudget > 0 ? `$${data.settings.monthlyBudget.toLocaleString()}` : '依餘額'}
            chevron
            onPress={() => setPage('budget')}
          />
          <Row
            leading={<IconTile name="repeat" bg={c.indigo} />}
            title="固定扣款"
            value={String(data.subscriptions.length)}
            chevron
            onPress={() => setPage('subs')}
          />
          <Row
            leading={<IconTile name="bank" bg={c.blue} />}
            title="常用轉帳對象"
            value={String(data.payees.length)}
            chevron
            onPress={() => setPage('payees')}
          />
        </Section>

        <Section separatorInset={58}>
          <Row
            leading={<IconTile name="shortcut" bg={c.purple} />}
            title="捷徑與自動化"
            chevron
            onPress={onOpenShortcuts}
          />
          <Row
            leading={<IconTile name="bell" bg={c.warning} />}
            title="收訊紀錄"
            value={String(data.events.length)}
            chevron
            onPress={() => setPage('events')}
          />
          <Row
            leading={<IconTile name="cloud" bg={c.cyan} />}
            title="雲端同步"
            value={`SideStore ${sidestoreDaysLeft} 天`}
            valueStyle={sidestoreDaysLeft <= 1 ? { color: c.negative } : undefined}
            chevron
            onPress={() => setPage('cloud')}
          />
        </Section>

        <Section footer="會清空所有交易、欠款和收訊紀錄，無法復原。">
          <Row
            title="清空帳本"
            destructive
            trailing={<SafeConfirmButton label="清空" confirmLabel="確定清空" onConfirm={resetDemoData} compact />}
          />
        </Section>
      </ScrollView>

      {page !== 'none' ? (
        <PushedPage title={PAGE_TITLES[page]} backLabel="設定" topInset={topInsetPadding} onBack={() => setPage('none')}>
          {renderPage()}
        </PushedPage>
      ) : null}
    </View>
  );
}

function FieldInline({
  value,
  onChangeText,
  placeholder,
  secure,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
}) {
  const c = usePalette();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.tertiaryLabel}
      selectionColor={c.accent}
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry={secure}
      style={[type.body, { color: c.label, paddingVertical: 4 }]}
    />
  );
}

const makeStyles = (c: Palette) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  pad: { paddingHorizontal: 16, marginTop: -8, marginBottom: 28 },
  inlineActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  fieldLabel: { ...type.footnote, color: c.secondaryLabel },
  empty: { paddingVertical: 60, paddingHorizontal: 40, alignItems: 'center' as const },
  emptyTitle: { ...type.title3, color: c.label },
  emptySub: { ...type.subheadline, color: c.secondaryLabel, marginTop: 6, textAlign: 'center' as const },
});
