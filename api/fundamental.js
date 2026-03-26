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

  // Map symbol to Yahoo Finance format
  const yahooSymbol = symbol.endsWith('.') ? symbol : symbol;

  try {
    const modules = encodeURIComponent(
      'summaryDetail,defaultKeyStatistics,financialData,earnings,price'
    );
    const url = `https://query1.finance.yahoo.com/v7/finance/quoteSummary/${yahooSymbol}?modules=${modules}&crumb=%2F9m1LZdJCHD`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/',
        'Cookie': ''
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance responded with ${response.status}`);
    }

    const json = await response.json();
    const result = json?.quoteSummary?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: 'No data found for symbol: ' + symbol });
    }

    const sd = result.summaryDetail || {};
    const ks = result.defaultKeyStatistics || {};
    const fd = result.financialData || {};
    const priceData = result.price || {};

    const formatLargeNumber = (num) => {
      if (!num && num !== 0) return 'N/A';
      if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
      if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
      if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
      return '$' + num.toLocaleString();
    };

    const formatVolume = (num) => {
      if (!num) return 'N/A';
      if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
      if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
      if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
      return num.toString();
    };

    const data = {
      symbol,
      price: priceData.regularMarketPrice?.raw || priceData.regularMarketPrice || 'N/A',
      marketCap: formatLargeNumber(sd.marketCap?.raw),
      marketCapRaw: sd.marketCap?.raw || 0,
      pe: sd.trailingPE?.raw ? sd.trailingPE.raw.toFixed(2) : 'N/A',
      forwardPE: sd.forwardPE?.raw ? sd.forwardPE.raw.toFixed(2) : 'N/A',
      eps: ks.trailingEps?.raw ? ks.trailingEps.raw.toFixed(2) : 'N/A',
      priceToBook: sd.priceToBook?.raw ? sd.priceToBook.raw.toFixed(2) : 'N/A',
      enterpriseValue: formatLargeNumber(sd.enterpriseValue?.raw),
      beta: ks.beta?.raw ? ks.beta.raw.toFixed(2) : 'N/A',
      week52High: sd.fiftyTwoWeekHigh?.raw ? sd.fiftyTwoWeekHigh.raw.toFixed(2) : 'N/A',
      week52Low: sd.fiftyTwoWeekLow?.raw ? sd.fiftyTwoWeekLow.raw.toFixed(2) : 'N/A',
      avgVolume: formatVolume(sd.averageVolume?.raw || sd.averageVolume?.fmt),
      revenue: formatLargeNumber(fd.totalRevenue?.raw),
      grossMargin: fd.grossMargins?.raw ? (fd.grossMargins.raw * 100).toFixed(1) + '%' : 'N/A',
      opMargin: fd.operatingMargins?.raw ? (fd.operatingMargins.raw * 100).toFixed(1) + '%' : 'N/A',
      netMargin: fd.profitMargins?.raw ? (fd.profitMargins.raw * 100).toFixed(1) + '%' : 'N/A',
      roe: fd.returnOnEquity?.raw ? (fd.returnOnEquity.raw * 100).toFixed(1) + '%' : 'N/A',
      debtToEquity: fd.debtToEquity?.raw ? fd.debtToEquity.raw.toFixed(1) : 'N/A',
      dividend: sd.dividendRate?.raw ? '$' + sd.dividendRate.raw.toFixed(2) : 'N/A',
      divYield: sd.dividendYield?.raw ? (sd.dividendYield.raw * 100).toFixed(2) + '%' : 'N/A',
      analystTarget: fd.growthTargets?.priceTargetAverage?.raw
        ? '$' + fd.growthTargets.priceTargetAverage.raw.toFixed(2)
        : 'N/A',
      recommendation: fd.recommendationKey || 'N/A',
      numberOfAnalysts: ks.numberOfAnalystOpinions?.raw || 'N/A',
      totalCash: formatLargeNumber(fd.totalCash?.raw),
      totalDebt: formatLargeNumber(fd.totalDebt?.raw),
      operatingCashflow: formatLargeNumber(fd.operatingCashflow?.raw),
      freeCashflow: formatLargeNumber(fd.freeCashflow?.raw),
      sector: priceData.sector || 'N/A',
      industry: priceData.industry || 'N/A',
      longName: priceData.shortName || priceData.longName || symbol,
      currency: priceData.currency || 'USD',
      marketState: priceData.marketState || 'N/A'
    };

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Fundamental API error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch data: ' + error.message });
  }
};
