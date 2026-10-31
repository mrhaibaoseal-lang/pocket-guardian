# HANDOFF.md — 跨工具／跨模型交接紀錄

> **最後更新時間**：2026-11-01 01:15 (UTC+8)
> **最後更新 Agent**：Cline (① 新增全站 5 大分頁 `總覽 / 明細 / 欠款 / 捷徑 / 設定` 支援頁面與底部導覽列「左右滑動切換頁面」`App.tsx`, `src/components/iosAnimations.tsx`，具備 1:1 水平跟手位移、邊界阻尼回彈、方向性彈簧轉場、底部翡翠光膠囊即時聯動推進與垂直捲動方向鎖定防誤觸；② 全站根治雲端同步與背景輪詢覆蓋問題：`core/memoryLedger.ts` 之 `mergeLedgerData` 確保將預算、底線、時薪、便當價改為 `0` 或任何數值皆以本機為準、`src/store/useLedger.tsx` 預設 `replaceCloud = true`、`src/screens/SettingsAndSubsScreen.tsx` 加入 `focusedFieldRef / dirtyFieldsRef` 防護與 `onBlur` 自動儲存)
> **專案路徑**：`C:\Users\mrhai\.gemini\antigravity\scratch\smart-ledger`
> **Git 分支與最新狀態**：`main`（已同步寫入主工作區並推送 `origin/main` 觸發 IPA 打包）
> **Cloudflare Worker 線上版本**：`https://pocket-guardian-api.mr-haibaoseal.workers.dev` (Version ID: `1e12ae0d-666f-42bd-beb3-d061a3a2e4ec`，前版可 Rollback ID: `845769c7-ceaf-40a6-aa24-5120b363981e`)
> **最新無簽名 IPA 位置（v3.3.0+ 底部字卡上下滑動跟手關閉修復 ＋ 固定扣款預留刪除不復活／防當月回溯扣款版，GitHub Actions Run ID: 41202906351，11.10 MB）**：
> - `C:\Users\mrhai\Downloads\PocketGuardian-SideStore.ipa`
> - `C:\Users\mrhai\.gemini\antigravity\scratch\smart-ledger\PocketGuardian-SideStore.ipa`
> - `C:\Users\mrhai\.cline\worktrees\40249\smart-ledger\PocketGuardian-SideStore.ipa`

---

## 1. 已完成工作摘要（截至 `v3.3.0+` 黑曜鉑金×冰翡翠配色 ＋ 字卡上下滑動關閉 ＋ 設定全抽屜 ＋ 回收桶一鍵清空）

