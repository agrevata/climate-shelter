# Protokol MQTT dan integrasi ESP32

## Topic

| Arah              | Topic contoh                                 | Tujuan                                       |
| ----------------- | -------------------------------------------- | -------------------------------------------- |
| ESP32 → bridge    | `climateshelter/school01/shelter/telemetry`  | Satu payload suhu/humidity/WBGT/surface/soil |
| Meter → bridge    | `climateshelter/school01/shelter/energy`     | Pengukuran listrik                           |
| Tandon → bridge   | `climateshelter/school01/garden/water`       | Level dan meter air                          |
| Device → bridge   | `climateshelter/school01/shelter/heartbeat`  | Online, opsional nilai output aktuator       |
| Bridge → fan      | `climateshelter/school01/control/fan`        | Command untuk device slug `fan`              |
| Bridge → shading  | `climateshelter/school01/control/shade`      | Command motor shading                        |
| Bridge → valve    | `climateshelter/school01/control/irrigation` | Command katup irigasi                        |
| Aktuator → bridge | `climateshelter/school01/shelter/ack`        | ACK fan/shade                                |
| Aktuator → bridge | `climateshelter/school01/garden/ack`         | ACK irigasi                                  |

Struktur umum `climateshelter/{school}/{zone}/{sensor}`; `sensor` pada implementasi adalah `telemetry`, `energy`, `water`, `heartbeat`, atau `ack`. Telemetry memakai paket pengukuran lengkap agar satu waktu rekam mewakili satu set parameter. Payload scalar seperti `31.42` pada `/temperature` **tidak diterima** oleh adapter ini.

QoS **1**, `retain=false`. Bridge mengabaikan semua pesan retained. Ukuran JSON maksimal 4 KiB; payload strict menolak properti tambahan. School/zone/device/kind harus sesuai registry database. Timestamps UTC ISO 8601 dengan zona, maksimum 120 detik lampau dan 30 detik masa depan. Gunakan NTP. Pesan sejarah yang lebih lama harus diimpor lewat jalur batch administratif yang terpisah, bukan dipalsukan sebagai telemetry saat ini.

## Payload sensor

Ganti `recorded_at` dengan waktu UTC saat publikasi dan buat `message_id` UUID baru per pengukuran. Contoh waktu di bawah bukan waktu untuk dipakai ulang. ID device sesuai `seed.sql`.

```json
{
  "message_id": "40000000-0000-4000-8000-000000000001",
  "device_id": "30000000-0000-4000-8000-000000000002",
  "recorded_at": "2026-09-27T06:00:00.000Z",
  "temperature": 29.2,
  "humidity": 68,
  "wbgt": 26.1,
  "surface_temperature": 30.5,
  "soil_moisture": null
}
```

Suhu, WBGT, permukaan dalam °C; humidity/soil persen 0–100. Soil `null` untuk node yang tidak punya probe. WBGT bukan heat index; jangan mengisi dari suhu udara saja. Adapter awal membutuhkan keempat pengukuran termal valid. Jika hardware belum menyediakan WBGT/surface, ubah schema dan UI secara eksplisit untuk mendukung null, bukan mengarang angka.

## Energi dan air

```json
{
  "message_id": "40000000-0000-4000-8000-000000000002",
  "device_id": "30000000-0000-4000-8000-000000000008",
  "recorded_at": "2026-09-27T06:00:00.000Z",
  "voltage": 220.2,
  "current": 0.42,
  "power_w": 92.4,
  "energy_kwh": 135.62
}
```

```json
{
  "message_id": "40000000-0000-4000-8000-000000000003",
  "device_id": "30000000-0000-4000-8000-000000000009",
  "recorded_at": "2026-09-27T06:00:00.000Z",
  "tank_level": 72,
  "stored_liters": 720,
  "used_liters": 4450,
  "harvested_liters": 6000
}
```

