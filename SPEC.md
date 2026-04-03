# 【Trading Backtest Tool】規格計劃書

## 1. 專案概述

### 1.1 專案背景與目的

散戶投資人在網路上學了一套「神奇策略」，但上線真金白銀測試後才發現——過去三年模擬早就顯示這個策略會虧錢，只是自己沒有工具驗證。TradingView 的 Pine Script 強大但學習曲線陡峭，一般投資人很難快速把想法轉化為可回測的策略。本工具提供「視覺化策略編輯器」：不需要寫程式碼，用 IF→THEN 的方式拖放條件方塊，即可建立交易策略；同時支援直接匯入 Pine Script。回測結果以完整風險儀表板呈現（總報酬/最大回落/夏普比率），最後支援即時模擬交易（Paper Trading）。
### 1.2 目標受眾（TA）

- 散戶投資人 — 想驗證自己學到的交易策略是否有效，但不會寫 Pine Script
- 量化交易學習者 — 需要一個工具快速原型驗證交易點子
- 加密貨幣愛好者 — 想要回測幣圈策略，但 Binance/Bybit 官方工具功能有限
- 交易教學者 — 需要一個工具向學生展示交易策略如何運作
### 1.3 專案範圍

### In Scope（做）

- 視覺化條件編輯器（IF → THEN 邏輯方塊）
- Pine Script 匯入 / 技術指標選擇（MA / RSI / MACD / Bollinger Bands / KD）
- 支援交易所歷史數據（Binance / OKX / Bybit）
- 自定義手續費 / 滑點設定 / 多時間框架（1m/5m/15m/1h/4h/1d）
- 完整風險儀表板（總報酬/最大回落/夏普比率/勝率/利潤因子）
- 即時模擬交易（Paper Trading，串接交易所即時行情）
- 交易記錄匯出 / 策略儲存與管理
### Out of Scope（不做）

- 實際下單交易（只有模擬）/ 風險管理（如固定倉位計算器）/ 機器人自動交易
## 2. 資訊架構與動線

### 2.1 網站地圖（Sitemap）

Trading Backtest Tool：策略編輯器（主要頁面）→ 回測結果頁 → 即時模擬頁（Paper Trading）→ 策略管理 → 交易所設定 → 設定
### 2.2 使用者動線

```mermaid\nflowchart TD\n    A([用戶進入編輯器]) --> B{意圖}\n    B -->|從零建立| C[拖放條件方塊建立策略]\n    B -->|匯入 Pine Script| D[貼上 Pine Script 並解析]\n    C --> E[選擇時間框架與交易所]\n    D --> E\n    E --> F[設定初始資金與手續費]\n    F --> G[點擊執行回測]\n    G --> H[系統拉取歷史 K 線資料]\n    H --> I[引擎計算策略信號]\n    I --> J[顯示回測結果]\n    J --> K{結果滿意?}\n    K -->|是| L[進入即時模擬]\n    K -->|否| M[調整條件方塊或參數]\n    M --> G\n    L --> N[串接交易所即時行情]\n    N --> O[訊號自動產生，模擬成交]\n    O --> P[觀察倉位與權益變化]\n    P --> Q([結束或持續監控])\n```
### 2.3 使用者旅程圖

```mermaid\njourney\n    title 交易回測旅程\n    section 建立策略\n      有了一個交易想法: 5: 散戶投資人\n      用 IF-THEN 方塊建立策略: 5: 量化學習者\n      匯入 Pine Script 作為參考: 4: 進階交易者\n    section 回測驗證\n      點擊執行回測: 5: 所有用戶\n      等待結果出來: 4: 散戶投資人\n      看到最大回落 40% 震驚: 5: 散戶\n      看到夏普比率 0.8 感到滿意: 4: 量化學習者\n    section 調整階段\n      調整手續費與滑點設定: 4: 所有用戶\n      修改進場/出場條件: 5: 交易教學者\n    section 實盤前驗證\n      進入即時模擬: 5: 所有用戶\n      觀察一段時間的訊號: 4: 加密貨幣愛好者\n      確認策略在實盤市場也有信號: 5: 量化學習者\n```
## 3. 視覺與 UI

