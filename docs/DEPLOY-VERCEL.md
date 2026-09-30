# Deploy Climate Shelter melalui GitHub dan Vercel

Database project `tgdcgwmouwcrmqsdwoeu` sudah disiapkan dengan `SETUP-SUPABASE.sql`. Jangan jalankan ulang seed demo. File SQL yang sudah dipakai tetap disimpan sebagai riwayat setup.

## 1. Isi dua key Supabase

Di Supabase buka **Settings → API Keys**. Salin **Publishable key** dan **Secret key** ke `.env.local` pada laptop:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://tgdcgwmouwcrmqsdwoeu.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ISI_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=ISI_SECRET_KEY
```

URL sudah diisi; dua nilai key masih kosong. Isi langsung di editor, tidak perlu mengirim key lewat chat. Nama lama `NEXT_PUBLIC_SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY` tetap didukung bila project masih menggunakan legacy keys.

`SUPABASE_SECRET_KEY` hanya untuk server. Jangan masukkan ke Wokwi, file example, kode browser, atau GitHub. Perangkat akan mendapat key `cs_...` yang terpisah untuk tiap ESP32.

Untuk mencoba login dan database nyata di localhost, hentikan server sebelumnya lalu jalankan:

```powershell
npm run dev:cloud
```

Perintah tersebut memakai Supabase dan tidak membuka tunnel. `npm run dev` tetap mengikuti konfigurasi lokal sebelumnya. Wokwi online memerlukan alamat web yang dapat dijangkau: gunakan endpoint Vercel setelah deploy. Menjalankan `dev:cloud` saja tidak membuat localhost dapat dijangkau Wokwi.

## 2. Buat akun super admin pertama

1. Supabase → **Authentication → Users → Add user → Create new user**.
2. Buat akun menggunakan email dan password milik Anda (minimal 12 karakter). Untuk akun awal yang Anda buat sendiri, gunakan opsi konfirmasi email otomatis jika tersedia.
3. Buka `supabase/ACTIVATE-SUPER-ADMIN.sql`. Ganti `GANTI_DENGAN_EMAIL_ANDA` dengan email yang sama.
4. Jalankan file itu di SQL Editor. Hasilnya harus `SUPER ADMIN SIAP`.
5. Login ke web dengan email/password tadi. Akun dashboard Supabase tidak otomatis menjadi akun aplikasi Climate Shelter.

Super admin kemudian dapat menetapkan operator/admin ke sekolah melalui User Management. Akun operator hanya bisa mengakses perangkat sekolah yang ditetapkan.

## 3. Push project ke GitHub

Gunakan folder `D:\IoT PLN\climate-shelter-iot` sebagai root repository (folder yang berisi `package.json`). Inisialisasi repository dan push melalui VS Code/Source Control atau Git sesuai akun Anda. Belum ada repository Git yang dibuat atau di-push oleh asisten.

`.gitignore` mengecualikan `.env.local`, folder `work` (termasuk token tunnel, simulator, dan compiler), `node_modules`, hasil build, dan `secrets.h`. File `.env.example` serta `.env.vercel.example` hanya contoh kosong. Jangan mengunggah seluruh folder laptop secara manual atau memaksa menambahkan file yang diabaikan Git.

## 4. Import ke Vercel

1. Vercel → **Add New → Project** → import repository GitHub tadi.
2. Framework **Next.js**; Root Directory adalah folder yang berisi `package.json`. Gunakan Node.js 24.x.
3. Isi tiga environment variable yang sama dengan bagian 1, untuk environment **Production**. Untuk preview yang akan dipakai testing, isi juga di Preview (sebaiknya memakai database pengujian terpisah).
4. Biarkan Build Command dari `vercel.json`: **npm run build:cloud**. Demo dan tunnel otomatis dimatikan dalam build cloud.
5. Klik **Deploy**. Setelah berhasil, gunakan domain produksi proyek, misalnya `https://nama-project.vercel.app`, bukan URL preview per commit.

`APP_ORIGIN` otomatis mengambil domain produksi Vercel; pastikan **Automatically expose System Environment Variables / Enable access to System Environment Variables** aktif. Jangan menyalin `APP_ORIGIN=http://localhost:3000` ke Vercel. Bila memakai domain sendiri, Anda dapat menetapkan `APP_ORIGIN=https://domain-anda` secara eksplisit. Nilai ini juga menentukan pemeriksaan asal form login dan URL undangan/reset password.

Setelah punya URL, Supabase → **Authentication → URL Configuration**:

