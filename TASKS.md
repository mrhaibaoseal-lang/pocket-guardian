# TASKS.md — 專案任務清單與驗收條件

> **專案名稱**：PocketGuardian（守財靈）`smart-ledger`
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
  - **負責模型**：Gemini 4（實作）+ Claude Opus 5.5（去重邊界條件審查）
  - **關聯檔案**：`core/parsers.ts`, `core/dedupe.ts`, `core/ledger.ts`, `core/memoryLedger.ts`, `core/__tests__/core.test.ts`
  - **驗收條件**：
    1. 支援 Apple Pay 錢包通知、玉山 e.Fingo 推播、玉山轉帳成功頁 OCR Regex 解析，並過濾 OTP 驗證碼。
    2. 30 分鐘跨通道雙插槽自動合體並標記 `is_locked = true`；同源連發必新增第 2 筆交易；支援一鍵拆單還原。
    3. `core/__tests__/core.test.ts` 33 項單元測試 100% 通過。

- [x] **T0.2：Cloudflare Workers + D1 後端 (`cloudflare-worker/`)**
  - **負責模型**：Gemini 4
  - **關聯檔案**：`cloudflare-worker/schema.sql`, `cloudflare-worker/src/index.ts`, `cloudflare-worker/wrangler.toml`
  - **驗收條件**：
    1. 提供 `/api/ingest` 全格式寬容接收器（JSON / 純文字 / Form / Query）與 D1 原子排隊鎖。
    2. 提供 `/api/widget-summary` 唯讀端點供 iOS 鎖定畫面與桌面 Widget 讀取。

- [x] **T0.3：iPhone 16 Plus (6.7") 單手大拇指熱區介面 (`src/` & `App.tsx`)**
  - **負責模型**：Gemini 4
  - **關聯檔案**：`App.tsx`, `src/store/useLedger.tsx`, `src/screens/*`, `src/components/*`
  - **驗收條件**：
    1. 上半部 55% 顯示電量式今日安全額度、玉山銀行與現金餘額、真正總可用餘額、小錢預警橫幅。
    2. 下半部 45% 提供 3 秒記現金、ATM 存提同步、罵醒我、魔術平帳 4 大極速動作鍵。
    3. 撤銷／刪除按鈕具備二次確認防誤觸（SafeConfirmButton）與 7 天回收桶機制。
    4. 內建「捷徑防打架模擬測試台 (`ShortcutsTestBenchScreen.tsx`)」可於本機離線驗證所有情境。

---

## P1：防棄坑強化與 iOS 原生封裝 / CI（已完成實作，待實機聯調）

- [x] **T1.1：罵醒我毒舌勸退、小錢雷達、固定扣款與省錢小金庫**
  - **負責模型**：Gemini 4
  - **關聯檔案**：`core/scold.ts`, `core/summary.ts`, `src/screens/SettingsAndSubsScreen.tsx`, `src/components/ActionSheetModals.tsx`
  - **驗收條件**：
    1. 支援三種勸退語氣（毒舌損友／殘酷數據／暴躁老媽）與時薪／雞腿便當換算。
    2. 固定扣款（Subscriptions）於月初預留額度，不重複扣除。

- [x] **T1.2：Swift `WidgetKit` 電量小工具與 Swift `AppIntents` 捷徑積木 (`targets/`)**
  - **負責模型**：Gemini 4（實作）+ Claude Opus 5.5（若 Xcode 編譯或 Swift 型別異常時介入除錯）
  - **關聯檔案**：`targets/widget/PocketGuardianWidget.swift`, `targets/app-intents/PocketGuardianShortcuts.swift`, `.github/workflows/build-sidestore-ipa.yml`
  - **驗收條件**：
    1. 產出免簽名 `.ipa`（最低相容 `iOS 17.0+`，支援 iPhone 16 Plus `iOS 27`）。
    2. GitHub Actions workflow 升級至 Node 24 (v7) 且修正 Swift 檔案掛載路徑。

---

## P1.5：近期進行中與待驗證任務（當前焦點）

- [-] **T1.3：Expo 實機預覽與 Tunnel 連線設定整理**
  - **預設負責模型**：Gemini 4（若額度耗盡由 **Cline + Gemini API** 接手）
  - **關聯檔案**：`app.json`, `package.json`, `package-lock.json`
  - **目前進度**：工作區已有未提交修改（`app.json` 加入 `"owner": "laoshu77"`，`package.json` 加入 `@expo/ngrok@^4.1.3`）。
  - **驗收條件**：
    1. 保留現有未提交修改，確認 `tsc --noEmit` 與 `vitest` 測試無誤。
    2. 由使用者確認是否要將此變更 Commit，或進行本機 Expo Tunnel 實機連線測試。

- [ ] **T1.4：Cloudflare Workers + D1 雲端實例綁定與部署驗證**
  - **預設負責模型**：Gemini 4（一般設定）／ Claude Opus 5.5（僅在發生跨端點同步或 D1 併發鎖異常時介入）
  - **關聯檔案**：`cloudflare-worker/wrangler.toml`, `src/store/useLedger.tsx`
  - **驗收條件**：
    1. **（需使用者明確要求才可執行部署）** 建立 Cloudflare D1 資料庫並將正式 `database_id` 填入 `wrangler.toml`。
    2. 執行 `schema.sql` 初始化資料表並部署 Worker。
    3. 在 App 設定頁填入 Worker URL 與 Token，實測捷徑測試台與雲端同步成功。

- [ ] **T1.5：iPhone 16 Plus (iOS 27) SideStore `.ipa` 安裝與 Action Button / 捷徑實機驗收**
  - **預設負責模型**：Gemini 4（引導與微調）／ Claude Opus 5.5（若原生 Swift Intent 觸發異常時介入）
  - **關聯檔案**：`PocketGuardian-SideStore.ipa`, `targets/app-intents/PocketGuardianShortcuts.swift`
  - **驗收條件**：
    1. 透過 SideStore 安裝 `.ipa` 至 iPhone 16 Plus。
    2. 設定 iOS 27「當收到來自『錢包』／『玉山銀行』通知時」自動化捷徑並綁定左側實體 Action Button。
    3. 實測 Apple Pay 雙通知合體、實體卡入帳與轉帳成功頁無痕 OCR 正常運作。

---

## P2 / P3：後續擴充待辦（Backlog — 未經使用者指示請勿提前實作）

- [ ] **T2.1：代墊款項（幫朋友先付／拆帳）沖銷標記**（預設：Gemini 4）
  - **驗收條件**：支援標記交易為「代墊款」，朋友轉帳還錢時可沖銷代墊金額，不計入個人當月一般消費。
- [ ] **T2.2：LINE Pay / 街口支付 / 全支付通知解析規則擴充**（預設：Gemini 4）
  - **驗收條件**：在 `core/parsers.ts` 新增對應通知 Regex 並在 `core.test.ts` 補齊單元測試。
- [ ] **T3.1：財政部電子發票載具明細補完（選配）**（預設：Gemini 4 規劃 + Claude Opus 5.5 審查 API 同步方案）
  - **驗收條件**：將超商／賣場單筆消費補上發票內的品項明細，不影響帳戶總餘額。
