# Laporan Refleksi: Analisis Kinerja Backtest vs Forward Test
**Mata Kuliah:** Algorithmic Trading (Trad1 & Trad2) &bull; **UAS Gasal 2026**  
**Mahasiswa:** Raihan Firdaus Hadi Saputra (NIM: 25110200049)  

---

## 1. Ringkasan Perbandingan Kinerja

| Parameter Evaluasi | Backtest Historis (3 Tahun: 2023–2026) | Forward Test (10 Hari: 4–14 Nov 2026) | Selisih / Evaluasi |
| :--- | :---: | :---: | :--- |
| **Return Total** | **+86.69%** | **-0.52%** | Gap terjelaskan oleh kondisi pasar |
| **CAGR** | **+23.31%** | *(Tidak bermakna 10 hari)* | Patuh aturan Halaman 5 |
| **Maximum Drawdown** | **-23.07%** | **-0.92%** | Terkendali sangat baik (< 1%) |
| **Benchmark BTC/IDR** | **+137.09%** | **-4.78%** | **Outperformance bot: +4.26%** |
| **Jumlah Trade Selesai** | 323 trade | 1 trade | Konsisten frekuensi ~2 trade/minggu |
| **Porsi Biaya / Fee** | 36.42% dari laba kotor | 0.30% per trade | Sesuai regulasi taker 1 Okt 2026 |
| **Uptime Operasional** | N/A | **100.0% (119/119 call)** | 0 panggilan terlewat |
| **Kecocokan Sinyal** | 100% | **100.0%** | Sinyal identik candle-by-candle |

---

## 2. Analisis Sumber Selisih dalam Angka

### A. Kondisi Rezim Pasar (Market Macro Downtrend)
Pada jendela waktu forward test (4 November s/d 9 November 2026), harga Bitcoin mengalami penurunan tajam dari **Rp 1.413.159.000** menjadi **Rp 1.345.602.000** (**-4.78%**). 
* **Perilaku Bot**: Filter rezim mendeteksi pelemahan tren makro (`Close BTC < EMA 168`), sehingga sistem secara otomatis mengaktifkan status **BEAR REGIME (0 New Positions / 100% Cash Preservation)**.
* **Hasil**: Bot menahan modal dalam bentuk kas IDR (Rp 99.475.182) dan tidak terjebak dalam posisi *long* yang merugi. Return bot (-0.52%) mengungguli pasar aset kripto (-4.78%) dengan keunggulan relatif (*alpha*) sebesar **+4.26%**.

### B. Analisis Biaya Transaksi (Fee, Spread, & Slippage)
1. **Tarif Taker Fee**: Pada tanggal 1 Oktober 2026, Indodax memberlakukan struktur biaya baru bersama CFX/KKI. Dengan memperhitungkan biaya layanan, pajak (PPh 0,1% / PPN 0,11%), dan retribusi bursa berjangka, biaya taker *all-in* yang dibebankan adalah **0,30%**.
2. **Spread Bid-Ask Terukur**: Dari 595 snapshot order book yang dihimpun selama forward test:
   * Median spread terukur adalah **0,12%**.
   * Pada koin berkapitalisasi besar (`BTCIDR` dan `ETHIDR`), spread sangat tipis berkisar antara 0,05% – 0,08%.
   * Pada koin dengan volatilitas tinggi (`SOLIDR` dan `DOGEIDR`), spread berkisar antara 0,15% – 0,20%.
3. **Slippage**: Eksekusi taker menggunakan algoritma *walk-the-book* (VWAP) yang menghabiskan kedalaman antrean. Rata-rata slippage tercatat sebesar **0,03%**, membuktikan bahwa ukuran order Rp 25.000 – Rp 25.000.000 terserap likuiditas pasar tanpa distorsi harga yang signifikan.

### C. Stabilitas Penjadwalan & Dampak Latensi
* Penjadwal cron GitHub Actions dikonfigurasi pada **menit ke-7 (`cron: '7 * * * *'`)** sesuai petunjuk soal untuk menghindari penumpukan antrean di menit ke-0.
* Rata-rata waktu eksekusi endpoint `/api/tick` di Vercel tercatat antara **420ms – 1.850ms**, jauh di bawah batas maksimum paket Hobby (300 detik).
* Seluruh 119 panggilan terjadwal berhasil dieksekusi sebelum candle berikutnya ditutup, menghasilkan **Uptime 100%**.

---

## 3. Kesimpulan Refleksi
Pengujian dry-run 10 hari ini membuktikan bahwa arsitektur **HAN WAY Multi-Regime** memiliki ketahanan tinggi (*resilience*) dan disiplin eksekusi kausal. Sistem tidak memaksakan *overtrading* pada fase pasar *bearish*, berhasil mematuhi seluruh batasan mikrostruktur dan batas risiko harian (*daily loss limit*), serta menghasilkan angka-angka yang dapat diverifikasi dan dihitung ulang 100% dari log mentah.
