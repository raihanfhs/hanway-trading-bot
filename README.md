# HAN WAY Crypto Multi-Regime Trading Bot (Indodax IDR)
> **Tugas Akhir Semester (UAS) Algoritma Trading (Trad1 & Trad2)**  
> **Mahasiswa:** Raihan Firdaus Hadi Saputra &bull; **NIM:** 25110200049  
> **Repositori Publik:** [https://github.com/raihanfhs/hanway-trading-bot](https://github.com/raihanfhs/hanway-trading-bot)  
> **Bukti Freeze Commit:** `Senin, 9 November 2026 pukul 15:10 WIB` (Hash: `2c2aee5`) &bull; Tag: `v1.1.0-freeze`  
> **Live Dashboard Vercel:** [https://hanway-trading-bot.vercel.app](https://hanway-trading-bot.vercel.app)

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
│   ├── sync_live_data.js        # Pengunduh log live dari Upstash Redis
│   ├── hitung_ulang.js          # Skrip audit rekalkulasi log mentah
│   └── test_connection.js       # Uji koneksi API publik Indodax
├── dashboard_offline.html       # Dashboard HTML standalone offline
├── package.json                 # Konfigurasi dependensi Node.js
├── README.md                    # Dokumentasi lengkap & instruksi deploy
├── REFLEKSI.md                  # Laporan refleksi selisih backtest vs forward
├── STRATEGI.md                  # Spesifikasi aturan lengkap & perubahan UTS
└── TRANSPARANSI.md              # Laporan transparansi pelaksanaan UAS
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
*Menghasilkan metrik historis 3 tahun menggunakan data asli Indodax.*

### D. Sinkronisasi Data Live Forward Test dari Storage:
```bash
npm run sync:live
```
*Mengunduh log tick, log order simulasi, dan snapshot orderbook dari Upstash Redis ke folder `data/`.*

### E. Menjalankan Skrip Hitung Ulang (Audit Log Mentah):
```bash
npm run recalculate
```
*(Atau `npm run audit`). Skrip ini membaca seluruh log mentah di folder `data/`, menghitung ulang seluruh metrik secara deterministik, menghasilkan `data/dashboard_calculated_metrics.json`, dan memperbarui file `dashboard_offline.html` secara otomatis.*

### F. Membuka Dashboard Mandiri:
Buka file `dashboard_offline.html` langsung di browser Anda (dapat dibuka secara luring tanpa koneksi internet).

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
4. **Jadwal Eksekusi**:
   - Cron berjalan otomatis setiap jam pada menit ke-7 via `.github/workflows/cron_tick.yml`.

---

## 5. Ringkasan Parameter & Desain Strategi

| Parameter | Pengaturan | Keterangan |
|:---|:---|:---|
| **Universe Kripto** | `BTCIDR`, `ETHIDR`, `SOLIDR`, `DOGEIDR`, `XRPIDR` | 5 pasangan IDR terlikuid tanpa survivorship bias |
| **Timeframe** | 1 Jam (`tf=60`) | Cukup bar untuk evaluasi momentum dan swing horizon |
| **Rezim Pasar Makro** | BTC/IDR vs SMA200 bar (200 jam) | Bull: Ekspansi alokasi; Bear: Defensif 100% Kas IDR |
| **Maksimum Posisi** | 3 Slot (Rezim Bull) &bull; 0 Slot (Rezim Bear) | Bobot 30% per posisi dari ekuitas total |
| **Scoring Cross-Sectional** | `0.40*r72 + 0.40*r168 + 0.20*(1/vol24)` | Momentum multi-horizon dan inverse volatility harian |
| **Exit Mechanism** | Time Exit 240 Jam + Trailing Stop Peak | 12% Trailing Stop saat Bull; Time exit rebalancing |
| **Taker Fee Rate** | 0.30% all-in | Mengikuti tarif terketat Indodax efektif 1 Okt 2026 |
| **Minimum Order** | Rp 25.000 | Mengikuti batas order mode Pro Indodax |
| **Daily Loss Limit** | 3% Ekuitas Harian | Batas berganti setiap 00:00 WIB (17:00 UTC) |
| **Idempotency** | Timestamp Bar Tertutup | Mencegah eksekusi ganda pada candle yang sama |

---
*Dikembangkan secara mandiri untuk Tugas Akhir Semester Algoritma Trading 2026.*
