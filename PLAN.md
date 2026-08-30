# Plan: trade-backtest

> 為什麼這樣排（<= 200 字中文）：先把「能驗證」做到位（W1 補 test runner + CI + 規劃書），再修掉「實際會壞」的硬傷（W2：vercel.json 找不到 SPEC.md、API 沒有 input validation、secrets/CORS 體檢），接著做「產品面」的低風險打磨（W3：index.html a11y/mobile/CSP 與 README/CHANGELOG/AGENTS），最後 orchestrator 收尾（W4：build report + 反思 + followup）。全程嚴守：純 JS、無 npm、不動 PRD/SPEC §1-§9、rpb 前綴、SHA-pinned actions、verify command 不變。每個 milestone 範圍 ≤ 150 LOC，verify < 5 分鐘。

## Wave 1: 規劃 + 測試 + CI 基線

### Milestone M1: 寫出 PLAN.md（自身）
- owner: orchestrator
- scope: `.clone/PLAN.md`
- verify: `test -f .clone/PLAN.md && wc -l .clone/PLAN.md`
- est. LOC: 100
- notes: 由當下 orchestrator subagent 自己完成；parent driver 收到後會 commit `rpb(orchestrator): add PLAN.md for trade-backtest`。這一步不跑 `node --check`，因為沒有改任何 JS。

### Milestone M2: 補上純 Node、無 npm 的 test runner + signal-monitor 純函式 smoke tests
- owner: qa
- scope: `tests/run.js`（新增）、`tests/signal-monitor.test.js`（新增，3-5 個 case）
- verify: `node tests/run.js` 全部 case PASS；同時 `node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js` 仍 exit 0
- est. LOC: 120
- notes: 跑 `signal-monitor.js` 內的純函式：`calculateMA`（不足 period 回 null；滿足 period 回正確均值）、`calculateRSI`（全漲 → 100、全跌 → 0/100 邊界）、`calculateMACD`（histogram 對齊長度）、`detectSignals`（golden cross / death cross / RSI 極端 / MACD 交叉 至少 4 個 case）。test runner 用 stdlib `assert` + 自寫 minimal harness（assertEqual / assertDeepEqual + summary），無 npm。為了隔離純函式，QA 必須讀原始檔後透過 `require('../signal-monitor.js')` 拿到 export；若 signal-monitor.js 的 module.exports 不夠，需要 backend 同步 export 該純函式——已驗證 `module.exports = { monitorSignals, detectSignals }` 在檔案末尾，目前 `calculateMA/calculateRSI/calculateMACD` **未 export**，所以 M2 的子任務包含把這 3 個 helper 加進 `module.exports`（小、純、不改行為）。若發現需要動 `signal-monitor.js`，則後端 M5 也要對齊（驗證後者不會破壞 M2 已有的測試）。

### Milestone M3: GitHub Actions CI（SHA-pinned）跑 node --check + test runner
- owner: devops
- scope: `.github/workflows/ci.yml`（新增）
- verify: YAML parse：`python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`；同時 `node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js` 仍 exit 0（CI workflow 不影響 source）
- est. LOC: 35
- notes: workflow 必須用 SHA pinned actions：`actions/checkout@<sha40>`、`actions/setup-node@<sha40>`。Node 版本：`node-version: '20'`（klines.js 用 global fetch，fundamental.js 用 node-fetch — 後者需在 CI 內偵測，若沒裝須在 followup 標出；M3 不解 fundamental.js 的 node-fetch 缺漏，那屬於 W2 後端範圍）。CI triggers：`push:branches:[master,feat/**,fix/**,chore/**,docs/**,test/**]` 與 `pull_request`。Cache 用 `setup-node` 的 `cache:` 參數。**注意**：本 repo 無 package.json，因此不跑 `npm ci`。

## Wave 2: 真實的後端 + 安全硬傷

