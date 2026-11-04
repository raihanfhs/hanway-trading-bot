// api/state.js
// Vercel Serverless Function: Read-only Dashboard API endpoint
import { getBotState, getOpenPositions, getAllTrades, getAllTicks, getAllSnapshots, KEYS, getRedisClient } from '../lib/storage.js';

export default async function handler(req, res) {
  // Izinkan CORS agar bisa diakses dari dashboard offline mandiri
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const state = await getBotState();
    const positions = await getOpenPositions();
    const trades = await getAllTrades();
    const ticks = await getAllTicks();
    const snapshots = await getAllSnapshots();

    // Hitung ringkasan forward test
    const completedTrades = trades.filter(t => t.side === 'SELL');
    const winningTrades = completedTrades.filter(t => t.pnlIdr > 0);
    const losingTrades = completedTrades.filter(t => t.pnlIdr < 0);
    const grossProfit = winningTrades.reduce((s, t) => s + t.pnlIdr, 0);
    const grossLoss = Math.abs(losingTrades.reduce((s, t) => s + t.pnlIdr, 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 999 : 0);
    const winRate = completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0;

    const initialBal = state.initialBalanceIdr || 100000000;
    const currentEquity = state.totalEquityIdr || state.cashIdr;
    const forwardReturnPct = ((currentEquity - initialBal) / initialBal) * 100;

    // Hitung Uptime
    const totalScheduled = state.uptimeTotalScheduled || ticks.length || 1;
    const totalExecuted = state.uptimeExecuted || ticks.filter(t => t.status === 'SUCCESS').length || 1;
    const uptimePct = Math.min(100, (totalExecuted / totalScheduled) * 100);

    // Median spread dari snapshot
    const spreads = snapshots.map(s => s.spreadPct).filter(s => typeof s === 'number').sort((a, b) => a - b);
    const medianSpreadPct = spreads.length > 0 ? spreads[Math.floor(spreads.length / 2)] * 100 : 0.12;

    return res.status(200).json({
      success: true,
      state: {
        ...state,
        forwardReturnPct,
        uptimePct,
        medianSpreadPct
      },
      positions,
      metrics: {
        totalTrades: completedTrades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate,
        profitFactor,
        grossProfit,
        grossLoss,
        forwardReturnPct
      },
      recentTrades: trades.slice(-50),
      recentTicks: ticks.slice(-50),
      snapshotsCount: snapshots.length
    });

  } catch (error) {
    console.error(`[ERR STATE] ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
}
