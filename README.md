# Climate Shelter School

## ESP32 Wokwi + pompa otomatis (lokal)

Jalankan **`npm run dev`**, Run kedua project Wokwi, lalu salin isi `work/wokwi/connect.txt` ke Serial Monitor masing-masing project dan Enter. Buka **http://localhost:3000/monitoring**, pilih **SD Negeri Candigaron 01 → Shelter / Ruang Kelas**. Shelter memiliki kipas + pompa; kelas memiliki kipas + pompa + HVAC + ventilasi. Riwayat dan setpoint kedua lokasi terpisah. Setpoint default 26,7°C, dengan interlock tandon kosong. Firmware ada di `firmware/wokwi/shelter/` dan `firmware/wokwi/classroom/`; panduan serta tautan kedua project ada di [docs/WOKWI-LOCAL.md](docs/WOKWI-LOCAL.md). Integrasi localhost ini terpisah dari ingest Supabase produksi yang dijelaskan di bawah.

Website hybrid publik dan dashboard IoT, dibangun di proyek yang sama: **Next.js App Router + TypeScript + Tailwind CSS + Supabase + Recharts + Lucide**.

Lokasi: `D:\IoT PLN\climate-shelter-iot`. Bisa dijalankan tanpa kredensial dalam **mode demo**. Dokumen Climate Shelter menjadi dasar konsep; CO₂, PM2.5, PCM, multi-school dan HTTP ESP32 ditambahkan sesuai permintaan lanjutan.

## Jalankan di Windows / PowerShell

Prasyarat: Node.js **22+** (pengembangan diuji Node 24), npm. Gunakan `npm.cmd` jika PowerShell memblokir `npm.ps1`.

```powershell
Set-Location 'D:\IoT PLN\climate-shelter-iot'
node --version
npm.cmd ci
# Hanya jika belum memiliki .env.local:
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm.cmd run dev
```

Buka **http://localhost:3000**. Pilih **Login Operator**, lalu peran demo Operator/Admin/Super admin. Tidak ada password bawaan. `APP_ORIGIN` harus sama persis dengan origin browser: gunakan localhost, bukan berganti ke 127.0.0.1.

Demo memakai sesi acak HttpOnly selama 8 jam dan penyimpanan memori **server** yang terpisah tiap sesi. Refresh halaman mempertahankan perubahan; reset demo/restart server menghapus simulasi. Data berubah perlahan setiap 6 detik. Sesi demo tidak cocok untuk banyak instance/serverless; **gunakan Supabase dan DEMO_MODE=false pada produksi**. API ingest perangkat sengaja tidak aktif pada demo.

Server lokal terikat ke loopback. Untuk LAN yang sengaja diizinkan, gunakan `npm.cmd exec next -- dev --hostname 0.0.0.0` dan sesuaikan APP_ORIGIN; jangan membuka server demo ke internet.

## Halaman dan fitur

| URL                                             | Fitur                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `/`                                             | Landing page, konsep sekolah teduh, teknologi dan CTA                      |
| `/monitoring`                                   | Ringkasan publik baca saja, sensor, energi, PCM, status perangkat, grafik  |
| `/login`, `/forgot-password`, `/reset-password` | Auth, remember me, pemulihan                                               |
| `/dashboard`                                    | Overview, 8 metrik udara/sistem, ΔT, cooling performance, peta dan PCM     |
| `/dashboard/live`                               | Monitoring realtime, CO₂, PM2.5, kenyamanan, PCM                           |
| `/dashboard/analytics`                          | Grafik suhu, RH, WBGT, surface, CO₂, PM2.5, energi, kenyamanan, PCM        |
| `/dashboard/heat-map`                           | SVG interaktif, keyboard/touch, detail zona dan status stale               |
| `/dashboard/energy`, `/dashboard/water`         | Meter energi, tandon, rainwater harvesting, soil moisture                  |
| `/dashboard/devices`                            | Inventaris; admin menambah/mengedit/menonaktifkan dan merotasi key         |
| `/dashboard/control`                            | Fan/shading/irigasi/HVAC/pump/ventilation, AUTO/MANUAL/EMERGENCY, setpoint |
| `/dashboard/alerts`                             | Warning/critical/info, filter, acknowledge dan resolved                    |
| `/dashboard/reports`                            | History dengan pagination, filter zona dan ekspor CSV                      |
| `/dashboard/activity`                           | Audit perubahan dan perintah                                               |
| `/dashboard/settings`                           | Threshold dan izin setpoint operator                                       |
| `/dashboard/users`                              | Super admin menetapkan sekolah/peran akun; admin melihat anggota sekolahnya |
| `/dashboard/schools`                            | Super admin mengelola sekolah, publikasi monitoring dan statistik          |

