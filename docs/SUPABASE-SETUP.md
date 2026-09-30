# Membuat database Climate Shelter

File yang perlu dijalankan: `supabase/SETUP-SUPABASE.sql`.

1. Buka project Supabase `tgdcgwmouwcrmqsdwoeu` (Climate Shelter).
2. Buka **SQL Editor → New query**.
3. Buka file `SETUP-SUPABASE.sql`, salin **seluruh isinya**, tempel ke SQL Editor, lalu klik **Run**. Gunakan role SQL Editor `postgres` bawaan, bukan `anon`.
4. Hasil akhir harus berisi `status = SIAP`, `sekolah = 1`, `lokasi = 2`, `esp32 = 2`, `aktuator = 6`, `pembacaan_sensor = 0`, dan `rls_aktif = true`.

Setelah hasil itu muncul, struktur database siap untuk tahap penyambungan kode web ke Supabase. Data Wokwi belum otomatis masuk hanya dengan menjalankan SQL ini; API web dan firmware akan disesuaikan pada tahap berikutnya.

## Yang dibuat

- SD Negeri Candigaron 01, dengan lokasi Shelter dan Ruang Kelas.
- Dua ESP32: satu untuk masing-masing lokasi.
- Shelter: kipas dan pompa air. Ruang Kelas: kipas, pompa air, HVAC, dan ventilasi.
- Penyimpanan data sensor, laporan status aktuator, dan target suhu awal 26,7°C per lokasi.
- Struktur akun, keanggotaan sekolah, konfigurasi, peringatan, dan catatan aktivitas sesuai aplikasi existing.
- Pembatasan database: operator/admin hanya membaca dan mengontrol sekolah yang ditetapkan; super admin mengatur penugasan akun. Satu akun biasa hanya memiliki satu sekolah.
- Pemisahan target suhu yang diminta dari setpoint yang benar-benar dilaporkan perangkat. Kode Wokwi saat ini memakai kontrol otomatis; perintah manual melalui antrean MQTT ditolak untuk perangkat yang dipetakan ke Wokwi.

Semua tabel aplikasi memakai Row Level Security. Tidak ada password, API key, akun demo, ataupun pengukuran sensor palsu dalam file ini. Pendaftaran user tidak otomatis menjadikannya admin. Penetapan super admin pertama dilakukan terpisah, menggunakan akun aplikasi yang Anda pilih.

Sekolah baru belum dibagikan kepada pengunjung tanpa login (`is_public = false`). Nanti super admin dapat mengaktifkan monitoring publik. Data yang dibagikan terbatas pada lingkungan: tanpa kunci perangkat, identitas controller, kehadiran, dan status aktuator.

## Penyimpanan data

Laporan terbaru controller diperbarui setiap kiriman. Sebanyak 720 paket mentah terakhir disimpan per controller (sekitar satu jam jika interval kirim lima detik). Riwayat sensor menyimpan paling banyak satu sampel valid per menit/controller selama 30 hari. Pemangkasan ini hanya berlaku untuk data controller Wokwi terkait, bukan seluruh tabel sekolah lain. Energi, volume air, dan parameter yang tidak diukur tidak dibuat-buat.

## Jika Run menampilkan error

- Jika tertulis **Schema public sudah berisi tabel**, jangan hapus tabel. File ini sengaja berhenti untuk melindungi database yang belum diperiksa. Kirim pesan error atau daftar tabel supaya migration yang sesuai dapat disiapkan.
- Jika tertulis **Versi setup berbeda atau tidak dikenal**, kirim pesan tersebut. Jangan menghapus penanda versi atau mengganti checksum.
- Jika tertulis error lainnya, kirim teks error lengkap. Semua perubahan setup berada dalam satu transaksi sehingga kegagalan membatalkan setup secara keseluruhan.
- File yang sama boleh dijalankan ulang setelah berhasil; data, setpoint, dan perangkat tidak digandakan atau direset.

Jangan menjalankan `seed.sql` atau `seed-hybrid.sql` untuk instalasi ini; kedua file tersebut merupakan data demo untuk pengujian.

## Catatan pengembangan

`SETUP-SUPABASE.sql` dihasilkan oleh `node scripts/build-supabase-setup.mjs` dari migration 001–005 dan `provision-candigaron.sql`. Jangan mengedit file gabungan secara terpisah. Untuk instalasi existing yang sudah pernah dipakai, gunakan migration lanjutan setelah memeriksa versinya, bukan file setup baru.

Uji lokal menggunakan PostgreSQL PGlite meliputi instalasi kosong, pengiriman kedua lokasi, RLS antar sekolah, penolakan data invalid, kiriman ulang, izin setpoint, laporan sensor gagal, proyeksi publik, serta perlindungan database existing. Pengujian lokal ini bukan bukti bahwa SQL sudah dijalankan di project Supabase Anda.
