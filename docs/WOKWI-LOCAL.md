# Climate Shelter — ESP32 Wokwi dan web lokal

Kedua project Wokwi existing berada pada sekolah yang sama, **SD Negeri Candigaron 01**:

| Lokasi | Project Wokwi | Salinan lokal | Aktuator |
|---|---|---|---|
| Shelter | https://wokwi.com/projects/476516571987622913 | `firmware/wokwi/shelter/` | Kipas, pompa |
| Ruang Kelas | https://wokwi.com/projects/476418811507177473 | `firmware/wokwi/classroom/` | Kipas, pompa, HVAC, ventilasi |

Satu monitoring sekolah berada di http://localhost:3000/monitoring. Pilih sekolah lalu lokasi **Shelter / Ruang Kelas**. `/wokwi` mengarah ke halaman ini. Kartu sensor, grafik, dan dashboard memakai kiriman perangkat pada lokasi terpilih. Riwayat dan setpoint kedua lokasi terpisah; jika belum ada kiriman ESP32, tampil "Menunggu ESP32" dan angka kosong. Lapangan dan taman di dashboard tetap contoh. Untuk memperbarui kedua salinan dari template, jalankan `node scripts/build-wokwi-projects.mjs`.

## Cara kerja

Satu DHT22 membaca suhu/kelembapan. CO₂, PM2.5 dan PCM adalah nilai slider simulasi; bukan pengukuran gas/partikel nyata. LDR menghasilkan estimasi lux. PIR membaca gerakan.

Setpoint default **26,7°C** memakai rata-rata normal nasional BMKG periode 1991–2020, bukan suhu tahunan terpanas atau standar kenyamanan. Sumber: https://www.bmkg.go.id/iklim/anomali-suhu-udara/anomali-suhu-udara-rata-rata-tahun-2024

- Suhu > setpoint: kipas ON, pompa ON jika air tandon tersedia. Khusus kelas, ventilasi 90°.
- Suhu ≤ setpoint − 0,5°C: kipas/pompa OFF. Khusus kelas, ventilasi 0°.
- Di antara kedua batas: mempertahankan keadaan sebelumnya.
- Tandon kosong: pompa OFF segera, kipas dan ventilasi tetap mengikuti suhu.
- DHT22 gagal: kipas, pompa, HVAC OFF dan ventilasi 0°.
- HVAC hanya pada kelas: suhu ≥31,5°C dan ada gerakan.
- Kontrol lokal tetap berjalan ketika Wi-Fi/HTTP terputus. Jaringan memakai task terpisah.

Kompatibilitas DHT22: runtime Wokwi saat pengujian melewatkan respons awal sensor ketika library mengganti mode pin di tengah transaksi. Firmware mempertahankan GPIO4 sebagai open-drain, membaca 40 bit sensor dengan batas waktu, lalu memeriksa checksum dan rentang nilai. Library DHT sensor library for ESPx tetap terpasang untuk tipe `TempAndHumidity`; pembacaan tidak memakai angka pengganti ketika sensor gagal. Relay pompa memakai transistor `npn`, aktif HIGH.

| Komponen | GPIO |
|---|---:|
| DHT22 | 4 |
| Slider CO₂ (400–2000 ppm) | 34 |
| Slider PM2.5 (0–150 µg/m³) | 35 |
| Slider PCM (18–45°C) | 32 |
| LDR AO | 33 |
| PIR | 27 |
| LED fan + 220Ω | 25 |
| LED HVAC + 220Ω (kelas) | 26 |
| Servo ventilasi (kelas) | 23 |
| Relay pompa, kontak NO | 22 |
| Sakelar tandon, INPUT_PULLUP | 21 |

Rail atas 3,3V/GND; bawah 5V/GND; kedua GND terhubung. Relay pompa mengendalikan LED biru + 220Ω sebagai indikator beban pompa. Wokwi tidak mensimulasikan aliran air. Sakelar tandon kiri menghubungkan GPIO21 ke GND = berisi, kanan = kosong. Pada alat fisik, ganti dengan sensor level air, gunakan catu pompa terpisah dan driver/relay sesuai arus motor; jangan memasok motor dari pin GPIO. Ini firmware demonstrasi simulator, belum commissioning alat fisik.

## Menjalankan ulang

`npm run dev` menjalankan web di localhost beserta penghubung Wokwi. Pengguna telah mengizinkan Cloudflare Tunnel sementara dan `.env.local` pada laptop ini sudah berisi `WOKWI_TUNNEL_AUTO_START=true`. Untuk salinan project baru, opsi ini tetap nonaktif pada `.env.example` sampai dipilih pemiliknya.

**Batas dua langkah:** Cloudflare Quick Tunnel mengubah URL setiap proses tunnel dimulai, sedangkan koneksi firmware disimpan di RAM dan hilang saat simulasi dimulai ulang. Karena itu mode sementara memerlukan satu kali `CONNECT` di Serial Monitor setelah Run. Jangan menaruh token di sketch Wokwi publik. Untuk penggunaan tanpa tunnel publik tersedia Wokwi Private Gateway (fitur berbayar), menggunakan `host.wokwi.internal`; gateway dan firmware HTTP lokal harus disiapkan tersendiri. Sumber: https://docs.wokwi.com/guides/esp32-wifi#the-private-gateway