0. **本次 Session 完成之 4 大更新（2026-10-31 18:52）**：
   - **① 全站 UI 配色升級為「方案 1：🏛️ 黑曜鉑金 × 冰翡翠 (Obsidian Platinum & Jade)」(`App.tsx`, `src/components/LiquidGlassView.tsx`, `src/components/iosAnimations.tsx`, `src/components/MorphingCategoryPill.tsx`, `src/components/SafeConfirmButton.tsx`, `src/components/ActionSheetModals.tsx`, `src/screens/*.tsx`)**：
     - 嚴格保留既有 UI 排版、三層 `LiquidGlassView` 毛玻璃折射與 6 大流體物理動畫（0 破壞）。
     - 採用 **90/10 暗色奢華視覺焦點法則**：90% 空間使用純淨煙燻黑曜毛玻璃（`rgba(13, 18, 22, 0.52)` / `rgba(17, 24, 29, 0.68)`）搭配頂部微米級冷白刀鋒高光（`rgba(255, 255, 255, 0.22)`）與三階冷調灰白字體（主字 `#F8FAFC`、次要字 `#CBD5E1`、輔助字 `rgba(148, 163, 184, 0.72)`）；次要膠囊統一收斂為低調消光冷鈦灰玻璃（`rgba(255, 255, 255, 0.055)`）。
     - **10% 唯一視覺焦點**：僅在「本月剩餘預算光管 (`#059669 → #10B981 → #6EE7B7`)」、「今日可用重點金額 (`#34D399`)」、「主行動按鈕 (`#10B981` 配深黑字 `#04120C`)」與「底部滑動導覽膠囊」點綴低飽和冰翡翠綠，讓重點一眼跳出。
   - **② 記收支 / ATM / 罵醒我 / 魔術平帳底部字卡支援「上下滑動手勢跟手關閉」(`src/components/ActionSheetModals.tsx`)**：
     - 修復先前在 iOS 實機下拉時無動畫且拉動無反應之四大根因：(1) 將原本獨立原生 `<Modal>` 改為與 `DismissibleBanner` 相同根視圖表面的 In-Tree `KeyboardAvoidingView` 頂層覆蓋層（搭配 `renderedActive` 生命週期確保滑出期間內容不提前卸載）；(2) 補齊 `onStartShouldSetPanResponder: () => true`、`onStartShouldSetPanResponderCapture: () => false`、`onPanResponderTerminationRequest: () => false` 及原生 `onTouchStart / onTouchMove / onTouchEnd` 即時跟手位移與瞬時速度計算；(3) 當字卡內容未超過螢幕高度 `68%` 時自動設為 `scrollEnabled={false}`，防止 iOS 原生 `UIScrollView` 發送 `touchesCancelled` 中斷下拉手勢；(4) 移除關閉時的同步 `sheetY = 0` 重置，確保下滑（`dy > 26` 或快速下滑）與上滑（`dy < -28` 或快速上滑）皆有 1:1 跟手動畫、背景遮罩動態明暗漸變與順暢滑出關閉。
   - **③ 「⚙️ 設定」全頁面抽屜化 ＆ 「📡 近期收訊紀錄」展開收合抽屜 (`src/screens/SettingsAndSubsScreen.tsx`, `src/screens/ShortcutsTestBenchScreen.tsx`)**：
     - 設定頁 6 大區塊（`🔄 固定扣款預留`、`🏦 常用轉帳對象字典`、`⚙️ 預算與體感參數`、`📡 近期收訊紀錄`、`☁️ Cloudflare D1 雲端與 SideStore`、`🧹 帳本歸零重置`）與捷徑頁「`📡 近期收訊紀錄`」全部改為預設收合、點擊展開／收起的抽屜卡片。
   - **④ 「☰ 明細 → 7天回收桶」一鍵全部永久刪除、單筆永久刪除 ＆ 「🔄 固定扣款預留」刪除不復活與防當月回溯扣款 (`src/screens/TransactionsScreen.tsx`, `core/memoryLedger.ts`, `src/store/useLedger.tsx`, `cloudflare-worker/src/index.ts`, `core/__tests__/core.test.ts`)**：
     - 在 `MemoryLedger` 與 `useLedger` 新增 `emptyTrash()` 與 `hardDelete(id)`，永久刪除時一併清理對應 `events` 關聯，並以 `{ replace: true }` 同步覆寫 Cloudflare D1 雲端快照，確保刪除後雲端同步不復活、重掃截圖不卡重複。
     - 修復 `mergeLedgerData` 合併邏輯與 `deleteSubscription / deletePayee / deleteDebt / softDeleteTx` 的 `{ replaceCloud: true }` 同步機制：非空白帳本同步時以本機 `subscriptions / payees / debts` 清單為準，並加入 `inFlightPushCountRef` 與 `localMutationSeqRef` 防競態鎖，徹底防止刪除固定扣款預留後被每 8 秒雲端輪詢復活。
     - 修復 `addSubscription` 與 Worker `PUT /api/state`：當新增固定扣款預留的扣款日在當月已過（例如 10/31 新增「每月 5 號扣款」），自動將 `lastChargedMonth` 設為當月（`2026-10`），從下個月 5 號才開始預留與扣款，絕不回溯補扣當月已過日期的餘額。
     - 在「7天回收桶」分頁頂部新增「`🗑️ 一鍵全部刪除 (N)`」防誤觸二次確認工具列，並在每筆回收桶紀錄新增單筆「`永久刪除`」按鈕。

   - **⑤ 全站 5 大分頁「左右滑動切換頁面」與底部流體膠囊即時跟手聯動 (`App.tsx`, `src/components/iosAnimations.tsx`)**：
     - 支援在畫面任意區域或底部懸浮導覽列**往左滑切換下一頁、往右滑切換上一頁**（依序：`◈ 總覽 ↔ ☰ 明細 ↔ 🤝 欠款 ↔ ⚡ 捷徑 ↔ ⚙ 設定`）。
     - 實作智慧方向鎖定（`evaluateSwipeLock`）：當手指垂直滑動（`|dy| > 10`）時立即鎖定為垂直捲動，確保長清單上下滑動 0 誤觸；當水平滑動（`|dx| > 12` 且大於垂直位移 `1.25` 倍）時切入水平跟手模式，支援 1:1 頁面即時位移、首尾頁邊界阻尼回彈（Rubber-banding）、跨過門檻微震動回饋（Haptics）、方向性滑入彈簧動畫，以及底部導覽列冰翡翠選中膠囊隨手指進度即時平滑推進。

