// K-lines API: proxies Binance / CoinGecko / Yahoo Finance for OHLCV data
// Handles CORS by running server-side on Vercel
//
// Data source priority for crypto:
//   1d/1w  (any period) → Binance (all historical data, free, no API key)
//   1m/5m/15m/1h/4h       → Binance (reliable, free, no API key)
//   Stocks                → Yahoo Finance
//
// Binance limits:
//   Max 1500 candles per call → paginate by endTime
//   Historical daily data: typically 3-5 years on public endpoint
//
// CoinGecko OHLC endpoint: /coins/{id}/ohlc?vs_currency=usd&days=N
//   days 1-90   → daily candles  ✓ safe to use
//   days 91-365 → weekly candles ✗ wrong granularity for 1d chart
//   days 366+   → monthly candles ✗ wrong granularity for 1d chart
// → Only use CoinGecko as last resort for 1d/1w short periods (< 90 days)

function isValidCandle(candle) {
  if (!candle.open || !candle.high || !candle.low || !candle.close) return false;
  if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) return false;
  if (candle.high < Math.max(candle.open, candle.close, candle.low)) return false;
  if (candle.low > Math.min(candle.open, candle.close, candle.high)) return false;
  if (candle.volume < 0) return false;
  return true;
}

function sanitizeAndValidate(rawData) {
  let prevTime = 0;
  return rawData
    .filter(c => {
      if (!isValidCandle(c)) return false;
      if (c.time <= prevTime) return false;
      prevTime = c.time;
      return true;
    });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── CoinGecko ──────────────────────────────────────────────────────────────────
// NOTE: CoinGecko's /ohlc endpoint returns:
//   days 1-90   → daily candles  ✓ safe to use
//   days 91-365 → weekly candles ✗ wrong granularity for 1d chart
//   days 366+   → monthly candles ✗ wrong granularity for 1d chart
// → Only use CoinGecko as fallback for 1d/1w when period ≤ 90, otherwise skip it.
const COINGECKO_IDS = {
  'BTCUSDT': 'bitcoin',
  'ETHUSDT': 'ethereum',
  'BNBUSDT': 'binancecoin',
  'SOLUSDT': 'solana',
  'XRPUSDT': 'ripple',
  'DOGEUSDT': 'dogecoin',
  'ADAUSDT': 'cardano',
  'AVAXUSDT': 'avalanche-2',
};

// Symbol price sanity-check: guard against wrong-asset data
// Returns true if the median close price is plausible for the given symbol
function plausiblePriceRange(symbol, candles) {
  if (!candles || candles.length === 0) return true;
  const median = candles.slice().sort((a, b) => a.close - b.close)[Math.floor(candles.length / 2)].close;
  const ranges = {
    'BTCUSDT': [500, 250000], 'ETHUSDT': [10, 20000], 'BNBUSDT': [5, 2000],
    'SOLUSDT': [0.5, 2000], 'XRPUSDT': [0.01, 20], 'DOGEUSDT': [0.001, 5],
    'ADAUSDT': [0.01, 10], 'AVAXUSDT': [0.5, 500],
    // Stocks: wide range, skip check
  };
  const range = ranges[symbol];
  if (!range) return true;
  return median >= range[0] && median <= range[1];
}

async function fetchCoinGecko(coinId, days) {
  // days 1-90: daily | 91-365: weekly | 366+: monthly
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const ohlc = await res.json();
  if (!Array.isArray(ohlc) || ohlc.length === 0) throw new Error('Empty CoinGecko response');

  // CoinGecko returns [timestamp(ms), open, high, low, close]
  const rawData = ohlc.map(k => ({
    time: Math.floor(k[0] / 1000),
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: 0,
  }));

  const data = sanitizeAndValidate(rawData);
  if (data.length < 2) throw new Error('Insufficient valid CoinGecko candles');
  return data;
}

// ── Binance ────────────────────────────────────────────────────────────────────
async function fetchBinance(symbol, interval, days) {
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - days * 86400;
  const limit = 1500;
  let allKlines = [];
  let endTimeMs = Math.floor(Date.now());
  let consecutiveEmpty = 0;
  let rateLimitRetries = 0;
  const MAX_RATE_LIMIT_RETRIES = 4;
  const BASE_DELAY_MS = 500;

  for (let i = 0; i < 50; i++) {
    // On rate-limit, respect Retry-After header (fallback to exponential backoff)
    let delayMs = BASE_DELAY_MS * Math.pow(2, rateLimitRetries);
    const bnUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&endTime=${endTimeMs}`;
    let r;
    try {
      r = await fetch(bnUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      console.error('Binance fetch error:', e.message);
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3) break;
      await sleep(delayMs);
      continue;
    }

    // Handle rate limiting with Retry-After support
    if (r.status === 429) {
      rateLimitRetries++;
      if (rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
        throw new Error(`Binance rate limit exceeded for ${symbol} (${interval}) after ${MAX_RATE_LIMIT_RETRIES} retries`);
      }
      const retryAfter = parseInt(r.headers.get('Retry-After') || '');
      delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delayMs * 2;
      console.warn(`Binance 429 received, retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES} after ${delayMs}ms`);
      await sleep(delayMs);
      continue;
    }

    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.error(`Binance HTTP ${r.status}: ${errBody.slice(0, 200)}`);
      // 5xx errors — retry with backoff
      if (r.status >= 500) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) break;
        await sleep(delayMs * 2);
        continue;
      }
      throw new Error(`Binance API error for ${symbol}: HTTP ${r.status} — ${errBody.slice(0, 100)}`);
    }

    let klines;
    try {
      klines = await r.json();
    } catch (e) {
      console.error('Binance JSON parse error:', e.message);
      throw new Error(`Binance JSON parse error for ${symbol}: ${e.message}`);
    }

    if (!Array.isArray(klines)) {
      throw new Error(`Binance returned non-array response for ${symbol}: ${JSON.stringify(klines).slice(0, 100)}`);
    }

    if (klines.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3) {
        // No more data available
        break;
      }
      await sleep(300);
      continue;
    }

    // Reset consecutive-empty counter on success
    consecutiveEmpty = 0;
    rateLimitRetries = 0;
    allKlines.push(...klines);

    if (klines.length < limit) break;

    const oldestOpenSec = Math.floor(klines[0][0] / 1000);
    if (oldestOpenSec <= startSec) break;
    endTimeMs = (oldestOpenSec - 1) * 1000;
    if (endTimeMs <= 0) break;

    await sleep(250);
  }

  if (allKlines.length === 0) {
    throw new Error(`No Binance data for ${symbol} (${interval}) — all sources returned empty`);
  }

  const raw = allKlines
    .map(k => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .filter(d => d.time >= startSec && d.time <= nowSec)
    .sort((a, b) => a.time - b.time);

  const data = sanitizeAndValidate(raw);
  if (data.length < 2) throw new Error(`Insufficient valid Binance candles for ${symbol}`);
  return data;
}

// ── Binance with retry wrapper ────────────────────────────────────────────────
// Wraps fetchBinance with retries on rate-limit so callers don't need to handle 429.
async function fetchBinanceWithRetry(symbol, interval, days, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const data = await fetchBinance(symbol, interval, days);
      return data;
    } catch (err) {
      const isRateLimit = err.message && err.message.includes('429');
      const is5xx = err.message && err.message.includes('500');
      if ((isRateLimit || is5xx) && attempt < maxRetries) {
        const delayMs = 2000 * Math.pow(2, attempt);
        console.warn(`Binance attempt ${attempt + 1} failed (${err.message}), retrying in ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
}
async function fetchYahoo(symbol, interval, days) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const yfInterval = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1wk' }[interval] || '1d';
  const yfSymbol = symbol.replace('USDT', '-USD');
  // query2 is less rate-limited than query1; fall back to query1 on failure
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${yfSymbol}?period1=${start}&period2=${end}&interval=${yfInterval}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?period1=${start}&period2=${end}&interval=${yfInterval}`,
  ];
  let lastError;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error(`No Yahoo Finance result for ${symbol}`);
      const ts = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const opens = result.indicators?.quote?.[0]?.open || [];
      const highs = result.indicators?.quote?.[0]?.high || [];
      const lows = result.indicators?.quote?.[0]?.low || [];
      const volumes = result.indicators?.quote?.[0]?.volume || [];
      const raw = ts.map((t, i) => ({
        time: t,
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i] || 0,
      }));
      const data = sanitizeAndValidate(raw);
      if (data.length < 2) throw new Error(`Insufficient valid Yahoo candles for ${symbol}`);
      return data;
    } catch (e) {
      lastError = e;
      console.warn(`Yahoo Finance (${url.split('/')[2]}) failed: ${e.message}`);
    }
  }
  throw lastError || new Error(`All Yahoo Finance endpoints failed for ${symbol}`);
}

// ── Main handler ───────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbol = (req.query.symbol || '').toUpperCase().trim();
  const days = Math.max(1, Math.min(parseInt(req.query.days || '90'), 365 * 6));
  const interval = (req.query.interval || '1d').toLowerCase();

  if (!symbol) {
    return res.status(400).json({ success: false, error: 'Missing symbol' });
  }

  const stockSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'META', 'NVDA', 'AMD'];
  const isCrypto = !stockSymbols.includes(symbol);

  // ── CRYPTO ──────────────────────────────────────────────────────────────────
  if (isCrypto) {
    const coinId = COINGECKO_IDS[symbol];

    // ── Primary: Binance (reliable for ALL crypto periods, free, no API key) ───
    // Binance has complete historical data via pagination (1500 candles/call)
    // Use retry logic to handle rate limits.
    try {
      const data = await fetchBinanceWithRetry(symbol, interval, days);
      if (data && data.length >= 2 && plausiblePriceRange(symbol, data)) {
        return res.status(200).json({ success: true, symbol, interval, data, source: 'binance', count: data.length });
      }
      if (data) {
        console.warn(`Binance sanity check failed for ${symbol}; trying fallback`);
      }
    } catch (bnErr) {
      console.warn(`Binance failed for ${symbol} (${interval}): ${bnErr.message}`);
    }

    // ── Yahoo Finance fallback: reliable for crypto 1d/1w at any period ─────────
    // CoinGecko is skipped for 1d/1w because its /ohlc endpoint returns 4h candles
    // (not 1d) for periods ≤90 days, which is wrong granularity for a "1d" chart.
    const isIntradayInterval = ['1m', '5m', '15m', '1h', '4h'].includes(interval);
    if (!isIntradayInterval) {
      try {
        const data = await fetchYahoo(symbol, interval, days);
        if (plausiblePriceRange(symbol, data)) {
          return res.status(200).json({ success: true, symbol, interval, data, source: 'yahoo', count: data.length });
        }
        console.warn(`Yahoo Finance sanity check failed for ${symbol}; trying CoinGecko`);
      } catch (yfErr) {
        console.warn(`Yahoo Finance failed for ${symbol}: ${yfErr.message}`);
      }
    }

    // ── Last resort: CoinGecko (only for intraday or when Yahoo Finance also failed) ──
    // NOTE: CoinGecko's /ohlc endpoint returns:
    //   days 1-90   → 4h candles  (NOT daily, wrong for 1d chart)
    //   days 91-365 → weekly      (NOT daily, wrong for 1d chart)
    //   days 366+   → monthly     (NOT daily, wrong for 1d chart)
    // Only use CoinGecko as absolute last resort.
    if (coinId) {
      try {
        const data = await fetchCoinGecko(coinId, days);
        if (plausiblePriceRange(symbol, data)) {
          return res.status(200).json({ success: true, symbol, interval, data, source: 'coingecko', count: data.length });
        }
        console.warn(`CoinGecko sanity check failed for ${symbol}`);
      } catch (cgErr) {
        console.warn(`CoinGecko failed for ${symbol}: ${cgErr.message}`);
      }
    }

    return res.status(200).json({ success: false, error: `All data sources failed for ${symbol} (${interval}). Please try again later.` });
  }

  // ── STOCKS (Yahoo Finance) ───────────────────────────────────────────────────
  try {
    const data = await fetchYahoo(symbol, interval, days);
    return res.status(200).json({ success: true, symbol, interval, data, source: 'yahoo', count: data.length });
  } catch (e) {
    return res.status(200).json({ success: false, error: `Yahoo Finance fetch failed: ${e.message}` });
  }
};
