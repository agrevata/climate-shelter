# Keamanan dan batas tanggung jawab

## Threat model

| Ancaman                                                       | Perlindungan yang tersedia                                                                                     | Batas / langkah produksi                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Pembaca publik atau akun sekolah lain mengambil data          | RLS semua tabel, keanggotaan school, foreign key komposit untuk isolasi perangkat/zona                         | Uji dua tenant nyata di staging; audit policy setiap migration                                            |
| Public/operator meningkatkan role / mengirim command langsung | Tidak ada grant DML untuk authenticated; write hanya RPC, role dari DB                                         | Bootstrap super admin oleh admin DB, keanggotaan lewat RPC admin terotorisasi; amankan dashboard Supabase |
| CSRF dan payload berbahaya                                    | Exact Origin, JSON only, batas body HTTP 8 KiB, Zod strict, validasi SQL, React escaping                       | Domain produksi tetap; proxy jangan mempercayai host dari klien                                           |
| XSS / framing                                                 | CSP nonce per request, strict-dynamic, no inline script tanpa nonce, frame-ancestors none, object-src none     | style unsafe-inline diperlukan Recharts/layout; tambah CSP reporting dan audit dependency                 |
| Secret bocor                                                  | Frontend hanya public key; service key hanya env bridge / modul server HTTP, env diabaikan Git/Docker          | Secret manager, rotasi, scoping jaringan; service role tetap hak tinggi lintas database                   |
| Flood command atau balapan request                            | Batas 10/min/user di DB dengan advisory lock; satu command aktif per device; row locks                         | Tambah WAF/IP rate limit, login abuse protection dan limit per sekolah                                    |
| MQTT spoofing/replay                                          | MQTT TLS, validasi device-school-zone-kind, UUID unik, timestamp ≤2 menit dan ≤30 detik ke depan, non-retained | Broker WAJIB ACL per credential/device. UUID dalam JSON bukan bukti identitas. Sinkronisasi NTP           |
| Perintah hilang/berulang                                      | DB outbox, QoS 1, UUID + sequence, expiry 30 detik, retry maks 3, ACK status terpisah                          | ESP32 wajib dedupe persisten dan pemeriksaan sequence/expiry; publish bukan bukti eksekusi                |
| Koneksi putus / data lama                                     | Status online ≤120 detik, peringatan stale, menolak command offline                                            | Firmware wajib fail-safe lokal, watchdog, manual physical override                                        |
| Irigasi tanpa air                                             | Manual irigasi ditolak saat data tandon lama/≤15%                                                              | Interlock water-level fisik/lokal tetap wajib, termasuk dalam AUTO                                        |
| Penghapusan/ubah audit                                        | Authenticated hanya SELECT logs/commands                                                                       | Service-role dan admin DB masih bisa mengubah data; ekspor audit ke penyimpanan immutable jika dibutuhkan |

## Kontrak keselamatan aktuator

Web ini **bukan safety controller bersertifikasi**. Jangan menyambungkan keluaran berbahaya sebelum firmware dan hardware interlock diuji. Hal yang sengaja tidak dapat dijamin hanya oleh dashboard: emergency ketika jaringan sudah terputus, posisi motor fisik tanpa feedback, penerapan TTL oleh firmware yang tidak mematuhinya, dan validitas sensor yang belum dikalibrasi.

EMERGENCY: kipas output 0; katup tutup; motor shading berhenti/menahan gerakan (angka output 0 bukan perintah untuk menarik peneduh). Mode terkunci sampai admin secara eksplisit mengirim mode baru setelah pemeriksaan. Sensor posisi shading perlu ditambahkan jika ingin menampilkan posisi fisik ketika motor dihentikan; saat ini nilai 0 pada emergency berarti output dihentikan.

MANUAL: lease 5–300 detik, kemudian output aman 0 dan mode manual dipertahankan sampai perintah baru. Saat timer berakhir, shading menghentikan motor dan mempertahankan posisi, tidak bergerak menuju nol. Firmware harus memperbarui `value` melalui heartbeat sebagai output yang sebenarnya. UI awal memakai persentase target posisi shading untuk perintah manual, bukan bukti feedback mekanis.

AUTO: aturan berjalan lokal pada firmware, bukan di browser/bridge. Ambang demo fan/shade/soil hanyalah contoh; kalibrasi, hysteresis, min-on/min-off, timeout, limit switch, water interlock, dan sensor failure behavior harus dirancang bersama hardware. Tombol fisik mempunyai prioritas lebih tinggi daripada command jaringan.

## Sebelum live

