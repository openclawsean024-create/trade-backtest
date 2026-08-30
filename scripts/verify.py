#!/usr/bin/env python3
"""
project-level verify script for trade-backtest.

Invoked by the repo-builder global pre-commit hook when HTML / asset /
script changes are staged. Runs the project's verify gates:

  1. node --check (syntax) on the 4 tracked JS source files
  2. node tests/run.js (smoke tests added by M2)

Exit 0 on full pass, non-zero on any failure.

This script is intentionally stdlib-only (no `requirements.txt`, no
`pip install`) so the pre-commit hook can invoke it on any host.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
NODE_BIN = shutil.which("node") or "node"

JS_FILES = [
    "lightweight-charts.4.1.0.js",
    "signal-monitor.js",
    "api/klines.js",
    "api/fundamental.js",
]


def run(label: str, cmd: list[str], cwd: Path) -> bool:
    print(f"--- {label} ---")
    print(f"  $ {' '.join(cmd)}  (cwd={cwd})")
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip(), file=sys.stderr)
    print(f"  exit={result.returncode}")
    return result.returncode == 0


def main() -> int:
    ok = True

    # Gate 1: syntax check
    ok &= run(
        "node --check (4 source files)",
        [NODE_BIN, "--check", *JS_FILES],
        REPO_ROOT,
    )

    # Gate 2: test runner (only if tests/ exists; this repo had no tests
    # before M2, so guard against the early-pre-M2 case)
    if (REPO_ROOT / "tests" / "run.js").exists():
        ok &= run(
            "node tests/run.js (smoke tests)",
            [NODE_BIN, "tests/run.js"],
            REPO_ROOT,
        )
    else:
        print("--- node tests/run.js (skipped: tests/ not yet created) ---")

    print("--- summary ---")
    print(f"  result={'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())