### Milestone M4: 修 `vercel.json` SPEC.md → PRD/SPEC.md 路徑錯誤
- owner: backend
- scope: `vercel.json`（單一檔）
- verify: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` 仍 exit 0；`node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js` 仍 exit 0；`test -f PRD/SPEC.md` 仍 true
- est. LOC: 5
- notes: 把 `vercel.json` 中 `"src": "SPEC.md"` 改為 `"src": "PRD/SPEC.md"`（這條 build entry 才會找到實際檔案，否則 Vercel deploy 會 404）。其他 entry 維持不動；不改 routes；不改 `@vercel/node` / `@vercel/static` 設定。

### Milestone M5: 補 `/api/klines` 與 `/api/fundamental` 的 input validation + 統一 fetch helper
- owner: backend
- scope: `api/klines.js`、`api/fundamental.js`
- verify: `node --check api/klines.js api/fundamental.js signal-monitor.js` exit 0；`node tests/run.js` 仍 PASS（M2 寫的測試）；同時新加 1 個 manual smoke：`node -e "require('./api/fundamental.js')" && node -e "require('./api/klines.js')"`（僅載入，不打網路）
- est. LOC: 70
- notes:
  1. `api/klines.js`：新增 `validateSymbol()`（reject 非英數、> 20 字元、`/api/../` 路徑穿越）；reject 已知的 SSRF 探測（symbol 含 `://` 或 `..`）；把 `interval` 限制為白名單 `['1m','5m','15m','1h','4h','1d','1w']`；`days` 已 clamp 到 [1, 2190]，保留。
  2. `api/fundamental.js`：symbol 同樣白名單 + 長度限制；統一改用 Node 18+ global `fetch`（與 `klines.js` 一致），把 `const fetch = require('node-fetch')` 改為「若 Node < 18 才退回 node-fetch」——但因為這 repo 沒 package.json，**不能** import node-fetch。最小解：移除 `node-fetch`，全程用 global `fetch`；若 build/runtime 環境 < Node 18，把需求寫進 FOLLOWUP.md。
  3. 兩個檔案的 handler 都要在 400 / 500 路徑明確分開（目前 `klines.js` 對 final fallback 用 `200 { success: false }`，這屬於既有行為，不在本次 scope；本 milestone 只加 symbol/interval validation，不改既有 happy-path payload schema）。
  4. 若 QA 的 M2 已經改了 `signal-monitor.js` 的 `module.exports` 來暴露純函式，這個 milestone 確認改動不破壞現有 export signature。

### Milestone M6: Secrets / SSRF / CORS / XSS audit + SECURITY_FINDINGS.md
- owner: security
- scope: 跨檔 audit（不改 production code 行為）+ 新增 `SECURITY_FINDINGS.md`
- verify: `grep -rEn "(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})" . --include='*.js' --include='*.html' --include='*.json' --include='*.md'` exit 0（無 match）；`node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js` 仍 exit 0；`test -f SECURITY_FINDINGS.md`
- est. LOC: 60
- notes:
  - 不修 production code，只報告（修補歸各 owner）。
  - 必查：① `config.json.example` 是否含 placeholder（已確認為空字串，OK）；② `index.html` 的 `innerHTML =` 是否會插入 user input（grep 結果目前都是 template literal 內部組字，非外部輸入，標 low）；③ `api/klines.js` 的 `Access-Control-Allow-Origin: '*'`（公開資料 API，OK，但若未來加 credentials 需修）；④ Telegram 訊息目前用 HTML parse_mode，**沒有 escape**，symbol 可能含 `<>`——標 medium 寫進 findings；⑤ `vercel.json` SPEC.md 路徑（已被 M4 修掉，本 milestone 僅 reference）；⑥ 確認 `.gitignore` 已擋下 `.env`、`config.json`、`signal_log.json`（已確認 OK）。
  - 額外：在 `SECURITY_FINDINGS.md` 列出 medium/low finding 各一條 actionable，但 **不修**，由對應 owner 後續處理（避免 scope creep）。

## Wave 3: 前端 + 文件