- **Site URL** = alamat produksi Vercel.
- **Redirect URLs** = `https://ALAMAT-PRODUKSI/auth/callback` dan `https://ALAMAT-PRODUKSI/auth/confirm` (tambahkan callback localhost hanya jika Anda memakai alur reset/login lokal).
- Jika memakai undangan/reset melalui email, sesuaikan template sesuai `docs/AUTH.md` bila file itu tersedia, atau panduan autentikasi di README. Jangan mengganti seluruh proteksi autentikasi untuk melewati masalah redirect.

## 5. Sambungkan kedua Wokwi

Gunakan project existing, tidak perlu membuat project baru:

| Lokasi | Wokwi | File sketch terbaru |
|---|---|---|
| Ruang Kelas | https://wokwi.com/projects/476418811507177473 | `firmware/wokwi/classroom/sketch.ino` |
| Shelter | https://wokwi.com/projects/476516571987622913 | `firmware/wokwi/shelter/sketch.ino` |

Ganti **seluruh isi sketch.ino** di masing-masing project dengan file yang sesuai. Rangkaian dan library existing tetap sesuai. Sketch terbaru berisi sertifikat CA publik, buffer untuk key perangkat, dan validasi HTTPS; sketch lama di tab browser belum otomatis diperbarui oleh perubahan file di laptop.

1. Login sebagai super admin/admin pada web Vercel → **Devices**.
2. Pilih **Rotasi API key** pada **ESP32 Shelter**. Simpan key yang ditampilkan sekali. Panel juga menyediakan baris `CONNECT` lengkap jika web dibuka melalui HTTPS.
3. Run Wokwi Shelter. Tempel baris `CONNECT` ke Serial Monitor lalu Enter.
4. Ulangi pada **ESP32 Ruang Kelas**, menggunakan key milik controller tersebut.

```text
CONNECT https://ALAMAT-PRODUKSI/api/wokwi/telemetry KEY_ESP32_LOKASI_INI
```

Key harus berbentuk `cs_...`, bukan key Supabase. Kipas/pompa/HVAC/ventilasi tidak memerlukan key terpisah karena dikendalikan oleh ESP32 lokasi masing-masing. Jangan menaruh key dalam sketch Wokwi publik. Konfigurasi CONNECT hanya disimpan di RAM: kirim ulang setelah simulasi dihentikan dan dijalankan ulang. URL produksi dan key tetap sama sampai domain diganti atau key dirotasi.

Setelah Wi-Fi dan sinkronisasi waktu siap, Serial Monitor harus menampilkan **HTTPS POST: 200**. Dashboard → pilih Shelter atau Ruang Kelas; nilai dan status berubah menurut sensor. Ubah target suhu di Control Panel lalu pastikan **Diterapkan ESP32** menyusul target setelah paket berikutnya.

Tidak memerlukan Cloudflare Tunnel untuk jalur **Wokwi → Vercel → Supabase**. Laptop boleh dimatikan untuk website Vercel; simulasi Wokwi browser tetap memerlukan sesi simulasi berjalan. Pada ESP32 fisik, ganti Wi-Fi dan provision key secara privat.

## Jika belum masuk

- **401**: key controller salah/dicabut atau memakai key Supabase alih-alih key perangkat.
- **403/409**: key milik lokasi lain, controller tidak aktif, atau payload tidak cocok.
- **404 / halaman login Vercel**: URL salah atau domain masih dilindungi Deployment Protection. Gunakan domain produksi yang memang diperuntukkan bagi aplikasi ini; jangan menaruh bypass secret Vercel di sketch publik.
- **HTTPS negatif**: lihat koneksi Wi-Fi, waktu NTP, dan rantai sertifikat domain. Firmware tidak mematikan pemeriksaan HTTPS.
- **Tidak ada sekolah**: akun belum diberi akses oleh super admin.
- **Monitoring publik kosong**: sharing sekolah default mati. Aktifkan opsi publik sekolah di School Management hanya bila ingin halaman tanpa login menampilkan data lingkungan. Dashboard operator tetap tersedia berdasarkan hak akses.

## Verifikasi pengembangan

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build:cloud` (setelah mengisi key). Firmware kedua lokasi dapat dikompilasi lewat compiler lokal dengan `node scripts/compile-wokwi-local.mjs` bila toolchain di `work` tersedia. Build web/firmware tidak membuktikan kiriman real ke Supabase; bukti akhirnya adalah HTTP 200 dan perubahan dashboard saat simulasi berjalan.

Referensi resmi: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Vercel project configuration](https://vercel.com/docs/project-configuration), [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Wokwi Wi-Fi](https://docs.wokwi.com/guides/esp32-wifi).