0.5. **全站 6 大 iOS 26 頂級流體物理動畫系統（`src/components/iosAnimations.tsx`, `App.tsx`, `src/screens/DashboardScreen.tsx`, `src/screens/TransactionsScreen.tsx`, `src/screens/DebtsScreen.tsx`, `src/components/MorphingCategoryPill.tsx`）**：
   - **方案一（動態島級頂部毛玻璃橫幅）**：`DismissibleBanner` 改為從頂部動態島以 iOS 阻尼彈簧（`damping: 15, stiffness: 230`）伴隨縮放（`0.84 → 1.0`）彈落並觸發輕觸覺震動；手指按住暫停時微幅膨脹（`scale: 1.025`），上滑時即時跟手並加速收合回動態島。
   - **方案二（Apple Wallet 級平滑滾動金額 + 香檳光管刀鋒流光）**：建立 `<AnimatedRollingNumber>` 以 iOS 五次減速曲線平滑滾動金額並帶微幅彈性脈衝；建立 `<LiquidLightTube>` 讓預算光管以 `withSpring` 彈性伸縮並循環掠過香檳金高光折射（Shimmer Sweep）。
   - **方案三（底部流體滑動膠囊導覽列 + 分頁微轉場）**：底部 5 欄導覽列改為共用 `<Animated.View>` 流體滑動琥珀膠囊（Fluid Sliding Pill）平滑滑移至選中分頁，搭配圖示 Q 彈跳動與 `<ScreenTransitionView>` `180ms` 微上浮轉場。
   - **方案四（3D 觸感果凍回彈 `<TactilePressable>`）**：首頁 3 秒極速現金膠囊、2x2 行動矩陣、晚間結算與欠款操作鈕全面支援按壓微縮（`0.92~0.95`）、高光疊加與低阻尼回彈，搭配 `expo-haptics` 觸覺回饋。
   - **方案五（瀑布流進場與自動彈性補位 `<StaggeredItem>`）**：首頁近期明細、明細頁與欠款清單支援依序微延遲瀑布流浮現（`FadeInDown.springify()`）與 `LinearTransition.springify()` 自動補位重排。
   - **方案六（底層大漠鈦金環境光球慢速呼吸律動）**：`AmbientLightCanvas` 左上古銅琥珀與右下大漠金光球以 7.8s / 9.6s 週期於 UI 執行緒慢速呼吸漂移。

