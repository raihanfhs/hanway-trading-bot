# Dokumen Spesifikasi Strategi: HAN WAY Crypto Multi-Regime (1 Jam)
**Mata Kuliah:** Algorithmic Trading (Trad1 & Trad2) &bull; **UAS Gasal 2026**  
**Penyusun:** Raihan Firdaus Hadi Saputra (NIM: 25110200049)  
**Waktu Pembekuan (Freeze Date):** Rabu, 4 November 2026 pukul 11:50 WIB  

---

## 1. Filosofi & Perubahan dari Versi UTS
Pada UTS, strategi **HAN WAY** dirancang untuk saham harian BEI (Kompas100) menggunakan rezim IHSG harian, fraksi harga BEI, batas ARA/ARB, dan evaluasi sinyal *end-of-day*.

Untuk UAS pasar kripto IDR Indodax, strategi diadaptasi menjadi **HAN WAY Crypto Multi-Regime (1-Hour Timeframe)**:
1. **Timeframe**: Berpindah dari harian (*daily*) ke **1 jam (`tf=60`)** agar memiliki sampel bar yang memadai (240 candle dalam 10 hari forward test).
2. **Rezim Pasar Makro (Macro Benchmark)**:
   - Pada UTS: Memakai momentum 63 hari IHSG.
   - Pada Kripto: Memakai tren **BTC/IDR** (EMA 72 jam vs EMA 168 jam / tren 3 hari vs 7 hari) sebagai penggerak likuiditas dan sentimen global pasar kripto.
3. **Eksekusi Mikrostruktur**:
   - Menghilangkan aturan ARA/ARB saham BEI.
   - Menerapkan **simulasi eksekusi Taker murni** pada *live order book depth* Indodax: beli di antrean *Ask* (VWAP), jual di antrean *Bid* (VWAP).
   - Membebankan biaya *Taker all-in* **0,30%** (mematuhi tarif resmi baru 1 Oktober 2026 yang mencakup biaya layanan, PPh/PPN, dan CFX/KKI fee).
   - Minimum order **Rp 25.000** (aturan mode Pro terketat Indodax).
   - Toleransi *spread bid-ask* maksimum 2% (order ditolak jika spread > 2% atau orderbook kosong).

---

## 2. Pemilihan Universe & Pencegahan Survivorship Bias
Universe terdiri dari **5 pasangan IDR paling likuid di Indodax**:
1. `BTC/IDR` (Pondasi pasar & acuan rezim makro)
2. `ETH/IDR` (Large-cap layer 1)
3. `SOL/IDR` (High-beta momentum leader)
4. `DOGEIDR` (High-volatility retail liquidity)
5. `XRP/IDR` (Established classic with tight tick spread)

**Pencegahan Survivorship Bias:**
Kelima koin ini dipilih berdasarkan riwayat likuiditas dan pencatatan aktif di Indodax sejak awal periode backtest (**November 2023 / 3 tahun lalu**), bukan koin tren baru yang baru melantai. Seluruh koin memiliki data historis 100% utuh tanpa kekosongan bar selama 26.298 jam pengujian.

---

## 3. Aturan Sinyal & Manajemen Risiko Kausal 100%

### A. Filter Rezim Pasar Makro (BTC/IDR)
Dihitung murni dari bar tertutup BTC/IDR:
* **BULL REGIME**: `Close BTC > EMA(72)` DAN `EMA(72) > EMA(168)`.
  * *Budget Risiko*: Maksimum 3 posisi simultan, alokasi 25% ekuitas per posisi.
* **SIDEWAYS REGIME**: `Close BTC` berada di antara `EMA(72)` dan `EMA(168)`.
  * *Budget Risiko*: Maksimum 2 posisi simultan, alokasi 20% ekuitas per posisi.
* **BEAR REGIME**: `Close BTC < EMA(168)`.
  * *Budget Risiko*: **0 posisi baru (100% kas)**, hanya memonitor exit posisi yang sudah terbuka untuk meminimalkan kerugian saat tren pasar melemah.

### B. Aturan Masuk (Entry Signal)
Dievaluasi pada candle tertutup $t$:
1. **Breakout Struktur**: `Close >= Highest(High, 120)` (Breakout Donchian 120 jam / 5 hari).
2. **Trend Alignment**: `Close > EMA(24)` DAN `EMA(24) > EMA(72)` DAN `EMA(72) > EMA(168)`.
3. **Konfirmasi Volume**: Volume bar $t \ge 1.2 \times$ Rata-rata Volume 24 jam terakhir.
4. **Validasi Data**: Tidak ada harga/volume nol, candle terakhir tidak lebih tua dari $2\times$ timeframe (7200 detik), dan spread $\le 2\%$.

### C. Aturan Keluar (Exit Signal & Trailing Stop)
Posisi dimonitor setiap bar tertutup:
1. **Initial Stop Loss**: Ditetapkan saat entry pada `Entry Price - (3.5 * ATR(24))`.
2. **Dynamic Trailing Stop**: `Highest High sejak Entry - (5.0 * ATR(24))`.
3. **Trigger Jual**: Jika `Close <= Active Stop Loss`, order Taker jual dieksekusi di antrean Bid order book.

### D. Manajemen Risiko Wajib Sistem
1. **Daily Loss Limit (3%)**: Dihitung dari batas hari pukul **00:00 WIB (17:00 UTC)**. Bila penurunan ekuitas dalam 1 hari kalender WIB melebihi 3%, bot membekukan seluruh pembukaan posisi baru hingga pukul 00:00 WIB berikutnya.
2. **Manual Kill Switch**: Flag tersimpan di Upstash Redis (`hanway:kill_switch`) dan API `/api/killswitch`, dapat diaktifkan seketika tanpa melakukan deploy ulang.
3. **Idempotency**: Tiap candle IDR hanya boleh diproses satu kali melalui pencatatan stempel waktu `lastProcessedCandleTime`.
4. **Retry & Rate Limit**: Maksimum 3 request per detik ke API Indodax dengan *exponential backoff* dan jeda protektif.
