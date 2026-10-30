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
import { theme } from '../theme/tokens';

type CoreFieldKey = 'budget' | 'floor' | 'wage' | 'bento' | 'cycleDay' | 'ownSuffix';

function cleanNumericInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  // Strip leading zeros when typing a multi-digit number (e.g. "0200" -> "200"), keep single "0"
  return digits.replace(/^0+(?=\d)/, '');
}

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

  const focusedFieldRef = useRef<CoreFieldKey | null>(null);
  const draftRef = useRef({
    budgetStr,
    floorStr,
    wageStr,
    bentoStr,
    cycleDayStr,
    ownSuffixStr,
  });
  draftRef.current = {
    budgetStr,
    floorStr,
    wageStr,
    bentoStr,
    cycleDayStr,
    ownSuffixStr,
  };

  // Only sync individual fields when their specific primitive value in store changes AND field is not focused
  useEffect(() => {
    if (focusedFieldRef.current !== 'budget') {
      setBudgetStr(String(data.settings.monthlyBudget));
    }
  }, [data.settings.monthlyBudget]);

  useEffect(() => {
    if (focusedFieldRef.current !== 'floor') {
      setFloorStr(String(data.settings.safetyFloor));
    }
  }, [data.settings.safetyFloor]);

  useEffect(() => {
    if (focusedFieldRef.current !== 'wage') {
      setWageStr(String(data.settings.hourlyWage));
    }
  }, [data.settings.hourlyWage]);

  useEffect(() => {
    if (focusedFieldRef.current !== 'bento') {
      setBentoStr(String(data.settings.bentoPrice));
    }
  }, [data.settings.bentoPrice]);

  useEffect(() => {
    if (focusedFieldRef.current !== 'cycleDay') {
      setCycleDayStr(String(data.settings.cycleStartDay));
    }
  }, [data.settings.cycleStartDay]);

  useEffect(() => {
    if (focusedFieldRef.current !== 'ownSuffix') {
      setOwnSuffixStr(data.settings.ownAccountSuffix);
    }
  }, [data.settings.ownAccountSuffix]);

  // --- Cloud Worker Meta ---
  const [workerUrlStr, setWorkerUrlStr] = useState(meta.workerUrl);
  const [tokenStr, setTokenStr] = useState(meta.ingestToken);

  // SideStore 7-day countdown calculation
  const refreshedMs = Date.parse(meta.sidestoreRefreshedAt) || Date.now();
  const elapsedDays = Math.floor((Date.now() - refreshedMs) / 86400000);
  const sidestoreDaysLeft = Math.max(0, 7 - elapsedDays);

  const commitCoreSettings = (silent: boolean) => {
    const d = draftRef.current;
    const nextBudget = Math.max(0, Number(d.budgetStr) || 0);
    const nextFloor = Math.max(0, Number(d.floorStr) || 0);
    const nextWage = Math.max(0, Number(d.wageStr) || 0);
    const nextBento = Math.max(0, Number(d.bentoStr) || 0);
    const nextCycleDay = Math.min(28, Math.max(1, Number(d.cycleDayStr) || 1));
    const nextOwnSuffix = d.ownSuffixStr.trim() || '83151';

    setBudgetStr(String(nextBudget));
    setFloorStr(String(nextFloor));
    setWageStr(String(nextWage));
    setBentoStr(String(nextBento));
    setCycleDayStr(String(nextCycleDay));
    setOwnSuffixStr(nextOwnSuffix);

    updateSettings(
      {
        monthlyBudget: nextBudget,
        safetyFloor: nextFloor,
        hourlyWage: nextWage,
        bentoPrice: nextBento,
        cycleStartDay: nextCycleDay,
        ownAccountSuffix: nextOwnSuffix,
      },
      { silent },
    );
  };

  const handleSaveCoreSettings = () => {
    focusedFieldRef.current = null;
    commitCoreSettings(false);
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
      <Text style={styles.screenTitle}>參數與自動化設定</Text>

      {/* 1. Subscriptions (Non-Glass Matte Surface) */}
      <View style={styles.surfaceCard}>
        <Text style={styles.cardTitle}>固定扣款預留</Text>
        <Text style={styles.cardDesc}>
          月初預先從安全額度扣除，收到銀行扣款推播時自動配對不重複扣款。
        </Text>

        {data.subscriptions.map((sub) => (
          <View key={sub.id} style={styles.listItem}>
            <View style={styles.listItemLeft}>
              <Text style={styles.listItemTitle}>
                {sub.name} · ${sub.amount}
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
                <Text style={[styles.smallBtnText, { color: theme.colors.semantic.danger }]}>刪除</Text>
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
            placeholderTextColor={theme.colors.text.tertiary}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={subAmount}
            onChangeText={setSubAmount}
            keyboardType="numeric"
            placeholder="金額"
            placeholderTextColor={theme.colors.text.tertiary}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={subDay}
            onChangeText={setSubDay}
            keyboardType="numeric"
            placeholder="幾號"
            placeholderTextColor={theme.colors.text.tertiary}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>
            無推播自動入帳（若為網銀無通知扣款再開啟）
          </Text>
          <Switch value={subAutoPost} onValueChange={setSubAutoPost} />
        </View>

        <Pressable style={styles.primaryBtn} onPress={handleAddSub}>
          <Text style={styles.primaryBtnText}>新增固定扣款預留</Text>
        </Pressable>
      </View>

      {/* 2. Payee Dictionary (Non-Glass Matte Surface) */}
      <View style={styles.surfaceCard}>
        <Text style={styles.cardTitle}>常用轉帳對象字典</Text>
        <Text style={styles.cardDesc}>
          轉帳截圖入帳時，自動比對帳號末五碼並帶入對象名稱。
        </Text>

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
              <Text style={[styles.smallBtnText, { color: theme.colors.semantic.danger }]}>刪除</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.formRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={payeeBankCode}
            onChangeText={setPayeeBankCode}
            placeholder="銀行808"
            placeholderTextColor={theme.colors.text.tertiary}
          />
          <TextInput
            style={[styles.input, { flex: 1.4 }]}
            value={payeeSuffix}
            onChangeText={setPayeeSuffix}
            placeholder="末五碼 (如 24126)"
            placeholderTextColor={theme.colors.text.tertiary}
          />
          <TextInput
            style={[styles.input, { flex: 1.8 }]}
            value={payeeName}
            onChangeText={setPayeeName}
            placeholder="暱稱 (如 室友房租)"
            placeholderTextColor={theme.colors.text.tertiary}
          />
        </View>

        <Pressable style={styles.primaryBtn} onPress={handleAddPayee}>
          <Text style={styles.primaryBtnText}>記住此轉帳帳號</Text>
        </Pressable>
      </View>

      {/* 3. Budget, Safety Floor & Feelings Parameters */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Text style={styles.cardTitle}>預算與體感參數</Text>
        <Text style={styles.cardDesc}>
          每月預算設為 0 時自動依帳戶餘額（扣除安全底線）計算可用額度。
        </Text>

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
                const cleaned = cleanNumericInput(v);
                setBudgetStr(cleaned);
                draftRef.current.budgetStr = cleaned;
                if (cleaned !== '') {
                  updateSettings({ monthlyBudget: Math.max(0, Number(cleaned) || 0) }, { silent: true });
                }
              }}
              onBlur={() => {
                if (focusedFieldRef.current === 'budget') focusedFieldRef.current = null;
                commitCoreSettings(true);
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
                const cleaned = cleanNumericInput(v);
                setFloorStr(cleaned);
                draftRef.current.floorStr = cleaned;
                if (cleaned !== '') {
                  updateSettings({ safetyFloor: Math.max(0, Number(cleaned) || 0) }, { silent: true });
                }
              }}
              onBlur={() => {
                if (focusedFieldRef.current === 'floor') focusedFieldRef.current = null;
                commitCoreSettings(true);
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
                const cleaned = cleanNumericInput(v);
                setWageStr(cleaned);
                draftRef.current.wageStr = cleaned;
                if (cleaned !== '') {
                  updateSettings({ hourlyWage: Math.max(0, Number(cleaned) || 0) }, { silent: true });
                }
              }}
              onBlur={() => {
                if (focusedFieldRef.current === 'wage') focusedFieldRef.current = null;
                commitCoreSettings(true);
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
                const cleaned = cleanNumericInput(v);
                setBentoStr(cleaned);
                draftRef.current.bentoStr = cleaned;
                if (cleaned !== '') {
                  updateSettings({ bentoPrice: Math.max(0, Number(cleaned) || 0) }, { silent: true });
                }
              }}
              onBlur={() => {
                if (focusedFieldRef.current === 'bento') focusedFieldRef.current = null;
                commitCoreSettings(true);
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
                const cleaned = cleanNumericInput(v);
                setCycleDayStr(cleaned);
                draftRef.current.cycleDayStr = cleaned;
                if (cleaned !== '') {
                  updateSettings(
                    { cycleStartDay: Math.min(28, Math.max(1, Number(cleaned) || 1)) },
                    { silent: true },
                  );
                }
              }}
              onBlur={() => {
                if (focusedFieldRef.current === 'cycleDay') focusedFieldRef.current = null;
                commitCoreSettings(true);
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
                setOwnSuffixStr(v);
                draftRef.current.ownSuffixStr = v;
                if (v.trim() !== '') {
                  updateSettings({ ownAccountSuffix: v.trim() }, { silent: true });
                }
              }}
              onBlur={() => {
                if (focusedFieldRef.current === 'ownSuffix') focusedFieldRef.current = null;
                commitCoreSettings(true);
              }}
              placeholder="83151, 99999"
              placeholderTextColor="rgba(235, 225, 210, 0.35)"
            />
          </View>
        </View>

        <Pressable style={styles.primaryBtn} onPress={handleSaveCoreSettings}>
          <Text style={styles.primaryBtnText}>儲存參數並重算今日安全額度</Text>
        </Pressable>
      </LiquidGlassCard>

      {/* 4. Cloudflare Workers + D1 & SideStore Status (Non-Glass Matte Surface) */}
      <View style={styles.surfaceCard}>
        <Text style={styles.cardTitle}>Cloudflare Workers + D1 雲端與 SideStore</Text>

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
          placeholderTextColor={theme.colors.text.tertiary}
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
          placeholderTextColor={theme.colors.text.tertiary}
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

        <View style={styles.sidestoreBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sidestoreTitle}>
              SideStore 免費憑證倒數：剩餘 {sidestoreDaysLeft} 天
            </Text>
            <Text style={styles.sidestoreSub}>
              即使過期，Cloudflare 雲端捷徑仍會 100% 正常記帳，重簽後無縫接軌
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
      </View>

      {/* 5. Reset All Data to Zero */}
      <View style={styles.surfaceCard}>
        <Text style={styles.cardTitle}>帳本歸零重置</Text>
        <SafeConfirmButton
          label="清空所有帳目並歸零"
          confirmLabel="確定全部歸零？再點一次執行"
          onConfirm={resetDemoData}
        />
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
    paddingBottom: 36,
    gap: theme.spacing.md,
  },
  screenTitle: {
    color: theme.colors.text.primary,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  card: {
    padding: theme.spacing.md,
    gap: 10,
  },
  surfaceCard: {
    padding: theme.spacing.md,
    gap: 10,
    borderRadius: theme.radii.listGroup,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.listSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  cardTitle: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.bodyMedium.fontSize,
    fontWeight: '600',
  },
  cardDesc: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.caption.fontSize,
    lineHeight: 17,
  },
  listItem: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderColor: theme.colors.glass.subtleBorder,
    borderWidth: 1,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
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
    color: theme.colors.text.primary,
    fontSize: theme.typography.bodyMedium.fontSize,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  listItemSub: {
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.micro.fontSize,
    marginTop: 2,
  },
  listItemActions: {
    flexDirection: 'row',
    gap: 6,
  },
  smallBtn: {
    backgroundColor: theme.colors.background.subtleSurface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
  },
  smallBtnAmber: {
    backgroundColor: theme.colors.semantic.dangerSubtle,
    borderColor: 'rgba(181, 90, 82, 0.28)',
  },
  smallBtnText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.micro.fontSize,
    fontWeight: '500',
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  input: {
    minWidth: 0,
    backgroundColor: theme.colors.background.base,
    borderColor: theme.colors.glass.fallbackBorder,
    borderWidth: 1,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: theme.colors.text.primary,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.caption.fontSize,
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: theme.colors.accent.primary,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: theme.colors.text.inverse,
    fontSize: 13,
    fontWeight: '600',
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
    color: theme.colors.text.secondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '500',
  },
  cloudBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cloudBtnTitanium: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background.subtleSurface,
    borderWidth: 1,
    borderColor: theme.colors.glass.subtleBorder,
    alignItems: 'center',
  },
  cloudBtnTitaniumText: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  cloudBtnAmber: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: theme.radii.control,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.accent.subtleBg,
    borderWidth: 1,
    borderColor: theme.colors.accent.subtleBorder,
    alignItems: 'center',
  },
  cloudBtnAmberText: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  sidestoreBox: {
    backgroundColor: theme.colors.background.subtleSurface,
    borderColor: theme.colors.glass.subtleBorder,
    borderWidth: 1,
    borderRadius: theme.radii.innerCard,
    borderCurve: 'continuous',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sidestoreTitle: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  sidestoreSub: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    marginTop: 2,
  },
});