### Milestone M7: index.html a11y / CSP / mobile 低風險修補
- owner: frontend
- scope: `index.html`
- verify: `node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js` exit 0；`python3 -c "from html.parser import HTMLParser; HTMLParser().feed(open('index.html').read())"` exit 0（HTML stack balance）；`grep -c '<meta http-equiv=\"Content-Security-Policy\"' index.html` ≥ 1（驗 meta tag 真的有加進去）
- est. LOC: 50
- notes:
  1. 在 `<head>` 加 `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.binance.com https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://api.coingecko.com;">`（CSP 第一版，scope 限定，後續可微調）。
  2. 給所有 icon-only button 補 `aria-label`（grep 後看 `<button>` 內無文字的）。
  3. `<html lang="zh-Hant">` 已存在則不動；若 `<meta name="viewport">` 缺失或用 `width=1024`，改為 `width=device-width, initial-scale=1`。
  4. 不重寫 `<script>` 大區塊；不改 DOM id（test / 既有 consumer 相依）；不做 code split（M7 太早，wiring 進 vercel.json 也算 scope creep）。
  5. **不做**：UI 大改、新增新功能（屬 spec §3 v2/v3，out of scope）。

### Milestone M8: README.md + CHANGELOG.md + AGENTS.md（補上真實專案資訊）
- owner: docs
- scope: `README.md`（新增）、`CHANGELOG.md`（新增）、`AGENTS.md`（改寫）
- verify: `test -f README.md && test -f CHANGELOG.md`；markdown link check（手動 grep `README.md` 內連結對應的 path 都存在）；`node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js` 仍 exit 0
- est. LOC: 120
- notes:
  1. README：產品一句話、quickstart（`vercel deploy`）、verify command、deploy target、API routes 簡表、SPEC 連結、`.clone` 路徑說明。**不**寫程式碼細節（會過期）；連結到 PRD/SPEC.md。
  2. CHANGELOG：以 `v0.2.1` 起始（目前 latest commit 是 v2.2.1 PRD，但 repo 本身還沒發版），本輪 rpb run 的 entries 列為 `Unreleased`。
  3. AGENTS.md：用真實內容取代 `repo-builder` 自動骨架：① 目標（v2.2.1 重定位為台灣零售交易者）；② 避免（無 npm / 不動 SPEC §1-§9 / rpb 前綴 / SHA-pinned）；③ 技術棧（純 JS、Vercel、`node --check` + `node tests/run.js` 為 verify）。
  4. 不改 SPEC.md（屬於 §1-§9 之外也不在本 milestone，本輪只在必要時補 §0、§10、§13 之外的引用）。

## Wave 4 (final): orchestrator 收尾

### Milestone M9: BUILD_REPORT.md + loop/reflection/wave-*-post-mortem.md + loop/lessons.md + FOLLOWUP.md
- owner: orchestrator
- scope: `BUILD_REPORT.md`（新增）、`loop/reflection/wave-1-post-mortem.md` ~ `wave-4-post-mortem.md`（新增，4 個檔）、`loop/lessons.md`（新增）、`FOLLOWUP.md`（新增）
- verify: `test -f BUILD_REPORT.md && test -f FOLLOWUP.md && test -f loop/lessons.md`；`ls loop/reflection/ | wc -l` ≥ 4；`node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js` 仍 exit 0
- est. LOC: 200
- notes:
  1. BUILD_REPORT 列出每個 milestone 的 owner / status / verify exit / retries used。
  2. 每個 wave-post-mortem：wave-N verify log 路徑、遇到的最大阻礙（若無就寫 "none, smooth run"）、process 改進點。
  3. lessons.md：把跨 wave 觀察到的 pattern（例：「純 JS + 無 npm repo 適合 stdlib-only test runner」）寫成 3-5 個 actionable lesson。
  4. FOLLOWUP.md：把這輪發現但**未做**的事項集中（例：fundamental.js 對 Node < 18 缺 node-fetch fallback、index.html `innerHTML` 用 template 但 symbol 進 Telegram message 未 escape、CSP 仍需實測 deploy 後行為、若未來要加 OpenAI key 需先 design secret flow）。
  5. 不 push、不 deploy。