1. **全新「🤝 欠款」獨立功能欄與五大進階點子（`core/types.ts`, `core/ledger.ts`, `core/memoryLedger.ts`, `src/store/useLedger.tsx`, `src/screens/DebtsScreen.tsx`, `src/screens/TransactionsScreen.tsx`, `App.tsx`）**：
   - **底部導覽列第 5 分頁「🤝 欠款」**：頂部顯示「🟢 別人欠我」與「🔴 我欠別人」雙生液態玻璃卡、雙向相抵淨額、便當數 🍱 與白打工時數 ⏱️ 換算。
   - **點子 ① 按「人」自動互抵淨額（Auto-Netting）**：在「👤 依對象歸戶」視角下，若同一對象同時有「他欠我」與「我欠他」，自動算出重疊金額並提供「⚡ 一鍵互抵」按鈕對沖銷帳。
   - **點子 ② 聚餐 AA 拆帳計算機 ＋ 明細一鍵轉欠款（保護個人預算）**：支援在欠款頁直接用「🧮 聚餐 AA 拆帳」建立多位朋友代墊，或在「☰ 明細」任一筆消費點選「🤝 轉欠款／AA拆帳」（支援 2/3/4 人平分或全額代墊），代墊部分自動拆分並標記 `isAdvance = true`，真實扣除銀行／現金餘額但**不吃掉個人月預算與每日可用額度**。
   - **點子 ③ BROKE AF 帳齡溫度計（`computeDebtAging`）**：依天數自動標記 `🌱 剛發生`、`⏳ 有點涼了`、`🧊 呆帳警報 (30天+)` 與 `🔥 快還錢！`。
   - **點子 ⑤ 部分還款分期進度條 ＋ 玉山銀行／現金錢包連動**：支援分次收回／歸還（附「先還一半」、「全額」快捷鍵）、視覺化進度條與歷次還款明細，並可選擇同步更新玉山銀行、現金錢包或僅勾銷狀態。
   - **點子 ⑥ 轉帳截圖末 5 碼自動沖銷連動**：當欠款綁定對方帳號末 5 碼（或對應常用轉帳對象 `Payee`），使用 iPhone 轉帳成功頁截圖捷徑入帳時，自動沖銷「我欠別人」欠款並標記 `isAdvance = true` 避免重複扣減個人預算。
2. **標籤錨定轉帳解析器與多格式日期／自己轉自己排除（`core/parsers.ts`, `core/time.ts`, `core/dedupe.ts`）**：
   - `parseTransferPage` 改為標籤錨定結構（同時支援單欄逐行與 iOS Vision 雙欄分開讀排版），精準取得 `轉帳金額`（支援 `20`、`100`、`1,000`），排除狀態列 `10:50` / 電量 `100`、手續費 `15`、三碼銀行通用結構 `^\d{3}[ \t]*[\u4e00-\u9fa5A-Za-z]{2,}` 與日期。
   - `taipeiLocalToIso` 擴充支援西元年（`2026-10-28`、`2026/10/28`）、民國年（`115/10/28`、`115年10月28日` 自動 `+1911`）與短日期時間（`10/26 02:07`）。
   - 支援多組「我的帳戶末碼」（如 `83151, 99999`），當轉入對象屬於使用者自己的帳戶時自動判定為內部移轉（`ignored`），不計入支出。
   - 補強無時間戳截圖與跨通道轉帳在 `±3 分鐘` 內的重複觸發攔截（`duplicate`）。
2. **結構化白名單 `parseWallet`、外幣攔截與無誤殺行銷過濾（`core/parsers.ts`）**：
   - 移除 `parseWallet` 寬鬆的 `N 元` 自由文字匹配；新增外幣偵測（`US$10.00`、`¥1,000` 等），偵測到外幣或缺金額時一律標為 `unknown` 送入收件匣待確認，絕不誤當新台幣或 `$0` 入帳。
   - 將行銷攔截改為促銷條件結構 `PROMO_CAMPAIGN_RE`，確保「雙11 刷卡滿 1,000 元送 100 元刷卡金，立即登錄」在所有通道皆略過且不 fallback 至 `wallet`，而「消費 NT$320，享 1% 回饋」正常入帳 `$320`。
   - 全面移除 `core/parsers.ts` 內的 Regex Lookbehind `(?<!...)`，並加上最外層 `try / catch` 防崩潰保護，確保 Hermes 與 Cloudflare V8 100% 相容。