`energy_kwh`, `used_liters`, dan `harvested_liters` adalah **counter kumulatif**, bukan delta setiap pesan. Counter dipisahkan per device; jangan mengganti ID ketika reboot biasa. Kalibrasi kapasitas tandon: 72% = 720 L hanya benar untuk tandon 1.000 L pada contoh ini.

## Heartbeat

Kirim setiap 30 detik. Semua data valid juga memperbarui `last_seen`. Sensor/meter tidak perlu properti `value`; aktuator mengirim output yang terakhir berlaku agar perubahan AUTO/timeout terlihat.

```json
{
  "message_id": "40000000-0000-4000-8000-000000000004",
  "device_id": "30000000-0000-4000-8000-000000000005",
  "recorded_at": "2026-09-27T06:00:00.000Z",
  "value": 65
}
```

Mode tidak boleh diubah lewat heartbeat. Perubahan mode jaringan hanya dikonfirmasi lewat ACK yang cocok dengan command. Tombol emergency fisik juga harus mengunci aktuator secara lokal; integrasi pelaporan emergency fisik sebagai event independen memerlukan perluasan protokol sebelum produksi, agar dashboard dapat membedakan physical latch dari output 0.

## Command dan ACK

Contoh pesan yang diterbitkan bridge (tidak mengandung Supabase key atau alasan pribadi):

```json
{
  "command_id": "50000000-0000-4000-8000-000000000001",
  "sequence": 42,
  "device_id": "30000000-0000-4000-8000-000000000005",
  "mode": "MANUAL",
  "value": 65,
  "duration_seconds": 60,
  "issued_at": "2026-09-27T06:00:00.000Z",
  "expires_at": "2026-09-27T06:00:30.000Z"
}
```

- `AUTO`: nilai command 0 berarti serahkan output ke aturan lokal. ACK boleh berisi nilai hasil aturan yang sebenarnya.
- `MANUAL`: fan 0–100% PWM; shading 0–100% target terbentang (0 tertarik, 100 terbentang); irigasi hanya 0/100. Lease 5–300 detik; setelah itu hentikan output dengan aman, jangan otomatis mengulang durasi saat duplicate command.
- `EMERGENCY`: `value=0`; fan off, valve closed, motor shade stopped/hold. Bukan perintah retract shading. Terlatch sampai pemulihan yang diotorisasi admin. Periksa limit switch, interlock, dan tombol fisik sebelum pemulihan.

ACK setelah penerapan/penolakan aktual:

```json
{
  "message_id": "40000000-0000-4000-8000-000000000005",
  "device_id": "30000000-0000-4000-8000-000000000005",
  "recorded_at": "2026-09-27T06:00:02.000Z",
  "command_id": "50000000-0000-4000-8000-000000000001",
  "status": "acknowledged",
  "mode": "MANUAL",
  "value": 65,
  "detail": "Output diterapkan"
}
```

Gunakan `status=failed` jika hardware menolak; cantumkan detail ringkas tanpa markup. Backend hanya menerima ACK milik perangkat dan sekolah yang tepat, sebelum expires_at. Untuk status acknowledged, mode/nilai harus cocok, kecuali nilai aktual AUTO dapat berbeda. `published` hanya berarti pesan dikirim, bukan hardware berhasil.

## State machine firmware yang wajib

