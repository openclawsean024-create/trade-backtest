// K-lines API: proxies Binance / CoinGecko / Yahoo Finance for OHLCV data
// Handles CORS by running server-side on Vercel

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

function makeJsonResponse(data, status = 200) {
  return {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data),
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async (req, res) => {
  // CORS preflight
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

  const coinGeckoIds = {
    'BTCUSDT': 'bitcoin',
    'ETHUSDT': 'ethereum',
    'BNBUSDT': 'binancecoin',
    'SOLUSDT': 'solana',
    'XRPUSDT': 'ripple',
    'DOGEUSDT': 'dogecoin',
    'ADAUSDT': 'cardano',
    'AVAXUSDT': 'avalanche-2',
  };

  // ── CRYPTO ──────────────────────────────────────────────────────────────────
  if (isCrypto) {
    const binanceIntervals = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
    const useBinance = binanceIntervals.includes(interval);

    if (useBinance) {
      // Binance: paginate backwards from now to collect enough candles
      const nowSec = Math.floor(Date.now() / 1000);
      const startSec = nowSec - days * 86400;
      const limit = 1500;
      let allKlines = [];
      let endTimeMs = Math.floor(Date.now());
      let consecutiveEmpty = 0;

      for (let i = 0; i < 50; i++) { // max 50 pagination steps
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

        // If we got fewer than limit, we've reached the end
        if (klines.length < limit) break;

        const oldestOpenSec = Math.floor(klines[0][0] / 1000);
        if (oldestOpenSec <= startSec) break;
        endTimeMs = (oldestOpenSec - 1) * 1000;
        if (endTimeMs <= 0) break;

        // Rate-limit friendly delay
        await sleep(200);
      }

      if (allKlines.length === 0) {
        return res.status(200).json({ success: false, error: `No Binance data for ${symbol} (${interval})` });
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
      if (data.length < 2) {
        return res.status(200).json({ success: false, error: `Insufficient valid candles for ${symbol}` });
      }

      return res.status(200).json({ success: true, symbol, interval, data, source: 'binance', count: data.length });
    }

    // CoinGecko fallback for non-standard intervals or long periods
    const coinId = coinGeckoIds[symbol];
    if (!coinId) {
      return res.status(400).json({ success: false, error: 'Unsupported crypto symbol: ' + symbol });
    }

    try {
      const cgUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
      const response = await fetch(cgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return res.status(200).json({ success: false, error: `CoinGecko API error: ${response.status}` });
      }

      const ohlc = await response.json();
      if (!Array.isArray(ohlc) || ohlc.length === 0) {
        return res.status(200).json({ success: false, error: `No CoinGecko data for ${symbol}` });
      }

      const rawData = ohlc.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: k[1],
        high: k[2],
        low: k[3],
        close: k[4],
        volume: 0,
      }));

      const data = sanitizeAndValidate(rawData);
      if (data.length < 2) {
        return res.status(200).json({ success: false, error: `No valid CoinGecko candles for ${symbol}` });
      }

      return res.status(200).json({ success: true, symbol, interval, data, source: 'coingecko', count: data.length });
    } catch (e) {
      return res.status(200).json({ success: false, error: `CoinGecko fetch failed: ${e.message}` });
    }
  }

  // ── STOCKS (Yahoo Finance) ────────────────────────────────────────────────────
  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 86400;
    const yfInterval = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1wk' }[interval] || '1d';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${start}&period2=${end}&interval=${yfInterval}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(200).json({ success: false, error: `Yahoo Finance error: ${response.status}` });
    }

    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      return res.status(200).json({ success: false, error: `No Yahoo Finance result for ${symbol}` });
    }

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const opens = result.indicators?.quote?.[0]?.open || [];
    const highs = result.indicators?.quote?.[0]?.high || [];
    const lows = result.indicators?.quote?.[0]?.low || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];

    const raw = timestamps.map((t, i) => ({
      time: t,
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
      volume: volumes[i] || 0,
    }));

    const data = sanitizeAndValidate(raw);
    if (data.length < 2) {
      return res.status(200).json({ success: false, error: `Insufficient valid candles for ${symbol}` });
    }

    return res.status(200).json({ success: true, symbol, interval, data, source: 'yahoo', count: data.length });
  } catch (e) {
    return res.status(200).json({ success: false, error: `Yahoo Finance fetch failed: ${e.message}` });
  }
};