## Dependencies

- M2 之後才能做 M3（M3 的 CI 必須能 invoke M2 的 test runner；但 M3 也可以只 invoke `node --check`，M2 的測試則另外手動跑——保險起見依賴關係保留，CI 同時跑兩者）。
- M5 之後才能宣告 M6 為 "verified done"，因為 M6 的 audit 報告會引用 M5 修補後的 handler 行為；M6 的 verify 不依賴 M5，但 deliverables 會 reference M5 的 diff。
- M7 之後才能宣告 M8 為 "verified done" 是**錯誤**的；M8 純文件，可與 M7 平行——但本 plan 為求 wave 內 milestone 數 ≤ 4，M7/M8 在同一 wave 順序執行，邏輯獨立。
- M9 必須在 M2-M8 全部 done 或 blocked 後才執行。

## Out of scope (this run)

- 不 push（任何遠端）。
- 不動 PRD/SPEC.md §1-§9 core scope 章節。
- 不引入 npm / package.json / 任何 heavyweight 依賴。
- 不改既有 user data schema（事實上本 repo 也沒有 user DB）。
- 不重寫 `signal-monitor.js` 的策略邏輯（detectSignals / MA / RSI / MACD 算法），只補 export。
- 不動 SPEC.md 內 `§3.2 v2` / `§3.3 v3` 列為「未做」的 feature。
- 不部署到 Vercel（無 deploy trigger；CI 也只在 push/PR 時 dry-run）。
- 不把 secrets / tokens 寫進任何 commit。
- 不做 code splitting / bundle optimization（M7 太早）。
- 不做 multi-tenant / auth（SPEC v2 才考慮）。
- 不改 `lightweight-charts.4.1.0.js`（vendor'd，160KB）。

## Risks

- **R1（high）**：`api/fundamental.js` 用 `node-fetch`，repo 沒有 `package.json`，移除後若 runtime 為 Node < 18 會壞。M5 的 followup 文字需明寫「需 Vercel runtime Node 18+」，若 deploy env < 18，handler 會 throw；可在 FUNDAMENTAL_NODE_MIN 或 README 註明。
- **R2（medium）**：M2 修改 `signal-monitor.js` 的 `module.exports` 屬於 backend 範圍，QA 動到 production code 違反「QA 不改 production code」原則——已在 M2 notes 明訂「QA 必要時擴充 export，僅加 helper export、不改既有 `monitorSignals` / `detectSignals` 行為」，仍由 backend owner 複核（commit message 標 `rpb(qa): ... with backend co-review`）。
- **R3（medium）**：CSP meta 引入可能破壞既有 inline event handler（`onclick="..."` in modal），M7 需逐項測試；本 plan 用 `script-src 'self'` + 開放 jsdelivr CDN（lightweight-charts 是 vendored 不是 CDN，可拿掉）。
- **R4（medium）**：CI workflow 用 SHA-pinned action，但 devops 需要查最新 SHA；提供一個查的 bash：`curl -s https://api.github.com/repos/actions/checkout/git/refs/heads/main | jq -r '.object.sha'`。若 sandbox 沒網，devops 用文件提供的 SHA；此為已知制約，列在 FOLLOWUP.md。
- **R5（low）**：`vercel.json` 的 SPEC.md 修法若 deploy 仍失敗（因為 Vercel 看到的是 build artifact 而非 source），M9 的 BUILD_REPORT 內 link 到這條 fix 的 commit；不重新 deploy 驗證。
- **R6（low）**：index.html 內 `<canvas id="qrcodeCanvas">` 與第三方 QR lib 若沒 inline，會被 CSP 擋下——M7 notes 已標明要複核 vendor。
- **R7（low）**：M6 SECURITY_FINDINGS 只列 finding 不修，但 medium 等級 finding 可能讓 verifier 覺得「未完成」；在 BUILD_REPORT 內明列「findings deferred to followup」，並在 FOLLOWUP.md 標 owner。