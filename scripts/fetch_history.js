// scripts/fetch_history.js
// Script penarikan data historis Indodax 3 tahun (tf=60) sesuai ketentuan UAS Trad1 & Trad2
import fs from 'fs';
import path from 'path';

const SYMBOLS = ['BTCIDR', 'ETHIDR', 'SOLIDR', 'DOGEIDR', 'XRPIDR'];
const TF = 60; // 60 menit (1 jam)
const THREE_YEARS_SEC = Math.floor(3 * 365.25 * 24 * 3600);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getServerTime() {
  const res = await fetch('https://indodax.com/api/server_time');
  const json = await res.json();
  return Math.floor(json.server_time / 1000);
}

async function fetchHistoryForSymbol(symbol, serverSec) {
  console.log(`\n==================================================`);
  console.log(`[PULL] Memulai penarikan data 3 tahun untuk ${symbol}...`);
  
  const fromTarget = serverSec - THREE_YEARS_SEC;
  let currentTo = serverSec;
  const barsMap = new Map();
  let requestCount = 0;

  while (currentTo > fromTarget) {
    const url = `https://indodax.com/tradingview/history_v2?symbol=${symbol}&tf=${TF}&from=${fromTarget}&to=${currentTo}`;
    try {
      requestCount++;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[WARN] HTTP ${res.status} saat menarik ${symbol}. Tunggu 2 detik...`);
        await sleep(2000);
        continue;
      }
      
      const bars = await res.json();
      if (!Array.isArray(bars) || bars.length === 0) {
        console.log(`[INFO] Selesai: Tidak ada bar lebih lama untuk ${symbol}.`);
        break;
      }

      let addedInBatch = 0;
      let minTimeInBatch = Infinity;

      for (const bar of bars) {
        // Aturan Page 2: Buang bar dengan Time + durasi timeframe > server_time (candle belum tutup)
        if (bar.Time + TF * 60 > serverSec) {
          continue;
        }

        if (!barsMap.has(bar.Time)) {
          barsMap.set(bar.Time, {
            time: bar.Time,
            open: Number(bar.Open),
            high: Number(bar.High),
            low: Number(bar.Low),
            close: Number(bar.Close),
            volume: Number(bar.Volume)
          });
          addedInBatch++;
        }

        if (bar.Time < minTimeInBatch) {
          minTimeInBatch = bar.Time;
        }
      }

      const earliestDate = new Date(minTimeInBatch * 1000).toISOString().replace('T', ' ').slice(0, 19);
      process.stdout.write(`\r  Req #${requestCount}: Total ${barsMap.size} bar tersimpan | Mundur s/d: ${earliestDate} UTC`);

      if (minTimeInBatch >= currentTo) {
        // Tidak ada bar baru yang lebih mundur
        break;
      }

      currentTo = minTimeInBatch - 1;
      // Beri jeda 350ms agar aman di bawah rate limit 3 req/detik
      await sleep(350);

    } catch (err) {
      console.error(`\n[ERR] Gagal menarik data: ${err.message}. Tunggu 3 detik...`);
      await sleep(3000);
    }
  }

  // Urutkan data secara kronologis (dari masa lalu ke masa sekarang)
  const sortedBars = Array.from(barsMap.values()).sort((a, b) => a.time - b.time);
  console.log(`\n[OK] Selesai ${symbol}: ${sortedBars.length} candle 1 jam berhasil diunduh.`);

  // Simpan ke file JSON
  const jsonPath = path.resolve('data/historical', `${symbol}_60m.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(sortedBars, null, 2), 'utf8');

  // Simpan ke format CSV
  const csvPath = path.resolve('data/historical', `${symbol}_60m.csv`);
  let csvContent = 'time,datetime_utc,datetime_wib,open,high,low,close,volume\n';
  for (const b of sortedBars) {
    const utcStr = new Date(b.time * 1000).toISOString();
    const wibStr = new Date(b.time * 1000 + 7 * 3600 * 1000).toISOString().replace('Z', '+07:00');
    csvContent += `${b.time},${utcStr},${wibStr},${b.open},${b.high},${b.low},${b.close},${b.volume}\n`;
  }
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  console.log(`[FILE] Tersimpan di: ${jsonPath} & ${csvPath}`);

  return sortedBars;
}

async function main() {
  const serverSec = await getServerTime();
  console.log(`Indodax Server Time: ${new Date(serverSec * 1000).toISOString()} (${serverSec})`);
  console.log(`Target 3 Tahun: ${new Date((serverSec - THREE_YEARS_SEC) * 1000).toISOString()}`);

  for (const sym of SYMBOLS) {
    await fetchHistoryForSymbol(sym, serverSec);
  }

  console.log(`\n==================================================`);
  console.log(`[SELESAI] Seluruh 5 pasangan IDR berhasil ditarik 100%!`);
}

main().catch(console.error);