1. Dari folder project, jalankan `npm run dev`. Proses ini menjalankan web dan membuka tunnel HTTPS Cloudflare sementara **hanya** menuju penerima telemetry. URL berubah ketika tunnel dimulai ulang. `cloudflared.exe` resmi dengan tanda tangan Cloudflare ada di `work/tools/`. `npm run wokwi:start` hanya diperlukan bila web sudah berjalan terpisah tanpa penghubung.
2. Buka kedua project Wokwi pada tabel. Bila perlu, isi `sketch.ino`, `diagram.json`, `libraries.txt` dari folder lokasi yang sesuai. Jangan menukar firmware karena identitas perangkat berbeda. Library: DHT sensor library for ESPx, ESP32Servo, ArduinoJson.
3. Jalankan kedua simulasi. Salin baris yang sama dari `work/wokwi/connect.txt` ke input Serial Monitor **masing-masing project**, lalu Enter. Koneksi hanya disimpan dalam RAM ESP32; ulangi setelah restart simulator. Jangan menyalin token ke sketch publik.
4. Setelah koneksi berhasil, Serial menampilkan pembacaan sensor dan `HTTPS POST: 200`. Buka http://localhost:3000/monitoring dan pilih lokasi. HTTP 200 dari test lokal saja belum membuktikan koneksi ESP32.
5. Login demo operator/admin pada web, pilih lokasi, buka Control Panel, gunakan panel Wokwi untuk setpoint. Target web ditandai terpisah dari nilai yang sudah dilaporkan ESP32; status baru dianggap diterapkan setelah telemetry berikutnya. Perubahan setpoint Shelter tidak mengubah setpoint kelas, dan sebaliknya.
6. Ctrl+C pada proses launcher menghentikan proses yang dimulainya. Proses web/proxy yang sudah ada sebelumnya tetap berjalan.

Jika `npm run dev` dijalankan saat web sudah aktif, launcher menampilkan alamat web yang sedang berjalan dan tidak membuat tunnel kedua. Hentikan terminal server sebelumnya dengan Ctrl+C bila ingin memulai ulang dari VS Code.

### Saat server kompilasi Wokwi sibuk

Compiler Arduino cadangan disimpan dalam `work/tools/`, terpisah dari instalasi Arduino milik pengguna. Setelah dukungan ESP32 dan ketiga library tersedia, jalankan `node scripts/compile-wokwi-local.mjs`. Pada editor Wokwi project yang sesuai, tekan F1 → **Upload Firmware and Start Simulation…**, lalu pilih berkas `.merged.bin` pada `work/wokwi/compiled-classroom/` atau `compiled-shelter/`. Jika memakai `.bin` aplikasi saja, bootloader dan partisi harus cocok. Perintah ini hanya menjalankan simulator, tidak mem-flash perangkat fisik. Setelah simulator berjalan, kirim CONNECT seperti biasa. Cara normal tetap tombol Run ketika server Wokwi tersedia. Sumber: https://docs.wokwi.com/guides/esp32#custom-application-firmware

Koneksi: `Wokwi-GUEST → HTTPS Cloudflare sementara → 127.0.0.1:8787/telemetry → /api/wokwi/telemetry → file lokal → dashboard`.

## Batas koneksi lokal

Supabase belum dikonfigurasi. Jalur produksi `/api/iot/sensor` tetap membutuhkan credential perangkat/Supabase. Integrasi ini hanya aktif jika `NEXT_PUBLIC_DEMO_MODE=true` dan `WOKWI_LOCAL_ENABLED=true`. Token khusus pada `.env.local` hanya mengizinkan data sintetis simulator; tidak memberi akses file, login, atau database. Proxy menolak seluruh path/metode selain POST `/telemetry`, membatasi payload, dan memeriksa token.

Firmware memakai TLS tanpa validasi CA khusus demonstrasi data sintetis. Untuk perangkat produksi, wajib validasi CA, provision key perangkat, dan gunakan endpoint produksi. Gateway publik Wokwi serta tunnel bukan jalur data sensitif. Riwayat lokal menyimpan 720 pengiriman terakhir **per lokasi** (sekitar satu jam jika 5 detik sekali), pada `work/wokwi/history-shelter.json` dan `history-classroom.json`. Setpoint disimpan pada file `config-<lokasi>.json` terpisah. Data lewat 20 detik ditandai kedaluwarsa; tampilan tidak mengaku output masih terkonfirmasi.

Untuk menghentikan integrasi, stop tunnel dan set `WOKWI_LOCAL_ENABLED=false`, lalu restart web. Token dapat dicabut dengan mengganti `WOKWI_INGEST_TOKEN` pada `.env.local` dan restart web/proxy. Tidak ada secret Supabase yang dibuat atau dikirim.

## Verifikasi

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

`node --env-file=.env.local scripts/test-wokwi-http.mjs` menguji receiver lokal, deduplikasi, interlock pompa, pembatasan proxy, dua lokasi dalam satu sekolah, 2/4 aktuator, dan isolasi riwayat/setpoint. Jalankan saat kedua simulator berhenti: test memakai fixture yang dihapus/dipulihkan setelah pengujian. Keberhasilannya terpisah dari bukti pengiriman oleh ESP32 di Serial Monitor.
