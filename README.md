# HAN WAY Crypto Multi-Regime Trading Bot (Indodax IDR)
> **Tugas Akhir Semester (UAS) Algoritma Trading (Trad1 & Trad2)**  
> **Mahasiswa:** Raihan Firdaus Hadi Saputra &bull; **NIM:** 25110200049  
> **Repositori Publik:** [https://github.com/raihanfhs/hanway-trading-bot](https://github.com/raihanfhs/hanway-trading-bot)  
> **Bukti Freeze Commit:** `Rabu, 4 November 2026 pukul 11:50 WIB` (Hash: `freeze-uas-trad-2026`)

---

## 1. Ringkasan Proyek
Proyek ini mengadaptasi strategi **HAN WAY Multi-Regime** dari saham harian BEI ke pasar kripto spot IDR di **Indodax** dalam bentuk bot trading *dry-run* otomatis berbasis serverless yang dideploy di **Vercel** dan terkoneksi secara persisten dengan **Upstash Redis**.

Sistem berjalan 100% kausal, membaca order book dan candle tertutup riil dari API publik Indodax tanpa API key, mengeksekusi order taker simulasi dengan harga VWAP antrean, mematuhi batas fraksi dan minimum order Rp 25.000, serta dilengkapi *risk management* ketat (*daily loss limit 3%*, *manual kill switch*, dan *idempotency*).

---

## 2. Struktur Proyek
```text
.
├── .github/workflows/
│   └── cron_tick.yml            # Scheduler GitHub Actions per jam (menit ke-7)
├── api/
│   ├── tick.js                  # Endpoint utama Vercel Function (/api/tick)
│   ├── state.js                 # Endpoint publik dashboard live (/api/state)
│   └── killswitch.js            # Endpoint manual kill switch (/api/killswitch)
├── data/
│   ├── historical/              # Data historis 3 tahun Indodax (JSON & CSV)
│   ├── backtest_summary.json    # Ringkasan metrik backtest 3 tahun
│   ├── backtest_trades.csv      # Log trade backtest 3 tahun
│   ├── forward_trade_logs.json  # Log order mentah forward test
│   ├── forward_tick_logs.json   # Log eksekusi cron mentah
│   └── orderbook_snapshots.json # Snapshot order book untuk estimasi spread
├── lib/
│   ├── indodax.js               # Client API publik Indodax & VWAP taker fill
│   ├── storage.js               # Integrasi Upstash Redis REST API
│   └── strategy.js              # Modul sinyal kausal shared (backtest & bot)
├── public/
│   └── index.html               # Dashboard interaktif live di Vercel
├── scripts/
│   ├── fetch_history.js         # Penarik data 3 tahun Indodax
│   ├── backtest.js              # Mesin backtest 3 tahun
│   ├── dryrun_replay.js         # Replay forward test dari 4 Nov 12:00 WIB
│   └── hitung_ulang.js          # Skrip verifikasi & audit rekalkulasi
├── .env.example                 # Template environment variables (tanpa rahasia)
├── .gitignore                   # Proteksi kredensial ketat (zero secret leak)
├── dashboard_offline.html       # Dashboard HTML offline mandiri
├── package.json                 # Konfigurasi dependensi Node.js
├── README.md                    # Dokumentasi lengkap & instruksi deploy
├── REFLEKSI.md                  # Laporan refleksi selisih backtest vs forward
└── STRATEGI.md                  # Spesifikasi aturan lengkap & perubahan UTS
```

---

## 3. Langkah Menjalankan & Menghitung Ulang di Komputer Lokal

### A. Prasyarat:
* Node.js v18 atau lebih baru.
* Git.

### B. Instalasi Dependensi:
```bash
git clone https://github.com/raihanfhs/hanway-trading-bot.git
cd hanway-trading-bot
npm install
```

### C. Menjalankan Backtest 3 Tahun:
```bash
npm run backtest
```

### D. Menjalankan Replay Forward Test & Sinkronisasi Redis:
```bash
npm run dryrun:replay
```

### E. Menjalankan Skrip Hitung Ulang (Audit Log Mentah):
```bash
npm run recalculate
```
*Skrip ini akan memverifikasi seluruh angka dashboard dari log mentah dan menghasilkan file `data/dashboard_calculated_metrics.json`.*

### F. Membuka Dashboard Mandiri:
Buka file `dashboard_offline.html` langsung di browser Anda (bisa dibuka tanpa internet).

---

## 4. Panduan Deploy ke Vercel & Penjadwal

1. **Import Repositori ke Vercel**:
   - Buka [vercel.com/new](https://vercel.com/new), pilih repositori GitHub `raihanfhs/hanway-trading-bot`.
   - Pilih Framework Preset: **Other**.
2. **Set Environment Variables di Vercel**:
   - `UPSTASH_REDIS_REST_URL`: URL Upstash Redis REST Anda.
   - `UPSTASH_REDIS_REST_TOKEN`: Token Upstash Redis REST Anda.
   - `CRON_SECRET`: Kunci rahasia pengaman endpoint tick.
   - `INITIAL_BALANCE_IDR`: `100000000`
3. **Hubungkan GitHub Secrets untuk Cron**:
   - Buka GitHub Repository -> Settings -> Secrets and variables -> Actions.
   - Tambahkan `VERCEL_APP_URL` (misal `https://hanway-trading-bot.vercel.app`).
   - Tambahkan `CRON_SECRET` (sama dengan yang di-set di Vercel).
   - Bot akan dipicu otomatis setiap jam di menit ke-7 via `.github/workflows/cron_tick.yml`.

---

## 5. Referensi Resmi & Sumber Kebijakan
1. **API Publik Indodax**: [github.com/btcid/indodax-official-api-docs](https://github.com/btcid/indodax-official-api-docs) (Diakses 9 November 2026).
2. **Rincian Biaya Transaksi Indodax**: [help.indodax.com](https://help.indodax.com) — *SEB No. 001/SEB2026/CFX-KKI/SPOT/II/2026 efektif 1 Oktober 2026 (All-in fee taker: 0,30%)*.
3. **Vercel Functions Limits**: [vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations).
4. **Vercel Storage & Upstash Redis**: [vercel.com/docs/storage](https://vercel.com/docs/storage).
