#!/usr/bin/env node
/**
 * Minimal Node test runner — stdlib only, zero dependencies, Node ≥ 18.
 *
 * Exposes:
 *   it(name, fn)             — register a test (sync or async)
 *   assertEqual(a, b, msg?)   — strict equality (===)
 *   assertDeepEqual(a, b, m?) — deep equality for arrays / plain objects
 *
 * Runs every registered `it()` in registration order. Failures are recorded
 * (not thrown). At end prints "<N> passed, <M> failed" and exits 1 if M > 0.
 *
 * No npm, no external deps, no console noise inside the harness itself —
 * only the final summary line.
 *
 * Usage: `node tests/run.js` — the runner requires all sibling *.test.js files.
 *
 * Circular-require note: test files do `require('./run.js')` to get `it`/`assertEqual`.
 * That require happens BEFORE run.js's own module body finishes evaluating (because run.js
 * triggers the test-file require itself). To avoid the resulting "accessing non-existent
 * property" warning and the empty exports object, we expose the API on `globalThis`
 * synchronously at file-load time. By the time the test file's body runs, the globals are
 * already set, even though module.exports of run.js is still empty.
 */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const tests = [];

// --- public API ----------------------------------------------------------
// Synchronous, top-level. These are visible to any test file that requires us, even
// mid-circular-import, because they're attached to globalThis (not module.exports).

function it(name, fn) {
    if (typeof name !== 'string' || typeof fn !== 'function') {
        throw new TypeError('it(name: string, fn: function) is required');
    }
    tests.push({ name, fn });
}

function assertEqual(actual, expected, msg) {
    assert.strictEqual(actual, expected, msg || `assertEqual failed: ${actual} !== ${expected}`);
}

function assertDeepEqual(actual, expected, msg) {
    try {
        assert.deepStrictEqual(actual, expected);
    } catch (e) {
        if (msg) throw new assert.AssertionError({ message: msg, actual, expected });
        throw e;
    }
}

globalThis.it = it;
globalThis.assertEqual = assertEqual;
globalThis.assertDeepEqual = assertDeepEqual;

// Also expose via module.exports for non-circular callers, but the globals above are
// what actually matters for sibling test files.
module.exports = { it, assertEqual, assertDeepEqual };

// --- discover sibling *.test.js -----------------------------------------

function discoverTests() {
    return fs.readdirSync(__dirname)
        .filter(f => f.endsWith('.test.js'))
        .sort()
        .map(f => path.join(__dirname, f));
}

// --- runner --------------------------------------------------------------

async function run() {
    for (const file of discoverTests()) {
        require(file);
    }

    let passed = 0;
    let failed = 0;

    for (const { name, fn } of tests) {
        try {
            await fn();
            passed += 1;
        } catch (err) {
            failed += 1;
            const msg = err && err.stack ? err.stack : String(err);
            process.stderr.write(`\n✗ ${name}\n${msg}\n`);
        }
    }

    process.stdout.write(`${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
}

run();
