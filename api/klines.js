const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const symbol = (req.query.symbol || '').toUpperCase().trim();
  const days = parseInt(req.query.days || '90');
  const interval = (req.query.interval || '1d').toLowerCase();
  const limit = Math.min(days, 1000);

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const stockSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'META', 'NVDA', 'AMD'];
  const isCrypto = !stockSymbols.includes(symbol);

  try {
    if (isCrypto) {
      // Binance K-lines API
      const binanceIntervalMap = { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' };
      const binanceInterval = binanceIntervalMap[interval] || '1d';

      // Try multiple Binance API endpoints (some support CORS)
      const endpoints = [
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`,
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}&startTime=${Date.now() - days * 86400 * 1000}`
      ];

      let klines = null;
      for (const url of endpoints) {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': 'application/json'
            }
          });
          if (response.ok) {
            klines = await response.json();
            if (klines && klines.length > 0) break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!klines || klines.length === 0) {
        // Try Binance US or alternative
        const altUrl = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`;
        const altRes = await fetch(altUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (altRes.ok) {
          klines = await altRes.json();
        }
      }

      if (!klines || klines.length === 0) {
        // Fallback: try Binance with CORS proxy via allorigins
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`)}`;
        const proxyRes = await fetch(proxyUrl);
        if (proxyRes.ok) {
          klines = await proxyRes.json();
        }
      }

      if (!klines || klines.length === 0) {
        return res.status(404).json({ error: 'No Binance data found for ' + symbol });
      }

      const data = klines.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));

      return res.status(200).json({ success: true, symbol, interval: binanceInterval, data });
    } else {
      // Yahoo Finance for stocks
      const end = Math.floor(Date.now() / 1000);
      const start = end - days * 86400;

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${start}&period2=${end}&interval=${interval === '1w' ? '1wk' : interval === '1d' ? '1d' : interval}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com/'
        }
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance responded with ${response.status}`);
      }

      const json = await response.json();
      const result = json?.chart?.result?.[0];

      if (!result) {
        return res.status(404).json({ error: 'No data found for symbol: ' + symbol });
      }

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const opens = result.indicators?.quote?.[0]?.open || [];
      const highs = result.indicators?.quote?.[0]?.high || [];
      const lows = result.indicators?.quote?.[0]?.low || [];
      const volumes = result.indicators?.quote?.[0]?.volume || [];

      const data = timestamps
        .map((t, i) => ({
          time: t,
          open: opens[i] || 0,
          high: highs[i] || 0,
          low: lows[i] || 0,
          close: closes[i] || 0,
          volume: volumes[i] || 0
        }))
        .filter(d => d.close > 0);

      return res.status(200).json({ success: true, symbol, interval, data });
    }
  } catch (error) {
    console.error('K-lines API error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch klines: ' + error.message });
  }
};
