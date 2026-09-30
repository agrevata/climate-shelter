# Perbaikan dashboard User dan error operator — 28 September 2026

Dashboard operator gagal dirender karena `DashboardView` memanggil `RoomStatusBanner` dan variabel `row` yang tidak didefinisikan. Pemanggilan tersebut dihapus. Status ruangan kini berada dalam komponen khusus User. Error boundary menggunakan `retry` sesuai dokumentasi Next.js yang terpasang, dengan pesan netral yang tidak menyimpulkan penyebabnya adalah jaringan.

## Dashboard User

Role database `public` (dan alias lama `viewer`) diperlakukan sebagai User biasa. Pilihan **User (monitoring)** tersedia pada login demo. Tampilan yang sama digunakan pada `/monitoring` tanpa login, hanya untuk sekolah yang membagikan data.

- Tepat delapan kartu: Suhu, Kelembapan, CO₂, PM2.5, Kenyamanan Termal, Kualitas Udara, Energi Kumulatif, Status PCM.
- Status ruangan mempertimbangkan kelima parameter lingkungan. Parameter kosong tidak dianggap baik. Gabungan kualitas udara mengikuti parameter dengan kondisi terburuk.
- Ambang awal dikonfigurasi di `shared/status-config.ts`. Ini indikator proyek yang perlu disesuaikan dengan SOP sekolah.
- Satu label sumber di header, tanpa klaim bahwa simulator aplikasi adalah Wokwi.
- Waktu pembaruan relatif memakai timestamp telemetry. Data lewat dua menit ditandai tidak tersedia dan tidak diberi label nyaman.
- Energi menampilkan total sejak pencatatan, dengan tanggal awal yang belum tersedia. Tidak dilabeli konsumsi bulanan.
- Grafik enam parameter dengan pilihan 1/6/24 jam dan 7/30 hari; tidak mengisi periode kosong dengan data buatan pada koneksi nyata.
- Tata letak empat kolom desktop, dua tablet, satu ponsel. Navigasi User hanya Monitoring, Riwayat lingkungan, dan Peringatan lingkungan.

## Batas akses dan integrasi

API dashboard menyaring perangkat, perintah, log, kontrol, anggota dan statistik operasional sebelum mengirim data ke User. Peringatan User memakai kategori lingkungan yang diizinkan dan pesan umum. Route operasional ditolak di server. Endpoint actuator dan pengaturan tetap memeriksa role.

**Untuk Supabase yang sudah memakai migration 002, jalankan `supabase/migrations/003_user_monitoring.sql` sekali.** Migration ini memperketat RLS tabel operasional dan mengganti payload publik lama agar tidak menyertakan heartbeat atau identitas perangkat. Untuk instalasi awal, ikuti urutan 001 → 002 → 003 dalam README. Mode demo tidak memerlukan SQL ini untuk berjalan.

Subscription Supabase Realtime dipertahankan. User berlangganan sensor, peringatan dan konfigurasi; monitoring anonim berlangganan proyeksi publik yang diperbarui oleh trigger sensor. Penyegaran cadangan koneksi nyata setiap 60 detik, dengan debounce perubahan. Simulasi lokal memakai interval yang sudah tersedia.

Pengujian perangkat Wokwi/ESP32 dan Supabase hosted belum dilakukan: lingkungan ini menggunakan mode demo tanpa kredensial perangkat nyata. SQL diuji secara lokal dengan PGlite; untuk staging, terapkan migration, masuk sebagai User, kirim telemetry melalui bridge yang telah dikonfigurasi, lalu pastikan kartu berubah melalui Realtime tanpa memuat ulang browser.

## File yang berubah

| Bagian | File |
| --- | --- |
| Error operator dan pemulihan halaman | `src/components/dashboard-view.tsx`, `src/app/error.tsx` |
| Tampilan khusus User dan publik | `src/components/user-monitoring.tsx` (baru), `src/components/public-site.tsx`, `src/components/platform-view.tsx`, `src/components/shell.tsx`, `src/app/globals.css` |
| Kartu operasional: pembersihan import dan label energi | `src/components/monitor-widgets.tsx` |
| Interpretasi status dan formatter | `shared/status-config.ts`, `src/lib/metrics.ts` |
| Akses route dan penyaringan respons | `shared/monitoring-access.ts` (baru), `src/app/dashboard/[view]/page.tsx`, `src/lib/data.ts` |
| Payload publik dan pembaruan | `src/lib/public-data.ts`, `src/lib/public-types.ts`, `src/components/dashboard-provider.tsx` |
| Demo User | `src/app/api/auth/login/route.ts`, `src/components/login-form.tsx`, `src/lib/demo-store.ts`, `src/lib/demo.ts` |
| Keamanan database | `supabase/migrations/003_user_monitoring.sql` (baru) |
| Pengujian | `tests/monitoring.test.ts` (baru), `tests/platform.test.ts`, `scripts/smoke.mjs` |
| Panduan dan catatan | `README.md`, `docs/VERIFICATION.md`, dokumen ini |

Nama sekolah dan perubahan visual proyek yang sudah ada dipertahankan. Antarmuka operasional tetap memiliki perangkat, kontrol, heat map, dan riwayat lengkap.
