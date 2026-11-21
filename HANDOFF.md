# HANDOFF.md — 跨工具／跨模型交接紀錄

> **最後更新時間**：2026-11-22 (UTC+8)
> **最後更新 Agent**：Claude Code（雲端 session）— T2.19 雲端上傳失敗自動補傳，v3.3.1
> **專案路徑**：`C:\Users\mrhai\.gemini\antigravity\scratch\smart-ledger`
> **Git 分支與最新狀態**：`main`（已同步寫入主工作區並推送 `origin/main` 觸發 IPA 打包）
> **Cloudflare Worker 線上版本**：`https://pocket-guardian-api.mr-haibaoseal.workers.dev` (Version ID: `e1c0f72e-03fd-498e-af07-849dab5ef446`，前版可 Rollback ID: `1e12ae0d-666f-42bd-beb3-d061a3a2e4ec`)
> **最新無簽名 IPA 位置（v3.3.0+ 底部字卡上下滑動跟手關閉修復 ＋ 固定扣款預留刪除不復活／防當月回溯扣款版，GitHub Actions Run ID: 41202906351，11.10 MB）**：
> - `C:\Users\mrhai\Downloads\PocketGuardian-SideStore.ipa`
> - `C:\Users\mrhai\.gemini\antigravity\scratch\smart-ledger\PocketGuardian-SideStore.ipa`
> - `C:\Users\mrhai\.cline\worktrees\40249\smart-ledger\PocketGuardian-SideStore.ipa`

---

## ⚠️ 待辦（使用者有空時做）：重新部署 Cloudflare Worker（T2.20）

**現況（2026-11-22 已裝 v3.3.1 實機確認）**：小工具仍比 App 多 $809（小工具銀行 $2,277／App 玉山 $1,468）。
**原因**：11/13 用「校正餘額」把玉山往下調 $809，存成一筆 **-$809 adjustment**。舊版 `sanitizeLedgerData` 會刪掉所有金額 ≤ 0 的交易，這個 bug 已在 commit `4c0fdd1`（11/14）修好，但**雲端 Worker 之後沒有重新部署**，仍跑舊的 `core/`。每次 App 上傳，Worker 就把 -$809 刪掉，所以雲端和小工具永遠多 $809。App 端不用再改。

**步驟（Windows PowerShell）**：
```powershell
cd C:\Users\mrhai\.gemini\antigravity\scratch\smart-ledger
git pull origin main
cd cloudflare-worker
npx wrangler deploy
```
（跳出瀏覽器就登入 Cloudflare；看到 `Deployed pocket-guardian-api` 即成功。部署也會一併帶上 `e7c72a9` 轉帳手續費等 11/14 之後的 `core/` 修改。）

**部署後**：
1. App →「設定 → 雲端同步 → 備份到雲端」，重新上傳含 -$809 調整的帳本。
2. 按小工具右上角刷新鈕，應與 App 的玉山餘額、可用總額一致。
3. 完成後把 HANDOFF 開頭的 Worker Version ID 換成新的，並勾選 TASKS T2.20。

## 0.0 最新變更（2026-11-22，T2.19 雲端上傳失敗自動補傳，v3.3.1）

- **問題**：小工具停在舊餘額、App 偶爾「雲端連線失敗」。查證：Worker `/api/widget-summary` 正常回應，但雲端玉山 $2,407、App 本機 $1,598 → App 的上傳失敗被靜默吞掉，雲端一直是舊的，小工具如實顯示雲端。
- **修改**：只動 `src/store/useLedger.tsx`（見 TASKS T2.19）。Worker、小工具 Swift、`core/` 未動。
- **驗證**：`tsc --noEmit` 0 errors；`vitest run` 64/64。已合併 main（PR #1），v3.3.1 實機已安裝；剩下的 $809 差額是 Worker 未部署造成，見上方 T2.20。
- **待觀察**：「偶爾連不到雲端」的根因未確認，懷疑 Cloudflare 免費方案 10ms CPU 上限（每次請求都解析整份帳本 JSON）；可到 Cloudflare 後台 Worker → Logs 查是否有 Exceeded CPU。補傳機制讓偶發失敗不再造成資料不一致。

## 0. 最新變更（2026-11-14，T2.17 全站 iOS 原生風格重做，已 commit）

