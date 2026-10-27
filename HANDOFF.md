# HANDOFF.md — 跨工具／跨模型交接紀錄

> **最後更新時間**：2026-10-27 21:23 (UTC+8)
> **最後更新 Agent**：Antigravity (Gemini 4)
> **專案路徑**：`C:\Users\mrhai\.gemini\antigravity\scratch\smart-ledger`
> **Git 分支與最新 Commit**：`main` @ `2276b55` (`chore(ci): upgrade GitHub Actions to v7 (Node 24) to eliminate deprecation warning [skip ci]`)

---

## 1. 已完成工作摘要

1. **P0 & P1 核心程式碼完整實作**（Commit `f20e9c4`）：
   - 完成 `core/` 共用帳務核心（通知與轉帳頁 Regex 解析、OTP 過濾、30 分鐘雙插槽去重合體引擎、雙軌安全額度計算、罵醒我勸退邏輯、本機記憶體帳本）。
   - 完成 `src/` iPhone 16 Plus (6.7") 單手大拇指熱區介面（戰情室首頁、交易明細與一鍵拆單、捷徑防打架模擬測試台、固定扣款與設定頁、二次確認安全撤銷按鈕）。
   - 完成 `cloudflare-worker/` D1 SQLite Schema 與 `/api/ingest`、`/api/widget-summary` 端點。
   - 完成 `targets/` Swift `WidgetKit` 電量小工具與 Swift `AppIntents` 捷徑專屬動作積木。
2. **GitHub Actions 免簽名 `.ipa` 自動編譯修正**（Commits `6407396`, `2276b55`）：
   - 修正 `PocketGuardianShortcuts.swift` 在 Xcode 專案中的路徑對應。
   - 升級 GitHub Actions 至 v7 (Node 24)，並於根目錄產出 `PocketGuardian-SideStore.ipa`。
3. **Vibe Coding 協作文件建立**：
   - 更新 `AGENTS.md`（納入 Gemini 4 / Claude Opus 5.5 / Cline 備援分工與安全省 Token 規則，並保留原有 Expo 規範）。
   - 建立 `TASKS.md` 與本交接文件 `HANDOFF.md`（直接沿用既有 `PLAN.md`，不重複建立 `PRD.md` 與 `ARCHITECTURE.md`）。

---

## 2. 目前工作區修改檔案（未提交變更 — 嚴禁覆蓋）

執行 `git status` 目前有以下 **未提交（Unstaged）或新增** 檔案：

| 狀態 | 檔案路徑 | 修改內容說明 | 處理原則 |
| :--- | :--- | :--- | :--- |
| `M` | `app.json` | 新增 `"owner": "laoshu77"`（供 Expo 帳號與 Tunnel 綁定） | **保留，嚴禁覆蓋或還原** |
| `M` | `package.json` | `devDependencies` 新增 `"@expo/ngrok": "^4.1.3"` | **保留，嚴禁覆蓋或還原** |
| `M` | `package-lock.json` | 安裝 `@expo/ngrok` 產生之相依鎖定變更 | **保留，嚴禁覆蓋或還原** |
| `M` | `AGENTS.md` | 新增多 Agent 協作、模型分工與省 Token 開發規範 | 待與任務進度一併確認後提交 |
| `??` | `TASKS.md` | 新增任務清單、完成狀態與驗收條件 | 待與任務進度一併確認後提交 |
| `??` | `HANDOFF.md` | 新增跨工具交接狀態紀錄（本文件） | 每次階段結束或切換工具前更新 |

---

## 3. 最新測試與型別檢查結果

- **TypeScript 型別檢查 (`tsc --noEmit`)**：✅ **通過（0 Errors）**
- **Vitest 單元測試 (`core/__tests__/core.test.ts`)**：✅ **通過（1 Test File, 33/33 Tests Passed，耗時 236ms）**
  - 涵蓋：Apple Pay `$81` + 玉山 e.Fingo `$81` 雙通知自動合體、同源連買兩次自動拆成兩筆、玉山轉帳成功頁 `$100` 給 `24126` 冪等解析、OTP 驗證碼攔截、一鍵拆單無損還原、雙軌今日安全額度計算。

---

## 4. 未解問題與待確認事項

1. **未提交的 Expo Tunnel 設定 (`T1.3`)**：`app.json` (`owner: "laoshu77"`) 與 `@expo/ngrok` 尚未 commit，需由使用者決定是否立即 commit 或先進行本機 Tunnel 預覽測試。
2. **Cloudflare D1 雲端資料庫尚未綁定正式 ID (`T1.4`)**：`cloudflare-worker/wrangler.toml` 目前為佔位設定，待使用者要求部署時再建立 D1 並填入正式 `database_id`（目前 App 可透過本機快取模式 100% 獨立運作）。
3. **iPhone 16 Plus (iOS 27) 實機捷徑與 Action Button 聯調 (`T1.5`)**：待使用者於手機端透過 SideStore 安裝 `PocketGuardian-SideStore.ipa` 後，驗證實機捷徑觸發回饋。

---

## 5. 下一步行動（Next Steps）

請接手的 Agent（**Antigravity Gemini 4** 或備援 **Cline + Gemini API**）依使用者指示執行以下任一項：

1. **若使用者要繼續測試 App / UI 微調**：
   - 先詢問是否保留或 commit 目前 `app.json` 與 `package.json` 的变更，再僅針對使用者指定的畫面 (`src/screens/*.tsx`) 修改。
2. **若使用者要部署 Cloudflare Workers + D1 (`T1.4`)**：
   - 只讀取 `cloudflare-worker/wrangler.toml` 與 `cloudflare-worker/src/index.ts`，引導或協助完成 D1 綁定與部署（**必須獲得使用者明確部署指令才可執行 `wrangler deploy`**）。
3. **若使用者回報 iOS 27 實機捷徑或 `.ipa` 問題 (`T1.5`)**：
   - 一般格式或 UI 問題由 **Gemini 4** 修正；若涉及複雜 Swift `AppIntents` / `WidgetKit` 編譯或 D1 併發問題，再切換 **Claude Opus 5.5** 分析。

---

## 6. 低成本一鍵交接指令範本（供使用者複製貼上）

### A. 當 Antigravity 用量快耗盡、準備暫停時（發給 Gemini 4）：
```text
請準備交接：不要修改任何功能程式碼，只根據目前 git status 與進度更新 TASKS.md 與 HANDOFF.md，完成後停手。
```

### B. 當切換到 Cline（使用 Gemini API）接手時（發給 Cline）：
```text
請先依序讀取 AGENTS.md、HANDOFF.md、TASKS.md，並檢查 git status 與 git diff --stat。不要掃描整個專案，不要覆蓋未提交的修改，請告訴我你確認到的「目前進度與下一步」，並直接執行：[在此填入你要做的任務]。
```

### C. 當遇到疑難 Bug 或重大修改、切換 Claude Opus 5.5 時（發給 Opus 5.5）：
```text
請先閱讀 HANDOFF.md 與相關檔案 [填入檔案名稱]。請針對 [填入問題或方案] 進行架構審查／疑難除錯，只處理這個核心問題，完成後請把結論更新至 HANDOFF.md，一般收尾交回 Gemini 4。
```
