// lib/indodax.js
// Indodax Public API client & realistic orderbook execution simulator

export const PAIRS = ['btcidr', 'ethidr', 'solidr', 'dogeidr', 'xrpidr'];

export const SYMBOL_MAP = {
  'btcidr': 'BTCIDR',
  'ethidr': 'ETHIDR',
  'solidr': 'SOLIDR',
  'dogeidr': 'DOGEIDR',
  'xrpidr': 'XRPIDR'
};

// Fee taker all-in (layanan + PPh/PPN + CFX fee) efektif 1 Oktober 2026: 0.30%
// Sesuai klausul Page 2: pakai tarif yang lebih mahal / konservatif
export const TAKER_FEE_RATE = 0.0030; // 0.30%
export const MIN_ORDER_IDR = 25000;   // Rp 25.000 (aturan mode Pro terketat)

/**
 * Mengambil waktu server Indodax terkini dalam detik
 */
export async function getServerTime() {
  const res = await fetch('https://indodax.com/api/server_time');
  const json = await res.json();
  return Math.floor(json.server_time / 1000);
}

/**
 * Mengambil order book depth terkini untuk pasangan tertentu
 */
export async function getOrderBook(pair) {
  const res = await fetch(`https://indodax.com/api/depth/${pair.toLowerCase()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching depth for ${pair}`);
  const json = await res.json();
  // json.buy = [[price, amount], ...] (bids, sorted descending)
  // json.sell = [[price, amount], ...] (asks, sorted ascending)
  return {
    bids: (json.buy || []).map(([p, a]) => [Number(p), Number(a)]),
    asks: (json.sell || []).map(([p, a]) => [Number(p), Number(a)])
  };
}

/**
 * Mengambil candle historis dan membuang bar yang masih berjalan
 */
export async function getClosedCandles(symbol, tf = 60, count = 100) {
  const serverSec = await getServerTime();
  const from = serverSec - (count + 15) * tf * 60;
  const to = serverSec;
  const url = `https://indodax.com/tradingview/history_v2?symbol=${symbol.toUpperCase()}&tf=${tf}&from=${from}&to=${to}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching history for ${symbol}`);
  const rawBars = await res.json();
  if (!Array.isArray(rawBars)) return [];

  // Filter candle yang masih berjalan: Time + timeframe > server_time wajib dibuang
  const closedBars = rawBars
    .filter(b => b.Time + tf * 60 <= serverSec)
    .map(b => ({
      time: b.Time,
      open: Number(b.Open),
      high: Number(b.High),
      low: Number(b.Low),
      close: Number(b.Close),
      volume: Number(b.Volume)
    }))
    .sort((a, b) => a.time - b.time);

  return closedBars;
}

/**
 * Simulasi eksekusi TAKER realistis pada Live Order Book Indodax
 * @param {string} side - 'BUY' atau 'SELL'
 * @param {number} targetAmountIdr - Nilai nominal IDR yang ingin dibeli / dijual
 * @param {Object} orderBook - { bids: [[p, vol]], asks: [[p, vol]] }
 * @returns {Object} Hasil fill dengan volume weighted average price
 */
export function simulateTakerExecution(side, targetAmountIdr, orderBook) {
  if (targetAmountIdr < MIN_ORDER_IDR) {
    return {
      success: false,
      reason: `Nominal order Rp ${targetAmountIdr.toLocaleString('id-ID')} di bawah minimum Rp ${MIN_ORDER_IDR.toLocaleString('id-ID')}`
    };
  }

  const { bids, asks } = orderBook;
  if (!bids || bids.length === 0 || !asks || asks.length === 0) {
    return { success: false, reason: 'Order book kosong' };
  }

  const bestBid = bids[0][0];
  const bestAsk = asks[0][0];
  const spreadPct = (bestAsk - bestBid) / bestBid;

  // Syarat Page 2: Selisih bid-ask tidak boleh lebih dari 2%
  if (spreadPct > 0.02) {
    return {
      success: false,
      reason: `Spread bid-ask ${(spreadPct * 100).toFixed(2)}% melebihi batas toleransi 2%`
    };
  }

  let remainingIdr = targetAmountIdr;
  let totalCrypto = 0;
  let totalCostIdr = 0;
  const levelsUsed = [];

  if (side === 'BUY') {
    // Beli di ask: habiskan antrean ask mulai dari harga terendah
    for (const [price, cryptoVol] of asks) {
      if (remainingIdr <= 0) break;
      const levelIdr = price * cryptoVol;
      const takeIdr = Math.min(remainingIdr, levelIdr);
      const takeCrypto = takeIdr / price;

      totalCrypto += takeCrypto;
      totalCostIdr += takeIdr;
      remainingIdr -= takeIdr;
      levelsUsed.push({ price, amountCrypto: takeCrypto, amountIdr: takeIdr });
    }

    if (totalCostIdr === 0) {
      return { success: false, reason: 'Likuiditas ask tidak mencukupi' };
    }

    const vwap = totalCostIdr / totalCrypto;
    const feeIdr = totalCostIdr * TAKER_FEE_RATE;
    const slippagePct = (vwap - bestAsk) / bestAsk;

    return {
      success: true,
      side: 'BUY',
      bestBid,
      bestAsk,
      spreadPct,
      vwap,
      fillPrice: vwap,
      cryptoAmount: totalCrypto,
      grossIdr: totalCostIdr,
      feeIdr,
      netIdr: totalCostIdr + feeIdr,
      slippagePct,
      levelsUsedCount: levelsUsed.length
    };

  } else {
    // Jual di bid: habiskan antrean bid mulai dari harga tertinggi
    for (const [price, cryptoVol] of bids) {
      if (remainingIdr <= 0) break;
      const levelIdr = price * cryptoVol;
      const takeIdr = Math.min(remainingIdr, levelIdr);
      const takeCrypto = takeIdr / price;

      totalCrypto += takeCrypto;
      totalCostIdr += takeIdr;
      remainingIdr -= takeIdr;
      levelsUsed.push({ price, amountCrypto: takeCrypto, amountIdr: takeIdr });
    }

    if (totalCostIdr === 0) {
      return { success: false, reason: 'Likuiditas bid tidak mencukupi' };
    }

    const vwap = totalCostIdr / totalCrypto;
    const feeIdr = totalCostIdr * TAKER_FEE_RATE;
    const slippagePct = (bestBid - vwap) / bestBid;

    return {
      success: true,
      side: 'SELL',
      bestBid,
      bestAsk,
      spreadPct,
      vwap,
      fillPrice: vwap,
      cryptoAmount: totalCrypto,
      grossIdr: totalCostIdr,
      feeIdr,
      netIdr: totalCostIdr - feeIdr,
      slippagePct,
      levelsUsedCount: levelsUsed.length
    };
  }
}