1. Ganti fixture identitas/denah; kalibrasi sensor WBGT/soil/tank/energy; dokumentasikan satuan dan sampling interval.
2. Terapkan firmware pada `docs/MQTT.md` termasuk idempotensi, urutan, waktu, heartbeat, ACK, fail-safe, state recovery, dan tombol fisik.
3. Broker TLS dengan sertifikat valid; credential unik tiap device; publish hanya telemetry/ACK miliknya; subscribe hanya command miliknya. Bridge punya credential terpisah. Nonaktifkan anonymous.
4. Matikan demo secara eksplisit pada build live; pasang APP_ORIGIN HTTPS yang tepat; batasi Auth redirect allowlist; aktifkan MFA untuk admin dan proteksi login di Supabase.
5. Gunakan akun bridge/database khusus dengan privileges lebih sempit bila tersedia; service-role di starter ini memerlukan perlindungan host ekstra. Rotasi key jika pernah terpapar.
6. Uji RLS, akun revoked, role downgrade, replay, retained messages, duplicate command, burst, outage, ACK salah, expired command, emergency recovery, sensor rusak dan reboot firmware.
7. Jalankan dashboard di HTTPS; konfigurasi WAF, rate limit auth/API/ingest, monitoring dan alarm health bridge; selesaikan CSP violation yang relevan.
8. Siapkan backup/PITR, retention/partitioning untuk telemetry, audit export, alert delivery eksternal bila dibutuhkan, serta job perawatan database. Sample telemetry disimpan tanpa penghapusan otomatis.
9. Tentukan ambang heat risk dan SOP kegiatan siswa bersama pihak berwenang. Threshold demo bukan pedoman resmi yang tervalidasi.

## Data & jaringan

Payload MQTT dibatasi 4 KiB; antrean ingest maksimal 100 pesan dalam memori; maksimal 120 pesan/menit/device. Burst berlebihan ditolak/dicatat. Database down atau proses mati bisa kehilangan telemetry yang belum tersimpan: perangkat harus menyimpan buffer lokal dan mengirim ulang `message_id` yang sama untuk pemulihan. Untuk jaminan ingestion yang lebih kuat, tambahkan broker persistent session/manual QoS acknowledgment atau durable queue. Tidak ada klaim exactly-once.

Perintah memakai outbox durable dan ACK aplikasi; retries mungkin dikirim ulang sehingga deduplikasi ESP32 tetap wajib. Jalur antara pemeriksaan status DB dan publish MQTT bukan transaksi atomik: sequence monotonic dan emergency latch pada firmware menangani perintah tertunda. Perangkat harus mengirim timestamp UTC yang akurat.

Jalankan satu school per bridge untuk membatasi kesalahan routing. Semua log runtime hanya menyebut event dan ID; tidak mencetak env, token, kata sandi, isi payload mentah atau header otorisasi. Health endpoint hanya menunjukkan kesiapan koneksi.

## Tambahan hybrid / HTTP

Publik anonim hanya dapat SELECT public_monitoring, proyeksi whitelist tanpa key, email, user ID, raw device ID, command atau audit. Sekolah default privat; super admin dapat memublikasikan/mencabutnya. Realtime memakai policy yang sama. Profile role tidak bisa diubah lewat API publik; role dalam metadata auth diabaikan.

Migration 004 memberlakukan satu keanggotaan sekolah per akun dengan constraint database. Hanya super admin boleh memanggil penetapan/cabut keanggotaan, baik lewat API web maupun RPC SQL. Operator/admin selalu memakai sekolah dari keanggotaan terverifikasi; cookie sekolah tidak menentukan hak mereka. Pergantian konteks sekolah adalah aksi khusus super admin. RLS dan RPC command/setpoint tetap memeriksa sekolah perangkat, termasuk setelah akses dicabut atau akun dipindahkan. Demo lokal bukan autentikasi akun produksi.

HTTP ESP32 mengikat secret acak 256-bit ke satu perangkat, menyimpan hash SHA-256, memverifikasi active/revoked dan membatasi 120 request/menit melalui lock database. Key lama dicabut saat rotasi. UUID pesan untuk idempotensi, waktu server untuk penerimaan; timestamp sensor hanya metadata. Key dicuri masih bisa memalsukan pengukuran untuk device tersebut: batasi akses fisik/flash, gunakan secure provisioning dan rotasi. MQTT masih membutuhkan ACL broker per perangkat.

Admin server Supabase diimpor hanya oleh file server-only. Endpoint undangan memverifikasi JWT dan role sekolah sebelum memakai service key. Setpoint tidak mengubah confirmed state sampai ACK berisi target yang cocok. Semua perubahan manajemen/command/alert dicatat pada activity_logs. Batasi service-role karena mampu melewati RLS.

Pembatas IP login/HTTP dalam memori hanya pertahanan tambahan; beberapa instance dapat mempunyai counter berbeda dan forwarded headers harus berasal dari proxy tepercaya. Aktifkan WAF, Supabase Auth rate limits, CAPTCHA/MFA sesuai kebutuhan produksi. Tidak ada username/password bawaan. Cookie demo HttpOnly dan sesi acak bersifat pengujian lokal; jangan mengaktifkan demo untuk kendali nyata. Cookie Supabase dipakai SDK browser untuk realtime, sehingga pencegahan XSS/CSP tetap penting. Remember me adalah pilihan persistensi cookie, bukan jaminan logout saat browser memulihkan sesi tertutup.