Filter waktu: Live 15 menit, 1/6/24 jam, 7/30 hari. Data history panjang disampel per jam; 6 jam terakhir per menit. CSV adalah ekspor data yang dimuat, bukan seluruh arsip mentah. Halaman lama seperti `/overview` tetap dialihkan ke dashboard. UI responsif dan mempunyai tema terang/gelap.

## Arsitektur

```text
ESP32 → MQTT TLS broker → services/mqtt-bridge → Supabase
ESP32 → HTTPS /api/iot/sensor ────────────────────┘
                                  ↓ RLS + Realtime
                      Dashboard Next.js terautentikasi
                                  ↓
POST /api/commands atau /api/manage/setpoint → SQL RPC → outbox
                                   ↓
                   MQTT control / HTTPS command polling
                                   ↓
                            ESP32 → ACK → log

Publik → /api/public → public_monitoring (proyeksi terbatas)
```

Bridge berjalan sebagai proses Node terpisah, **tidak ditempatkan dalam function Vercel**. Browser hanya menerima anon/publishable key. Service-role key hanya digunakan oleh modul server HTTP perangkat/undangan dan service bridge. Command pengelola tetap memakai JWT pengguna dan pemeriksaan role di RPC.

## Setup / upgrade Supabase

### Proyek baru

Jalankan melalui SQL Editor, berurutan:

1. `supabase/migrations/001_initial.sql`.
2. `supabase/migrations/002_hybrid_platform.sql`.
3. `supabase/migrations/003_user_monitoring.sql` untuk membatasi data teknis dan memperbarui monitoring publik.
4. `supabase/migrations/004_account_school_scope.sql` untuk satu sekolah per akun dan penetapan akses khusus super admin.
5. Opsional data contoh: `supabase/seed.sql`, lalu `supabase/seed-hybrid.sql`.

Seed aman dijalankan ulang, tidak membuat akun/password dan tidak mengaku perangkat online. Untuk produksi tanpa fixture, lewati seed dan buat sekolah melalui super admin.

### Proyek tahap awal yang sudah berisi data

Backup database terlebih dahulu. Jalankan migration yang belum diterapkan secara berurutan sampai **004**. Jangan mengulang migration atau mereset database produksi. Migration 002 mengganti role lama `viewer` menjadi `public`; role tersebut tampil sebagai **User**. Migration 003 membatasi data teknis ke pengelola. Migration 004 membatasi satu sekolah per akun dan pengelolaan keanggotaan hanya oleh super admin. Jika sudah ada akun dengan beberapa sekolah, migration 004 berhenti tanpa menghapus data: tentukan satu sekolah dan cabut keanggotaan lainnya terlebih dahulu. Monitoring sekolah yang ada tetap privat sampai diaktifkan oleh super admin. Jalankan seed hanya jika data sintetis diperlukan.

### Auth dan bootstrap

1. Buat/undang akun pertama melalui Supabase Authentication. Konfigurasikan SMTP, Site URL `http://localhost:3000` serta domain produksi nanti. Allowlist `/auth/callback`, `/auth/confirm`, `/reset-password` pada domain yang digunakan. Nonaktifkan signup publik bila tidak dibutuhkan.
2. Ganti UUID pada SQL ini dengan ID akun asli. Hanya pemilik database melakukan bootstrap super admin:

```sql
update public.profiles
set full_name = 'Pengelola Sistem', role = 'super_admin'
where id = 'UUID_USER_DARI_SUPABASE_AUTH';
```

Trigger auth membuat profil public secara otomatis, tanpa mempercayai role dalam metadata pengguna. Setelah login sebagai super admin, buka **School Management → Kelola sekolah → Atur akun sekolah ini**. Tetapkan email akun terdaftar dan peran Operator/Admin sekolah melalui **User Management**. Satu akun hanya memiliki satu sekolah; untuk pemindahan, cabut akses lama lalu beri akses di sekolah baru. Super admin dapat mengelola seluruh sekolah tanpa keanggotaan sekolah.

3. Isi `.env.local` (jangan commit):

```dotenv
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_ANON_OR_PUBLISHABLE_KEY
APP_ORIGIN=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=SERVER_ONLY_SERVICE_ROLE_KEY
```

