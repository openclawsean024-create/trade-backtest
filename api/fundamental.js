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

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com'
  };

  const formatLargeNumber = (num) => {
    if (num === null || num === undefined || Number.isNaN(Number(num))) return 'N/A';
    if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    return '$' + Number(num).toLocaleString();
  };

  const formatVolume = (num) => {
    if (num === null || num === undefined || Number.isNaN(Number(num))) return 'N/A';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return Number(num).toString();
  };

  const extractNumber = (value) => {
    if (value && typeof value === 'object' && 'raw' in value) return value.raw;
    return value;
  };

  const buildData = (result) => {
    const sd = result.summaryDetail || {};
    const ks = result.defaultKeyStatistics || {};
    const fd = result.financialData || {};
    const priceData = result.price || {};

    return {
      symbol,
      price: extractNumber(priceData.regularMarketPrice) ?? extractNumber(priceData.postMarketPrice) ?? extractNumber(priceData.preMarketPrice) ?? 'N/A',
      marketCap: formatLargeNumber(extractNumber(sd.marketCap)),
      marketCapRaw: extractNumber(sd.marketCap) || 0,
      pe: extractNumber(sd.trailingPE) ? Number(extractNumber(sd.trailingPE)).toFixed(2) : 'N/A',
      forwardPE: extractNumber(sd.forwardPE) ? Number(extractNumber(sd.forwardPE)).toFixed(2) : 'N/A',
      eps: extractNumber(ks.trailingEps) ? Number(extractNumber(ks.trailingEps)).toFixed(2) : 'N/A',
      priceToBook: extractNumber(sd.priceToBook) ? Number(extractNumber(sd.priceToBook)).toFixed(2) : 'N/A',
      enterpriseValue: formatLargeNumber(extractNumber(sd.enterpriseValue)),
      beta: extractNumber(ks.beta) ? Number(extractNumber(ks.beta)).toFixed(2) : 'N/A',
      week52High: extractNumber(sd.fiftyTwoWeekHigh) ? Number(extractNumber(sd.fiftyTwoWeekHigh)).toFixed(2) : 'N/A',
      week52Low: extractNumber(sd.fiftyTwoWeekLow) ? Number(extractNumber(sd.fiftyTwoWeekLow)).toFixed(2) : 'N/A',
      avgVolume: formatVolume(extractNumber(sd.averageVolume) || extractNumber(sd.averageVolume?.fmt)),
      revenue: formatLargeNumber(extractNumber(fd.totalRevenue)),
      grossMargin: extractNumber(fd.grossMargins) !== undefined ? (Number(extractNumber(fd.grossMargins)) * 100).toFixed(1) + '%' : 'N/A',
      opMargin: extractNumber(fd.operatingMargins) !== undefined ? (Number(extractNumber(fd.operatingMargins)) * 100).toFixed(1) + '%' : 'N/A',
      netMargin: extractNumber(fd.profitMargins) !== undefined ? (Number(extractNumber(fd.profitMargins)) * 100).toFixed(1) + '%' : 'N/A',
      roe: extractNumber(fd.returnOnEquity) !== undefined ? (Number(extractNumber(fd.returnOnEquity)) * 100).toFixed(1) + '%' : 'N/A',
      debtToEquity: extractNumber(fd.debtToEquity) ? Number(extractNumber(fd.debtToEquity)).toFixed(1) : 'N/A',
      dividend: extractNumber(sd.dividendRate) ? '$' + Number(extractNumber(sd.dividendRate)).toFixed(2) : 'N/A',
      divYield: extractNumber(sd.dividendYield) ? (Number(extractNumber(sd.dividendYield)) * 100).toFixed(2) + '%' : 'N/A',
      analystTarget: extractNumber(fd.growthTargets?.priceTargetAverage)
        ? '$' + Number(extractNumber(fd.growthTargets.priceTargetAverage)).toFixed(2)
        : 'N/A',
      recommendation: fd.recommendationKey || 'N/A',
      numberOfAnalysts: extractNumber(ks.numberOfAnalystOpinions) || 'N/A',
      totalCash: formatLargeNumber(extractNumber(fd.totalCash)),
      totalDebt: formatLargeNumber(extractNumber(fd.totalDebt)),
      operatingCashflow: formatLargeNumber(extractNumber(fd.operatingCashflow)),
      freeCashflow: formatLargeNumber(extractNumber(fd.freeCashflow)),
      sector: priceData.sector || 'N/A',
      industry: priceData.industry || 'N/A',
      longName: priceData.shortName || priceData.longName || symbol,
      currency: priceData.currency || 'USD',
      marketState: priceData.marketState || 'N/A'
    };
  };

  const fetchYahooJson = async (url) => {
    const response = await fetch(url, { headers });
    const text = await response.text();

    // Check HTTP status first, before attempting JSON parse
    if (!response.ok) {
      const snippet = text ? text.slice(0, 150).replace(/\s+/g, ' ') : 'empty body';
      throw new Error(`HTTP ${response.status}: ${snippet}`);
    }

    try {
      const json = JSON.parse(text);
      return { response, json };
    } catch (parseError) {
      // Non-JSON response even with 200 OK — still an error
      const snippet = text ? text.slice(0, 150).replace(/\s+/g, ' ') : 'empty response';
      throw new Error(`Yahoo Finance returned non-JSON (HTTP 200): ${snippet}`);
    }
  };

  const quoteSummaryUrl = `https://query2.finance.yahoo.com/v7/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent('summaryDetail,defaultKeyStatistics,financialData,price')}`;
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false&events=div,splits`;

  try {
    const { response, json } = await fetchYahooJson(quoteSummaryUrl);
    // response.ok already validated inside fetchYahooJson
    const result = json?.quoteSummary?.result?.[0];
    if (result) {
      return res.status(200).json({ success: true, data: buildData(result), source: 'quoteSummary' });
    }
    throw new Error('quoteSummary returned empty result');
  } catch (primaryError) {
    try {
      const { response, json } = await fetchYahooJson(chartUrl);
      // response.ok already validated inside fetchYahooJson
      const result = json?.chart?.result?.[0];
      const meta = result?.meta || {};
      if (!result || !meta) {
        throw new Error('Yahoo chart returned empty result');
      }

      const fallbackData = {
        symbol,
        price: extractNumber(meta.regularMarketPrice) ?? 'N/A',
        marketCap: 'N/A',
        marketCapRaw: 0,
        pe: 'N/A',
        forwardPE: 'N/A',
        eps: 'N/A',
        priceToBook: 'N/A',
        enterpriseValue: 'N/A',
        beta: 'N/A',
        week52High: extractNumber(meta.fiftyTwoWeekHigh) ? Number(extractNumber(meta.fiftyTwoWeekHigh)).toFixed(2) : 'N/A',
        week52Low: extractNumber(meta.fiftyTwoWeekLow) ? Number(extractNumber(meta.fiftyTwoWeekLow)).toFixed(2) : 'N/A',
        avgVolume: formatVolume(extractNumber(meta.averageDailyVolume3Month) || extractNumber(meta.regularMarketVolume)),
        revenue: 'N/A',
        grossMargin: 'N/A',
        opMargin: 'N/A',
        netMargin: 'N/A',
        roe: 'N/A',
        debtToEquity: 'N/A',
        dividend: 'N/A',
        divYield: 'N/A',
        analystTarget: 'N/A',
        recommendation: 'N/A',
        numberOfAnalysts: 'N/A',
        totalCash: 'N/A',
        totalDebt: 'N/A',
        operatingCashflow: 'N/A',
        freeCashflow: 'N/A',
        sector: meta.instrumentType || 'N/A',
        industry: 'N/A',
        longName: meta.longName || meta.shortName || symbol,
        currency: meta.currency || 'USD',
        marketState: meta.marketState || 'N/A'
      };

      return res.status(200).json({ success: true, data: fallbackData, source: 'chartFallback', warning: primaryError.message });
    } catch (fallbackError) {
      console.error('Fundamental API error:', fallbackError.message);
      return res.status(500).json({ error: 'Failed to fetch data: ' + fallbackError.message });
    }
  }
};
