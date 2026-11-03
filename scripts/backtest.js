// scripts/backtest.js
// 3-Year Historical Backtest Engine for HAN WAY Crypto Multi-Regime
// Memenuhi seluruh aturan mikrostruktur dan risk management UAS Trad1 & Trad2

import fs from 'fs';
import path from 'path';
import { getCryptoRegime, evaluateEntrySignal, evaluateExitSignal, validateCandles } from '../lib/strategy.js';

const SYMBOLS = ['BTCIDR', 'ETHIDR', 'SOLIDR', 'DOGEIDR', 'XRPIDR'];
const INITIAL_BALANCE = 100000000; // Rp 100.000.000
const TAKER_FEE_RATE = 0.0030;     // 0.30% fee all-in (efektif 1 Okt 2026)
const MIN_ORDER_IDR = 25000;       // Minimum Rp 25.000
const DAILY_LOSS_LIMIT_PCT = 0.03; // 3% batas rugi harian

// Spread & slippage konservatif per koin (berdasarkan pengukuran median order book)
const SPREAD_SLIPPAGE = {
  'BTCIDR': 0.0008, // 0.08%
  'ETHIDR': 0.0012, // 0.12%
  'SOLIDR': 0.0018, // 0.18%
  'DOGEIDR': 0.0020, // 0.20%
  'XRPIDR': 0.0015  // 0.15%
};

