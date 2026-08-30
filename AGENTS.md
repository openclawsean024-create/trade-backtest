# trade-backtest

> 台灣零售交易者的台股 / 期貨回測 + AI 策略助理 — Progressive Web App, deployed on Vercel.

## 目標

- 提供一個**無需註冊、無需後端帳號**的純前端回測工具，給台灣散戶用台股 / 加密幣 / 期貨的歷史 OHLCV 驗證技術分析策略（MA / RSI / MACD / 黃金交叉 / 死亡交叉）。
- 部署在 Vercel，靜態前端 + 兩個 serverless API（klines / fundamental）。
- 可選的 Telegram bot 通知（透過 `signal-monitor.js` daemon）。
- 完整產品定位見 [`PRD/SPEC.md`](PRD/SPEC.md) v2.2.1。

## 避免

- **不要新增 `package.json` 或 `npm install`**。本 repo 故意維持 zero-dependency 純 JS；新增 lockfile 會破壞現有 Vercel build（`@vercel/static` + `@vercel/node`）。
- **不要修改 `PRD/SPEC.md` §1–§9 core scope 章節**。可以更新附錄、變更紀錄、BUILD_REPORT。
- **不要把 `config.json`、`signal_log.json`、`.env*` commit 進來**。這些是 user-local secrets，已在 `.gitignore`。
- **不要改 `signal-monitor.js` 的策略算法**（detectSignals / MA / RSI / MACD 計算）。M2 只擴充了 export，行為沒變。
- **不要動 `lightweight-charts.4.1.0.js`**（vendor'd，160KB）。
- **不要 push 到任何遠端**。本地 commit 即可，merge / push 由使用者決定。
- **不要把 secrets / API keys / tokens 寫進任何 commit / output / workflow yaml**。
- **Commit message 前綴**：用 `rpb(<owner>): ...`（owner ∈ {backend, frontend, devops, qa, security, docs, orchestrator}）。Conventional Commits scope 也保留。
- **GitHub Actions 版本必須 SHA pinned**（40-char hex），禁止 `@v4` / `@main` / `@v4.2.2`。
- **驗證 gate**：任何程式碼改動都必須讓下面兩個命令 exit 0：

  ```bash
  node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js
  node tests/run.js
  ```

## 技術棧與指令

### 主要語言 / 框架
- JavaScript（ES2020+），無框架、無 TypeScript、無打包工具。
- 第三方 JS（CDN load，runtime）：`lightweight-charts@4.1.0`（unpkg）、`qrcode@1.5.3`（jsdelivr）。
- Vercel runtime：Node 18+（`/api/fundamental.js` 已移除 `node-fetch` require，改用 global `fetch`）。

### 主要指令
| 命令 | 用途 |
|---|---|
| `node --check <files>` | 語法檢查（regression gate） |
| `node tests/run.js` | 跑 smoke tests |
| `python3 scripts/verify.py` | 同時跑上述兩個 + 摘要（repo-builder pre-commit hook 會呼叫） |
| `vercel dev` | 本地 preview |
| `vercel deploy --prod` | 部署到 production |
| `node signal-monitor.js --watch` | 啟動 Telegram signal daemon（需要 `config.json`） |

### CI
- `.github/workflows/ci.yml`：SHA-pinned GitHub Actions，於 push / PR 跑 `node --check` + `node tests/run.js`。

### 部署目標
- **Vercel**（靜態前端 + 兩個 `@vercel/node` serverless functions）。詳細 routing / build 配置見 [`vercel.json`](vercel.json)。

### 目錄結構
```
PRD/SPEC.md                  完整產品規格（28 KB, v2.2.1 繁體中文）
api/klines.js                OHLCV 代理（Binance → Yahoo → CoinGecko fallback）
api/fundamental.js           基本面代理（Yahoo quoteSummary → chart fallback）
signal-monitor.js            Signal daemon（CLI: --watch）
index.html                   整個前端 UI
lightweight-charts.4.1.0.js  Vendored TradingView chart library
vercel.json                  Vercel build config
config.json.example          Telegram bot 設定 template（user-local, 勿 commit）
scripts/verify.py            Project-level verify gate
tests/run.js                 Minimal Node test harness (stdlib assert)
tests/signal-monitor.test.js Smoke tests
.github/workflows/ci.yml     SHA-pinned CI
SECURITY_FINDINGS.md         M6 安全稽核結果（read-only）
README.md                    對外說明文件
CHANGELOG.md                 變更紀錄
PLAN.md                      自主開發迴圈的 plan（這個 run 的 brief）
AGENTS.md                    本檔
```

### 偵測到的備註
- 找到 `PRD/SPEC.md`，目標與範圍有書面紀錄。
- 偵測到 deploy target: Vercel。
- CI workflow 已建立（M3）。
- Smoke tests 已建立（M2）。
- 安全稽核已完成（M6，見 `SECURITY_FINDINGS.md`）。
- 修復了 `vercel.json` 的 SPEC 路徑 bug（M4）。
- `api/fundamental.js` 移除 `node-fetch` require，改用 Node 18+ global fetch（M5）。