3. **「📥 未入帳／已略過收件匣」與 iOS 27「錢包 (Wallet)」＋ AI 提示詞雙模式設定指南（`src/screens/ShortcutsTestBenchScreen.tsx`, `src/store/useLedger.tsx`, `core/memoryLedger.ts`, `targets/app-intents/PocketGuardianShortcuts.swift`）**：
   - `MemoryLedger` 儲存事件時自動將 9～16 碼完整銀行帳號遮罩為 `****末5碼`，並自動清理超過 30 天的舊事件。
   - 在「⚡ 捷徑」分頁新增「📥 未入帳／已略過收件匣」，支援一鍵「✍️ 手動補記」與「🗑️ 刪除」。
   - 針對 iOS 27 捷徑大改版（原「交易」改名為「錢包 (Wallet)」，並支援 AI 提示詞自動產生模塊），同步更新 App 內設定指南與 Swift `IngestNotificationIntent` 參數描述。
4. **頂部單一毛玻璃橫幅觸控與計時優化（`App.tsx`, `src/store/useLedger.tsx`）**：
   - 以遞增 `toastSeq` 確保連續相同通知必重置倒數；一般通知 4.5 秒消失、`⚠️ 未入帳` 錯誤通知延長為 8 秒消失；手指按住橫幅時暫停倒數；移除左右滑動（避免與 iOS 左緣返回手勢衝突），僅保留往上滑動與 `✕` 關閉。

---

## 2. 最新測試與環境狀態

- **Windows 環境注意事項**：本機 Node.js 位於 `C:\Program Files\nodejs`，若在終端機執行 `npx` / `vitest` / `wrangler` 遇到找不到 `node`，請先確保 `$env:PATH = "C:\Program Files\nodejs;$env:PATH"`。
- **TypeScript 型別檢查 (`npx tsc --noEmit`)**：✅ **通過（0 Errors）**
- **Vitest 單元測試 (`npx vitest run`)**：✅ **通過（1 Test File, 59/59 Tests Passed）**
  - 涵蓋實機 7724/7794 轉出截圖、7717 玉山存摺明細轉入收入（`網路非約轉帳 ... 轉帳給此帳號` -> `轉入：阮*豫 ****88173 +$500`，排除年份 `2026` 與 `帳戶餘額 2,040`）、7793 錯誤截圖精簡提示、刪除舊交易後重掃不吃單（`mergeLedgerData` 忽略已刪除交易的 `idempotencyKey`）、7天回收桶一鍵全部永久刪除 (`emptyTrash`) 與單筆永久刪除 (`hardDelete`)、以及 Cloudflare Workers AI / iOS 捷徑 AI 結構化 JSON 解析。

---

## 3. 下一步行動（供接手的 Cline Agent 參考）

1. **禁止全倉掃描與禁止重寫已完成模組**：
   - 請先閱讀 `AGENTS.md`、`HANDOFF.md`、`TASKS.md`，並檢查 `git status`。
   - 只讀取與使用者當前指令直接相關的 1～3 個檔案，嚴禁掃描 `node_modules`、`.expo`、`dist-ipa`。
2. **等待使用者實機測試 `v3.2.3` 回饋**：
   - 若使用者回報特定銀行通知或轉帳截圖文字格式需微調：只讀取並修改 `core/parsers.ts` 與 `core/__tests__/core.test.ts`，跑過 `npx vitest run` 後，可在獲得使用者同意後於 `cloudflare-worker/` 執行 `npx wrangler deploy` 即時更新雲端解析器（0 元免費，免重裝 App）。
   - 若使用者要求調整 UI 細節：只修改對應的 `src/screens/*.tsx` 或 `App.tsx`，確認 `npx tsc --noEmit` 通過。
   - **重要成本護欄**：未經使用者明確指示「打包 IPA / 推送 GitHub」，切勿主動執行 `git push` 或 `gh workflow run` 以免消耗 GitHub Actions macOS 分鐘數。
