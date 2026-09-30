# ESP32 melalui HTTPS

Gunakan HTTPS produksi dengan validasi sertifikat CA. Key perangkat hanya disimpan di firmware/device yang terkait. Jangan memasang Supabase service-role atau credential pengguna pada ESP32. Key dibuat admin melalui Devices → Rotasi API key, ditampilkan sekali. Penonaktifan perangkat mencabut semua key aktif.

## Sensor

`POST /api/iot/sensor`

Headers: `Content-Type: application/json`, `Authorization: Bearer cs_<credential UUID>_<64 karakter secret>`.

```json
{
  "device_id": "sensor-shelter",
  "message_id": "50000000-0000-4000-8000-000000000080",
  "temperature": 29.2,
  "humidity": 68,
  "co2": 780,
  "pm25": 18.5,
  "thermal_comfort_index": 82,
  "energy": 123.45,
  "pcm_temperature": 27.1,
  "wbgt": 26.1,
  "surface_temperature": 30.5,
  "soil_moisture": null,
  "recorded_at": "2026-09-28T00:00:00Z",
  "firmware_version": "1.0.0"
}
```

device_id boleh UUID atau kode perangkat, harus cocok dengan key. temperature dan humidity wajib; metrik lain opsional/null. energy adalah kWh kumulatif, PM2.5 µg/m³, CO₂ ppm, RH/soil %, suhu °C, kenyamanan skor proyek 0–100. Jangan mengarang WBGT dari suhu udara tanpa metode instrumentasi tervalidasi.

Server menurunkan school/zone dari registrasi perangkat dan memakai waktu penerimaan sebagai recorded_at. Waktu sensor disimpan terpisah sebagai device_recorded_at. Respons 201: reading_id, server_time, ok. UUID message_id yang sama diulang secara idempoten; gunakan UUID baru untuk pengukuran baru, UUID sama saat retry. Device lain tidak bisa mengambil alih message_id tersebut.

HTTP JSON dibatasi 8 KiB, key 120 request/menit di database, pembatas tambahan IP bersifat per proses (pasang WAF untuk skala produksi). 400 payload invalid, 401 key invalid, 409 mismatch/nonaktif/demo, 429 rate limit. Jangan mencetak Authorization ke log.

## Aktuator

`GET /api/iot/commands` dengan key aktuator, interval sekitar 5 detik. Poll memperbarui heartbeat. Respons berisi commands; tidak mencakup identitas pengguna/alasan internal.

```json
{
  "commands": [
    {
      "id": "70000000-0000-4000-8000-000000000001",
      "sequence": 12,
      "command_type": "setpoint",
      "mode": "AUTO",
      "value": 65,
      "duration_seconds": 60,
      "expires_at": "2026-09-28T00:00:30Z",
      "temperature_setpoint": 27,
      "humidity_setpoint": 60
    }
  ]
}
```

Firmware wajib cek expires_at, deduplikasi ID, sequence monotonic tersimpan, emergency latch, batas mekanis, watchdog serta manual override fisik. Jangan mengirim ACK sukses sebelum output/setpoint benar-benar diterapkan. Untuk command_type=actuator, abaikan field setpoint null. AUTO mengikuti aturan firmware; EMERGENCY berhenti dan terkunci, recovery hanya perintah admin setelah pemeriksaan.

`POST /api/iot/ack` dengan key yang sama:

```json
{
  "message_id": "80000000-0000-4000-8000-000000000001",
  "device_id": "30000000-0000-4000-8000-000000000005",
  "recorded_at": "2026-09-28T00:00:05Z",
  "command_id": "70000000-0000-4000-8000-000000000001",
  "status": "acknowledged",
  "mode": "AUTO",
  "value": 65,
  "temperature_setpoint": 27,
  "humidity_setpoint": 60,
  "detail": "Setpoints applied"
}
```

ACK setpoint harus menyertakan target yang cocok. Untuk perintah actuator, field setpoint dapat dihilangkan. Gunakan status failed jika ditolak firmware. SQL memverifikasi device, school, status, TTL dan nilai; confirmed device_controls berubah setelah ACK sukses. Pengulangan ACK sukses tidak menggandakan log.

Pilih satu transport dispatch utama per aktuator. MQTT dan HTTP membaca outbox yang sama; penggunaan bersamaan membutuhkan koordinasi firmware. MQTT tetap jalur utama untuk energy/water meters terpisah. HTTP sensor mempunyai metrik energi kumulatif ringkas; halaman Energy meter tetap membaca energy_readings.
