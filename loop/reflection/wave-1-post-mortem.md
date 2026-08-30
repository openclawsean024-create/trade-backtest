# Wave 1 post-mortem

**Wave:** 1 — 規劃 + 測試 + CI 基線
**Milestones:** M1 (orchestrator PLAN.md) + M2 (qa test runner) + M3 (devops CI)
**Verify log:** `wave-1-verify.log` (commit `7dbbddb`)
**Outcome:** ✅ All milestones green on first attempt (M2 had 1 retry).

## What went well

- **M1**: orchestrator subagent produced a 125-line PLAN.md in one pass.
  PLAN was well-grounded: cited actual source lines (`signal-monitor.js`
  module.exports, `vercel.json` SPEC.md path bug, `node-fetch` import),
  identified file-edit conflicts (M2 + M5 both touching `signal-monitor.js`
  export surface; M5 marked as co-review checkpoint), and routed the
  `vercel.json` SPEC path fix into M4 instead of inventing a new milestone.
- **M3**: devops subagent looked up live SHAs via `git ls-remote` (not
  stale cached pins), wrote a clean 60-LOC YAML with explicit
  SHA-pin rationale + cache-exception documentation. Used `git ls-remote`
  rather than the well-known fallback SHAs I'd pre-cached in the prompt
  (one of which was actually 41 chars, justifying the network lookup).
- **M2 retry**: second attempt succeeded with 4 well-documented deviations
  (Wilder RSI plateau ≠ literal `100`; import-time guard via `--config`
  flag; circular-require fix via `globalThis`; force-added log file).

## What was rough

- **M2 crash**: first qa subagent crashed mid-reasoning while analyzing
  MA calculation edge cases. The crash happened AFTER a correct edit to
  `signal-monitor.js` but BEFORE any tests, commit, or verify. Cost 1
  retry (well within budget). Pattern repeated for M4..M8 (see
  `loop/lessons.md` L1).
- **Wasted prompt prep**: the M2 first-attempt prompt was verbose and
  included detailed edge-case reasoning hints that the subagent never
  got to use. The retry prompt was tighter and got further.

## Process improvement

- For test-writing subagents, hand them the **expected test count and
  approximate body shapes** upfront. Free-form "write good tests" tasks
  invite runaway reasoning that may not converge in the subagent's
  budget.
- Add a 30-second "thinking budget" by giving the subagent a structured
  plan rather than an open-ended one.

## Stats

- M1: 1 attempt, 0 retries, 0 verify failures.
- M2: 2 attempts (1 retry), 1 retry, 0 verify failures.
- M3: 1 attempt, 0 retries, 0 verify failures.
- Total commits this wave: 4 (M1, M2, M3, wave-1 verify log).
- Wall-time estimate: ~8 minutes (subagent dispatch + verify + commit).