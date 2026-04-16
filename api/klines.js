// K-lines API: proxies CoinGecko / Yahoo Finance for OHLCV data
// Handles CORS by running server-side on Vercel
//
// Data source priority for crypto:
//   1d/1w  → CoinGecko (free, reliable, no API key)
//   1m/5m/15m/1h/4h → Yahoo Finance (replaces Binance, no API key needed)
//   Stocks → Yahoo Finance
//
// CoinGecko OHLC endpoint: /coins/{id}/ohlc?vs_currency=usd&days=N
//   days 1-90   → daily candles
//   days 91-365 → weekly candles
//   days 366+   → monthly candles

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

  for (let i = 0; i < 50; i++) {
    const bnUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&endTime=${endTimeMs}`;
    let r;
    try {
      r = await fetch(bnUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      console.error('Binance fetch error:', e.message);
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) break;
      await sleep(500);
      continue;
    }

    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.error(`Binance HTTP ${r.status}: ${errBody.slice(0, 100)}`);
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) break;
      await sleep(1000);
      continue;
    }

    let klines;
    try {
      klines = await r.json();
    } catch (e) {
      console.error('Binance JSON parse error:', e.message);
      break;
    }

    if (!Array.isArray(klines) || klines.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) break;
      await sleep(500);
      continue;
    }

    consecutiveEmpty = 0;
    allKlines.push(...klines);

    if (klines.length < limit) break;

    const oldestOpenSec = Math.floor(klines[0][0] / 1000);
    if (oldestOpenSec <= startSec) break;
    endTimeMs = (oldestOpenSec - 1) * 1000;
    if (endTimeMs <= 0) break;

    await sleep(200);
  }

  if (allKlines.length === 0) throw new Error(`No Binance data for ${symbol} (${interval})`);

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

// ── Yahoo Finance ──────────────────────────────────────────────────────────────
async function fetchYahoo(symbol, interval, days) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const yfInterval = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1wk' }[interval] || '1d';
  const yfSymbol = symbol.replace('USDT', '-USD');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?period1=${start}&period2=${end}&interval=${yfInterval}`;
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

    // ── Primary: CoinGecko (best for 1d / long periods, free, no rate limits) ──
    if (coinId) {
      try {
        const data = await fetchCoinGecko(coinId, days);
        return res.status(200).json({ success: true, symbol, interval, data, source: 'coingecko', count: data.length });
      } catch (cgErr) {
        console.warn(`CoinGecko failed for ${symbol}: ${cgErr.message}`);
        // fall through to Binance below
      }
    }

    // ── Secondary: Yahoo Finance (for intraday: 1m/5m/15m/1h/4h) ───────────────────
    const intradayIntervals = ['1m', '5m', '15m', '1h', '4h'];
    if (intradayIntervals.includes(interval)) {
      try {
        // Yahoo Finance supports BTC-USD, ETH-USD etc. with intraday data
        // fetchYahoo handles USDT->USD conversion internally
        const data = await fetchYahoo(symbol, interval, days);
        return res.status(200).json({ success: true, symbol, interval, data, source: 'yahoo', count: data.length });
      } catch (yfErr) {
        console.warn(`Yahoo Finance intraday failed for ${symbol}: ${yfErr.message}`);
      }
    }

    // ── Tertiary: Yahoo Finance fallback ─────────────────────────────────────
    try {
      const data = await fetchYahoo(symbol, interval, days);
      return res.status(200).json({ success: true, symbol, interval, data, source: 'yahoo', count: data.length });
    } catch (yfErr) {
      console.warn(`Yahoo Finance fallback failed for ${symbol}: ${yfErr.message}`);
    }

    // ── All sources exhausted ─────────────────────────────────────────────────
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
