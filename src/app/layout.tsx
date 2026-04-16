import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '加密貨幣交易回測工具',
  description: '比特幣/以太幣 K 線圖與回測（CoinGecko 公開 API）',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}