Key server diperlukan untuk HTTP ESP32 dan undangan. Dashboard, kontrol user, dan MQTT masing-masing tetap memakai jalur otorisasi yang dijelaskan di atas. Jangan pernah memberi awalan NEXT_PUBLIC pada secret.

4. Untuk undangan, ubah **Supabase Auth → Email Templates → Invite user** agar tautannya menuju:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite"
  >Aktifkan akun</a
>
```

Reset password memakai PKCE via `/auth/callback?next=/reset-password`; tautan default `{{ .ConfirmationURL }}` pada template recovery dapat dipakai. Alternatif template token-hash recovery: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. Pengguna mengisi password sendiri. Remember me mengatur persistensi cookie; masa berlaku token/refresh tetap tunduk pada Supabase Auth.

5. Restart frontend. Login, buat sekolah jika belum ada, lalu daftarkan perangkat dan operator. Sekolah baru memperoleh zona shelter awal. Tambah zona nyata melalui SQL terkontrol sesuai schema sebelum membuat inventaris pada zona lain. Denah SVG empat jenis zona adalah contoh yang perlu disesuaikan dengan site survey.
6. Migration mengaktifkan publication Realtime. Dashboard berlangganan tabel yang diizinkan RLS, polling 30 detik sebagai cadangan. Error live tidak pernah otomatis beralih ke data demo.

### Hak akses

- **Publik tanpa login:** hanya `public_monitoring` untuk sekolah yang membagikan data. Tidak ada raw readings, email, key, log, atau kontrol.
- **Public terdaftar:** baca data sekolah yang diberikan, tanpa perubahan.
- **Operator:** monitoring, command, alert dan setpoint bila admin mengizinkan.
- **Admin:** melihat anggota, mengelola perangkat, threshold, key dan recovery emergency sekolahnya; tidak mengubah penetapan akun.
- **Super admin:** seluruh sekolah, penetapan sekolah/peran akun, publikasi dan statistik.

RLS dan fungsi SQL mengendalikan akses; menyembunyikan menu bukan pengaman utama. Profil role hanya sumber hak super admin; hak per sekolah berasal dari school_members.

Dashboard pengelola hanya menyediakan pilihan **Lokasi di sekolah**. Nama sekolah tampil sebagai identitas akun; operator/admin tidak dapat menggantinya melalui cookie maupun `/api/manage/select`. Super admin mengganti sekolah yang dikelola hanya melalui School Management. Mode demo lokal tetap memakai sesi simulasi terpisah; pengaturan anggota demo tidak membuat akun login nyata. Isolasi akun produksi memerlukan Supabase/Auth dan seluruh migration di atas. Uji batas akses lokal: `node scripts/test-school-access.mjs`; uji SQL/RLS: `npm test`.

## Hubungkan ESP32 melalui HTTPS

1. Login admin, buka Devices, daftarkan device dengan kode unik dan zona.
2. Klik **Rotasi API key**, simpan token yang ditampilkan satu kali. Database hanya menyimpan hash SHA-256; token lama langsung dicabut.
3. Ikuti `docs/HTTP-IOT.md`. ESP32 mengirim `Authorization: Bearer cs_<id>_<secret>`.
4. Sensor ingest menggunakan waktu server dan message_id UUID untuk deduplikasi. Timestamp perangkat tersimpan terpisah.
5. Aktuator dapat polling `GET /api/iot/commands`, lalu kirim ACK. Jangan memakai MQTT dan HTTP dispatch secara bersamaan untuk satu aktuator tanpa rancangan deduplikasi/ownership transport.

## Broker dan MQTT bridge

Opsional Mosquitto lokal dengan Docker Desktop:

```powershell
docker compose up -d mqtt
docker compose logs mqtt
```

Broker contoh hanya terbuka pada `127.0.0.1:1883`, anonymous untuk pengujian loopback. ESP32 di Wi-Fi membutuhkan broker TLS berautentikasi (Mosquitto/EMQX), ACL per perangkat. Jangan mempublikasikan broker anonymous.

Buka PowerShell kedua:

```powershell
Set-Location 'D:\IoT PLN\climate-shelter-iot'
if (-not (Test-Path services/mqtt-bridge/.env)) {
  Copy-Item services/mqtt-bridge/.env.example services/mqtt-bridge/.env
}
# Isi URL/key Supabase, MQTT_URL, MQTT_USERNAME/PASSWORD, SCHOOL_SLUG.
npm.cmd run bridge:dev
```

Konvensi topic dan payload ada di `docs/MQTT.md`: `climateshelter/{school}/{zone}/telemetry`, `.../energy`, `.../water`, `.../heartbeat`, `.../ack`; kontrol `climateshelter/{school}/control/{actuator}`.

Health bridge: `http://localhost:8080/healthz`. HTTP 200 hanya ketika broker tersambung dan database responsif. TLS wajib kecuali pengecualian loopback eksplisit.

