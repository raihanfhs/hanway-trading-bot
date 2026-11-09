# Dokumen Spesifikasi Strategi: HAN WAY Multi-Regime Cross-Sectional Factor Model (1 Jam)
**Mata Kuliah:** Algorithmic Trading (Trad1 & Trad2) &bull; **UAS Gasal 2026**  
**Penyusun:** Raihan Firdaus Hadi Saputra (NIM: 25110200049)  
**Waktu Pembekuan (Freeze Date):** Rabu, 4 November 2026 pukul 11:50 WIB  

---

## 1. Filosofi & Perubahan dari Versi UTS
Pada UTS, strategi **HAN WAY** dirancang untuk saham harian BEI (Kompas100) menggunakan rezim IHSG harian, ranking faktor momentum cross-sectional, dan holding mingguan.

Untuk UAS pasar kripto spot IDR di Indodax, sistem mempertahankan **100% DNA orisinal HAN WAY**:
1. **Timeframe**: Berpindah dari harian (*daily*) ke **1 jam (`tf=60`)** agar memiliki sampel bar yang memadai (240 candle dalam 10 hari forward test).
2. **Rezim Pasar Makro (Macro Benchmark)**:
   - Pada UTS: Memakai IHSG vs SMA200 hari.
   - Pada Kripto: Memakai **BTC/IDR vs SMA200 jam** sebagai penggerak likuiditas dan sentimen pasar kripto.
3. **Cross-Sectional Factor Ranking**:
   - Sistem **bukanlah trend following generik** (bukan Donchian atau moving average crossover biasa).
   - Sistem melakukan ranking kompetitif antar-aset menggunakan formula:
     $$\text{Score}_{\text{Bull}} = 0.40 \cdot r_{72} + 0.40 \cdot r_{168} + 0.20 \cdot \left(\frac{1}{\text{vol}_{24}}\right)$$
   - Mengombinasikan momentum multi-horizon (3 hari dan 7 hari) dengan penimbang **Inverse Volatility ($1/\text{vol}_{24}$)** untuk memprioritaskan aset ber-momentum stabil dengan volatilitas rendah.
4. **Proteksi Rezim Bear & Defensive Cash Preservation**:
   - Di pasar *Bear* (BTC $\le$ SMA200), sistem secara otomatis menghentikan pembukaan posisi baru (100% Kas IDR) untuk mencegah kerugian saat pasar sedang turun.
5. **Eksekusi Mikrostruktur Realistis**:
   - Order Taker dieksekusi di antrean order book Indodax (VWAP) dengan fee all-in **0,30%** (berdasarkan regulasi resmi 1 Oktober 2026 yang mencakup biaya bursa CFX/KKI dan pajak).
   - Minimum order **Rp 25.000** (aturan mode Pro terketat Indodax).
   - Toleransi *spread bid-ask* maksimum 2% (order ditolak jika spread > 2% atau orderbook kosong).

---

## 2. Pemilihan Universe & Pencegahan Survivorship Bias
Universe terdiri dari **5 pasangan IDR paling likuid di Indodax**:
1. `BTC/IDR` (Pondasi pasar & acuan rezim makro)
2. `ETH/IDR` (Large-cap layer 1)
3. `SOL/IDR` (High-beta momentum leader)
4. `DOGEIDR` (High-volatility retail liquidity)
5. `XRPIDR` (Established classic with tight tick spread)

**Pencegahan Survivorship Bias:**
Kelima koin ini dipilih berdasarkan riwayat likuiditas dan pencatatan aktif di Indodax sejak awal periode backtest (**November 2023 / 3 tahun lalu**), bukan koin tren baru yang baru melantai. Seluruh koin memiliki data historis 100% utuh tanpa kekosongan bar selama 26.298 jam pengujian.

---

## 3. Aturan Sinyal & Manajemen Risiko Kausal 100%

### A. Filter Rezim Pasar Makro (BTC/IDR)
Dihitung murni dari bar tertutup BTC/IDR:
* **BULL REGIME**: `Close BTC > SMA(200 jam)`.
  * *Budget Risiko*: Maksimum 3 posisi simultan, alokasi 30% ekuitas per slot, batas holding `holdMaxHours = 240 jam` (10 hari), trailing stop 12%.
* **BEAR REGIME**: `Close BTC <= SMA(200 jam)`.
  * *Budget Risiko*: **0 posisi baru (100% Kas IDR)**, proteksi modal defensif. Posisi terbuka yang masih ada diperketat trailing stop-nya menjadi 6% (*fast bear exit*).

### B. Aturan Masuk (Cross-Sectional Candidate Ranking)
Dievaluasi pada jadwal rebalancing berkala:
1. Hitung return $r_{24}$ (1 hari), $r_{72}$ (3 hari), $r_{168}$ (7 hari), dan volatilitas tahunan $\text{vol}_{24}$.
2. Di rezim Bull: Seleksi koin dengan $r_{72} > 0$ dan $r_{168} > 0$, lalu hitung $\text{Score} = 0.40 \cdot r_{72} + 0.40 \cdot r_{168} + 0.20 \cdot (1/\text{vol}_{24})$.
3. Urutkan koin dari skor tertinggi, lalu alokasikan kas pada koin-koin berperingkat teratas hingga kuota slot terpenuhi.

### C. Aturan Keluar (Dual Exit Mechanism)
Posisi dimonitor setiap bar tertutup:
1. **Time-Based Exit**: Posisi ditutup setelah mencapai batas durasi holding optimal (`holdMaxHours = 240 jam`).
2. **Peak Trailing Stop**: Posisi ditutup jika harga jatuh melebihi 12% dari harga tertinggi (*peak*) yang pernah dicapai sejak entry (atau 6% bila pasar makro berbalik menjadi Bear).

### D. Manajemen Risiko Wajib Sistem
1. **Daily Loss Limit (3%)**: Dihitung dari batas hari pukul **00:00 WIB (17:00 UTC)**. Bila penurunan ekuitas dalam 1 hari kalender WIB melebihi 3%, bot membekukan seluruh pembukaan posisi baru hingga pukul 00:00 WIB berikutnya.
2. **Manual Kill Switch**: Flag tersimpan di Upstash Redis (`hanway:kill_switch`) dan API `/api/killswitch`, dapat diaktifkan seketika tanpa melakukan deploy ulang.
3. **Idempotency**: Tiap candle IDR hanya boleh diproses satu kali melalui pencatatan stempel waktu `lastProcessedCandleTime`.
4. **Retry & Rate Limit**: Maksimum 3 request per detik ke API Indodax dengan jeda protektif.
