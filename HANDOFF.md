# HANDOFF.md — 跨工具／跨模型交接紀錄

> **最後更新時間**：2026-10-28 22:25 (UTC+8)
> **最後更新 Agent**：Cline (Gemini 備援加固)
> **專案路徑**：`C:\Users\mrhai\.gemini\antigravity\scratch\smart-ledger`
> **Git 分支與最新 Commit**：`main` @ `36ff71b` + 本地打包前完整加固（待使用者確認後部署／打包）
> **Cloudflare Worker 線上版本**：`https://pocket-guardian-api.mr-haibaoseal.workers.dev` (Version ID: `4deb2077-229b-4aba-b53d-114b6dafd222`，前版可 Rollback ID: `0cd6b1db-4365-4113-b071-5cbe8731efff`)
> **最新無簽名 IPA 位置**：
> - `C:\Users\mrhai\.gemini\antigravity\scratch\smart-ledger\PocketGuardian-SideStore.ipa`
> - `C:\Users\mrhai\Downloads\PocketGuardian-SideStore.ipa`

---

## 1. 已完成工作摘要（截至 `v3.2.3` 打包前完整加固）

1. **標籤錨定轉帳解析器與多格式日期／自己轉自己排除（`core/parsers.ts`, `core/time.ts`, `core/dedupe.ts`）**：
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
- **Vitest 單元測試 (`npx vitest run`)**：✅ **通過（1 Test File, 43/43 Tests Passed）**
  - 涵蓋轉帳 20/100/1,000 單雙欄排版、狀態列 10:50 與電量 100 過濾、手續費 15 元排除、西元／民國年／短日期解析與防誤抓、自己轉自己排除、滿千送百略過與享 1% 回饋正常入帳、外幣與空字串進收件匣、收件匣完整帳號遮罩，以及 `monthlyBudget = 0` vs `> 0` 雙模式測試。

---

## 3. 下一步行動（供接手的 Cline Agent 參考）

1. **禁止全倉掃描與禁止重寫已完成模組**：
   - 請先閱讀 `AGENTS.md`、`HANDOFF.md`、`TASKS.md`，並檢查 `git status`。
   - 只讀取與使用者當前指令直接相關的 1～3 個檔案，嚴禁掃描 `node_modules`、`.expo`、`dist-ipa`。
2. **等待使用者實機測試 `v3.2.3` 回饋**：
   - 若使用者回報特定銀行通知或轉帳截圖文字格式需微調：只讀取並修改 `core/parsers.ts` 與 `core/__tests__/core.test.ts`，跑過 `npx vitest run` 後，可在獲得使用者同意後於 `cloudflare-worker/` 執行 `npx wrangler deploy` 即時更新雲端解析器（0 元免費，免重裝 App）。
   - 若使用者要求調整 UI 細節：只修改對應的 `src/screens/*.tsx` 或 `App.tsx`，確認 `npx tsc --noEmit` 通過。
   - **重要成本護欄**：未經使用者明確指示「打包 IPA / 推送 GitHub」，切勿主動執行 `git push` 或 `gh workflow run` 以免消耗 GitHub Actions macOS 分鐘數。