## Validasi dan build produksi

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run bridge:build
npm.cmd start
# Terminal lain, setelah frontend berjalan:
npm.cmd run test:http
```

Runner test memakai TypeScript dan node:test, termasuk PostgreSQL in-process (PGlite). Ia tidak membutuhkan proyek Supabase pengguna. Hasil/ruang lingkup pengujian ada di `docs/VERIFICATION.md`.

Bridge produksi lokal dengan file env:

```powershell
node --env-file=services/mqtt-bridge/.env services/mqtt-bridge/dist/services/mqtt-bridge/src/index.js
```

`npm run bridge:start` memakai env proses dari hosting. AUTO dijalankan firmware, bukan browser. Firmware ESP32 siap flash tidak termasuk; implementasikan kontrak ACK, sequence, TTL, interlock dan override fisik sebelum memasang aktuator.

## Deployment

### Vercel — frontend

- Import repository milikmu, root directory `climate-shelter-iot` jika berada di folder induk. Install `npm ci`, build `npm run build`, preset Next.js, Node 22+.
- Masukkan env di atas dengan DEMO_MODE=false, APP_ORIGIN origin HTTPS produksi. `SUPABASE_SERVICE_ROLE_KEY` tetap server-only; jangan menyebutnya dalam variabel NEXT_PUBLIC, log, atau komponen client.
- Sesuaikan Supabase Site URL/redirect allowlist dan SMTP. Jangan memakai static export karena API/auth/CSP membutuhkan server.
- Perubahan NEXT_PUBLIC memerlukan rebuild. Domain preview membutuhkan APP_ORIGIN preview tersendiri.
- Jalankan pengujian role/RLS/perangkat di staging. Proyek ini **belum dipublikasikan ke akun hosting**.

### Railway / Render / VPS — bridge

Gunakan proses selalu hidup:

- Dockerfile `services/mqtt-bridge/Dockerfile`, konteks build root proyek. Image non-root, env melalui secret manager.
- Railway: service Docker, health `/healthz`, restart on failure, MQTT TLS eksternal.
- Render: Docker Web Service dengan health endpoint atau Background Worker. Hindari instance tidur.
- VPS: restart policy, firewall, broker TLS ACL, rotasi log dan monitoring. Satu bridge per sekolah, client ID unik.

```powershell
docker build -f services/mqtt-bridge/Dockerfile -t climate-shelter-bridge .
docker run --name climate-bridge --restart unless-stopped --env-file services/mqtt-bridge/.env -p 127.0.0.1:8080:8080 climate-shelter-bridge
```

## File penting

```text
src/app/                 Landing, monitoring, login, /dashboard, API
src/components/          Grafik, SVG heat map, forms, realtime, shell
src/lib/                 Auth, demo server, data adapters, secret server client
shared/                  Validasi Zod MQTT / HTTP / manajemen
supabase/migrations/     001 schema + 002 hybrid + 003 monitoring + 004 sekolah akun
supabase/seed*.sql        Fixture opsional, tanpa password
services/mqtt-bridge/     MQTT service terpisah + Dockerfile
scripts/ + tests/        Runner, HTTP smoke, SQL/RLS dan kontrak
docs/                    Konsep, MQTT, HTTP, threat model, verifikasi
```

## Batas interpretasi

ΔT merupakan selisih sesaat, bukan bukti kausal penghematan. WBGT perlu instrumentasi valid; batas contoh 25/28/31°C bukan pedoman medis. CO₂/PM2.5 dan indeks kenyamanan perlu kalibrasi serta SOP sekolah. **PCM phase/charging adalah estimasi suhu**, bukan pengukuran fraksi cair atau energi laten; atur rentang leleh material nyata. Air hujan untuk nonkonsumsi. Data hilang ditampilkan sebagai tidak tersedia, bukan nol. Meter kumulatif menjumlah kenaikan per meter dan mengabaikan reset negatif.

Lihat `docs/SECURITY.md` untuk threat model dan hardening produksi. Referensi: [Next.js App Router](https://nextjs.org/docs/app), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [MQTT.js](https://github.com/mqttjs/MQTT.js).
