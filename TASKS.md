# TASKS.md — 專案任務清單與驗收條件

> **專案名稱**：錢呢[BROKE AF]（原 PocketGuardian 守財靈）`smart-ledger` (`v3.3.0`)
> **需求與架構基準**：請見 [`PLAN.md`](./PLAN.md)（已涵蓋完整 PRD 與系統架構，無須另建 `PRD.md` 或 `ARCHITECTURE.md`）
> **開發規範**：請見 [`AGENTS.md`](./AGENTS.md)
> **交接紀錄**：請見 [`HANDOFF.md`](./HANDOFF.md)

### 狀態標記說明
- `[x]` **已完成**：程式碼已實作並通過自動化測試／型別檢查（**禁止擅自重寫**）
- `[-]` **進行中 / 待驗證**：已有部分修改或等待實機／雲端連線驗證
- `[ ]` **待辦事項**：尚未開始，由當前 Agent（Gemini 4 或備援 Cline）依序接手

---

## P0：核心引擎、雲端後端與單手拇指熱區 UI（已完成）

- [x] **T0.1：共用解析與防打架去重引擎 (`core/`)**
  - **關聯檔案**：`core/parsers.ts`, `core/dedupe.ts`, `core/ledger.ts`, `core/memoryLedger.ts`, `core/__tests__/core.test.ts`
  - **驗收條件**：
    1. 支援 Apple Pay 錢包通知、玉山 e.Fingo 推播、玉山與各家銀行轉帳成功頁雙欄／單欄 OCR Regex 解析（含 3 位數金額如 `$100`），過濾 OTP 驗證碼與行銷促銷推播。
    2. 支援多通道自動容錯（Self-Healing Pipeline）：即使 iOS 捷徑選錯 `source` 通道，仍自動嘗試 `efingo` / `wallet` / `transfer_page` 並校正來源。
    3. 30 分鐘跨通道雙插槽自動合體並標記 `is_locked = true`；同源連發必新增第 2 筆交易；支援一鍵拆單還原；支援轉帳 `±3 分鐘` 重複觸發攔截與自己轉自己（多組末碼）排除。
    4. `monthlyBudget === 0` 時，本月剩餘預算與每日預算自動根據「目前帳戶餘額（扣除安全水位底線）」計算；`monthlyBudget > 0` 時根據設定金額計算。
    5. 外幣交易（如 `US$10.00`、`¥1,000`）與缺金額輸入自動進入「📥 未入帳／已略過收件匣」（保留 30 天、自動遮罩完整銀行帳號），支援一鍵補記與刪除。
    6. 支援實機捷徑將「`文字 (商家 數量)` / `通知` / `已擷取的文字` / `螢幕上的文字`」直接傳入金額與商家選填欄位，防止多行 OCR 數字串接為 `1.032e+42` 亂碼，並精簡非交易畫面（7793）未入帳提示。
    7. `core/__tests__/core.test.ts` 54 項單元測試 100% 通過（無 Lookbehind Regex，100% 相容 Hermes 與 V8）。

- [x] **T0.2：Cloudflare Workers + D1 後端 (`cloudflare-worker/`)**
  - **關聯檔案**：`cloudflare-worker/schema.sql`, `cloudflare-worker/src/index.ts`, `cloudflare-worker/wrangler.toml`
  - **驗收條件**：
    1. 正式部署於 `https://pocket-guardian-api.mr-haibaoseal.workers.dev`（綁定 D1 `pocket-guardian-db` `04989ce0-5883-406d-a306-91549540eb8f`）。
    2. 提供 `/api/ingest` 全格式寬容接收器、`/api/widget-summary` 端點與 `/api/state` 完整同步端點。

