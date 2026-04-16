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
  const [symbol, setSymbol] = useState('BTC');
  const [btcLoaded, setBtcLoaded] = useState(false);
  const [ethLoaded, setEthLoaded] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#010409', color: '#e6edf3', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #30363d', paddingBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>加密貨幣交易回測工具</h1>
        <p style={{ color: '#8b949e', margin: '0.5rem 0 0' }}>資料來源：CoinGecko 公開 API（不需要 API Key）</p>
      </header>

      <section>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>比特幣 / 以太幣 K 線圖（近30天）</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
          <div style={{ background: '#161b22', borderRadius: '8px', padding: '1rem', border: '1px solid #30363d' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#f7931a' }}>Bitcoin (BTC)</h3>
            <CoinChart coinId="bitcoin" coinName="比特幣 BTC" />
          </div>
          <div style={{ background: '#161b22', borderRadius: '8px', padding: '1rem', border: '1px solid #30363d' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#627eea' }}>Ethereum (ETH)</h3>
            <CoinChart coinId="ethereum" coinName="以太幣 ETH" />
          </div>
        </div>
      </section>
    </div>
  );
}