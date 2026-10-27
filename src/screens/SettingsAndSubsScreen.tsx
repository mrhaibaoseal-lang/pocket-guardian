import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
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

  // --- Cloud Worker Meta ---
  const [workerUrlStr, setWorkerUrlStr] = useState(meta.workerUrl);
  const [tokenStr, setTokenStr] = useState(meta.ingestToken);

  // SideStore 7-day countdown calculation
  const refreshedMs = Date.parse(meta.sidestoreRefreshedAt) || Date.now();
  const elapsedDays = Math.floor((Date.now() - refreshedMs) / 86400000);
  const sidestoreDaysLeft = Math.max(0, 7 - elapsedDays);

  const handleSaveCoreSettings = () => {
    updateSettings({
      monthlyBudget: Math.max(0, Number(budgetStr) || 15000),
      safetyFloor: Math.max(0, Number(floorStr) || 3000),
      hourlyWage: Math.max(1, Number(wageStr) || 200),
      bentoPrice: Math.max(1, Number(bentoStr) || 120),
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
      <Text style={styles.screenTitle}>👻 訂閱預留、轉帳字典與雲端設定</Text>

      {/* 1. 👻 Subscriptions (Fixed Recurring Charges) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👻 固定扣款幽靈預警（月初即預留，不虛胖日額）</Text>
        <Text style={styles.cardDesc}>
          設定後，系統會在月初直接從「今日安全額度」預先凍結該筆金額；當玉山簽帳卡推播相同金額時，自動標記為此訂閱，絕不重複扣第二次！
        </Text>

        {data.subscriptions.map((sub) => (
          <View key={sub.id} style={styles.listItem}>
            <View style={styles.listItemLeft}>
              <Text style={styles.listItemTitle}>
                {sub.isActive ? '🟢' : '⚪'} {sub.name} · ${sub.amount}
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
                style={[styles.smallBtn, styles.smallBtnDanger]}
                onPress={() => deleteSubscription(sub.id)}
              >
                <Text style={styles.smallBtnText}>刪除</Text>
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
            placeholderTextColor="#64748B"
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={subAmount}
            onChangeText={setSubAmount}
            keyboardType="numeric"
            placeholder="金額"
            placeholderTextColor="#64748B"
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={subDay}
            onChangeText={setSubDay}
            keyboardType="numeric"
            placeholder="幾號"
            placeholderTextColor="#64748B"
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
      </View>

      {/* 2. 👤 Payee Dictionary (e.g., Friend 24126) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 常用轉帳對象字典（OCR 自動對應名稱）</Text>
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
              style={[styles.smallBtn, styles.smallBtnDanger]}
              onPress={() => deletePayee(p.id)}
            >
              <Text style={styles.smallBtnText}>刪除</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.formRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={payeeBankCode}
            onChangeText={setPayeeBankCode}
            placeholder="銀行808"
            placeholderTextColor="#64748B"
          />
          <TextInput
            style={[styles.input, { flex: 1.4 }]}
            value={payeeSuffix}
            onChangeText={setPayeeSuffix}
            placeholder="末五碼 (如 24126)"
            placeholderTextColor="#64748B"
          />
          <TextInput
            style={[styles.input, { flex: 1.8 }]}
            value={payeeName}
            onChangeText={setPayeeName}
            placeholder="暱稱 (如 室友房租)"
            placeholderTextColor="#64748B"
          />
        </View>

        <Pressable style={styles.primaryBtn} onPress={handleAddPayee}>
          <Text style={styles.primaryBtnText}>＋ 記住此轉帳帳號</Text>
        </Pressable>
      </View>

      {/* 3. ⚙️ Budget, Safety Floor & Feelings Parameters */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚙️ 雙軌安全額度與「罵醒我」體感參數</Text>

        <View style={styles.fieldGrid}>
          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>每月預算上限 ($)</Text>
            <TextInput
              style={styles.input}
              value={budgetStr}
              onChangeText={setBudgetStr}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>安全水位底線 ($)</Text>
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
            <Text style={styles.fieldLabel}>自己玉山末五碼</Text>
            <TextInput
              style={styles.input}
              value={ownSuffixStr}
              onChangeText={setOwnSuffixStr}
            />
          </View>
        </View>

        <Pressable style={styles.primaryBtn} onPress={handleSaveCoreSettings}>
          <Text style={styles.primaryBtnText}>💾 儲存參數並重算今日安全額度</Text>
        </Pressable>
      </View>

      {/* 4. ☁️ Cloudflare Workers + D1 & SideStore Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>☁️ Cloudflare Workers + D1 雲端與 SideStore</Text>

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
          placeholderTextColor="#64748B"
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
          placeholderTextColor="#64748B"
        />

        <View style={styles.cloudBtnRow}>
          <Pressable
            style={[styles.cloudBtn, { backgroundColor: '#0284C7' }]}
            onPress={() => {
              syncFromCloud().catch(() => undefined);
            }}
          >
            <Text style={styles.cloudBtnText}>⬇️ 從雲端拉取</Text>
          </Pressable>
          <Pressable
            style={[styles.cloudBtn, { backgroundColor: '#059669' }]}
            onPress={() => {
              pushToCloud().catch(() => undefined);
            }}
          >
            <Text style={styles.cloudBtnText}>⬆️ 備份至雲端</Text>
          </Pressable>
        </View>

        {/* SideStore 7-day reminder */}
        <View style={styles.sidestoreBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sidestoreTitle}>
              📦 SideStore 免費憑證倒數：剩餘 {sidestoreDaysLeft} 天
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
      </View>

      {/* 5. Reset Demo Data */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧪 測試資料重置</Text>
        <SafeConfirmButton
          label="🔄 重置為預設範例帳本"
          confirmLabel="⚠️ 確定重置？再點一次執行"
          onConfirm={resetDemoData}
        />
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
    paddingBottom: 36,
    gap: 14,
  },
  screenTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#131C2E',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  cardDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
  },
  listItem: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
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
  },
  listItemSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  listItemActions: {
    flexDirection: 'row',
    gap: 6,
  },
  smallBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  smallBtnDanger: {
    backgroundColor: '#3B1D2E',
    borderColor: '#F43F5E',
  },
  smallBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    backgroundColor: '#090D16',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 13,
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
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#052E16',
    fontSize: 14,
    fontWeight: '900',
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fieldItem: {
    width: '48%',
    gap: 4,
  },
  fieldLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  cloudBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cloudBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  cloudBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  sidestoreBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sidestoreTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
  },
  sidestoreSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
});
