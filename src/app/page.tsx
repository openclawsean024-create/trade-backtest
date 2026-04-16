'use client';

import { useEffect, useRef, useState } from 'react';

interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartModule {
  CandlestickSeries: any;
  ColorType: any;
  CrosshairMode: any;
  createChart: (container: HTMLElement, options: any) => any;
}

async function loadTradingChart(): Promise<ChartModule> {
  const mod = await import('lightweight-charts');
  return mod as unknown as ChartModule;
}

async function fetchOHLC(coinId: string, days: number): Promise<CandlestickData[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url);
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 30000));
    return fetchOHLC(coinId, days);
  }
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const data: number[][] = await res.json();
  return data.map(([t, o, h, l, c]) => ({ time: t / 1000, open: o, high: h, low: l, close: c }));
}

function CoinChart({ coinId, coinName }: { coinId: string; coinName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const TradingChart = await loadTradingChart();
        if (!containerRef.current || !mounted) return;

        const chart = TradingChart.createChart(containerRef.current, {
          layout: { background: { type: TradingChart.ColorType.Solid, color: '#0d1117' }, textColor: '#e6edf3' },
          grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
          crosshair: { mode: TradingChart.CrosshairMode.Normal },
          timeScale: { borderColor: '#30363d', timeVisible: true },
          rightPriceScale: { borderColor: '#30363d' },
          width: containerRef.current.clientWidth,
          height: 300,
        });

        const series = chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderDownColor: '#ef5350',
          borderUpColor: '#26a69a',
          wickDownColor: '#ef5350',
          wickUpColor: '#26a69a',
        });

        chartRef.current = chart;
        seriesRef.current = series;

        const data = await fetchOHLC(coinId, 30);
        series.setData(data);
        chart.timeScale().fitContent();

        const resizeObserver = new ResizeObserver(() => {
          if (containerRef.current && chartRef.current) {
            chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
          }
        });
        resizeObserver.observe(containerRef.current);

        setLoading(false);
      } catch (e: any) {
        if (mounted) setError(e.message);
      }
    })();
    return () => { mounted = false; };
  }, [coinId]);

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ color: '#e6edf3', marginBottom: '0.5rem' }}>{coinName}</h2>
      {loading && <p style={{ color: '#8b949e' }}>載入 K 線圖...</p>}
      {error && <p style={{ color: '#f85149' }}>錯誤：{error}</p>}
      <div ref={containerRef} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #30363d' }} />
    </div>
  );
}

export default function Home() {
  const [symbol, setSymbol] = useState('bitcoin'); // 'bitcoin' | 'ethereum'
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const COIN_MAP: Record<string, { id: string; name: string; color: string }> = {
    bitcoin: { id: 'bitcoin', name: '比特幣 BTC', color: '#f7931a' },
    ethereum: { id: 'ethereum', name: '以太幣 ETH', color: '#627eea' },
  };

  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchOHLC(symbol, 30);
        if (!mounted) return;
        setChartData(data);

        // Destroy old chart if exists
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          seriesRef.current = null;
        }

        if (!containerRef.current) return;
        const TradingChart = await loadTradingChart();
        if (!mounted || !containerRef.current) return;

        const chart = TradingChart.createChart(containerRef.current, {
          layout: { background: { type: TradingChart.ColorType.Solid, color: '#0d1117' }, textColor: '#e6edf3' },
          grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
          crosshair: { mode: TradingChart.CrosshairMode.Normal },
          timeScale: { borderColor: '#30363d', timeVisible: true },
          rightPriceScale: { borderColor: '#30363d' },
          width: containerRef.current.clientWidth,
          height: 400,
        });

        const series = chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderDownColor: '#ef5350',
          borderUpColor: '#26a69a',
          wickDownColor: '#ef5350',
          wickUpColor: '#26a69a',
        });

        chartRef.current = chart;
        seriesRef.current = series;
        series.setData(data);
        chart.timeScale().fitContent();

        resizeObserver = new ResizeObserver(() => {
          if (containerRef.current && chartRef.current) {
            chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
          }
        });
        resizeObserver.observe(containerRef.current);
        setLoading(false);
      } catch (e: any) {
        if (mounted) setError(e.message);
      }
    })();
    return () => {
      mounted = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [symbol]);

  const coin = COIN_MAP[symbol];

  return (
    <div style={{ minHeight: '100vh', background: '#010409', color: '#e6edf3', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #30363d', paddingBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>加密貨幣交易回測工具</h1>
        <p style={{ color: '#8b949e', margin: '0.5rem 0 0' }}>資料來源：CoinGecko 公開 API（不需要 API Key）</p>
      </header>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>K 線圖（近30天）</h2>
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            style={{
              background: '#161b22',
              color: '#e6edf3',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '0.4rem 0.75rem',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            <option value="bitcoin">比特幣 (BTC)</option>
            <option value="ethereum">以太幣 (ETH)</option>
          </select>
        </div>

        <div style={{ background: '#161b22', borderRadius: '8px', padding: '1rem', border: '1px solid #30363d', maxWidth: 800 }}>
          <h3 style={{ margin: '0 0 1rem', color: coin.color }}>{coin.name}</h3>
          {loading && <p style={{ color: '#8b949e' }}>載入 K 線圖...</p>}
          {error && <p style={{ color: '#f85149' }}>錯誤：{error}</p>}
          {!loading && !error && chartData.length === 0 && <p style={{ color: '#8b949e' }}>無資料</p>}
          <div ref={containerRef} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #30363d' }} />
        </div>
      </section>
    </div>
  );
}