function loadHistoricalData() {
  const data = {};
  for (const sym of SYMBOLS) {
    const jsonPath = path.resolve('data/historical', `${sym}_60m.json`);
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Data historis ${sym} tidak ditemukan di ${jsonPath}! Jalankan fetch:data dulu.`);
    }
    const bars = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    data[sym] = bars;
  }
  return data;
}

export function runBacktest(options = {}) {
  const allData = loadHistoricalData();
  const btcBars = allData['BTCIDR'];
  const totalBars = btcBars.length;

  console.log(`\n===============================================================`);
  console.log(`[BACKTEST] Memulai backtest historis 3 tahun (${totalBars} bar 1 jam)...`);
  console.log(`Modal Awal: Rp ${INITIAL_BALANCE.toLocaleString('id-ID')}`);
  console.log(`Tarif Taker Fee: ${(TAKER_FEE_RATE * 100).toFixed(2)}% | Min Order: Rp ${MIN_ORDER_IDR.toLocaleString('id-ID')}`);

  let cash = INITIAL_BALANCE;
  let positions = {}; // symbol -> position object
  const trades = [];
  const equityCurve = [];

  let dailyStartEquity = INITIAL_BALANCE;
  let currentDayWib = '';
  let dailyLossExceeded = false;

  let peakEquity = INITIAL_BALANCE;
  let maxDrawdown = 0;

  // Window warmup (minimal 180 bar untuk EMA168 dan Donchian 120)
  const WARMUP_BARS = 180;

  for (let idx = WARMUP_BARS; idx < totalBars; idx++) {
    const currentTime = btcBars[idx].time;

    // Deteksi pergantian hari WIB (UTC+7, jam 00:00 WIB)
    const dateWib = new Date(currentTime * 1000 + 7 * 3600 * 1000).toISOString().slice(0, 10);
    if (dateWib !== currentDayWib) {
      currentDayWib = dateWib;
      // Hitung equity awal hari untuk daily loss limit
      let currentEquityAtMidnight = cash;
      for (const [sym, pos] of Object.entries(positions)) {
        const lastPrice = allData[sym][idx].close;
        currentEquityAtMidnight += pos.cryptoAmount * lastPrice;
      }
      dailyStartEquity = currentEquityAtMidnight;
      dailyLossExceeded = false;
    }

    // 1. Hitung total ekuitas saat ini pada harga Close t
    let currentEquity = cash;
    for (const [sym, pos] of Object.entries(positions)) {
      const lastClose = allData[sym][idx].close;
      currentEquity += pos.cryptoAmount * lastClose;
    }

    // Cek Drawdown
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const dd = (peakEquity - currentEquity) / peakEquity;
    if (dd > maxDrawdown) maxDrawdown = dd;

    // Cek Daily Loss Limit
    const dailyLoss = (dailyStartEquity - currentEquity) / dailyStartEquity;
    if (dailyLoss >= DAILY_LOSS_LIMIT_PCT) {
      dailyLossExceeded = true;
    }

    // 2. Evaluasi Rezim Pasar Kripto dari candle BTC tertutup (180 bar terakhir s/d idx)
    const btcSlice = btcBars.slice(idx - 175, idx + 1);
    const regime = getCryptoRegime(btcSlice);

    // 3. Evaluasi Posisi yang Sedang Terbuka (EXIT CHECK)
    const openSymbols = Object.keys(positions);
    for (const sym of openSymbols) {
      const pos = positions[sym];
      const coinSlice = allData[sym].slice(idx - 175, idx + 1);

      const exitEval = evaluateExitSignal(pos, coinSlice);
      if (exitEval.action === 'SELL') {
        // Eksekusi jual di harga close bar ini dikurangi spread & slippage taker
        const adverseCost = SPREAD_SLIPPAGE[sym] || 0.0015;
        const rawExitPrice = coinSlice[coinSlice.length - 1].close;
        const fillPrice = rawExitPrice * (1 - adverseCost);
        const grossReturnIdr = pos.cryptoAmount * fillPrice;
        const feeIdr = grossReturnIdr * TAKER_FEE_RATE;
        const netReturnIdr = grossReturnIdr - feeIdr;

        const pnlIdr = netReturnIdr - pos.costIdr;
        const pnlPct = (pnlIdr / pos.costIdr) * 100;

        cash += netReturnIdr;

        trades.push({
          tradeId: trades.length + 1,
          symbol: sym,
          side: 'SELL',
          entryTime: pos.entryTime,
          entryPrice: pos.entryPrice,
          exitTime: currentTime,
          exitPrice: fillPrice,
          cryptoAmount: pos.cryptoAmount,
          costIdr: pos.costIdr,
          returnIdr: netReturnIdr,
          feeIdr: pos.entryFeeIdr + feeIdr,
          spreadSlippageIdr: (pos.costIdr * adverseCost) + (grossReturnIdr * adverseCost),
          pnlIdr,
          pnlPct,
          holdHours: Math.round((currentTime - pos.entryTime) / 3600),
          reason: exitEval.reason
        });

        delete positions[sym];
      } else {
        // Perbarui trailing stop
        pos.highestPrice = exitEval.newHighestPrice;
        pos.stopLoss = exitEval.newStopLoss;
      }
    }

    // 4. Evaluasi Sinyal Masuk Baru (ENTRY CHECK) bila daily loss belum kena
    if (!dailyLossExceeded && Object.keys(positions).length < regime.maxPositions) {
      for (const sym of SYMBOLS) {
        if (positions[sym]) continue; // Sudah ada posisi di koin ini
        if (Object.keys(positions).length >= regime.maxPositions) break;

        const coinSlice = allData[sym].slice(idx - 175, idx + 1);
        const val = validateCandles(coinSlice);
        if (!val.valid) continue;

        const entryEval = evaluateEntrySignal(coinSlice, regime);
        if (entryEval.action === 'BUY') {
          // Hitung ukuran posisi
          const targetBudget = currentEquity * regime.positionSizePct;
          const allocIdr = Math.min(cash, targetBudget);

          if (allocIdr >= MIN_ORDER_IDR) {
            const adverseCost = SPREAD_SLIPPAGE[sym] || 0.0015;
            const rawEntryPrice = coinSlice[coinSlice.length - 1].close;
            const fillPrice = rawEntryPrice * (1 + adverseCost);
            const feeIdr = allocIdr * TAKER_FEE_RATE;
            const netAllocIdr = allocIdr - feeIdr;
            const cryptoAmount = netAllocIdr / fillPrice;

            cash -= allocIdr;

            positions[sym] = {
              symbol: sym,
              entryTime: currentTime,
              entryPrice: fillPrice,
              cryptoAmount,
              costIdr: allocIdr,
              entryFeeIdr: feeIdr,
              stopLoss: entryEval.stopLoss,
              highestPrice: fillPrice,
              atr: entryEval.atr,
              reason: entryEval.reason
            };
          }
        }
      }
    }

    equityCurve.push({
      time: currentTime,
      datetimeWib: new Date(currentTime * 1000 + 7 * 3600 * 1000).toISOString().replace('Z', '+07:00'),
      cash,
      totalEquity: currentEquity,
      drawdown: dd,
      openPositionsCount: Object.keys(positions).length
    });
  }

  // Ringkasan Metrik
  const finalEquity = equityCurve[equityCurve.length - 1].totalEquity;
  const totalReturnPct = ((finalEquity - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
  const years = (btcBars[totalBars - 1].time - btcBars[WARMUP_BARS].time) / (365.25 * 24 * 3600);
  const cagrPct = (Math.pow(finalEquity / INITIAL_BALANCE, 1 / years) - 1) * 100;

  const winningTrades = trades.filter(t => t.pnlIdr > 0);
  const losingTrades = trades.filter(t => t.pnlIdr < 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnlIdr, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlIdr, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);

  const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

  const totalFee = trades.reduce((sum, t) => sum + t.feeIdr, 0);
  const totalSpreadSlippage = trades.reduce((sum, t) => sum + t.spreadSlippageIdr, 0);
  const totalCost = totalFee + totalSpreadSlippage;
  const costSharePct = grossProfit > 0 ? (totalCost / grossProfit) * 100 : 0;

  // Benchmark Buy & Hold BTC
  const btcStartClose = btcBars[WARMUP_BARS].close;
  const btcEndClose = btcBars[btcBars.length - 1].close;
  const btcReturnPct = ((btcEndClose - btcStartClose) / btcStartClose) * 100;

  const summary = {
    initialBalance: INITIAL_BALANCE,
    finalEquity,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: maxDrawdown * 100,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    profitFactor,
    avgWinIdr: avgWin,
    avgLossIdr: avgLoss,
    totalFeeIdr: totalFee,
    totalSpreadSlippageIdr: totalSpreadSlippage,
    totalCostIdr: totalCost,
    costSharePct,
    btcBenchmarkReturnPct: btcReturnPct,
    periodYears: years
  };

  console.log(`\n================== HASIL BACKTEST 3 TAHUN ==================`);
  console.log(`Total Return: ${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}% | CAGR: +${cagrPct.toFixed(2)}%`);
  console.log(`Max Drawdown: -${(maxDrawdown * 100).toFixed(2)}%`);
  console.log(`Win Rate: ${winRate.toFixed(1)}% | Profit Factor: ${profitFactor.toFixed(2)}`);
  console.log(`Total Trade: ${trades.length} | Avg Win: Rp ${Math.round(avgWin).toLocaleString('id-ID')} | Avg Loss: Rp ${Math.round(avgLoss).toLocaleString('id-ID')}`);
  console.log(`Porsi Biaya (Fee+Spread+Slip)/Gross Profit: ${costSharePct.toFixed(2)}%`);
  console.log(`Benchmark B&H BTC/IDR: ${btcReturnPct >= 0 ? '+' : ''}${btcReturnPct.toFixed(2)}%`);
  console.log(`Ekuitas Akhir: Rp ${Math.round(finalEquity).toLocaleString('id-ID')}`);
  console.log(`============================================================\n`);

  // Simpan hasil
  fs.writeFileSync('data/backtest_summary.json', JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync('data/backtest_trades.json', JSON.stringify(trades, null, 2), 'utf8');

  let tradesCsv = 'trade_id,symbol,entry_time,exit_time,entry_price,exit_price,crypto_amount,cost_idr,return_idr,fee_idr,pnl_idr,pnl_pct,reason\n';
  for (const t of trades) {
    tradesCsv += `${t.tradeId},${t.symbol},${t.entryTime},${t.exitTime},${t.entryPrice.toFixed(0)},${t.exitPrice.toFixed(0)},${t.cryptoAmount.toFixed(6)},${t.costIdr.toFixed(0)},${t.returnIdr.toFixed(0)},${t.feeIdr.toFixed(0)},${t.pnlIdr.toFixed(0)},${t.pnlPct.toFixed(2)},"${t.reason}"\n`;
  }
  fs.writeFileSync('data/backtest_trades.csv', tradesCsv, 'utf8');

  return { summary, trades, equityCurve };
}

// Eksekusi jika dipanggil langsung
if (process.argv[1] && process.argv[1].endsWith('backtest.js')) {
  runBacktest();
}