### 3.1 品牌設計指南

- Primary: #6366F1 / Secondary: #0F172A / Background: #0B0F19 / Card BG: #1F2937
- Accent Green: #10B981（多頭進場、盈利）/ Accent Red: #EF4444（空頭進場、虧損）
- Warning: #F59E0B / Chart Line: #3B82F6 / 字體：Inter + JetBrains Mono（數字）
## 4. 前端功能規格

- 視覺化策略編輯器：React Flow，IF-THEN 方塊拖放，連接線呈現邏輯
- 條件方塊：技術指標交叉（MA 金叉/死叉）、RSI 超買超賣、價格突破、成交量放大
- 動作方塊：進場（做多/做空）、出金（全平/一半）、通知
- Pine Script 匯入：解析 Pine Script v5 語法，轉為視覺化方塊
- 時間框架：1m/5m/15m/1h/4h/1d / 交易所：Binance / OKX / Bybit
- 手續費/滑點設定 / 初始資金設定（USDT 或 BTC）
- 權益曲線圖：Chart.js，顯示淨值變化 vs 基準（買入持有）
- 風險儀表板：總報酬/最大回落/夏普比率/勝率/利潤因子/平均持倉時間
- 交易明細列表：每筆交易（時間/方向/價格/數量/盈虧），可點擊跳至 K 線圖標記
- 即時模擬（Paper Trading）：WebSocket 串接交易所即時行情，模擬下單不真實成交
- 策略儲存與管理 / 策略比較（最多3個）/ CSV/JSON 匯出
## 5. 後端與技術規格

### 5.1 技術棧

- 前端框架：Next.js 14（App Router）+ Tailwind CSS + React Flow
- K 線圖表：TradingView Lightweight Charts
- 後端回測引擎：Python（backtrader 或 vectorbt）
- 即時行情：WebSocket（Binance/OKX/Bybit 官方 SDK）
- 後端框架：FastAPI / 資料庫：PostgreSQL / 部署：Railway + Vercel
## 6. 專案時程與驗收標準

### 6.1 里程碑時程

```mermaid\ntimeline\n    title Trading Backtest Tool 開發時程\n    phase 1: 策略引擎 (Week 1-2)\n        Python backtrader 整合 : 4 days\n        技術指標計算實作 : 4 days\n        Pine Script 解析器 : 5 days\n    phase 2: 交易所串接 (Week 3)\n        Binance K 線 API 串接 : 3 days\n        OKX / Bybit API 串接 : 3 days\n        手續費 / 滑點模型 : 2 days\n    phase 3: 前端編輯器 (Week 4-5)\n        React Flow 策略 Canvas : 5 days\n        條件 / 動作方塊實作 : 4 days\n        Pine Script 匯入 UI : 3 days\n    phase 4: 回測結果 (Week 6)\n        權益曲線圖 : 2 days\n        風險儀表板 : 3 days\n        交易明細列表 : 2 days\n    phase 5: 即時模擬 (Week 7)\n        WebSocket 即時行情串接 : 4 days\n        模擬下單引擎 : 3 days\n    phase 6: 測試與交付 (Week 8-9)\n        回測準確率驗證 : 3 days\n        交易所串接測試 : 2 days\n        Bug 修復與文件 : 4 days\n```
### 6.2 驗收標準

- 支援瀏覽器：Chrome 120+、Firefox 120+ / 回測準確率 > 99%
- 策略Canvas操作流暢度：60 FPS 拖放 / 策略儲存成功率 > 99%
- 使用者滿意度 > 4/5 / 平均使用時長 > 15 分鐘 / 即時行情延遲 < 1 秒
## 7. 功能勾選清單

### 前端

### 後端

### DevOps

