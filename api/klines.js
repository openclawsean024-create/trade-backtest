module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const symbol = (req.query.symbol || '').toUpperCase().trim();
  const days = Math.max(1, Math.min(parseInt(req.query.days || '90'), 365));
  const interval = (req.query.interval || '1d').toLowerCase();

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const stockSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'META', 'NVDA', 'AMD'];
  const isCrypto = !stockSymbols.includes(symbol);

  // CoinGecko ID mapping for supported crypto symbols
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
      const coinId = coinGeckoIds[symbol];
      if (!coinId) {
        return res.status(400).json({ error: 'Unsupported crypto symbol: ' + symbol });
      }

      // CoinGecko OHLC endpoint: returns [timestamp, open, high, low, close]
      const cgUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;

      const response = await fetch(cgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const ohlc = await response.json();

      if (!Array.isArray(ohlc) || ohlc.length === 0) {
        return res.status(404).json({ error: 'No CoinGecko data found for ' + symbol });
      }

      // Map CoinGecko OHLC to our format (timestamps are in milliseconds)
      const data = ohlc.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: k[1],
        high: k[2],
        low: k[3],
        close: k[4],
        volume: 0 // CoinGecko OHLC doesn't include volume, set to 0
      }));

      return res.status(200).json({ success: true, symbol, interval, data, source: 'coingecko' });
    } else {
      // Yahoo Finance for stocks
      const end = Math.floor(Date.now() / 1000);
      const start = end - days * 86400;
      const yfInterval = interval === '1w' ? '1wk' : interval === '1d' ? '1d' : interval;

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${start}&period2=${end}&interval=${yfInterval}`;

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

      return res.status(200).json({ success: true, symbol, interval, data, source: 'yahoo' });
    }
  } catch (error) {
    console.error('K-lines API error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch klines: ' + error.message });
  }
};
