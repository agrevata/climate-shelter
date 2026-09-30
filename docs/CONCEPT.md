# Pemetaan konsep dokumen

Dasar: **Climate Shelter.docx**, diakses dari lampiran percakapan “Konsep IoT Climate Shelter”. Path `/mnt/data/Climate Shelter.docx` dalam permintaan tidak ada di Windows; lampiran yang sama tersedia melalui salinan file percakapan dan telah dibaca. Dokumen asli tidak diubah.

| Komponen dalam dokumen         | Implementasi                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Climate Monitoring System      | Suhu, kelembapan, WBGT, permukaan; peta empat zona; riwayat, realtime, alerts                |
| Passive Cooling Infrastructure | Deskripsi cool roof, ventilasi silang, kanopi, vegetasi dan paving permeabel pada zona       |
| Smart Active Cooling           | Fan DC, shading dan irigasi; kontrol, modes, outbox dan audit                                |
| Climate Shelter Zone           | Zona khusus dengan perbandingan suhu luar/shelter dan ΔT                                     |
| Rainwater harvesting           | Level/volume tandon, meter air dipanen/digunakan, irigasi nonkonsumsi                        |
| Manual/emergency override      | Mode dan lease manual; emergency latch; kontrak tombol fisik dan fail-safe firmware          |
| Monitoring/evaluasi dampak     | Analytics lintas zona, sensor history CSV, energi; tidak mengarang baseline atau penghematan |

Dokumen menyebut dukungan prakiraan BMKG dan panel surya/baterai sebagai komponen yang mungkin digunakan. Tidak ada API, lokasi sensor, faktor emisi, firmware, kapasitas tandon, ambang klinis atau denah terukur dalam lampiran; integrasi tersebut tidak diklaim aktif. Skenario demo menggunakan tandon 1.000 L dan empat zona konseptual; nama sekolah adalah fixture.

WBGT demo adalah data sintetis, bukan konversi suhu/humidity yang dipakai sebagai hasil pengukuran. Peta menggunakan kategori WBGT untuk warna dan suhu udara untuk angka. Denah dalam `school-map.tsx` perlu dipetakan ulang untuk sekolah nyata.
