# Lessons — trade-backtest autonomous run

> 5 actionable lessons distilled from the M1..M9 run. Each names a
  concrete change the parent driver (or future repo-builder users)
  can apply next time.

---

## L1 — Subagent infrastructure flakiness forced a fallback

**Observation:** Of the 9 milestones, only M1 (the orchestrator
producing PLAN.md) succeeded under the designed subagent path.
M2's first subagent run crashed mid-reasoning (after producing
the `signal-monitor.js` export change but before any tests or
commit); M4, M5, M6, M7, M8 each had their backend/devops/security/
frontend/docs subagents crash mid-task (silent exit, no commit).
M3 (devops) succeeded, possibly because its task was simple
boilerplate (write a YAML file with SHAs).

**Action for next time:**
- The parent driver should retry a subagent invocation **once**
  on silent failure before falling back to direct execution.
- For very small milestones (< 10 LOC change), skip the subagent
  and execute directly — the protocol's "invoke builder subagent"
  is overkill for a 1-line JSON edit.
- The `repo-builder` skill could improve by:
  (a) returning a clearer error message on subagent crash so the
      parent driver knows whether to retry,
  (b) explicitly supporting a "parent-driver mode" milestone type
      for trivial changes (avoids burning retry budget on
      infrastructure flakiness).

---

## L2 — Pure-JS + no-npm repos love the stdlib `assert` test harness

**Observation:** M2 wrote a ~100 LOC test runner using only Node's
stdlib `assert`. The 5-case smoke suite (`calculateMA`,
`calculateRSI`, `calculateMACD`, golden cross, death cross) ran
green first try after 2 minor corrections (Wilder RSI plateau is
not literally `100`; circular-require needed `globalThis` fix).

**Action for next time:**
- For any zero-dependency repo (no `package.json`), default to
  `node:test` (Node 18+) or stdlib `assert` + minimal harness.
- Don't reach for `npm install jest` unless the test count
  justifies the dependency. At < 30 cases, stdlib is faster,
  smaller, and less brittle.
- When documenting test scopes in PLAN.md, ground expected
  thresholds in the source first — the PLAN said "RSI full-up
  → 100" but the actual Wilder implementation plateaus at
  `99.0099...`. Always read the source before specifying test
  expectations.

---

## L3 — The repo-builder pre-commit hook expects `scripts/verify.py`

**Observation:** When M7 staged `index.html`, the global
pre-commit hook escalated from "warn" to "fail" and demanded
`scripts/verify.py`. The hook runs the script on every commit that
touches HTML / asset / script files.

**Action for next time:**
- Create `scripts/verify.py` (or `scripts/verify.sh`) at the
  earliest wave, BEFORE any HTML / frontend changes. The script
  should just re-run the project's verify gates (`node --check`
  + `node tests/run.js` for this repo). Stdlib-only Python is
  fine; no `pip install` needed.
- Document the script's existence in the project's `AGENTS.md`
  so future agents don't try to `SKIP_VERIFY=1` it as a hack.
- This is repo-builder infrastructure, not the `secret-safety`
  hook from `~/.dsh/AGENTS.md` — they're independent.

---

## L4 — Input validation belongs at the API edge, not at the data source

**Observation:** M5 added `validateSymbol()` (regex `^[A-Z0-9._-]{1,20}$`)
+ interval whitelist to both `/api/klines` and `/api/fundamental`.
The handlers previously accepted any string and passed it to
upstream APIs. This is a real security improvement (SSRF probes,
path-traversal, oversized inputs all rejected at the edge before
any network egress).

**Action for next time:**
- Treat input validation as part of every API-handler milestone,
  not as a separate "hardening" milestone. M5 combined validation
  with the `node-fetch` removal cleanly; doing them as two
  separate milestones would have wasted a wave slot.
- Whitelist enums (`VALID_INTERVALS`) beat blacklist regex for
  known-fixed-value sets. Blacklists grow forever; whitelists
  stay stable.
- Reject `://`, `..`, and `/` in any user-supplied URL
  component. These are the three classic SSRF / path-traversal
  probes; one regex handles all three.

---

## L5 — "Audit-only" milestones are undervalued; ship them anyway

**Observation:** M6 (security audit) produced `SECURITY_FINDINGS.md`
with 8 findings (2 medium, 3 low, 3 informational) and explicitly
deferred all fixes to FOLLOWUP.md. This kept scope discipline but
also means the actual security work is "scheduled" indefinitely.

**Action for next time:**
- Audit-only deliverables are worth committing because they
  become the load-bearing reference for future sprints. Without
  them, the next person re-does the same audit from scratch.
- Pair every audit with a `FOLLOWUP.md` entry — that way the
  findings have a home and won't be re-discovered.
- M6 succeeded in ~5 minutes of grep + source-read. The
  cost-to-value ratio is very high; ship audits early (W2 in
  this run), not last.

---

*5 lessons, ordered by generalizability. L1 and L3 are
repo-builder-specific; L2, L4, L5 are general engineering wisdom
that surfaced from this particular project.*