module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const symbol = (req.query.symbol || '').toUpperCase().trim();
  const days = Math.max(1, Math.min(parseInt(req.query.days || '90'), 365 * 6));
  const interval = (req.query.interval || '1d').toLowerCase();

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
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

  try {
    if (isCrypto) {
      const binanceIntervals = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
      const useBinance = binanceIntervals.includes(interval);

      if (useBinance) {
        const nowSec = Math.floor(Date.now() / 1000);
        const startSec = nowSec - days * 86400;
        const limit = 1500;
        let allKlines = [];
        let endTimeMs = Math.floor(Date.now());

        for (let i = 0; i < 20; i++) {
          const bnUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&endTime=${endTimeMs}`;
          let r;
          try {
            r = await fetch(bnUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) });
          } catch(e) {
            break;
          }

          if (!r.ok) {
            const errBody = await r.text();
            break;
          }

          const rawText = await r.text();
          
          // Re-parse as JSON since we already read it
          let klines;
          try {
            klines = JSON.parse(rawText);
          } catch(e) {
            break;
          }



          if (!Array.isArray(klines) || klines.length === 0) {
            break;
          }

          allKlines.push(...klines);

          if (klines.length < limit) break;

          const oldestOpenSec = Math.floor(klines[0][0] / 1000);
          if (oldestOpenSec <= startSec) break;
          endTimeMs = (oldestOpenSec - 1) * 1000;
          if (endTimeMs <= 0) break;
        }

        if (allKlines.length === 0) {
          throw new Error('No Binance data for ' + symbol + ' (interval=' + interval + ')');
        }

        const data = allKlines
          .map(k => ({
            time: Math.floor(k[0] / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
          }))
          .filter(d => d.time >= startSec && d.time <= nowSec)
          .sort((a, b) => a.time - b.time);

        return res.status(200).json({ success: true, symbol, interval, data, source: 'binance' });
      }

      // CoinGecko for non-standard intervals or long periods
      const coinId = coinGeckoIds[symbol];
      if (!coinId) {
        return res.status(400).json({ error: 'Unsupported crypto symbol: ' + symbol });
      }

      if (days > 365) {
        const yearChunks = [];
        const now = Math.floor(Date.now() / 1000);
        const oneYear = 365 * 86400;
        const end = now;
        const start = end - days * 86400;
        for (let t = end; t > start; t = Math.max(t - oneYear, start)) {
          const chunkDays = Math.min(Math.floor((end - t) / 86400) || 365, 365);
          const cgUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${chunkDays}`;
          try {
            const r = await fetch(cgUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
            if (r.ok) {
              const ohlc = await r.json();
              if (Array.isArray(ohlc) && ohlc.length > 0) yearChunks.push(...ohlc);
            }
          } catch {}
          if (t > start + oneYear) await new Promise(r => setTimeout(r, 200));
        }
        if (yearChunks.length === 0) throw new Error('No CoinGecko data for ' + symbol);
        const seen = new Set();
        yearChunks.sort((a, b) => a[0] - b[0]);
        const unique = yearChunks.filter(k => { if (seen.has(k[0])) return false; seen.add(k[0]); return true; });
        const data = unique.map(k => ({ time: Math.floor(k[0] / 1000), open: k[1], high: k[2], low: k[3], close: k[4], volume: 0 })).filter(d => d.time >= start && d.time <= end);
        return res.status(200).json({ success: true, symbol, interval, data, source: 'coingecko' });
      } else {
        const cgUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
        const response = await fetch(cgUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`CoinGecko API error: ${response.status}`);
        const ohlc = await response.json();
        if (!Array.isArray(ohlc) || ohlc.length === 0) throw new Error('No CoinGecko data for ' + symbol);
        const data = ohlc.map(k => ({ time: Math.floor(k[0] / 1000), open: k[1], high: k[2], low: k[3], close: k[4], volume: 0 }));
        return res.status(200).json({ success: true, symbol, interval, data, source: 'coingecko' });
      }
    } else {
      // Yahoo Finance for stocks
      const end = Math.floor(Date.now() / 1000);
      const start = end - days * 86400;
      const yfInterval = { '1m':'1m','5m':'5m','15m':'15m','1h':'1h','4h':'4h','1d':'1d','1w':'1wk' }[interval] || '1d';
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${start}&period2=${end}&interval=${yfInterval}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' } });
      if (!response.ok) throw new Error(`Yahoo Finance: ${response.status}`);
      const json = await response.json();
      const result = json?.chart?.result?.[0];
      if (!result) return res.status(404).json({ error: 'No data for ' + symbol });
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const opens = result.indicators?.quote?.[0]?.open || [];
      const highs = result.indicators?.quote?.[0]?.high || [];
      const lows = result.indicators?.quote?.[0]?.low || [];
      const volumes = result.indicators?.quote?.[0]?.volume || [];
      const data = timestamps.map((t, i) => ({ time: t, open: opens[i]||0, high: highs[i]||0, low: lows[i]||0, close: closes[i]||0, volume: volumes[i]||0 })).filter(d => d.close > 0);
      return res.status(200).json({ success: true, symbol, interval, data, source: 'yahoo' });
    }
  } catch (error) {
    console.error('K-lines error:', error.message);
    return res.status(500).json({ error: 'Failed: ' + error.message });
  }
};