- **新增**：`src/theme/index.ts`（iOS 系統語意色 light/dark、Dynamic Type 字級、`useThemedStyles`）、`src/components/ui/`（`Icon`/`IconTile` SF Symbols 對照表、`List`（Section/Row/Button/LargeTitle/Badge）、`Segmented`、`Field`/`AmountField`/`SearchField`、`FormRow`/`Chip`、`TxRow`、`PushedPage`、`txVisual`（分類圖示色、金額格式、`stripEmoji`））。
- **依賴**：`expo-symbols ~58.0.5`（原生模組 → 必須重新打包 IPA 才會生效；web 預覽以 Material Symbols 字型後備）。
- **App 殼層**：4 分頁（總覽/明細/欠款/設定），iOS 26 浮動膠囊導覽列（保留原生水平分頁滑動與導覽列滑動切換）；捷徑頁改由設定推入；頂部通知改 iOS 通知橫幅（顯示時去除 emoji，`⚠️` 開頭的錯誤 toast 顯示紅色警示圖示，store 內原字串未改動以保留錯誤判斷）。
- **各頁**：總覽（大數字＋進度條＋三格統計、快速記帳 4 格、帳戶、工具、小金庫、最近 5 筆）；明細（搜尋、全部/最近刪除分段、依日期分組、點選展開詳細與操作）；欠款（摘要、+ 開啟表單、依對象/未結清/已結清）；設定（iOS 設定式清單＋推入子頁）。
- **底部字卡**：`ActionSheetModals.tsx` 第 1～446 行的手勢／捲動交接邏輯保留，只調整開關動畫（無縮放／淡出、臨界阻尼彈簧）並重寫畫面為「取消／標題／完成」表單。
- **被拿掉的小東西**：明細列內的「雙源已鎖／前端槽／銀行槽」標籤改為展開後的「來源」文字與鎖頭小圖示；捷徑頁重複的「近期收訊紀錄」移除（設定 → 收訊紀錄仍有）；金額欄旁的「清空」二次確認鈕移除。
- **驗證**：`tsc --noEmit` 0 errors；`vitest run` 112/112 通過；web 預覽 393×852 淺色／深色逐頁目視檢查（總覽、明細展開、欠款、設定、捷徑推入頁、記一筆／ATM／校正餘額字卡）。**尚未在 iPhone 實機驗證**（SF Symbols、BlurView、字卡手勢需實機確認）。
- **本機預覽**：`.claude/launch.json` 新增 `expo-web`（以完整 node 路徑啟動 `expo start --web`），未加入 git。
- **下一步**：使用者確認後 commit → 推送觸發 IPA 打包 → 實機驗收 T2.17。

## 0.1 最新變更（2026-11-14，T2.18 小工具 iOS 原生風格，已 commit）

- `targets/widget/PocketGuardianWidget.swift` 畫面層重寫：系統背景色（淺／深色跟隨系統）、SF Symbols 彩色方塊圖示、系統綠強調、`widgetAccentable` 支援染色模式；鎖定畫面配件用透明背景。資料、快取與兩個 AppIntent 邏輯未改。
- 小工具名稱改為「總餘額」「快速記帳」；「魔術平帳」按鈕改稱「校正」（深連結仍是 `reconcile`）。
- **驗證**：Windows 無法編譯 Swift，**尚未經 Xcode 編譯與實機驗證**；需推送後由 GitHub Actions 打包 IPA 確認編譯通過。
- **下一步**：commit → 推送觸發 IPA → 實機確認小工具（可能需移除舊小工具重新加入）。

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
2. **標籤錨定轉帳解析器與多格式日期／完整與遮罩帳號解析（`core/parsers.ts`, `core/time.ts`, `core/dedupe.ts`, `core/memoryLedger.ts`）**：
   - `parseTransferPage` 改為標籤錨定結構（同時支援單欄逐行與 iOS Vision 雙欄分開讀排版），精準取得 `轉帳金額`（支援 `20`、`100`、`274`、`1,000`），排除狀態列 `10:50` / 電量 `100`、手續費 `0`/`15`、三碼銀行通用結構 `^\d{3}[ \t]*[\u4e00-\u9fa5A-Za-z]{2,}` 與日期。
   - `taipeiLocalToIso` 擴充支援西元年（`2026-10-28`、`2026/10/28`）、民國年（`115/10/28`、`115年10月28日` 自動 `+1911`）與短日期時間（`10/26 02:07`）。
   - 已依使用者需求**徹底移除「轉入自己帳戶（內部移轉，不計入支出）」(`isSelfTransfer` / `internal_transfer`) 忽略機制**；同時支援在同一畫面並存「未遮罩完整對方帳號（如 `0222979124126` → `24126`）」與「遮罩自己帳號（如 `********83151`）」時精準擷取對方帳號末 5 碼 `24126` 與對方姓名 `潘O杏`，並於 `sanitizeLedgerData` 自動補記曾被誤標為 `轉入自己帳戶` 的轉帳事件。
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
- **Vitest 單元測試 (`npx vitest run`)**：✅ **通過（1 Test File, 62/62 Tests Passed）**
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
