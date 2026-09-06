# trade-backtest · PRD 變更日誌

> 對齊 SPEC v3.0 契約（v3.0.2 = fleet alignment 版本）
> 維護者：Sean 10-repo-fleet
> 最後更新：2026-09-06

---

## v3.0.2 — 2026-09-06 by Sean 10-repo-fleet

**類型**：Fleet alignment（不改動規格書 §1–§19 正文）
**動機**：將 trade-backtest 對齊 10-repo-fleet 的 SPEC v3.0 fleet 標準（其他 39 個 sibling repos 皆已升級到 v3.0.2）

### 變更內容

1. **frontmatter 升級**
   - 版本：v2.2.1 → **v3.0.2**
   - 維護者：Sophia (CPO) for Sean → **Sean 10-repo-fleet**
   - 新增 v3.0.2 說明段落（不改動 v2.2.1 sweet-spot rewrite 結論）

2. **新增 CHANGELOG.md**（本檔）
   - 串接 v1.0 (initial) → v2.2.1 (sweet-spot rewrite) → v3.0.2 (fleet alignment) 三層歷史

3. **升級 `.github/workflows/ci.yml` 為 SPEC v3.0 標準 4-job 結構**
   - 既有 SHA-pinned 1-job (`verify`: `node --check` + `node tests/run.js`) 為 security best practice，本版**保留 SHA-pinning 設計意圖**
   - 但改寫成 4 jobs：`lint` / `test` / `build` / `deploy (vercel)`
   - SHA pinning 從既有 `actions/checkout@f548e57e` + `actions/setup-node@94196ee1` 沿用（不解 pin）
   - 移除 `cache: 'npm'`（本 repo 無 package.json，cache 會 fail — 既有註解保留）
   - 觸發條件升級為 `push to master` + `pull_request` + `workflow_dispatch`（標準 SPEC v3.0 觸發矩陣）
   - `permissions: contents: read`（最少權限原則）
   - `concurrency: ci-${{ github.ref }} cancel-in-progress: true`

4. **dev 補強驗證**
   - `node tests/run.js` → **5 passed, 0 failed**（signal-monitor 純函式 smoke tests）
   - `node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js` → exit 0
   - 純 JS 設計意圖保留（無 package.json / 無 node_modules / 無 npm 依賴）

5. **不變更項目（per task constraints）**
   - `PRD/SPEC.md` §0–§19 規格書正文（v2.2.1 sweet-spot rewrite 7.2/10 已完備）
   - `index.html` (~750 行 PWA frontend)
   - `signal-monitor.js` (CLI daemon + Telegram bot)
   - `api/klines.js` + `api/fundamental.js` (Vercel serverless)
   - `tests/run.js` + `tests/signal-monitor.test.js`
   - `vercel.json` (build 設定: `@vercel/static` + `@vercel/node`)
   - `config.json.example`（本地 Telegram bot config 範本）
   - `SECURITY_FINDINGS.md` / `PLAN.md` / `FOLLOWUP.md` / `BUILD_REPORT.md` / `CHANGELOG.md`（既有文件）

### Deploy 契約

- 目標：**Vercel**（既有 `vercel.json` 已配置 `@vercel/static` + `@vercel/node`，framework: nextjs 不適用此純 JS 站）
- Live：https://b-group-poc.vercel.app/
- 觸發：push to master（自動 vercel-action deploy）
- Secret：需 `VERCEL_TOKEN` + `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`（owner 在 Vercel 後台設定）

### 驗證證據

| Check | Result |
|---|---|
| `node tests/run.js` | ✅ 5 passed, 0 failed |
| `node --check` × 4 files | ✅ exit 0 |
| Existing `.github/workflows/ci.yml` | ✅ SHA-pinned 1-job verify (predecessor) |
| New `.github/workflows/ci.yml` | ✅ 4-job SPEC v3.0 standard |

---

## v2.2.1 — 2026-07-19 (sweet-spot rewrite by Sophia (CPO) for Sean)

**類型**：Major rewrite (sweet-spot 4/10 → 7.2/10)
**動機**：原始 v2.2.1 PRD 定位「MultiCharts 替代」紅海化，重新定位為**台灣零售交易者專用**

### 變更摘要

- 砍掉美股 / 外匯 / 加密貨幣（紅海）
- 鎖定台灣 200 萬散戶中的「想學程式交易但 MultiCharts 太貴」的 ~10 萬人
- 加入 AI 策略助理（GPT 自動生成策略）
- §15 貼出完整 sweet spot 5 問體檢與重寫理由
- 新增繁中 UI + 台股 / 期貨 / 選擇權資料源（Yahoo Finance / Binance / CoinGecko fallback）
- 既有實作：MA crossovers / RSI / MACD / golden-death crosses
- Live demo：https://b-group-poc.vercel.app/
- 既有 SECURITY_FINDINGS.md（M6 稽核 medium/low 全部 deferred）

---

## v1.0 — initial (pre-sweet-spot)

- MultiCharts 替代品（紅海定位 — 後被 sweet-spot 體檢標 4/10）
- 通用回測工具（美股 / 台股 / 外匯 / 加密貨幣）
- Live：https://b-group-poc.vercel.app/（與 v2.2.1 共用 URL）
- 後由 v2.2.1 sweet-spot rewrite 取代
