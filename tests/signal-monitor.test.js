/**
 * signal-monitor smoke tests (M2).
 *
 * Source notes — verified by reading signal-monitor.js before writing:
 *   calculateMA(data, period)        → array length === data.length; entries [0..period-2] are null
 *   calculateRSI(data, period=14)    → array length === data.length - 1; entries [0..period-2] are null
 *   calculateMACD(data, fast=12, slow=26, signal=9) → { macdLine, signalLine, histogram } all length === data.length
 *   detectSignals(data, symbol)      → array of { type: 'BUY'|'SELL', reason, price, symbol }
 *       MA-cross reasons are exactly: 'Golden Cross (MA20/MA50)', 'Death Cross (MA20/MA50)'
 *
 * Import side-effect: signal-monitor.js's CLI dispatcher fires `monitorSignals()` when no
 * `--watch` / `--config` / `--set-keywords` flag is present. monitorSignals() reaches out to
 * Binance over HTTPS. We neutralize this by stamping process.argv with a benign sentinel flag
 * (`--config`) BEFORE the first require, so the dispatcher hits the `--config` branch (which
 * just prints JSON to stdout) instead of calling monitorSignals. The pure-function helpers we
 * need are unaffected — they don't read process.argv.
 *
 * The harness API (`it`, `assertEqual`, `assertDeepEqual`) is exposed on globalThis by
 * tests/run.js at file-load time. We use the globals directly to avoid a circular require
 * (run.js → test file → run.js, where run.js hasn't finished evaluating yet).
 */
'use strict';

// IMPORTANT: must run BEFORE require('../signal-monitor.js') below. The module's top-level
// dispatcher inspects process.argv to decide which branch to execute; we steer it into the
// harmless `--config` branch (which just JSON.stringifies the default config and prints —
// no network call). We also silence that stdout noise so the test summary line stays clean.
process.argv = ['node', 'signal-monitor.js', '--config'];
const _origConsoleLog = console.log;
console.log = () => {};
const { calculateMA, calculateRSI, calculateMACD, detectSignals } = require('../signal-monitor.js');
console.log = _origConsoleLog;

// Build a flat OHLCV row at a given close price. `time` increments by 1 hour.
function row(close, idx) {
    return {
        time: 1_700_000_000 + idx * 3600,
        open: close,
        high: close,
        low: close,
        close,
        volume: 1
    };
}

// --- 1. calculateMA: too few points → null entries, then correct mean ----
it('calculateMA returns nulls until period reached, then correct rolling mean', () => {
    const data = [10, 20, 30, 40, 50].map((c, i) => row(c, i));
    const ma3 = calculateMA(data, 3);
    assertEqual(ma3.length, 5);
    assertEqual(ma3[0], null);
    assertEqual(ma3[1], null);
    assertEqual(ma3[2], (10 + 20 + 30) / 3);
    assertEqual(ma3[3], (20 + 30 + 40) / 3);
    assertEqual(ma3[4], (30 + 40 + 50) / 3);
});

// --- 2. calculateRSI: monotonic series → boundary saturation -------------
// Verified empirically against the source: pure uptrend plateaus at the
// Wilder-smoothed saturation value 100 - 100/(1+100) ≈ 99.0099 (the source
// seeds with a 14-bar simple sum then smooths thereafter, so it never
// literally hits 100). Pure downtrend does saturate exactly at 0 because
// avgGain === 0 yields RS = 0 ⇒ 100 - 100/(1+0) = 0 and that value sticks.
it('calculateRSI saturates at boundary values for monotonic inputs', () => {
    const up = [];
    for (let i = 0; i < 30; i++) up.push(row(100 + i, i));
    const rsiUp = calculateRSI(up, 14);
    // Last entry must be at the plateau (constant across the tail of the series).
    assertEqual(rsiUp[rsiUp.length - 1], 100 - 100 / 101);
    assertEqual(rsiUp[rsiUp.length - 1], rsiUp[rsiUp.length - 2]);

    const down = [];
    for (let i = 0; i < 30; i++) down.push(row(200 - i, i));
    const rsiDown = calculateRSI(down, 14);
    // Pure downtrend → avgGain === 0 → RS = 0 → RSI = 100 - 100/(1+0) = 0
    assertEqual(rsiDown[rsiDown.length - 1], 0);
});

// --- 3. calculateMACD: histogram length matches input length -------------
it('calculateMACD returns histogram array of same length as input', () => {
    const data = [];
    for (let i = 0; i < 60; i++) data.push(row(100 + Math.sin(i / 3) * 5, i));
    const macd = calculateMACD(data);
    assertEqual(macd.histogram.length, data.length);
    assertEqual(macd.macdLine.length, data.length);
    assertEqual(macd.signalLine.length, data.length);
});

// --- 4. detectSignals: hand-crafted Golden Cross -------------------------
// detectSignals uses MA20/MA50 on the LAST TWO points of the series. To make MA20[last-2]
// and MA50[last-2] non-null, data.length must be ≥ 51. We craft: flat baseline (MA20≈MA50≈100),
// then a small dip (MA20 dips slightly below MA50 at index last-2), then a sharp spike on the
// last bar that pulls MA20 above MA50 at index last-1.
it('detectSignals emits a Golden Cross on a bullish MA20/MA50 crossover', () => {
    const data = [];
    // 48-point flat baseline so both MAs settle at 100
    for (let i = 0; i < 48; i++) data.push(row(100, i));
    // Two dips → MA20 falls just below MA50 at index 49 (which becomes [last-2])
    data.push(row(99, 48));
    data.push(row(99, 49));
    // Big jump on last bar → MA20 rockets above MA50
    data.push(row(110, 50));
    const signals = detectSignals(data, 'BTCUSDT');
    const golden = signals.find(s => s.reason === 'Golden Cross (MA20/MA50)');
    assertEqual(!!golden, true, 'expected a Golden Cross signal to be present');
    assertEqual(golden.type, 'BUY');
});

// --- 5. detectSignals: hand-crafted Death Cross --------------------------
it('detectSignals emits a Death Cross on a bearish MA20/MA50 crossover', () => {
    const data = [];
    // 48-point flat baseline so both MAs settle at 100
    for (let i = 0; i < 48; i++) data.push(row(100, i));
    // Two small upticks → MA20 lifts above MA50 at index 49 (which becomes [last-2])
    data.push(row(101, 48));
    data.push(row(101, 49));
    // Big drop on last bar → MA20 plunges below MA50
    data.push(row(90, 50));
    const signals = detectSignals(data, 'BTCUSDT');
    const death = signals.find(s => s.reason === 'Death Cross (MA20/MA50)');
    assertEqual(!!death, true, 'expected a Death Cross signal to be present');
    assertEqual(death.type, 'SELL');
});
