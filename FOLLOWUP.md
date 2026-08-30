# FOLLOWUP — trade-backtest

> Backlog of items discovered during the M1..M9 autonomous run that
> were intentionally NOT executed (per PLAN.md scope discipline) or
> that emerged after the run settled. Prioritized for the next
> planning cycle.

---

## P0 — Security (medium)

### F1 — Telegram `parse_mode: 'HTML'` without escape
- **File:** `signal-monitor.js:258` (`text: messageText, parse_mode: 'HTML'`).
- **Issue:** User-influenced strings (symbol, strategy names) are
  embedded in HTML-marked-up Telegram messages. M5's `validateSymbol`
  rejects `/` but not `<` / `>`. No active exploit today (symbols are
  curated), but latent risk if symbol list ever opens up.
- **Suggested fix:** Either escape `<>&"` in `messageText` before
  injecting, or switch to `parse_mode: 'MarkdownV2'` and escape its
  special chars (`_*[]()~\`>#+-=|{}.!`).
- **Owner:** backend.
- **Effort:** ~30 min (small change + smoke test).

### F2 — CORS wildcard on both `/api/*` handlers
- **Files:** `api/klines.js:310-312`, `api/fundamental.js:28-30`.
- **Issue:** `Access-Control-Allow-Origin: '*'`. Safe today (no
  credentials issued). Latent risk the moment any auth cookie flows.
- **Suggested fix:** Echo request `Origin` header back (allowlist
  production domain + `localhost:3000`).
- **Owner:** backend.
- **Effort:** ~20 min.

---

## P1 — Runtime correctness

### R1 — `api/fundamental.js` requires Node 18+ runtime
- **File:** `api/fundamental.js` (M5 commit).
- **Issue:** Switched from `node-fetch` to global `fetch`, which
  needs Node ≥ 18.3. Vercel `@vercel/node` is Node 18+ by default,
  but a project that pins `engines.node` to an older version will
  throw on first request.
- **Suggested fix:** Add a startup-time check
  (`if (typeof fetch !== 'function') throw new Error('Node 18+ required')`),
  or pin the runtime in `vercel.json` explicitly.
- **Owner:** backend.
- **Effort:** ~10 min.

### R2 — Wilder RSI plateau is `99.0099...`, not literal `100`
- **File:** `tests/signal-monitor.test.js` (M2 commit, documented in
  test inline comment).
- **Issue:** The PLAN.md M2 spec said "全漲 → 100". The actual source
  uses Wilder's smoothing which plateaus at `100 - 100/(1+100)`.
  The test asserts the correct plateau + its stability. PLAN was wrong
  on this; source is the source of truth.
- **Suggested fix:** None needed — this is a spec vs reality gap that
  was resolved in favor of reality. If the spec must be updated, edit
  `PRD/SPEC.md` §6 (signal thresholds) — but per AGENTS.md that
  section is read-only in this repo's discipline.
- **Owner:** docs (SPEC clarification only, optional).

---

## P2 — Performance / scalability

### F3 — No rate limiting on `/api/*`
- **Files:** both `api/*.js` entry points.
- **Issue:** Any internet caller can hammer Binance / Yahoo /
  CoinGecko via this proxy. Upstream rate-limit hits will get
  *this project's* egress IP banned, breaking the app for everyone.
- **Suggested fix:** Add Vercel Edge Middleware rate-limiter per
  source IP (e.g. 60 req/min). Or signed tokens for non-public
  deployment scenarios.
- **Owner:** devops (middleware) + backend (signature changes).
- **Effort:** ~1-2 hours.

### F4 — Telegram env vars read at config-construction time
- **File:** `signal-monitor.js:21-22, 32-33`.
- **Issue:** `process.env.TELEGRAM_*` captured into config object
  that may end up in logs or error messages.
- **Suggested fix:** Read env vars at use-site only, not at module
  init.
- **Owner:** backend.
- **Effort:** ~15 min.

---

## P3 — Frontend polish

### CSP — drop `'unsafe-inline'` for script-src
- **File:** `index.html` (M7 commit).
- **Issue:** `'unsafe-inline'` retained on `script-src` because the
  page renders `onclick=` via `innerHTML` (e.g. modal close, share
  buttons). Locked-in XSS surface.
- **Suggested fix:** Refactor those handlers to `addEventListener`
  (or event delegation on `document`), then drop `'unsafe-inline'`.
- **Owner:** frontend.
- **Effort:** ~1-2 hours (72 KB index.html with 7 inline handlers).

### CSP — wide `connect-src`
- **File:** `index.html` (M7 commit).
- **Issue:** Currently trusts all 4 data-source APIs. If any of
  them becomes compromised, the page can leak user queries.
- **Suggested fix:** Already optimal — these are the only upstream
  APIs. Just re-verify if new data sources are added.
- **Owner:** frontend (re-audit on changes).
- **Effort:** ~5 min audit per change.

### HTTP security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`)
- **File:** `vercel.json` (or `headers` block).
- **Issue:** Default Vercel sets some; not all.
- **Suggested fix:** Add `headers` block to `vercel.json` explicitly.
- **Owner:** devops.
- **Effort:** ~15 min.

---

## P4 — Secrets / future keys

### OpenAI API key design (SPEC §15 mention)
- **Issue:** SPEC mentions GPT-generated strategies but no key flow
  exists yet. When implemented, the key must NEVER be committed and
  must flow via env var (`OPENAI_API_KEY`) only.
- **Suggested fix:** At feature design time, document the key flow
  in `SECURITY_FINDINGS.md` F9+ before any code is written.
- **Owner:** backend (when feature starts).
- **Effort:** ~30 min documentation + design.

---

## P5 — Long-term structural

### Add a real test framework
- **File:** `tests/run.js`.
- **Issue:** Current harness is ~100 LOC of stdlib-assert glue.
  Fine for 5 smoke tests; won't scale to 50+.
- **Suggested fix:** When test count grows, consider migrating to
  `node:test` (Node 18+, stdlib) for `describe` / `it` ergonomics
  without adding npm.
- **Owner:** qa.
- **Effort:** ~1-2 hours.

### Vendor `lightweight-charts` instead of CDN load
- **Files:** `index.html:7` loads from `unpkg.com`.
- **Issue:** CDN dependency. If unpkg is down, the chart breaks.
  Vercel `lightweight-charts.4.1.0.js` is already vendored in the
  repo (160 KB) but the HTML still loads from CDN.
- **Suggested fix:** Change `<script src>` to `lightweight-charts.4.1.0.js`
  (relative path) and rely on the vendored copy.
- **Owner:** frontend.
- **Effort:** ~10 min + verify.

---

*Generated by M9 (orchestrator). Items are ordered by severity ×
likelihood. None block the current shipped state — all are deferred
improvements.*