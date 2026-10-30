# AGENTS.md — 專案開發與多 Agent 協作規範

> 本文件為所有開發工具（**Antigravity** 與備援工具 **Cline**）共用的最高開發準則。任何 Agent 開始工作前必須遵守以下規範。

## 1. 工具配置與模型分工（嚴禁重複工作）

本專案僅使用 **Antigravity**（主力）與 **Cline**（備援），**不使用 Claude Code**。各模型依預設職責分工，可依任務難度彈性調整，但**絕不讓兩個模型重複執行同一件工作**：

| 工具 / 模型 | 角色定位 | 負責範圍與觸發時機 |
| :--- | :--- | :--- |
| **Antigravity — Gemini 4** | **主力預設模型** | 1. 需求整理、功能規劃、任務拆解（維護 `TASKS.md`）<br>2. 一般程式開發、UI 元件修改、API 串接、常規重構<br>3. 撰寫與執行單元測試、日常小問題修正<br>4. 暫停或額度耗盡前更新 `HANDOFF.md` 與 `TASKS.md` |
| **Antigravity — Claude Opus 5.5** | **高階架構與疑難專家** | **僅在關鍵時刻介入（不必檢查每個小修改）**：<br>1. 複雜跨模組架構分析（如原生 Swift `AppIntents` / `WidgetKit` 與 Expo 橋接）<br>2. Gemini 4 嘗試 2 次仍未解決的疑難 Bug 或 Race Condition<br>3. 重大資料結構或帳務邏輯修改前的方案審查<br>4. 核心關鍵程式碼（如 `core/dedupe.ts`、D1 原子鎖、金額計算）的品質檢查 |
| **Cline + Google Gemini API** | **額度耗盡備援工具** | **僅在 Antigravity 用量耗盡時使用**：<br>1. 啟動後先讀取 `HANDOFF.md`、`TASKS.md`、檢查 `git status` / `git diff` 與目標程式碼<br>2. 嚴格沿用既有架構，接手完成 `TASKS.md` 中尚未完成的任務<br>3. 階段完成或切換回 Antigravity 前，更新 `HANDOFF.md` 與 `TASKS.md` |

---

## 2. 安全鐵律與單一寫入鎖定

1. **單一 Agent 修改鎖定**：同一時間只允許**一個工具、一個 Agent** 修改工作目錄。切換 Antigravity 與 Cline 前，必須確認前一個 Agent 已完全停止。
2. **禁止覆蓋未提交修改**：動手修改任何檔案前，必先檢查 `git status` 與 `git diff`。**嚴禁覆蓋、還原或丟棄工作區內尚未 commit 的修改**。
3. **禁止擅自重寫已完成功能**：已在 `TASKS.md` 標記為完成 `[x]` 的模組，除非使用者明確要求修改或發現 Bug，否則**不得擅自重構、改寫或更換實作方式**。
4. **禁止破壞性操作與自動推送／部署**：除非使用者在當次對話中**明確要求**，否則**嚴禁自行執行**：
   - `git reset --hard`、`git checkout -- .`、`git restore .`、`git clean -fd`
   - `git push`、`git push --force`
   - `wrangler deploy`、`eas build`、`eas update` 或刪除任何資料庫／檔案。

---

## 3. 低成本與省 Token 讀取規範（Context Economy）

1. **禁止無差別掃描全專案**：接手任務時，請嚴格依以下最小路徑讀取上下文：
   - **Step 1**：讀取 `HANDOFF.md`（掌握最新進度、未提交檔案、待解問題與下一步）。
   - **Step 2**：讀取 `TASKS.md`（對照當前任務項目與驗收條件）。
   - **Step 3**：執行 `git status --short` 與 `git diff --stat`（確認實際程式碼異動）。
   - **Step 4**：**只讀取與當前任務直接相關的 1～3 個程式碼檔案**。
2. **禁止重複建立規劃文件**：本專案的產品需求（PRD）與系統架構已完整記錄於 `PLAN.md`，**無須另外建立 `PRD.md` 或 `ARCHITECTURE.md`**，亦不得在每次對話中重新規劃已定案的架構。
3. **交接更新義務**：
   - 當一個任務階段完成、準備暫停，或 Antigravity 用量即將耗盡時，當前 Agent 必須同步更新 `TASKS.md`（勾選狀態）與 `HANDOFF.md`（記錄修改檔案、測試結果與下一步）。
4. **防 429 極限批次與小區間讀取鐵律（Anti-429 Batching Protocol）**：
   - **單回合平行批次化**：嚴禁「讀一個檔 → 回覆 → 再讀下一個檔」。凡已知需讀取、搜尋或修改的檔案，必須合併在同一個回合（Single Turn）內平行呼叫，避免在 60 秒內重複傳送對話歷史觸發 Vertex AI `429 Resource exhausted`。
   - **大檔案區間讀取**：超過 250 行的檔案（如 `App.tsx`、`DashboardScreen.tsx`），優先使用 `start_line` / `end_line` 讀取與修改邏輯相關的完整段落，保持上下文精煉且不失準確度。
   - **驗證指令合併**：執行驗證時，將 `tsc --noEmit` 與 `vitest run` 合併於同一條指令執行；單次 `editor` 替換文字保持在 4,500 字元以內，避免因超限重試浪費請求配額。
5. **全域省 Token 瀏覽器、iOS 實圖視覺檢查與 GitHub 打包鐵律（呼叫 `$env:USERPROFILE\.local\bin\ai-tools.ps1`）**：
   - **查技術資料（禁讀原始 HTML）**：優先用 `google:search`、`fetch_web_content` 或 `/llms.txt`；若需抓取外部網頁，一律使用 `& "$env:USERPROFILE\.local\bin\ai-tools.ps1" fetch "<URL>" "<關鍵字>" 45`（免費透過 `r.jina.ai` 轉 Markdown 並硬性鎖死最多 45 行）。
   - **測 iOS / 網頁排版（強制看 `393×852` 實圖、禁印 DOM 原始碼）**：不印幾千行 HTML，但**必須親眼看實際畫面**以確保視覺品質。一律執行 `& "$env:USERPROFILE\.local\bin\ai-tools.ps1" ios-shot "http://localhost:8081" ".tmp/ios-preview.png"` 截取 iPhone 16 Pro (`393×852`) 實圖，並呼叫 `read_files` 讀取該 PNG 圖片親眼檢視排版、毛玻璃質感、對比度與文字溢位（單張僅約 300~500 Tokens）。
   - **GitHub 打包 IPA / CI 狀態（0 瀏覽器、純 CLI）**：嚴禁開瀏覽器看 GitHub Actions 或印出整份編譯 Log。一律使用 `& "$env:USERPROFILE\.local\bin\ai-tools.ps1" gh-status` 查狀態（1 行 JSON），失敗時用 `gh-failed-log <RunID>` 只抓最後 35 行錯誤，成功時用 `gh run download <RunID>` 直接下載。

---

## 4. Expo / React Native 技術規範（既有規則）

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

> **Windows PowerShell 環境提示**：若在非互動式 PowerShell 執行 `npx` 遇到 `"node" 不是內部或外部命令`，請直接使用完整 Node 路徑（避免重複嘗試浪費 Token）：
> ```powershell
> & "C:\Program Files\nodejs\node.exe" .\node_modules\typescript\bin\tsc --noEmit
> & "C:\Program Files\nodejs\node.exe" .\node_modules\vitest\vitest.mjs run
> ```

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
