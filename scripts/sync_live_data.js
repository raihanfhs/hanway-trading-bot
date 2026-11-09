// scripts/sync_live_data.js
// Skrip untuk mengunduh log mentah operasional bot dari Upstash Redis ke folder data/
// Digunakan sebelum menjalankan skrip hitung_ulang.js untuk audit transparansi.

import fs from 'fs';
import path from 'path';
import { 
  getRedisClient, KEYS, 
  getBotState, getOpenPositions, 
  getAllTrades, getAllTicks, 
  getAllSnapshots 
} from '../lib/storage.js';

async function syncLiveData() {
  console.log('===============================================================');
  console.log('[SYNC] Menghubungi Upstash Redis untuk mengunduh log live...');

  const state = await getBotState();
  const positions = await getOpenPositions();
  const trades = await getAllTrades();
  const ticks = await getAllTicks();
  const snapshots = await getAllSnapshots();

  if (!fs.existsSync('data')) {
    fs.mkdirSync('data', { recursive: true });
  }

  // Simpan log mentah
  fs.writeFileSync('data/bot_state_live.json', JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync('data/open_positions_live.json', JSON.stringify(positions, null, 2), 'utf8');
  fs.writeFileSync('data/forward_trade_logs.json', JSON.stringify(trades, null, 2), 'utf8');
  fs.writeFileSync('data/forward_tick_logs.json', JSON.stringify(ticks, null, 2), 'utf8');
  fs.writeFileSync('data/orderbook_snapshots.json', JSON.stringify(snapshots, null, 2), 'utf8');

  console.log(`[OK] Sinkronisasi selesai:`);
  console.log(`- State Bot: Ekuitas Rp ${Math.round(state.totalEquityIdr || 100000000).toLocaleString('id-ID')}`);
  console.log(`- Total Tick Log: ${ticks.length}`);
  console.log(`- Total Trade Log: ${trades.length}`);
  console.log(`- Total Order Book Snapshots: ${snapshots.length}`);
  console.log('===============================================================\n');
}

if (process.argv[1] && process.argv[1].endsWith('sync_live_data.js')) {
  syncLiveData().catch(console.error);
}

export { syncLiveData };
