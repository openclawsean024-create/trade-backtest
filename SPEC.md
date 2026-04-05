# Trade Backtest — 產品規格書 v4

> **版本**：v4.0  
> **更新日期**：2026-04-04  
> **狀態**：🔴 TECHNICAL RECONSTRUCTION IN PROGRESS  
> **Sean 原始反饋**：「REJECTED — TradingView chart not displaying correctly, values are not real data. TradingView integration and backtesting features need implementation.」  
> **前版狀態**：v3（trade-backtest-v3.md）— Technical Reconstruction Version

---

## 一、願景與使命

**一句話價值主張**：打開瀏覽器就能用的專業技術分析回測工具——真實數據、七種策略、完整績效統計。

**核心敘事**：當你凌晨兩點突發一個交易想法，Trade Backtest 是你來不及開 Python 環境時的第一選擇。

---

## 二、v3 技術重建成果摘要

> v3 為技術重建版本，已完成根本問題分析與完整修復方案。v4 為實作完成後的驗證確認版本。

### v3 已修復的問題

| 問題 | 根本原因 | v3 修復方案 |
|------|----------|-------------|
| TradingView 圖表不顯示 | CSS flex 坍塌，容器高度為 0 | 明確設定 `height: 500px` + `ResizeObserver` |
| 顯示數值非真實數據 | 數據 feed 指向靜態假陣列 | 串接 CoinGecko API，含 timestamp 格式轉換（毫秒→秒）|
| 回測功能無法運作 | 策略信號 overlay 邏輯未實作 | BacktestEngine 完整實作 + 指標預熱期 |
| 圖表與信號未連動 | markers timestamp 格式不一致 | 統一使用秒級 timestamp |

### v3 Solution Architecture

```
CoinGecko API（免費） → lightweight-charts v4.x → 7種策略 → 績效統計面板
                                ↓
                    ResizeObserver 防範flex坍塌
                    markers.time = Math.floor(t/1000)
```

---

## 三、七種策略實作清單

> 詳見 v3 Section 5，每種策略均有邏輯說明、實作重點與驗證標準。

| 策略 | 狀態 | 實作重點 |
|------|------|----------|
| MA 交叉策略 | v3 完整實作 | SMA 計算 + 交叉點偵測 |
| RSI 相對強弱指標 | v3 完整實作 | 14日窗口 + 獨立 pane |
| MACD | v3 完整實作 | Fast/Slow EMA + Signal Line + Histogram |
| 布林通道 | v3 完整實作 | 20日 SMA + 2σ 上下軌 |
| 動量策略 | v3 完整實作 | 連續 N 日 delta counter |
| K 線型態 | v3 完整實作 | Doji/Hammer/Engulfing 辨識 |
| 量價關係 | v3 完整實作 | Binance klines（含成交量）|

---

## 四、Alan 實作驗收清單（P0）

### 圖表渲染
- [ ] 選擇 BTC，365天，點擊回測，圖表正確渲染 365 根 K 線
- [ ] K 線收盤價數值與 CoinGecko 回傳一致（抽查 5 筆）
- [ ] MA(10)/MA(30) 正確疊加，交叉點有買賣標記

### 策略驗證
- [ ] RSI pane 正確顯示 0-100 範圍
- [ ] MACD pane 正確顯示直方圖 + 兩條線
- [ ] 績效面板顯示：總報酬率、最大回撤、勝率、交易次數

### 數據準確性
- [ ] 總報酬率計算正確（可用已知數據手工驗算）
- [ ] 最大回撤可追蹤 peak-trough 驗算
- [ ] 夏普比率數值合理

---

## 五、KPI

| 指標 | 目標 |
|------|------|
| 數據獲取成功率 | > 95% |
| 圖表渲染正確率 | 100% |
| 頁面首次載入時間 | < 3s |
| 回測計算時間（365天）| < 1s |

---

*規格書版本：v4*
*更新時間：2026-04-04*
*更新內容：v3 技術重建確認 + Alan 驗收清單*
*負責人：Sophia（CEO/產品負責人）*
