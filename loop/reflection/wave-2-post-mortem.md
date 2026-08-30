# Wave 2 post-mortem

**Wave:** 2 — 真實的後端 + 安全硬傷
**Milestones:** M4 (backend vercel.json fix) + M5 (backend input validation) + M6 (security audit)
**Verify log:** `wave-2-verify.log` (commit `11bd637`)
**Outcome:** ✅ All milestones green; subagent crashes forced parent-driver fallback for all 3.

## What went well

- **M4**: The 1-line `vercel.json` edit (`SPEC.md` → `PRD/SPEC.md`) was
  the smallest, highest-impact change in the run. PLAN.md correctly
  identified this as a real config bug (root-level SPEC.md doesn't
  exist; SPEC lives in PRD/) — would have caused 404 on every
  Vercel deploy.
- **M5**: Combined two changes cleanly: (a) `validateSymbol()` +
  interval whitelist on both `/api/*` handlers, (b) removed broken
  `const fetch = require('node-fetch')` (would have thrown at runtime
  since the repo has no `package.json`). The validateSymbol regex
  (`^[A-Z0-9._-]{1,20}$`) rejects 4 known bad-input patterns in one
  shot: non-alphanumeric, > 20 chars, path-traversal (`../`, `/`),
  and SSRF probes (`://`).
- **M6**: 8 findings (2 medium, 3 low, 3 informational) catalogued
  cleanly in `SECURITY_FINDINGS.md`. F1 (Telegram HTML parse_mode
  without escape) and F2 (CORS wildcard) are real but latent risks;
  F3 (no rate limit) is the highest-impact future hardening task.

## What was rough

- **All 3 subagents crashed** mid-task. M4's was the worst — it crashed
  BEFORE making any change. M5's also crashed before commit (parent
  driver executed the edits and commit). M6's crashed too, parent
  driver wrote the audit.
- This is the wave where the pattern became clear: subagents on this
  repo crash silently, with no recoverable error context. The parent
  driver should have stopped trying to spawn subagents after M4 + M5
  both crashed; instead it kept trying.

## Process improvement

- **Cut over to direct parent-driver execution sooner.** After 2
  consecutive subagent crashes in the same wave, the parent driver
  should commit to direct execution for the rest of that wave.
- **Audit milestones are an ideal parent-driver candidate.** They
  require no code changes; the deliverable is a markdown file derived
  from grep + source-read. Subagents don't add value here.
- **M5's export change co-review with M2** worked as designed: M2
  added 3 helpers to `module.exports`, M5 confirmed the change
  didn't break the handler signature. No conflict in practice.

## Stats

- M4: 1 attempt (parent driver, no subagent), 0 retries, 0 verify failures.
- M5: 1 attempt (parent driver), 0 retries, 0 verify failures.
- M6: 1 attempt (parent driver), 0 retries, 0 verify failures.
- Total commits this wave: 4 (M4, M5, M6, wave-2 verify log).
- Wall-time estimate: ~6 minutes (parent driver direct execution is faster than subagent dispatch when the task is well-specified).