1. Validasi topic/device ID, field, tipe dan range; tolak command retained/expired dan timestamp tidak masuk akal. Tolak jika NTP belum sinkron.
2. Simpan `command_id` dan sequence tertinggi secara persisten. UUID yang sama hanya dikonfirmasi kembali, tanpa menjalankan ulang/mereset timer. Sequence lebih tua ditolak, termasuk setelah reboot.
3. Tombol fisik dan emergency latch selalu mengalahkan AUTO/MANUAL jaringan. Hanya command pemulihan yang disetujui server serta pelepasan fisik yang diperbolehkan. Jika physical latch belum dilepas, ACK failed.
4. Mulai lease menggunakan elapsed time lokal monotonic, batasi oleh durasi yang diminta. Pada loss of communication/watchdog/sensor gagal, pindah ke keluaran aman yang telah dianalisis untuk hardware.
5. AUTO berjalan lokal. Contoh awal untuk dibahas: fan on ketika suhu shelter >30°C, off <29°C; shading terbentang saat panas, dengan interlock angin/limit switch; irrigation saat soil <30%, stop >45%, dengan tandon >15% dan batas waktu keras. **Contoh ini bukan firmware siap pakai**.
6. Publikasikan ACK dan heartbeat; jangan menganggap command diterima broker sebagai penerapan output. Jika ACK hilang, kirim ulang ACK untuk duplicate command.
7. Buffer telemetry saat offline, gunakan UUID yang sama untuk replay yang masih memenuhi jendela freshness. Data lama perlu jalur arsip batch. Jaminan tidak hilangnya semua sample membutuhkan durable ingestion tambahan (lihat SECURITY.md).

## Pengujian publish lokal di PowerShell

Dengan binary `mosquitto_pub` tersedia:

```powershell
$sensorSample = @{
  message_id = [guid]::NewGuid().ToString()
  device_id = '30000000-0000-4000-8000-000000000002'
  recorded_at = [DateTime]::UtcNow.ToString('o')
  temperature = 29.2
  humidity = 68
  wbgt = 26.1
  surface_temperature = 30.5
  soil_moisture = $null
} | ConvertTo-Json -Compress
$sensorSample | mosquitto_pub -h 127.0.0.1 -p 1883 -q 1 -t climateshelter/school01/shelter/telemetry -s
```

Ulangi dengan `device_id` tiap aktuator dan topic heartbeat sebelum mencoba kontrol live. Jangan menandai perangkat online dengan SQL hanya agar tombol kontrol aktif; pengujian sebaiknya benar-benar melewati MQTT.

## ACL broker produksi

Setiap credential perangkat hanya boleh:

- publish topic telemetry/heartbeat/ACK yang dibutuhkan di school/zone-nya;
- subscribe topic control slug perangkatnya;
- dilarang publish ke `/control/*`, topic sekolah lain, atau subscribe `#`.

Karena beberapa perangkat satu zona dapat memakai topic ACK yang sama, ACL topic saja tidak membedakan ID payload antar perangkat. Untuk isolasi hardware yang lebih ketat, gunakan topic dengan ID perangkat (mis. `.../{zone}/{device}/ack`) dan adaptasikan parser + ACL, atau broker rules yang mengikat credential ke device_id payload. Registry validation pada bridge **bukan pengganti identity binding broker**. Terapkan sebelum pemasangan di jaringan yang tidak dipercaya.

Credential bridge dapat subscribe school telemetry dan publish control school tersebut. Simpan credential di secret manager, gunakan sertifikat valid (`rejectUnauthorized=true`), rotasi berkala dan batasi akses jaringan Supabase/broker.

## Upgrade hybrid (migration 002)

Telemetry menerima co2 (ppm), pm25 (µg/m³), thermal_comfort_index (skor 0–100), energy_consumption (kWh kumulatif), pcm_temperature (°C) secara opsional/null. WBGT dan suhu permukaan dapat null jika sensor belum tersedia. Device kind hvac, pump, ventilation menggunakan kontrol ON/OFF 0/100. Perangkat nonaktif ditolak oleh database.

Command sekarang mempunyai command_type actuator/setpoint dan temperature_setpoint/humidity_setpoint untuk setpoint. Firmware harus mengirim kembali temperature_setpoint dan humidity_setpoint yang diterapkan pada ACK setpoint. RPC menolak ACK yang tidak cocok; device_controls baru berubah setelah ACK sukses. Terapkan min-on/min-off HVAC dan pengaman lokal. Jalur HTTP alternatif dijelaskan pada HTTP-IOT.md.
