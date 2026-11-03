// lib/strategy.js
// HAN WAY Crypto Multi-Regime Strategy Module (1-Hour Timeframe)
// Kausal 100%: Murni dihitung dari bar-bar tertutup (closed candles)
// Dirancang khusus untuk pasar kripto Indodax IDR dengan micro-structure realistis

/**
 * Menghitung Exponential Moving Average (EMA)
 */
export function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Menghitung Average True Range (ATR)
 */
export function calculateATR(candles, period = 24) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const high = candles[i].high;
    const low = candles[i].low;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  // Wilder's smoothed ATR
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/**
 * Menentukan Rezim Pasar Kripto dari candle BTCIDR tertutup
 * @param {Array} btcCandles - Array candle tertutup BTCIDR (minimal 170 bar)
 * @returns {Object} { regime: 'BULL' | 'SIDEWAYS' | 'BEAR', maxPositions: number, positionSizePct: number }
 */
export function getCryptoRegime(btcCandles) {
  if (!btcCandles || btcCandles.length < 168) {
    return { regime: 'SIDEWAYS', maxPositions: 2, positionSizePct: 0.20, reason: 'BTC history < 168 bars' };
  }

  const closes = btcCandles.map(c => c.close);
  const currentClose = closes[closes.length - 1];
  const ema72 = calculateEMA(closes, 72);   // Trend 3 hari
  const ema168 = calculateEMA(closes, 168); // Trend 7 hari

  if (currentClose > ema72 && ema72 > ema168) {
    // Bull Market: Struktur uptrend kuat, alokasi hingga 3 posisi
    return { regime: 'BULL', maxPositions: 3, positionSizePct: 0.25, ema72, ema168 };
  } else if (currentClose < ema168) {
    // Bear Market: Downtrend, proteksi modal ketat (0 posisi baru)
    return { regime: 'BEAR', maxPositions: 0, positionSizePct: 0.0, ema72, ema168 };
  } else {
    // Sideways Market: Konsolidasi antara EMA 72 & EMA 168
    return { regime: 'SIDEWAYS', maxPositions: 2, positionSizePct: 0.20, ema72, ema168 };
  }
}

/**
 * Validasi integritas data bar sesuai aturan Halaman 2 UAS
 */
export function validateCandles(candles, timeframeSeconds = 3600, serverSec = null) {
  if (!candles || candles.length < 120) {
    return { valid: false, reason: 'Jumlah candle tertutup kurang dari 120' };
  }

  const lastBar = candles[candles.length - 1];
  if (serverSec) {
    // Bar tertutup terakhir tidak boleh lebih tua dari 2x timeframe
    if (serverSec - (lastBar.time + timeframeSeconds) > 2 * timeframeSeconds) {
      return { valid: false, reason: 'Candle tertutup terakhir terlalu usang (> 2x timeframe)' };
    }
  }

  // Cek harga atau volume nol
  for (let i = candles.length - 10; i < candles.length; i++) {
    const c = candles[i];
    if (c.close <= 0 || c.open <= 0 || c.high <= 0 || c.low <= 0 || c.volume <= 0) {
      return { valid: false, reason: `Ditemukan bar dengan harga atau volume nol pada time ${c.time}` };
    }
  }

  return { valid: true };
}

/**
 * Evaluasi Sinyal Masuk (Entry) untuk satu koin pada candle tertutup
 * @param {Array} coinCandles - Array candle tertutup koin target (minimal 170 bar)
 * @param {Object} regime - Rezim pasar saat ini dari getCryptoRegime()
 * @returns {Object} { action: 'BUY' | 'HOLD', stopLoss: number, atr: number, reason: string }
 */
