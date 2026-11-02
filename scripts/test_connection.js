// scripts/test_connection.js
// Uji koneksi pra-freeze ke Indodax Public API dan Upstash Redis
import { getServerTime, getOrderBook } from '../lib/indodax.js';
import { getRedisClient } from '../lib/storage.js';

async function testAll() {
  console.log(`\n--- UJI KONEKSI PRA-FREEZE SISTEM HAN WAY ---`);

  // 1. Uji Indodax API
  try {
    const serverSec = await getServerTime();
    console.log(`[PASS] Indodax API OK! Server Time: ${new Date(serverSec * 1000).toISOString()}`);
    const depth = await getOrderBook('btcidr');
    console.log(`[PASS] Indodax Depth OK! Best Bid: Rp ${depth.bids[0][0].toLocaleString('id-ID')} | Best Ask: Rp ${depth.asks[0][0].toLocaleString('id-ID')}`);
  } catch (err) {
    console.error(`[FAIL] Indodax API: ${err.message}`);
  }

  // 2. Uji Upstash Redis
  try {
    const redis = getRedisClient();
    const res = await redis.ping();
    console.log(`[PASS] Upstash Redis OK! Response: ${res}`);
  } catch (err) {
    console.error(`[FAIL] Upstash Redis: ${err.message}`);
  }

  console.log(`--- SELESAI PENGUJIAN ---\n`);
}

testAll().catch(console.error);
