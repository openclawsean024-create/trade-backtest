# Changelog

All notable changes to `trade-backtest` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added (M2 — qa)
- `tests/run.js`: minimal Node test harness using stdlib `assert`,
  no npm install required.
- `tests/signal-monitor.test.js`: 5 smoke tests for the pure functions
  in `signal-monitor.js` (`calculateMA`, `calculateRSI`,
  `calculateMACD`, golden/death cross detection).
- `signal-monitor.js`: exposed `calculateMA`, `calculateRSI`,
  `calculateMACD` via `module.exports` (additive only — no behavior
  change). Co-reviewed per `PLAN.md` risk R2.

### Added (M3 — devops)
- `.github/workflows/ci.yml`: SHA-pinned GitHub Actions workflow that
  runs `node --check` (4 JS files) and `node tests/run.js` on push to
  `master`, `feat/**`, `fix/**`, `chore/**`, `docs/**`, `test/**` and
  on pull_request against `master`. Actions pinned by SHA at workflow
  creation time; refresh via `git ls-remote` in a follow-up commit
  if a SHA is ever invalidated.

### Fixed (M4 — backend)
- `vercel.json`: `"src": "SPEC.md"` → `"src": "PRD/SPEC.md"`. The
  SPEC lives under `PRD/`, not the repo root. This would have caused
  the deployed static asset to 404.

### Changed (M5 — backend)
- `api/klines.js`: added `validateSymbol()` rejecting non-alphanumeric,
  > 20 chars, path-traversal (`../`, `/`), and SSRF probes (`://`).
  Added `validateInterval()` whitelist
  (`['1m','5m','15m','1h','4h','1d','1w']`). 400 on invalid input;
  happy-path payload schema unchanged.
- `api/fundamental.js`: removed broken `const fetch = require('node-fetch')`
  (no `package.json` in repo, would throw at runtime). Now uses Node 18+
  global `fetch`. Added `validateSymbol()` guard. Requires Node 18+
  runtime — tracked in `FOLLOWUP.md`.

### Added (M6 — security)
- `SECURITY_FINDINGS.md`: 8 findings (2 medium, 3 low, 3 informational).
  All fixes deferred to owners per scope discipline; tracked in
  `FOLLOWUP.md` for prioritized follow-up.

### Added (M7 — frontend)
- `index.html`: added `<meta http-equiv="Content-Security-Policy">`
  with directives covering the live CDN endpoints
  (`unpkg.com`, `cdn.jsdelivr.net`, `fonts.googleapis.com`,
  `fonts.gstatic.com`) and the data-source APIs
  (`api.binance.com`, `query{1,2}.finance.yahoo.com`,
  `api.coingecko.com`). `'unsafe-inline'` retained on `script-src`
  to accommodate existing `onclick=` handlers rendered via `innerHTML`.

### Added (M8 — docs)
- `README.md`: full quickstart, repository layout, verify steps,
  API reference, build/deploy notes.
- `CHANGELOG.md`: this file.
- `AGENTS.md`: replaced the auto-bootstrap skeleton with real project
  guidance (goals, avoidances, tech stack, verify commands).
- `scripts/verify.py`: project-level verify script invoked by the
  repo-builder pre-commit hook for HTML/script changes.

## [v2.2.1-spec] — 2026-07-19

### Changed
- Sweet-spot-driven rewrite of `PRD/SPEC.md`: repositioned from
  "generic backtest tool" (red ocean vs MultiCharts / QuantConnect) to
  "Taiwan retail traders' Taiwan-stock / futures backtest + AI strategy
  assistant" (sweet spot 4/10 → targeted). Dropped US stocks, FX,
  crypto-only positioning; focused on 台灣 200 萬散戶 with ~5% interested
  in programmatic trading.

---

Release tags use `vX.Y.Z`. Pre-1.0 the project follows 0-based minor
versioning; 1.0 marks the first "production-ready" release (TBD).