export function evaluateEntrySignal(coinCandles, regime) {
  if (regime.regime === 'BEAR' || regime.maxPositions === 0) {
    return { action: 'HOLD', reason: 'Rezim pasar BEAR (0 new buy positions, 100% cash preservation)' };
  }

  if (coinCandles.length < 170) {
    return { action: 'HOLD', reason: 'History candle < 170 bars' };
  }

  const closes = coinCandles.map(c => c.close);
  const highs = coinCandles.map(c => c.high);
  const volumes = coinCandles.map(c => c.volume);
  const currentBar = coinCandles[coinCandles.length - 1];
  const currentClose = currentBar.close;

  // Donchian Upper Band (120 period / 5 hari lookback, sebelum bar ini)
  const prevHighs120 = highs.slice(highs.length - 121, highs.length - 1);
  const donchianUpper120 = Math.max(...prevHighs120);

  // EMA Structure
  const ema24 = calculateEMA(closes, 24);
  const ema72 = calculateEMA(closes, 72);
  const ema168 = calculateEMA(closes, 168);

  // ATR 24
  const atr = calculateATR(coinCandles, 24);
  if (!atr) return { action: 'HOLD', reason: 'ATR calculation failed' };

  // Volume Breakout: Volume bar ini >= 1.2x rata-rata volume 24 jam terakhir
  const prevVols = volumes.slice(volumes.length - 25, volumes.length - 1);
  const avgVol = prevVols.reduce((a, b) => a + b, 0) / prevVols.length;
  const isVolConfirmed = avgVol > 0 ? (currentBar.volume >= 1.2 * avgVol) : true;

  // Syarat Entry Trend Following:
  // 1. Breakout Donchian 120-jam (5 hari)
  // 2. Trend alignment: Close > EMA24 dan EMA24 > EMA72 dan EMA72 > EMA168
  // 3. Konfirmasi volume
  const isBreakout = currentClose >= donchianUpper120;
  const isTrendUp = currentClose > ema24 && ema24 > ema72 && ema72 > ema168;

  if (isBreakout && isTrendUp && isVolConfirmed) {
    const initialStopLoss = currentClose - (3.5 * atr);
    return {
      action: 'BUY',
      signalPrice: currentClose,
      stopLoss: initialStopLoss,
      atr: atr,
      reason: `Breakout 120H Donchian (${currentClose} >= ${donchianUpper120}) + Trend Multi-EMA + Vol ${(currentBar.volume / (avgVol || 1)).toFixed(1)}x`
    };
  }

  return { action: 'HOLD', reason: 'Kondisi breakout 120H / multi-EMA belum terpenuhi' };
}

/**
 * Evaluasi Sinyal Keluar (Exit) untuk posisi terbuka
 * @param {Object} position - Posisi yang sedang terbuka { entryPrice, highestPrice, stopLoss, atr }
 * @param {Array} coinCandles - Array candle tertutup koin target
 * @returns {Object} { action: 'SELL' | 'HOLD', reason: string, newHighestPrice: number, newStopLoss: number }
 */
export function evaluateExitSignal(position, coinCandles) {
  if (coinCandles.length < 50) {
    return { action: 'HOLD', reason: 'Data candle tidak cukup untuk evaluasi exit' };
  }

  const currentBar = coinCandles[coinCandles.length - 1];
  const currentClose = currentBar.close;
  const currentHigh = currentBar.high;

  const atr = calculateATR(coinCandles, 24) || position.atr || (currentClose * 0.02);

  // Perbarui Highest Price sejak entry
  const highestPrice = Math.max(position.highestPrice || position.entryPrice, currentHigh);

  // Trailing Stop dinamis: Highest Price - (5.0 * ATR) -> memberikan ruang nafas trend 5 hari
  const trailingStop = highestPrice - (5.0 * atr);
  const activeStopLoss = Math.max(position.stopLoss || 0, trailingStop);

  // Sinyal Jual jika tembus Trailing Stop Loss
  if (currentClose <= activeStopLoss) {
    return {
      action: 'SELL',
      exitPrice: currentClose,
      reason: `Hit Trailing Stop Loss (${currentClose} <= ${activeStopLoss.toFixed(0)})`
    };
  }

  return {
    action: 'HOLD',
    newHighestPrice: highestPrice,
    newStopLoss: activeStopLoss,
    reason: `Posisi aman (Close: ${currentClose} > SL: ${activeStopLoss.toFixed(0)})`
  };
}
