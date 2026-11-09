// lib/strategy.js
// HAN WAY Multi-Regime Cross-Sectional Factor Model (Indodax 1-Hour)
// 100% Kausal: Sinyal murni dari bar tertutup, identik dengan formula UTS

export const UNIVERSE = ['BTCIDR', 'ETHIDR', 'SOLIDR', 'DOGEIDR', 'XRPIDR'];

/**
 * Menghitung Simple Moving Average (SMA)
 */
export function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(prices.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Menghitung Rolling Volatility 24 Jam (Disetahunkan)
 */
export function calculateRollingVol24(closes) {
  if (closes.length < 25) return 0.50; // default proxy
  let sVar = 0;
  for (let q = closes.length - 24; q < closes.length; q++) {
    const ret = (closes[q] - closes[q - 1]) / closes[q - 1];
    sVar += ret * ret;
  }
  const sd = Math.sqrt(sVar / 23);
  return sd * Math.sqrt(24 * 365);
}

/**
 * Menentukan Rezim Pasar Makro (BTC/IDR vs SMA200 jam)
 * Menggantikan fungsi IHSG vs SMA200 hari pada versi UTS
 */
export function getCryptoRegime(btcCandles) {
  if (!btcCandles || btcCandles.length < 200) {
    return {
      regime: 'SIDEWAYS',
      maxSlots: 1,
      slotWeight: 0.20,
      holdMaxHours: 120,
      stopPct: 0.08,
      reason: 'BTC history < 200 bars'
    };
  }

  const closes = btcCandles.map(c => c.close);
  const currentBtcClose = closes[closes.length - 1];
  const sma200 = calculateSMA(closes, 200);

  if (currentBtcClose > sma200) {
    // BULL REGIME: Ekspansi makro, alokasi hingga 3 slot
    return {
      regime: 'BULL',
      maxSlots: 3,
      slotWeight: 0.30,
      holdMaxHours: 240, // 10 hari holding horizon
      stopPct: 0.12,     // 12% trailing stop dari peak
      btcClose: currentBtcClose,
      sma200
    };
  } else {
    // BEAR REGIME: Defensif penuh, 0 posisi baru (100% Kas IDR)
    return {
      regime: 'BEAR',
      maxSlots: 0,
      slotWeight: 0.0,
      holdMaxHours: 72,  // 3 hari swing holding
      stopPct: 0.06,     // 6% trailing stop ketat saat pasar bear
      btcClose: currentBtcClose,
      sma200
    };
  }
}

/**
 * Validasi Integritas Data Candle (Aturan Hal. 2 UAS)
 */
export function validateCandles(candles, timeframeSeconds = 3600, serverSec = null) {
  if (!candles || candles.length < 120) {
    return { valid: false, reason: 'Candle tertutup kurang dari 120 bar' };
  }

  const lastBar = candles[candles.length - 1];
  if (serverSec) {
    if (serverSec - (lastBar.time + timeframeSeconds) > 2 * timeframeSeconds) {
      return { valid: false, reason: 'Candle tertutup terakhir terlalu usang (> 2x timeframe)' };
    }
  }

  for (let i = candles.length - 10; i < candles.length; i++) {
    const c = candles[i];
    if (c.close <= 0 || c.open <= 0 || c.high <= 0 || c.low <= 0 || c.volume <= 0) {
      return { valid: false, reason: `Bar harga/volume nol pada timestamp ${c.time}` };
    }
  }

  return { valid: true };
}

/**
 * Cross-Sectional Factor Ranking Asli HAN WAY
 * Meranking seluruh kandidat koin secara simultan
 * Formula UTS: 0.40 r72 + 0.40 r168 + 0.20 (1/vol24)
 */
export function rankUniverseCandidates(allCandlesMap, regime, openSymbols = []) {
  if (regime.regime === 'BEAR' || regime.maxSlots === 0) {
    return []; // Di rezim bear, pertahankan 100% kas
  }

  const candidates = [];

  for (const sym of UNIVERSE) {
    if (openSymbols.includes(sym)) continue;

    const candles = allCandlesMap[sym];
    if (!candles || candles.length < 170) continue;

    const val = validateCandles(candles);
    if (!val.valid) continue;

    const closes = candles.map(c => c.close);
    const n = closes.length;
    const curClose = closes[n - 1];

    // Momentum Multi-Horizon
    const r24 = (curClose - closes[n - 25]) / closes[n - 25];   // Return 1 hari
    const r72 = (curClose - closes[n - 73]) / closes[n - 73];   // Return 3 hari
    const r168 = (curClose - closes[n - 169]) / closes[n - 169]; // Return 7 hari

    // Volatilitas 24 jam
    const vol24 = calculateRollingVol24(closes);
    const invVol = vol24 > 0 ? (1 / vol24) : 1;

    // Formula Bull Asli HAN WAY: Bobot Momentum Multi-Horizon + Inverse Volatility
    if (r72 > 0 && r168 > 0) {
      const score = 0.40 * r72 + 0.40 * r168 + 0.20 * invVol;
      candidates.push({
        symbol: sym,
        score,
        curClose,
        r24,
        r72,
        r168,
        vol24,
        reason: `Bull Momentum Leader: r72=${(r72 * 100).toFixed(1)}%, r168=${(r168 * 100).toFixed(1)}%, invVol=${invVol.toFixed(2)}`
      });
    }
  }

  // Urutkan dari skor faktor tertinggi (Cross-Sectional Rank)
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Dual Exit Mechanism Asli HAN WAY
 * Memonitor Time Exit (horizon rebalancing) dan Trailing Stop (peak protection)
 */
export function evaluateExitSignal(position, coinCandles, regime) {
  if (coinCandles.length < 50) {
    return { action: 'HOLD', reason: 'Data candle tidak cukup' };
  }

  const currentBar = coinCandles[coinCandles.length - 1];
  const currentClose = currentBar.close;

  // Track Peak Price sejak masuk
  const peakPrice = Math.max(position.peak || position.entryPrice, currentClose);
  const hoursHeld = (position.hours || 0) + 1;

  const holdMax = position.holdMaxHours || regime.holdMaxHours || 240;
  
  // Jika pasar beralih ke Bear, terapkan exit cepat 6% untuk mengamankan kas
  const stopPct = (regime.regime === 'BEAR') ? 0.06 : (position.stopPct || regime.stopPct || 0.12);

  // 1. Time Exit: Posisi ditutup setelah mencapai durasi maksimal (240 jam / 10 hari)
  if (hoursHeld >= holdMax) {
    return {
      action: 'SELL',
      exitPrice: currentClose,
      peakPrice,
      hoursHeld,
      reason: `TIME_EXIT_${holdMax}H: Batas holding optimal tercapai (${hoursHeld} jam)`
    };
  }

  // 2. Trailing Stop: Posisi ditutup jika harga turun melebihi batas dari titik puncak
  const stopPrice = peakPrice * (1 - stopPct);
  if (currentClose <= stopPrice) {
    return {
      action: 'SELL',
      exitPrice: currentClose,
      peakPrice,
      hoursHeld,
      reason: `TRAILING_STOP_${Math.round(stopPct * 100)}%: Penurunan dari peak (${currentClose} <= ${stopPrice.toFixed(0)})`
    };
  }

  return {
    action: 'HOLD',
    peakPrice,
    hoursHeld,
    reason: `Posisi aktif: Jam ke-${hoursHeld}/${holdMax}, Peak: Rp ${peakPrice.toLocaleString('id-ID')}`
  };
}
