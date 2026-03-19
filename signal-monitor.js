#!/usr/bin/env node
/**
 * Trade Signal Monitor
 * Real-time trading signal detection with Telegram notifications
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Config
const CONFIG_FILE = path.join(__dirname, 'config.json');
const LOG_FILE = path.join(__dirname, 'signal_log.json');

// Default config — tokens MUST come from environment variables in production
const DEFAULT_CONFIG = {
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    keywords: ['golden cross', 'death cross', 'bullish', 'bearish'],
    intervals: ['1h', '4h', '1d'],
    // ⚠️ 安全修正：嚴禁將 token 寫入程式碼，使用環境變數
    telegram_token: process.env.TELEGRAM_BOT_TOKEN || '',
    telegram_chat_id: process.env.TELEGRAM_CHAT_ID || ''
};

// Load config — environment variables take priority (security: tokens must not be in files)
function loadConfig() {
    try {
        const file = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        return {
            ...DEFAULT_CONFIG,
            ...file,
            telegram_token: process.env.TELEGRAM_BOT_TOKEN || file.telegram_token || '',
            telegram_chat_id: process.env.TELEGRAM_CHAT_ID || file.telegram_chat_id || ''
        };
    } catch (e) {
        return DEFAULT_CONFIG;
    }
}

// Save config
function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Load signal log
function loadSignalLog() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        }
    } catch (e) {}
    return { signals: [], last_check: null };
}

// Save signal log
function saveSignalLog(log) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
}

// Fetch OHLCV data from Binance
function fetchOHLCV(symbol, interval, limit = 100) {
    return new Promise((resolve, reject) => {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const klines = JSON.parse(data);
                    const ohlcv = klines.map(k => ({
                        time: Math.floor(k[0] / 1000),
                        open: parseFloat(k[1]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[3]),
                        close: parseFloat(k[4]),
                        volume: parseFloat(k[5])
                    }));
                    resolve(ohlcv);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Calculate Moving Average
function calculateMA(data, period) {
    const ma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            ma.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
            }
            ma.push(sum / period);
        }
    }
    return ma;
}

// Calculate RSI
function calculateRSI(data, period = 14) {
    const rsi = [];
    let gains = 0, losses = 0;
    
    for (let i = 1; i < data.length; i++) {
        const change = data[i].close - data[i-1].close;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
        
        if (i < period) {
            rsi.push(null);
        } else {
            const avgGain = gains / period;
            const avgLoss = losses / period;
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
            
            gains = gains * (period - 1) / period;
            losses = losses * (period - 1) / period;
        }
    }
    return rsi;
}

// Calculate MACD
function calculateMACD(data, fast = 12, slow = 26, signal = 9) {
    const ema = (arr, p) => {
        const k = 2 / (p + 1);
        const result = [arr[0]];
        for (let i = 1; i < arr.length; i++) {
            result.push(arr[i] * k + result[i-1] * (1 - k));
        }
        return result;
    };
    
    const closes = data.map(d => d.close);
    const fastEMA = ema(closes, fast);
    const slowEMA = ema(closes, slow);
    const macdLine = fastEMA.map((f, i) => f - slowEMA[i]);
    const signalLine = ema(macdLine, signal);
    const histogram = macdLine.map((m, i) => m - signalLine[i]);
    
    return { macdLine, signalLine, histogram };
}

// Detect trading signals
function detectSignals(data, symbol) {
    const signals = [];
    const now = data[data.length - 1];
    const prev = data[data.length - 2];
    
    // MA Crossover
    const ma20 = calculateMA(data, 20);
    const ma50 = calculateMA(data, 50);
    const ma200 = calculateMA(data, 200);
    
    if (ma20.length >= 2 && ma50.length >= 2) {
        // Golden Cross (MA20 crosses above MA50)
        if (ma20[ma20.length - 2] < ma50[ma50.length - 2] && ma20[ma20.length - 1] > ma50[ma50.length - 1]) {
            signals.push({
                type: 'BUY',
                reason: 'Golden Cross (MA20/MA50)',
                price: now.close,
                symbol
            });
        }
        // Death Cross (MA20 crosses below MA50)
        if (ma20[ma20.length - 2] > ma50[ma50.length - 2] && ma20[ma20.length - 1] < ma50[ma50.length - 1]) {
            signals.push({
                type: 'SELL',
                reason: 'Death Cross (MA20/MA50)',
                price: now.close,
                symbol
            });
        }
    }
    
    // RSI
    const rsi = calculateRSI(data);
    const currentRSI = rsi[rsi.length - 1];
    if (currentRSI < 30) {
        signals.push({
            type: 'BUY',
            reason: `RSI Oversold (${currentRSI.toFixed(1)})`,
            price: now.close,
            symbol
        });
    } else if (currentRSI > 70) {
        signals.push({
            type: 'SELL',
            reason: `RSI Overbought (${currentRSI.toFixed(1)})`,
            price: now.close,
            symbol
        });
    }
    
    // MACD
    const macd = calculateMACD(data);
    const hist = macd.histogram;
    if (hist.length >= 2) {
        if (hist[hist.length - 2] < 0 && hist[hist.length - 1] > 0) {
            signals.push({
                type: 'BUY',
                reason: 'MACD Golden Cross',
                price: now.close,
                symbol
            });
        } else if (hist[hist.length - 2] > 0 && hist[hist.length - 1] < 0) {
            signals.push({
                type: 'SELL',
                reason: 'MACD Death Cross',
                price: now.close,
                symbol
            });
        }
    }
    
    // Price momentum
    const change24h = ((now.close - data[data.length - 24].close) / data[data.length - 24].close) * 100;
    if (change24h > 5) {
        signals.push({
            type: 'SELL',
            reason: `Strong momentum +${change24h.toFixed(1)}% (24h)`,
            price: now.close,
            symbol
        });
    } else if (change24h < -5) {
        signals.push({
            type: 'BUY',
            reason: `Strong downside -${Math.abs(change24h).toFixed(1)}% (24h)`,
            price: now.close,
            symbol
        });
    }
    
    return signals;
}

// Send Telegram notification
function sendTelegram(message, config) {
    return new Promise((resolve, reject) => {
        const { telegram_token, telegram_chat_id } = config;
        
        if (!telegram_token || !telegram_chat_id) {
            console.log('[WARN] Telegram not configured');
            resolve(false);
            return;
        }
        
        const data = JSON.stringify({
            chat_id: telegram_chat_id,
            text: message,
            parse_mode: 'HTML'
        });
        
        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${telegram_token}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.ok) {
                        console.log('✅ Telegram notification sent');
                        resolve(true);
                    } else {
                        console.log('❌ Telegram error:', result.description);
                        resolve(false);
                    }
                } catch (e) {
                    resolve(false);
                }
            });
        });
        
        req.on('error', (e) => {
            console.log('❌ Telegram error:', e.message);
            resolve(false);
        });
        
        req.write(data);
        req.end();
    });
}

// Main monitoring function
async function monitorSignals(config) {
    console.log('==================================================');
    console.log('📈 Trade Signal Monitor Started');
    console.log('==================================================');
    
    console.log(`Symbols: ${config.symbols.join(', ')}`);
    console.log(`Intervals: ${config.intervals.join(', ')}`);
    console.log('--------------------------------------------------');
    
    const signalLog = loadSignalLog();
    const newSignals = [];
    
    for (const symbol of config.symbols) {
        for (const interval of config.intervals) {
            try {
                console.log(`\n📊 Checking ${symbol} (${interval})...`);
                const data = await fetchOHLCV(symbol, interval);
                
                if (data.length < 50) {
                    console.log(`  ⚠️ Not enough data`);
                    continue;
                }
                
                const signals = detectSignals(data, symbol);
                
                for (const signal of signals) {
                    // Check if already sent recently
                    const signalKey = `${symbol}-${interval}-${signal.reason}`;
                    const recentSignals = signalLog.signals.filter(s => 
                        s.key === signalKey && 
                        Date.now() - new Date(s.time).getTime() < 24 * 60 * 60 * 1000 // 24h
                    );
                    
                    if (recentSignals.length === 0) {
                        console.log(`  ✅ Signal: ${signal.type} - ${signal.reason}`);
                        newSignals.push({ ...signal, interval, key: signalKey });
                    } else {
                        console.log(`  ⏭️ Already sent: ${signal.reason}`);
                    }
                }
                
                if (signals.length === 0) {
                    console.log(`  ✓ No signals`);
                }
                
            } catch (e) {
                console.log(`  ❌ Error: ${e.message}`);
            }
        }
    }
    
    // Send Telegram notifications for new signals
    if (newSignals.length > 0) {
        console.log('\n🔔 Sending Telegram notifications...');
        
        let message = '📈 <b>Trading Signals Detected</b>\n\n';
        
        for (const signal of newSignals) {
            const emoji = signal.type === 'BUY' ? '🟢' : '🔴';
            message += `${emoji} <b>${signal.type}</b> ${signal.symbol}\n`;
            message += `   📊 ${signal.reason}\n`;
            message += `   💰 Price: $${signal.price.toLocaleString()}\n`;
            message += `   ⏱️ Timeframe: ${signal.interval}\n\n`;
            
            // Log the signal
            signalLog.signals.push({
                key: signal.key,
                type: signal.type,
                symbol: signal.symbol,
                reason: signal.reason,
                price: signal.price,
                time: new Date().toISOString()
            });
        }
        
        message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        message += `🤖 Auto-generated by Trade Signal Monitor`;
        
        await sendTelegram(message, config);
        
        // Keep only last 100 signals
        if (signalLog.signals.length > 100) {
            signalLog.signals = signalLog.signals.slice(-100);
        }
        saveSignalLog(signalLog);
    }
    
    signalLog.last_check = new Date().toISOString();
    saveSignalLog(signalLog);
    
    console.log('\n==================================================');
    console.log('✅ Monitor cycle complete');
    console.log('==================================================');
}

// CLI
const args = process.argv.slice(2);

if (args[0] === '--watch' || args[0] === '-w') {
    // Watch mode
    const interval = parseInt(args[1]) || 15; // minutes
    
    console.log(`\n🔄 Watch mode: checking every ${interval} minutes`);
    console.log('Press Ctrl+C to stop\n');
    
    const config = loadConfig();
    
    async function loop() {
        await monitorSignals(config);
        console.log(`\n💤 Sleeping for ${interval} minutes...`);
        setTimeout(loop, interval * 60 * 1000);
    }
    
    loop();
} else if (args[0] === '--config') {
    // Show config
    const config = loadConfig();
    console.log('\n📋 Current Config:');
    console.log(JSON.stringify(config, null, 2));
} else if (args[0] === '--set-keywords') {
    // Set keywords
    const keywords = args.slice(1);
    const config = loadConfig();
    config.keywords = keywords;
    saveConfig(config);
    console.log('✅ Keywords updated:', keywords.join(', '));
} else {
    // Single run
    const config = loadConfig();
    monitorSignals(config).catch(console.error);
}

module.exports = { monitorSignals, detectSignals };
