// api/tick.js
// Vercel Serverless Function: Hourly Tick Endpoint for HAN WAY Trading Bot
// Protected by CRON_SECRET

import { getServerTime, getOrderBook, getClosedCandles, simulateTakerExecution, PAIRS, SYMBOL_MAP, TAKER_FEE_RATE } from '../lib/indodax.js';
import { getCryptoRegime, evaluateEntrySignal, evaluateExitSignal, validateCandles } from '../lib/strategy.js';
import { 
  getBotState, saveBotState, 
  getOpenPositions, saveOpenPositions, 
  appendTradeLog, appendTickLog, appendOrderBookSnapshot, 
  isKillSwitchActive 
} from '../lib/storage.js';

const DAILY_LOSS_LIMIT_PCT = 0.03; // 3% batas rugi harian

export default async function handler(req, res) {
  const startTime = Date.now();

  // 1. Keamanan Endpoint (CRON_SECRET)
  const authHeader = req.headers['authorization'];
  const querySecret = req.query ? req.query.secret : null;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
    const isQueryValid = querySecret === cronSecret;
    if (!isHeaderValid && !isQueryValid) {
      return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' });
    }
  }

  try {
    // 2. Baca state & cek kill switch manual
    const state = await getBotState();
    const positions = await getOpenPositions();
    const isKilled = await isKillSwitchActive();

    state.uptimeTotalScheduled = (state.uptimeTotalScheduled || 0) + 1;

    if (isKilled || state.killSwitchActive) {
      const msg = 'Kill switch aktif! Bot tidak memproses transaksi.';
      await appendTickLog({
        time: Math.floor(startTime / 1000),
        datetimeWib: new Date(startTime + 7 * 3600 * 1000).toISOString().replace('Z', '+07:00'),
        status: 'KILLED',
        reason: msg
      });
      await saveBotState(state);
      return res.status(200).json({ status: 'KILLED', message: msg });
    }

    // 3. Ambil waktu server Indodax & candle tertutup BTC
    const serverSec = await getServerTime();
    const btcBars = await getClosedCandles('BTCIDR', 60, 180);

    if (btcBars.length === 0) {
      throw new Error('Gagal mengambil candle tertutup BTCIDR');
    }

    const latestBar = btcBars[btcBars.length - 1];

    // 4. Idempotency: Tiap candle hanya boleh diproses satu kali
    if (state.lastProcessedCandleTime && latestBar.time <= state.lastProcessedCandleTime) {
      return res.status(200).json({
        status: 'ALREADY_PROCESSED',
        message: `Candle ${latestBar.time} (${new Date(latestBar.time * 1000).toISOString()}) sudah diproses sebelumnya.`
      });
    }

    // 5. Cek batas hari WIB (UTC+7, jam 00:00 WIB) untuk Daily Loss Limit
    const wibDate = new Date(serverSec * 1000 + 7 * 3600 * 1000);
    const dayStr = wibDate.toISOString().slice(0, 10);

    if (dayStr !== state.currentDayWib) {
      state.currentDayWib = dayStr;
      state.dailyStartEquity = state.totalEquityIdr || state.cashIdr;
      state.dailyLossExceeded = false;
    }

    // Hitung total equity berjalan (mark-to-market posisi ke best bid)
    let currentEquity = state.cashIdr;
    const depthMap = {};

    // Ambil order book live semua pasangan
    for (const pair of PAIRS) {
      try {
        const depth = await getOrderBook(pair);
        depthMap[pair] = depth;
        const sym = SYMBOL_MAP[pair];
        if (positions[sym] && depth.bids.length > 0) {
          const markPrice = depth.bids[0][0]; // Mark to market best bid
          currentEquity += positions[sym].cryptoAmount * markPrice;
        }
      } catch (err) {
        console.warn(`Gagal fetch depth ${pair}: ${err.message}`);
      }
    }

    state.totalEquityIdr = currentEquity;

    // Cek daily loss limit
    const dailyLoss = (state.dailyStartEquity - currentEquity) / (state.dailyStartEquity || 1);
    if (dailyLoss >= DAILY_LOSS_LIMIT_PCT) {
      state.dailyLossExceeded = true;
    }

    // 6. Evaluasi Rezim Pasar Kripto
    const regime = getCryptoRegime(btcBars);

    // 7. Simpan Order Book Snapshot untuk audit spread & slippage
    for (const pair of PAIRS) {
      const depth = depthMap[pair];
      if (depth && depth.bids.length > 0 && depth.asks.length > 0) {
        const bestBid = depth.bids[0][0];
        const bestAsk = depth.asks[0][0];
        await appendOrderBookSnapshot({
          time: serverSec,
          datetimeWib: wibDate.toISOString().replace('Z', '+07:00'),
          symbol: SYMBOL_MAP[pair],
          bestBid,
          bestAsk,
          spreadPct: (bestAsk - bestBid) / bestBid
        });
      }
    }

    const executedActions = [];

    // 8. Evaluasi EXIT Posisi Terbuka
    for (const sym of Object.keys(positions)) {
      const pos = positions[sym];
      const coinBars = await getClosedCandles(sym, 60, 180);
      const exitEval = evaluateExitSignal(pos, coinBars);

      if (exitEval.action === 'SELL') {
        const pair = Object.keys(SYMBOL_MAP).find(k => SYMBOL_MAP[k] === sym);
        const depth = depthMap[pair];

        if (depth) {
          const approxIdr = pos.cryptoAmount * depth.bids[0][0];
          const fill = simulateTakerExecution('SELL', approxIdr, depth);

          if (fill.success) {
            const pnlIdr = fill.netIdr - pos.costIdr;
            const pnlPct = (pnlIdr / pos.costIdr) * 100;

            state.cashIdr += fill.netIdr;

            const tradeRecord = {
              tradeId: Date.now(),
              symbol: sym,
              side: 'SELL',
              time: serverSec,
              datetimeWib: wibDate.toISOString().replace('Z', '+07:00'),
              entryTime: pos.entryTime,
              entryPrice: pos.entryPrice,
              exitTime: serverSec,
              exitPrice: fill.fillPrice,
              cryptoAmount: pos.cryptoAmount,
              costIdr: pos.costIdr,
              returnIdr: fill.netIdr,
              feeIdr: pos.entryFeeIdr + fill.feeIdr,
              pnlIdr,
              pnlPct,
              bestBid: fill.bestBid,
              bestAsk: fill.bestAsk,
              slippagePct: fill.slippagePct,
              reason: exitEval.reason
            };

            await appendTradeLog(tradeRecord);
            delete positions[sym];
            executedActions.push(`SELL ${sym}: PnL Rp ${Math.round(pnlIdr).toLocaleString('id-ID')} (${pnlPct.toFixed(2)}%)`);
          }
        }
      } else {
        pos.highestPrice = exitEval.newHighestPrice;
        pos.stopLoss = exitEval.newStopLoss;
      }
    }

    // 9. Evaluasi ENTRY Baru
    if (!state.dailyLossExceeded && Object.keys(positions).length < regime.maxPositions) {
      for (const pair of PAIRS) {
        const sym = SYMBOL_MAP[pair];
        if (positions[sym]) continue;
        if (Object.keys(positions).length >= regime.maxPositions) break;

        const coinBars = await getClosedCandles(sym, 60, 180);
        const val = validateCandles(coinBars, 3600, serverSec);
        if (!val.valid) continue;

        const entryEval = evaluateEntrySignal(coinBars, regime);
        if (entryEval.action === 'BUY') {
          const targetBudget = currentEquity * regime.positionSizePct;
          const allocIdr = Math.min(state.cashIdr, targetBudget);

          if (allocIdr >= 25000) {
            const depth = depthMap[pair];
            if (depth) {
              const fill = simulateTakerExecution('BUY', allocIdr, depth);
              if (fill.success) {
                state.cashIdr -= fill.netIdr;

                positions[sym] = {
                  symbol: sym,
                  entryTime: serverSec,
                  entryPrice: fill.fillPrice,
                  cryptoAmount: fill.cryptoAmount,
                  costIdr: fill.netIdr,
                  entryFeeIdr: fill.feeIdr,
                  stopLoss: entryEval.stopLoss,
                  highestPrice: fill.fillPrice,
                  atr: entryEval.atr,
                  reason: entryEval.reason
                };

                const tradeRecord = {
                  tradeId: Date.now(),
                  symbol: sym,
                  side: 'BUY',
                  time: serverSec,
                  datetimeWib: wibDate.toISOString().replace('Z', '+07:00'),
                  fillPrice: fill.fillPrice,
                  cryptoAmount: fill.cryptoAmount,
                  costIdr: fill.netIdr,
                  feeIdr: fill.feeIdr,
                  bestBid: fill.bestBid,
                  bestAsk: fill.bestAsk,
                  slippagePct: fill.slippagePct,
                  reason: entryEval.reason
                };

                await appendTradeLog(tradeRecord);
                executedActions.push(`BUY ${sym}: Rp ${Math.round(fill.netIdr).toLocaleString('id-ID')} @ Rp ${Math.round(fill.fillPrice).toLocaleString('id-ID')}`);
              }
            }
          }
        }
      }
    }

    // 10. Simpan perubahan ke Redis
    state.lastProcessedCandleTime = latestBar.time;
    state.uptimeExecuted = (state.uptimeExecuted || 0) + 1;
    state.lastUpdated = new Date().toISOString();

    await saveBotState(state);
    await saveOpenPositions(positions);

    // Log Tick Sukses
    await appendTickLog({
      time: serverSec,
      datetimeWib: wibDate.toISOString().replace('Z', '+07:00'),
      scheduledTime: latestBar.time + 3600,
      actualTime: serverSec,
      latencySec: Math.max(0, serverSec - (latestBar.time + 3600)),
      regime: regime.regime,
      openPositions: Object.keys(positions).length,
      cashIdr: state.cashIdr,
      equityIdr: state.totalEquityIdr,
      actions: executedActions,
      status: 'SUCCESS'
    });

    const elapsed = Date.now() - startTime;
    return res.status(200).json({
      success: true,
      candleTime: latestBar.time,
      serverSec,
      regime: regime.regime,
      openPositions: Object.keys(positions).length,
      totalEquityIdr: state.totalEquityIdr,
      executedActions,
      elapsedMs: elapsed
    });

  } catch (error) {
    console.error(`[ERR TICK] ${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
