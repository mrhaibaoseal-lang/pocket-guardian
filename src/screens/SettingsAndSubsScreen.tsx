import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    setBudgetStr(String(data.settings.monthlyBudget));
    setFloorStr(String(data.settings.safetyFloor));
    setWageStr(String(data.settings.hourlyWage));
    setBentoStr(String(data.settings.bentoPrice));
    setCycleDayStr(String(data.settings.cycleStartDay));
    setOwnSuffixStr(data.settings.ownAccountSuffix);
  }, [data.settings]);

  // --- Cloud Worker Meta ---
  const [workerUrlStr, setWorkerUrlStr] = useState(meta.workerUrl);
  const [tokenStr, setTokenStr] = useState(meta.ingestToken);

  // SideStore 7-day countdown calculation
  const refreshedMs = Date.parse(meta.sidestoreRefreshedAt) || Date.now();
  const elapsedDays = Math.floor((Date.now() - refreshedMs) / 86400000);
  const sidestoreDaysLeft = Math.max(0, 7 - elapsedDays);

  const handleSaveCoreSettings = () => {
    updateSettings({
      monthlyBudget: Math.max(0, Number(budgetStr) || 0),
      safetyFloor: Math.max(0, Number(floorStr) || 0),
      hourlyWage: Math.max(0, Number(wageStr) || 0),
      bentoPrice: Math.max(0, Number(bentoStr) || 0),
      cycleStartDay: Math.min(28, Math.max(1, Number(cycleDayStr) || 1)),
      ownAccountSuffix: ownSuffixStr.trim() || '83151',
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
        <Text style={styles.cardTitle}>固定扣款幽靈預警（月初即預留，不虛胖日額）</Text>
        <Text style={styles.cardDesc}>
          設定後，系統會在月初直接從「今日安全額度」預先凍結該筆金額；當玉山簽帳卡推播相同金額時，自動標記為此訂閱，絕不重複扣第二次！
        </Text>

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
                <Text style={[styles.smallBtnText, { color: '#FBBF24' }]}>刪除</Text>
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
      </LiquidGlassCard>

      {/* 2. Payee Dictionary */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Text style={styles.cardTitle}>常用轉帳對象字典（OCR 自動對應名稱）</Text>
        <Text style={styles.cardDesc}>
          當你在玉山轉帳成功頁按下「動作按鈕」截圖時，系統會比對轉入帳號末五碼並自動帶入對象名稱。
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
              <Text style={[styles.smallBtnText, { color: '#FBBF24' }]}>刪除</Text>
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
      </LiquidGlassCard>

      {/* 3. Budget, Safety Floor & Feelings Parameters */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Text style={styles.cardTitle}>雙軌安全額度與「罵醒我」體感參數</Text>
        <Text style={styles.cardDesc}>
          • 每月預算上限：設為 0 時，本月剩餘預算與每日預算會自動根據「目前帳戶餘額」計算；若有設定金額，則依設定金額計算。{'\n'}
          • 安全水位底線：帳戶裡「絕對不能花掉的保命底線」，計算餘額日額時會先預留此金額，一旦跌破立即亮紅燈並觸發強烈勸退。
        </Text>

        <View style={styles.fieldGrid}>
          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>每月預算上限 (0=依餘額)</Text>
            <TextInput
              style={styles.input}
              value={budgetStr}
              onChangeText={setBudgetStr}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>安全水位底線 (保命底線)</Text>
            <TextInput
              style={styles.input}
              value={floorStr}
              onChangeText={setFloorStr}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>你的時薪 ($/hr)</Text>
            <TextInput
              style={styles.input}
              value={wageStr}
              onChangeText={setWageStr}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>雞腿便當基準價 ($)</Text>
            <TextInput
              style={styles.input}
              value={bentoStr}
              onChangeText={setBentoStr}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>每月結算日 (1-28)</Text>
            <TextInput
              style={styles.input}
              value={cycleDayStr}
              onChangeText={setCycleDayStr}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>我的帳戶末碼 (多組用逗號分隔)</Text>
            <TextInput
              style={styles.input}
              value={ownSuffixStr}
              onChangeText={setOwnSuffixStr}
              placeholder="83151, 99999"
              placeholderTextColor="rgba(235, 225, 210, 0.35)"
            />
          </View>
        </View>

        <Pressable style={styles.primaryBtn} onPress={handleSaveCoreSettings}>
          <Text style={styles.primaryBtnText}>儲存參數並重算今日安全額度</Text>
        </Pressable>
      </LiquidGlassCard>

      {/* 4. Cloudflare Workers + D1 & SideStore Status */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
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
      </LiquidGlassCard>

      {/* 5. Reset All Data to Zero */}
      <LiquidGlassCard shape="card" contentStyle={styles.card}>
        <Text style={styles.cardTitle}>帳本歸零重置</Text>
        <SafeConfirmButton
          label="清空所有帳目並歸零"
          confirmLabel="確定全部歸零？再點一次執行"
          onConfirm={resetDemoData}
        />
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
    color: '#FAF6F0',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  card: {
    padding: 15,
    gap: 10,
  },
  cardTitle: {
    color: '#FAF6F0',
    fontSize: 15,
    fontWeight: '700',
  },
  cardDesc: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 12,
    lineHeight: 17,
  },
  listItem: {
    backgroundColor: 'rgba(214, 195, 165, 0.08)',
    borderColor: 'rgba(230, 213, 184, 0.18)',
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
    color: '#FAF6F0',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  listItemSub: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  listItemActions: {
    flexDirection: 'row',
    gap: 6,
  },
  smallBtn: {
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
  },
  smallBtnAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  smallBtnText: {
    color: '#E6D5B8',
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
    backgroundColor: 'rgba(28, 24, 20, 0.65)',
    borderColor: 'rgba(230, 213, 184, 0.25)',
    borderWidth: 0.8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#FAF6F0',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    color: '#E6D5B8',
    fontSize: 12,
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: '#FBBF24',
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#080705',
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
    color: 'rgba(235, 225, 210, 0.5)',
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
    backgroundColor: 'rgba(214, 195, 165, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(230, 213, 184, 0.25)',
    alignItems: 'center',
  },
  cloudBtnTitaniumText: {
    color: '#E6D5B8',
    fontSize: 13,
    fontWeight: '700',
  },
  cloudBtnAmber: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 0.8,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    alignItems: 'center',
  },
  cloudBtnAmberText: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '700',
  },
  sidestoreBox: {
    backgroundColor: 'rgba(214, 195, 165, 0.08)',
    borderColor: 'rgba(230, 213, 184, 0.18)',
    borderWidth: 0.8,
    borderRadius: 16,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sidestoreTitle: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '700',
  },
  sidestoreSub: {
    color: 'rgba(235, 225, 210, 0.5)',
    fontSize: 11,
    marginTop: 2,
  },
});
