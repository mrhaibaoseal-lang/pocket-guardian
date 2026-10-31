import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LiquidGlassCard } from '../components/LiquidGlassView';
import { SafeConfirmButton } from '../components/SafeConfirmButton';
import { useLedger } from '../store/useLedger';

export function SettingsAndSubsScreen() {
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

  // --- New Subscription Form ---
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subDay, setSubDay] = useState('15');
  const [subAutoPost, setSubAutoPost] = useState(false);

  // --- New Payee Form ---
  const [payeeBankCode, setPayeeBankCode] = useState('808');
  const [payeeSuffix, setPayeeSuffix] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [payeeCategory, setPayeeCategory] = useState('轉帳');

  // --- Core Settings Form ---
  const [budgetStr, setBudgetStr] = useState(String(data.settings.monthlyBudget));
  const [floorStr, setFloorStr] = useState(String(data.settings.safetyFloor));
  const [wageStr, setWageStr] = useState(String(data.settings.hourlyWage));
  const [bentoStr, setBentoStr] = useState(String(data.settings.bentoPrice));
  const [cycleDayStr, setCycleDayStr] = useState(String(data.settings.cycleStartDay));
  const [ownSuffixStr, setOwnSuffixStr] = useState(data.settings.ownAccountSuffix);
  const focusedFieldRef = useRef<string | null>(null);
  const dirtyFieldsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (focusedFieldRef.current !== 'budget' && !dirtyFieldsRef.current.has('budget')) {
      setBudgetStr(String(data.settings.monthlyBudget));
    }
    if (focusedFieldRef.current !== 'floor' && !dirtyFieldsRef.current.has('floor')) {
      setFloorStr(String(data.settings.safetyFloor));
    }
    if (focusedFieldRef.current !== 'wage' && !dirtyFieldsRef.current.has('wage')) {
      setWageStr(String(data.settings.hourlyWage));
    }
    if (focusedFieldRef.current !== 'bento' && !dirtyFieldsRef.current.has('bento')) {
      setBentoStr(String(data.settings.bentoPrice));
    }
    if (focusedFieldRef.current !== 'cycleDay' && !dirtyFieldsRef.current.has('cycleDay')) {
      setCycleDayStr(String(data.settings.cycleStartDay));
    }
    if (focusedFieldRef.current !== 'ownSuffix' && !dirtyFieldsRef.current.has('ownSuffix')) {
      setOwnSuffixStr(data.settings.ownAccountSuffix);
    }
  }, [
    data.settings.monthlyBudget,
    data.settings.safetyFloor,
    data.settings.hourlyWage,
    data.settings.bentoPrice,
    data.settings.cycleStartDay,
    data.settings.ownAccountSuffix,
  ]);

  // --- Cloud Worker Meta ---
  const [workerUrlStr, setWorkerUrlStr] = useState(meta.workerUrl);
  const [tokenStr, setTokenStr] = useState(meta.ingestToken);

  // --- Collapsible Drawer States ---
  const [subsExpanded, setSubsExpanded] = useState(false);
  const [payeesExpanded, setPayeesExpanded] = useState(false);
  const [budgetExpanded, setBudgetExpanded] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [cloudExpanded, setCloudExpanded] = useState(false);
  const [resetExpanded, setResetExpanded] = useState(false);

  // SideStore 7-day countdown calculation
  const refreshedMs = Date.parse(meta.sidestoreRefreshedAt) || Date.now();
  const elapsedDays = Math.floor((Date.now() - refreshedMs) / 86400000);
  const sidestoreDaysLeft = Math.max(0, 7 - elapsedDays);

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>訂閱預留、轉帳字典與雲端設定</Text>

      {/* 1. Subscriptions (Fixed Recurring Charges) */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Pressable
          style={styles.collapsibleHeaderRow}
          onPress={() => setSubsExpanded((prev) => !prev)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              🔄 固定扣款預留 ({data.subscriptions.length})
            </Text>
            <Text style={styles.cardDesc}>
              {subsExpanded
                ? '點選收起'
                : '月初預先扣除安全額度，自動配對不重複扣款 · 點選展開'}
            </Text>
          </View>
          <View style={styles.collapseChevronBtn}>
            <Text style={styles.collapseChevron}>{subsExpanded ? '▴' : '▾'}</Text>
          </View>
        </Pressable>

        {subsExpanded && (
          <>
            {data.subscriptions.map((sub) => (
              <View key={sub.id} style={styles.listItem}>
                <View style={styles.listItemLeft}>
                  <Text style={styles.listItemTitle}>
                    {sub.isActive ? '◈' : '◇'} {sub.name} · ${sub.amount}
                  </Text>
                  <Text style={styles.listItemSub}>
                    每月 {sub.billingDay} 號扣款 ·{' '}
                    {sub.autoPost ? '無通知自動入帳' : '等待玉山簽帳卡推播配對'}
                  </Text>
                </View>
                <View style={styles.listItemActions}>
                  <Pressable
                    style={styles.smallBtn}
                    onPress={() => toggleSubscription(sub.id)}
                  >
                    <Text style={styles.smallBtnText}>
                      {sub.isActive ? '暫停' : '啟用'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.smallBtn, styles.smallBtnAmber]}
                    onPress={() => deleteSubscription(sub.id)}
                  >
                    <Text style={[styles.smallBtnText, { color: '#34D399' }]}>刪除</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={styles.formRow}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                value={subName}
                onChangeText={setSubName}
                placeholder="項目 (如 Spotify)"
                placeholderTextColor="rgba(235, 225, 210, 0.4)"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={subAmount}
                onChangeText={setSubAmount}
                keyboardType="numeric"
                placeholder="金額"
                placeholderTextColor="rgba(235, 225, 210, 0.4)"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={subDay}
                onChangeText={setSubDay}
                keyboardType="numeric"
                placeholder="幾號"
                placeholderTextColor="rgba(235, 225, 210, 0.4)"
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                無推播自動入帳（若為網銀無通知扣款再開啟）
              </Text>
              <Switch value={subAutoPost} onValueChange={setSubAutoPost} />
            </View>

            <Pressable style={styles.primaryBtn} onPress={handleAddSub}>
              <Text style={styles.primaryBtnText}>＋ 新增固定扣款預留</Text>
            </Pressable>
          </>
        )}
      </LiquidGlassCard>

      {/* 2. Payee Dictionary */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Pressable
          style={styles.collapsibleHeaderRow}
          onPress={() => setPayeesExpanded((prev) => !prev)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              🏦 常用轉帳對象字典 ({data.payees.length})
            </Text>
            <Text style={styles.cardDesc}>
              {payeesExpanded
                ? '點選收起'
                : '轉帳截圖入帳自動比對末五碼並帶入對象名稱 · 點選展開'}
            </Text>
          </View>
          <View style={styles.collapseChevronBtn}>
            <Text style={styles.collapseChevron}>{payeesExpanded ? '▴' : '▾'}</Text>
          </View>
        </Pressable>

        {payeesExpanded && (
          <>
            {data.payees.map((p) => (
              <View key={p.id} style={styles.listItem}>
                <View style={styles.listItemLeft}>
                  <Text style={styles.listItemTitle}>
                    {p.displayName}（****{p.accountSuffix}）
                  </Text>
                  <Text style={styles.listItemSub}>
                    銀行代碼 {p.bankCode || '808'} · 預設分類：{p.defaultCategory}
                  </Text>
                </View>
                <Pressable
                  style={[styles.smallBtn, styles.smallBtnAmber]}
                  onPress={() => deletePayee(p.id)}
                >
                  <Text style={[styles.smallBtnText, { color: '#34D399' }]}>刪除</Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.formRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={payeeBankCode}
                onChangeText={setPayeeBankCode}
                placeholder="銀行808"
                placeholderTextColor="rgba(235, 225, 210, 0.4)"
              />
              <TextInput
                style={[styles.input, { flex: 1.4 }]}
                value={payeeSuffix}
                onChangeText={setPayeeSuffix}
                placeholder="末五碼 (如 24126)"
                placeholderTextColor="rgba(235, 225, 210, 0.4)"
              />
              <TextInput
                style={[styles.input, { flex: 1.8 }]}
                value={payeeName}
                onChangeText={setPayeeName}
                placeholder="暱稱 (如 室友房租)"
                placeholderTextColor="rgba(235, 225, 210, 0.4)"
              />
            </View>

            <Pressable style={styles.primaryBtn} onPress={handleAddPayee}>
              <Text style={styles.primaryBtnText}>＋ 記住此轉帳帳號</Text>
            </Pressable>
          </>
        )}
      </LiquidGlassCard>

      {/* 3. Budget, Safety Floor & Feelings Parameters */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Pressable
          style={styles.collapsibleHeaderRow}
          onPress={() => setBudgetExpanded((prev) => !prev)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>⚙️ 預算與體感參數</Text>
            <Text style={styles.cardDesc}>
              {budgetExpanded
                ? '點選收起'
                : `月預算 $${data.settings.monthlyBudget} · 底線 $${data.settings.safetyFloor} · 時薪 $${data.settings.hourlyWage} · 點選展開`}
            </Text>
          </View>
          <View style={styles.collapseChevronBtn}>
            <Text style={styles.collapseChevron}>{budgetExpanded ? '▴' : '▾'}</Text>
          </View>
        </Pressable>

        {budgetExpanded && (
          <>
            <View style={styles.fieldGrid}>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>每月預算上限 (0=依餘額)</Text>
                <TextInput
                  style={styles.input}
                  value={budgetStr}
                  onFocus={() => {
                    focusedFieldRef.current = 'budget';
                  }}
                  onChangeText={(v) => {
                    dirtyFieldsRef.current.add('budget');
                    setBudgetStr(v);
                  }}
                  onBlur={() => {
                    if (focusedFieldRef.current === 'budget') focusedFieldRef.current = null;
                    handleSaveCoreSettings();
                  }}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>安全水位底線 (保命底線)</Text>
                <TextInput
                  style={styles.input}
                  value={floorStr}
                  onFocus={() => {
                    focusedFieldRef.current = 'floor';
                  }}
                  onChangeText={(v) => {
                    dirtyFieldsRef.current.add('floor');
                    setFloorStr(v);
                  }}
                  onBlur={() => {
                    if (focusedFieldRef.current === 'floor') focusedFieldRef.current = null;
                    handleSaveCoreSettings();
                  }}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>你的時薪 ($/hr)</Text>
                <TextInput
                  style={styles.input}
                  value={wageStr}
                  onFocus={() => {
                    focusedFieldRef.current = 'wage';
                  }}
                  onChangeText={(v) => {
                    dirtyFieldsRef.current.add('wage');
                    setWageStr(v);
                  }}
                  onBlur={() => {
                    if (focusedFieldRef.current === 'wage') focusedFieldRef.current = null;
                    handleSaveCoreSettings();
                  }}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>雞腿便當基準價 ($)</Text>
                <TextInput
                  style={styles.input}
                  value={bentoStr}
                  onFocus={() => {
                    focusedFieldRef.current = 'bento';
                  }}
                  onChangeText={(v) => {
                    dirtyFieldsRef.current.add('bento');
                    setBentoStr(v);
                  }}
                  onBlur={() => {
                    if (focusedFieldRef.current === 'bento') focusedFieldRef.current = null;
                    handleSaveCoreSettings();
                  }}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>每月結算日 (1-28)</Text>
                <TextInput
                  style={styles.input}
                  value={cycleDayStr}
                  onFocus={() => {
                    focusedFieldRef.current = 'cycleDay';
                  }}
                  onChangeText={(v) => {
                    dirtyFieldsRef.current.add('cycleDay');
                    setCycleDayStr(v);
                  }}
                  onBlur={() => {
                    if (focusedFieldRef.current === 'cycleDay') focusedFieldRef.current = null;
                    handleSaveCoreSettings();
                  }}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>我的帳戶末碼 (多組用逗號分隔)</Text>
                <TextInput
                  style={styles.input}
                  value={ownSuffixStr}
                  onFocus={() => {
                    focusedFieldRef.current = 'ownSuffix';
                  }}
                  onChangeText={(v) => {
                    dirtyFieldsRef.current.add('ownSuffix');
                    setOwnSuffixStr(v);
                  }}
                  onBlur={() => {
                    if (focusedFieldRef.current === 'ownSuffix') focusedFieldRef.current = null;
                    handleSaveCoreSettings();
                  }}
                  placeholder="83151, 99999"
                  placeholderTextColor="rgba(235, 225, 210, 0.35)"
                />
              </View>
            </View>

            <Pressable style={styles.primaryBtn} onPress={handleSaveCoreSettings}>
              <Text style={styles.primaryBtnText}>儲存參數並重算今日安全額度</Text>
            </Pressable>
          </>
        )}
      </LiquidGlassCard>

      {/* 4. Recent Signal / Notification Records Drawer */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Pressable
          style={styles.collapsibleHeaderRow}
          onPress={() => setEventsExpanded((prev) => !prev)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              📡 近期收訊紀錄 ({data.events.length})
            </Text>
            <Text style={styles.cardDesc}>
              {eventsExpanded
                ? '點選收起'
                : '最近 15 筆捷徑與雲端收訊紀錄 · 點選展開'}
            </Text>
          </View>
          <View style={styles.collapseChevronBtn}>
            <Text style={styles.collapseChevron}>{eventsExpanded ? '▴' : '▾'}</Text>
          </View>
        </Pressable>

        {eventsExpanded && (
          data.events.length === 0 ? (
            <Text style={styles.cardDesc}>尚無收訊紀錄</Text>
          ) : (
            data.events
              .slice(-15)
              .reverse()
              .map((ev, idx) => (
                <View key={ev.id || idx} style={styles.listItem}>
                  <View style={styles.listItemLeft}>
                    <Text style={styles.listItemTitle}>
                      [{ev.source}] {ev.parsed.kind} ·{' '}
                      {ev.parsed.amount !== null ? `$${ev.parsed.amount}` : '無金額'}
                    </Text>
                    <Text style={styles.listItemSub} numberOfLines={2}>
                      {ev.reason}
                    </Text>
                  </View>
                </View>
              ))
          )
        )}
      </LiquidGlassCard>

      {/* 5. Cloudflare Workers + D1 & SideStore Status */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Pressable
          style={styles.collapsibleHeaderRow}
          onPress={() => setCloudExpanded((prev) => !prev)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>☁️ Cloudflare D1 雲端與 SideStore</Text>
            <Text style={styles.cardDesc}>
              {cloudExpanded
                ? '點選收起'
                : `雲端備份、捷徑金鑰 · SideStore 剩餘 ${sidestoreDaysLeft} 天 · 點選展開`}
            </Text>
          </View>
          <View style={styles.collapseChevronBtn}>
            <Text style={styles.collapseChevron}>{cloudExpanded ? '▴' : '▾'}</Text>
          </View>
        </Pressable>

        {cloudExpanded && (
          <>
            <Text style={styles.fieldLabel}>Cloudflare Worker 網址</Text>
            <TextInput
              style={styles.input}
              value={workerUrlStr}
              onChangeText={(v) => {
                setWorkerUrlStr(v);
                updateMeta({ workerUrl: v });
              }}
              autoCapitalize="none"
              placeholder="https://pocket-guardian-api.your-name.workers.dev"
              placeholderTextColor="rgba(235, 225, 210, 0.4)"
            />

            <Text style={styles.fieldLabel}>X-Ingest-Token 金鑰（選填）</Text>
            <TextInput
              style={styles.input}
              value={tokenStr}
              onChangeText={(v) => {
                setTokenStr(v);
                updateMeta({ ingestToken: v });
              }}
              autoCapitalize="none"
              placeholder="留空代表免驗證快速測試"
              placeholderTextColor="rgba(235, 225, 210, 0.4)"
            />

            <View style={styles.cloudBtnRow}>
              <Pressable
                style={styles.cloudBtnTitanium}
                onPress={() => {
                  syncFromCloud().catch(() => undefined);
                }}
              >
                <Text style={styles.cloudBtnTitaniumText}>從雲端拉取</Text>
              </Pressable>
              <Pressable
                style={styles.cloudBtnAmber}
                onPress={() => {
                  pushToCloud().catch(() => undefined);
                }}
              >
                <Text style={styles.cloudBtnAmberText}>備份至雲端</Text>
              </Pressable>
            </View>

            {/* SideStore 7-day reminder */}
            <View style={styles.sidestoreBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sidestoreTitle}>
                  SideStore 免費憑證倒數：剩餘 {sidestoreDaysLeft} 天
                </Text>
                <Text style={styles.sidestoreSub}>
                  即使過期，Cloudflare 雲端捷徑仍會 100% 正常記帳，重簽後一秒無縫接軌
                </Text>
              </View>
              <Pressable
                style={styles.smallBtn}
                onPress={() =>
                  updateMeta({ sidestoreRefreshedAt: new Date().toISOString() })
                }
              >
                <Text style={styles.smallBtnText}>已重簽</Text>
              </Pressable>
            </View>
          </>
        )}
      </LiquidGlassCard>

      {/* 6. Reset All Data to Zero */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Pressable
          style={styles.collapsibleHeaderRow}
          onPress={() => setResetExpanded((prev) => !prev)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>🧹 帳本歸零重置</Text>
            <Text style={styles.cardDesc}>
              {resetExpanded ? '點選收起' : '清空所有交易、欠款與收訊紀錄 · 點選展開'}
            </Text>
          </View>
          <View style={styles.collapseChevronBtn}>
            <Text style={styles.collapseChevron}>{resetExpanded ? '▴' : '▾'}</Text>
          </View>
        </Pressable>

        {resetExpanded && (
          <SafeConfirmButton
            label="清空所有帳目並歸零"
            confirmLabel="確定全部歸零？再點一次執行"
            onConfirm={resetDemoData}
          />
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
    paddingBottom: 36,
    gap: 14,
  },
  screenTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  card: {
    padding: 15,
    gap: 10,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  cardDesc: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  collapsibleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 2,
  },
  collapseChevronBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseChevron: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  listItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderColor: 'rgba(255, 255, 255, 0.11)',
    borderWidth: 0.8,
    borderRadius: 16,
    padding: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  listItemLeft: {
    flex: 1,
  },
  listItemTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  listItemSub: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 11,
    marginTop: 2,
  },
  listItemActions: {
    flexDirection: 'row',
    gap: 6,
  },
  smallBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  smallBtnAmber: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(52, 211, 153, 0.32)',
  },
  smallBtnText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  input: {
    minWidth: 0,
    backgroundColor: 'rgba(8, 12, 15, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 0.8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: '#10B981',
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#04120C',
    fontSize: 13,
    fontWeight: '800',
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fieldItem: {
    width: '48%',
    flexGrow: 1,
    minWidth: 140,
    gap: 4,
  },
  fieldLabel: {
    color: 'rgba(148, 163, 184, 0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  cloudBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cloudBtnTitanium: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
  },
  cloudBtnTitaniumText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  cloudBtnAmber: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 0.8,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    alignItems: 'center',
  },
  cloudBtnAmberText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700',
  },
  sidestoreBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderColor: 'rgba(255, 255, 255, 0.11)',
    borderWidth: 0.8,
    borderRadius: 16,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sidestoreTitle: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700',
  },
  sidestoreSub: {
    color: 'rgba(148, 163, 184, 0.72)',
    fontSize: 11,
    marginTop: 2,
  },
});
