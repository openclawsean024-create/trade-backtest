# TradeBacktest

> 台灣零售交易者的台股 / 期貨回測 + AI 策略助理 — Progressive Web App, deployed on Vercel.

A static single-page web app that lets you backtest technical-analysis
strategies (MA crossovers, RSI, MACD, golden/death crosses) against
historical OHLCV data from Binance (crypto), Yahoo Finance (stocks),
and CoinGecko (fallback). Optionally pipes signal events to a Telegram
bot.

This repo is the public codebase. It contains **no secrets, no user
data, no API keys** — `config.json` is git-ignored; you must create
your own locally and never commit it.

**Live demo:** https://b-group-poc.vercel.app/

---

## Quickstart

The project is a pure-JS static + serverless-functions site for
[Vercel](https://vercel.com). No `npm install` required.

### Local preview

```bash
# Install Vercel CLI once (skip if you already have it)
npm i -g vercel

# From the repo root:
vercel dev
# → opens http://localhost:3000
```

### Deploy

```bash
vercel deploy --prod
```

### Optional: Telegram alerts

1. Copy `config.json.example` → `config.json`.
2. Fill in `telegram_token` and `telegram_chat_id` (from
   [@BotFather](https://t.me/BotFather) and your chat ID).
3. Run `node signal-monitor.js --watch` to start the signal daemon.

`config.json` is git-ignored and must never be committed.

---

## Repository layout

```
PRD/SPEC.md                Full product spec (v2.2.1, Traditional Chinese).
api/klines.js              Vercel serverless: OHLCV proxy (Binance/Yahoo/CoinGecko).
api/fundamental.js         Vercel serverless: fundamentals proxy (Yahoo Finance).
signal-monitor.js          Standalone signal-monitor daemon (CLI: --watch).
index.html                 The whole frontend UI (~750 lines).
lightweight-charts.4.1.0.js Vendored TradingView chart library (do not edit).
vercel.json                Vercel build config (static + 2 serverless functions).
config.json.example        Template for local-only Telegram bot config.
scripts/verify.py          Project verify gate (node --check + node tests/run.js).
tests/run.js               Minimal Node test harness (stdlib assert).
tests/signal-monitor.test.js Smoke tests for signal-monitor pure functions.
.github/workflows/ci.yml   SHA-pinned GitHub Actions CI.
SECURITY_FINDINGS.md       M6 security audit findings (read-only).
PLAN.md                    Autonomous-development-loop plan (this run's brief).
CHANGELOG.md               Per-release notes.
AGENTS.md                  Per-repo agent guidance (real content, not skeleton).
```

---

## Verify

Run from the repo root:

```bash
# 1. Syntax check (regression gate)
node --check lightweight-charts.4.1.0.js signal-monitor.js api/klines.js api/fundamental.js

# 2. Unit tests (smoke tests for signal-monitor pure functions)
node tests/run.js

# 3. (optional) Run the project-level verify script
python3 scripts/verify.py
```

All three must exit 0 before any PR.

CI runs gates 1 and 2 on every push and PR against `master` (see
`.github/workflows/ci.yml`). Gate 3 is local-only.

---

## API endpoints

| Route | Source priority | Auth | CORS |
|---|---|---|---|
| `GET /api/klines?symbol=...&interval=...&days=...` | Binance → Yahoo → CoinGecko | none | `*` |
| `GET /api/fundamental?symbol=...` | Yahoo `quoteSummary` → Yahoo chart fallback | none | `*` |

`symbol` must match `^[A-Z0-9._-]{1,20}$`; `interval` must be one of
`1m, 5m, 15m, 1h, 4h, 1d, 1w`. Invalid input → 400. Upstream failure
→ 200 with `{ success: false, error: ... }`.

---

## Build / deploy

The project has **no `package.json` and no Node dependencies** —
intentional. Adding `node_modules` would break the current Vercel
build configuration (`@vercel/static` + `@vercel/node`). All third-party
JS is loaded at runtime from CDN (`unpkg.com`, `cdn.jsdelivr.net`)
with SHA-pinned versions in the CSP meta tag.

---

## License

Private project — all rights reserved by the repo owner. See `PRD/SPEC.md`
for the full product specification.

---

## See also

- `PRD/SPEC.md` — full product spec (v2.2.1, 28 KB Traditional Chinese).
- `SECURITY_FINDINGS.md` — M6 audit findings (medium/low, all deferred).
- `PLAN.md` — the autonomous-development-loop plan this run followed.