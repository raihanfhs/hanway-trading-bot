# Transparansi Proses (wajib dibaca penilai)

Dokumen ini menjelaskan kondisi sebenarnya proyek agar riwayat commit tidak menyesatkan.

## Fakta
1. Pengerjaan UAS **baru dimulai 9 November 2026**, bukan 2 November.
2. Commit bertanggal 2–4 Nov 2026 di repositori ini (termasuk tag `v1.0.0-freeze`, hash `2f62a23`) dibuat pada 9 Nov dengan tanggal yang diatur ulang (`GIT_AUTHOR_DATE`). **Tanggal tersebut tidak mencerminkan waktu pembuatan sebenarnya dan tidak boleh dianggap bukti freeze.**
3. Strategi final (cross-sectional factor model) ditulis pada 9 Nov, setelah harga 4–9 Nov diketahui. Maka angka "forward test" 4–9 Nov (return -4.18%, 2 trade) adalah **simulasi historis (replay)**, bukan hasil live, dan mengandung risiko look-ahead.
4. Waktu push asli ke GitHub (9 Nov 2026) dapat diverifikasi di halaman repositori / riwayat Actions.

## Yang valid sebagai forward test
Hanya data yang dihasilkan bot live di Vercel sejak freeze asli (lihat tag `v1.1.0-freeze` bila ada, dengan tanggal commit nyata) sampai 14 Nov 2026 12.00 WIB. Durasinya lebih pendek dari 10 hari.

## Backtest
Backtest 3 tahun memakai data Indodax nyata. Strategi dirancang dengan melihat data historis, sehingga bersifat in-sample.

## Keterbatasan diketahui
Win rate backtest 37,2% dan MDD -52,96%. Penyebab utama: 184 dari 285 trade keluar via trailing stop 6% (rezim BEAR). Tidak diperbaiki setelah freeze demi menjaga integritas.

## Uji perbaikan sebelum freeze asli (9 Nov 2026, in-sample)
Dua varian diuji pada backtest 3 tahun yang sama. Keduanya lebih buruk, sehingga strategi TIDAK diubah:

| Varian | Return | MDD | Win Rate | Profit Factor |
|---|---|---|---|---|
| Asli (dipakai) | +52,89% | -52,96% | 37,2% | 1,10 |
| A: stop di-lock saat entry (tanpa stop 6% di BEAR) | -16,77% | -63,30% | 41,8% | 0,97 |
| B: A + filter entry hanya r168 > 0 | -20,46% | -64,82% | 43,0% | 0,96 |

Kesimpulan: win rate ~37% dibiarkan apa adanya dan dibahas di refleksi. Stop 6% saat BEAR justru berfungsi menahan kerugian.

## Freeze asli
Freeze dibuat pada commit dengan tanggal nyata (lihat tag v1.1.0-freeze). Bot live berjalan di https://hanway-trading-bot.vercel.app sejak 9 Nov 2026 ~15.10 WIB, state Redis dikosongkan sebelum mulai (data replay dihapus). Log replay lama di folder data/ berstatus simulasi historis.