- [x] **T0.3：iPhone 16 Plus (6.7") iOS 26 Desert Titanium & Warm Amber 液態玻璃介面 (`src/` & `App.tsx`)**
  - **關聯檔案**：`App.tsx`, `src/store/useLedger.tsx`, `src/screens/*`, `src/components/*`
  - **驗收條件**：
    1. 3 層液態玻璃折射（`LiquidGlassView.tsx`）、iPhone 16 Plus 真實安全區域（Top 59pt / Bottom 34pt）與 PC Web 1:1 模擬器外框。
    2. 頂部通知與「撤銷上筆」整合為單一毛玻璃膠囊橫幅，4.5 秒自動消失，並支援上／左／右滑動手勢或點選 `✕` 立即關閉。
    3. 內建「捷徑與雲端收訊紀錄 (`ShortcutsTestBenchScreen.tsx`)」可一鍵與 Cloudflare D1 同步。

---

## P1：防棄坑強化與 iOS 原生封裝 / CI（已完成 `v3.2.3`）

- [x] **T1.1：罵醒我毒舌勸退、小錢雷達、固定扣款與省錢小金庫**
  - **關聯檔案**：`core/scold.ts`, `core/summary.ts`, `src/screens/SettingsAndSubsScreen.tsx`, `src/components/ActionSheetModals.tsx`

- [x] **T1.2：Swift `WidgetKit` 小工具與 Swift `AppIntents` 捷徑積木 (`targets/`)**
  - **關聯檔案**：`targets/widget/PocketGuardianWidget.swift`, `targets/app-intents/PocketGuardianShortcuts.swift`, `.github/workflows/build-sidestore-ipa.yml`
  - **驗收條件**：
    1. `IngestNotificationIntent` 支援「通知或畫面文字」以及選填「Apple Pay 金額 (`String?`)」、「Apple Pay 商家 (`String?`)」。
    2. GitHub Actions 自動產出免簽名 `PocketGuardian-SideStore.ipa`（`v3.3.0`，Run ID `41064228785` 已編譯通過並下載至專案根目錄與 `C:\Users\mrhai\Downloads\PocketGuardian-SideStore.ipa`）。

---

## P1.5：實機驗證與後續微調（當前焦點）

- [-] **T1.5：iPhone 16 Plus 實機安裝 `v3.2.3` `.ipa` 與捷徑驗收**
  - **關聯檔案**：`PocketGuardian-SideStore.ipa`, `core/parsers.ts`, `src/screens/*`
  - **驗收條件**：
    1. 使用者透過 SideStore 安裝最新版 `PocketGuardian-SideStore.ipa` (`v3.2.3`)。
    2. 實測轉帳截圖 Action Button OCR、Apple Pay 交易自動化、玉山銀行通知自動化、頂部通知橫幅滑動／自動消失、以及預設預算 `0` 時的餘額計算。
    3. 若實機測試有新的版面或銀行通知格式需求，僅針對對應檔案局部微調。

---

## P2 / P3：後續擴充待辦（Backlog — 未經使用者指示請勿提前實作）

- [x] **T2.1：人情欠款與代墊拆帳獨立功能欄（「🤝 欠款」`DebtsScreen.tsx`）**
  - **關聯檔案**：`core/types.ts`, `core/ledger.ts`, `core/memoryLedger.ts`, `src/store/useLedger.tsx`, `src/screens/DebtsScreen.tsx`, `src/screens/TransactionsScreen.tsx`, `App.tsx`, `core/__tests__/core.test.ts`
  - **驗收條件**：
    1. 底部浮動毛玻璃導覽列新增第 5 欄「🤝 欠款」，頂部提供「🟢 別人欠我（待收回）」與「🔴 我欠別人（待歸還）」雙生總覽卡與相抵淨額。
    2. 支援「👤 依對象歸戶」同人雙向欠款一鍵自動互抵（Auto-Netting）。
    3. 支援「🧮 聚餐 AA 拆帳計算機」與從「☰ 明細」一鍵轉欠款／AA 拆帳，代墊部分自動標記 `isAdvance = true` 不吃掉個人月預算。
    4. 支援 BROKE AF 帳齡溫度計（`🌱 剛發生` / `⏳ 有點涼了` / `🧊 呆帳警報` / `🔥 快還錢！`）與便當／白打工時數換算。
    5. 支援部分還款（分期進度條與歷次還款紀錄）及三選一連動（玉山銀行／現金錢包／僅勾銷狀態）。
    6. 支援綁定對方銀行帳號末 5 碼，當 iOS 轉帳截圖捷徑入帳時自動比對沖銷「我欠別人」欠款且不重複扣除個人預算。
- [x] **T2.15：iOS 26 頂級流體物理動畫全套升級 (`src/components/iosAnimations.tsx`)**
  - **關聯檔案**：`src/components/iosAnimations.tsx`, `App.tsx`, `src/screens/DashboardScreen.tsx`, `src/screens/TransactionsScreen.tsx`, `src/screens/DebtsScreen.tsx`, `src/components/MorphingCategoryPill.tsx`
  - **驗收條件**：
    1. 頂部通知膠囊支援動態島彈簧墜落、按住微膨脹與上滑跟手阻尼收合。
    2. 首頁與欠款頁大金額支援 Apple Wallet 級平滑滾動跳字與香檳光管刀鋒流光（Shimmer Sweep）。
    3. 底部導覽列支援流體滑動選中膠囊（Fluid Sliding Pill）、圖示彈跳與分頁 `180ms` 絲滑微轉場。
    4. 快捷鍵與行動卡片支援 `<TactilePressable>` 3D 果凍按壓回彈與 Haptics 觸覺回饋；清單支援 `<StaggeredItem>` 瀑布流與自動補位重排；底層環境光球支援慢速呼吸律動。
- [ ] **T2.2：更多行動支付（LINE Pay / 街口支付 / 全支付）專用通知模板細化**
- [ ] **T3.1：財政部電子發票載具明細補完（選配）**
