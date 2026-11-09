// lib/storage.js
// Persistent State Management via Upstash Redis REST API
import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';

// Helper load env lokal bila process.env belum disetel
function loadLocalEnv() {
  if (fs.existsSync('.env')) {
    const lines = fs.readFileSync('.env', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [k, ...v] = trimmed.split('=');
      const val = v.join('=').replace(/^["']|["']$/g, '');
      if (!process.env[k.trim()]) {
        process.env[k.trim()] = val.trim();
      }
    }
  }
}

// Inisialisasi client Redis
let redisInstance = null;

export function getRedisClient() {
  if (redisInstance) return redisInstance;

  loadLocalEnv();
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN wajib disetel di Environment Variables!');
  }

  redisInstance = new Redis({ url, token });
  return redisInstance;
}

export const KEYS = {
  STATE: 'hanway:bot_state',
  POSITIONS: 'hanway:positions',
  TRADES: 'hanway:trade_logs',
  TICKS: 'hanway:tick_logs',
  SNAPSHOTS: 'hanway:orderbook_snapshots',
  DAILY_EQUITY: 'hanway:daily_equity',
  ERRORS: 'hanway:error_logs',
  KILL_SWITCH: 'hanway:kill_switch'
};

/**
 * Mengambil state bot terkini
 */
export async function getBotState() {
  const redis = getRedisClient();
  const state = await redis.get(KEYS.STATE);
  if (!state) {
    return {
      cashIdr: 100000000,
      totalEquityIdr: 100000000,
      initialBalanceIdr: 100000000,
      lastProcessedCandleTime: 0,
      dailyStartEquity: 100000000,
      currentDayWib: '',
      dailyLossExceeded: false,
      killSwitchActive: false,
      uptimeTotalScheduled: 0,
      uptimeExecuted: 0,
      startedAt: new Date().toISOString()
    };
  }
  return typeof state === 'string' ? JSON.parse(state) : state;
}

/**
 * Menyimpan state bot
 */
export async function saveBotState(state) {
  const redis = getRedisClient();
  await redis.set(KEYS.STATE, JSON.stringify(state));
}

/**
 * Mengambil daftar posisi terbuka
 */
export async function getOpenPositions() {
  const redis = getRedisClient();
  const pos = await redis.get(KEYS.POSITIONS);
  if (!pos) return {};
  return typeof pos === 'string' ? JSON.parse(pos) : pos;
}

/**
 * Menyimpan daftar posisi terbuka
 */
export async function saveOpenPositions(positions) {
  const redis = getRedisClient();
  await redis.set(KEYS.POSITIONS, JSON.stringify(positions));
}

/**
 * Menambahkan riwayat trade log
 */
export async function appendTradeLog(trade) {
  const redis = getRedisClient();
  await redis.rpush(KEYS.TRADES, JSON.stringify(trade));
}

/**
 * Mengambil seluruh riwayat trade log
 */
export async function getAllTrades() {
  const redis = getRedisClient();
  const trades = await redis.lrange(KEYS.TRADES, 0, -1);
  return trades.map(t => (typeof t === 'string' ? JSON.parse(t) : t));
}

/**
 * Menambahkan tick log (panggilan bot per jam)
 */
export async function appendTickLog(tick) {
  const redis = getRedisClient();
  await redis.rpush(KEYS.TICKS, JSON.stringify(tick));
}

/**
 * Mengambil tick logs
 */
export async function getAllTicks() {
  const redis = getRedisClient();
  const ticks = await redis.lrange(KEYS.TICKS, 0, -1);
  return ticks.map(t => (typeof t === 'string' ? JSON.parse(t) : t));
}

/**
 * Menyimpan snapshot order book
 */
export async function appendOrderBookSnapshot(snapshot) {
  const redis = getRedisClient();
  await redis.rpush(KEYS.SNAPSHOTS, JSON.stringify(snapshot));
}

export async function getAllSnapshots() {
  const redis = getRedisClient();
  const snaps = await redis.lrange(KEYS.SNAPSHOTS, 0, -1);
  return snaps.map(s => (typeof s === 'string' ? JSON.parse(s) : s));
}

/**
 * Mengambil status kill switch
 */
export async function isKillSwitchActive() {
  const redis = getRedisClient();
  const val = await redis.get(KEYS.KILL_SWITCH);
  return val === '1' || val === true || val === 'true';
}

/**
 * Mengubah status kill switch manual
 */
export async function setKillSwitch(active) {
  const redis = getRedisClient();
  await redis.set(KEYS.KILL_SWITCH, active ? '1' : '0');
}
