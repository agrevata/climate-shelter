import type { DashboardData, Device } from "./types";
export const SCHOOL_ID = "10000000-0000-4000-8000-000000000001";
export const zoneId = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const deviceId = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function createDemo(now = new Date()): DashboardData {
  const at = now.toISOString();
  const zoneDefs = [
    [
      "playground",
      "Lapangan terbuka",
      "outside",
      "Permukaan paving dengan paparan matahari langsung.",
    ],
    [
      "shelter",
      "Climate Shelter",
      "shelter",
      "Kanopi, vegetasi, kipas DC dan akses air minum.",
    ],
    [
      "garden",
      "Taman resapan",
      "garden",
      "Vegetasi dan paving permeabel dengan irigasi air hujan.",
    ],
    [
      "classroom",
      "Gedung kelas A",
      "classroom",
      "Cool roof, peneduh jendela dan ventilasi silang.",
    ],
  ] as const;
  const zones = zoneDefs.map(([slug, name, kind, description], i) => ({
    id: zoneId(i + 1),
    school_id: SCHOOL_ID,
    slug,
    name,
    kind,
    description,
  }));
  const deviceDefs = [
    [1, "sensor-outside", "Sensor lapangan", "sensor", 1, 0],
    [2, "sensor-shelter", "Sensor shelter", "sensor", 2, 0],
    [3, "sensor-garden", "Sensor taman", "sensor", 3, 0],
    [4, "sensor-classroom", "Sensor kelas A", "sensor", 4, 0],
    [5, "fan", "Kipas DC shelter", "fan", 2, 65],
    [6, "shade", "Motorized shading", "shade", 2, 85],
    [7, "irrigation", "Irigasi taman", "irrigation", 3, 0],
    [8, "energy-meter", "Meter energi", "energy", 2, 0],
    [9, "water-tank", "Tandon air hujan", "water", 3, 0],
    [10, "sensor-backup", "Sensor cadangan kelas", "sensor", 4, 0],
    [11, "hvac", "HVAC kelas", "hvac", 4, 100],
    [12, "pump", "Pompa tandon", "pump", 3, 0],
    [13, "ventilation", "Ventilasi kelas", "ventilation", 4, 100],
  ] as const;
  const devices: Device[] = deviceDefs.map(
    ([n, slug, name, kind, zone, value]) => ({
      id: deviceId(n),
      school_id: SCHOOL_ID,
      zone_id: zoneId(zone),
      slug,
      name,
      kind,
      value,
      mode: "AUTO",
      emergency_latched: false,
      active: true,
      location: zones[zone - 1].name,
      firmware_version: "demo-2.0",
      last_seen: n === 10 ? new Date(+now - 3600000).toISOString() : at,
    }),
  );
  const sensors: DashboardData["sensors"] = [];
  const energy: DashboardData["energy"] = [];
  const water: DashboardData["water"] = [];
  for (let i = 720; i >= 0; i--) {
    const date = new Date(+now - i * 3600000);
    const hour = (date.getUTCHours() + 7) % 24;
    const heat = Math.max(0, Math.sin(((hour - 6) * Math.PI) / 12));
    zones.forEach((zone, j) => {
      const temp =
        26 + heat * [9.2, 3.8, 4.9, 6.4][j] + Math.sin(i * 0.7 + j) * 0.25;
      sensors.push({
        id: `demo-s-${i}-${j}`,
        school_id: SCHOOL_ID,
        device_id: deviceId(j + 1),
        zone_id: zone.id,
        recorded_at: date.toISOString(),
        temperature: +temp.toFixed(1),
        humidity: +(78 - heat * 17 + j * 1.2).toFixed(1),
        co2: Math.round(760 + Math.sin(i / 4 + j) * 300),
        pm25: +(18 + Math.sin(i / 7 + j) * 8).toFixed(1),
        thermal_comfort_index: Math.round(80 + Math.sin(i / 5) * 9),
        energy_consumption: +(123 + (720 - i) * 0.075).toFixed(3),
        pcm_temperature: +(27 + Math.sin(i / 12) * 1.8).toFixed(1),
        wbgt: +(temp - 3.2).toFixed(1),
        surface_temperature: +(temp + heat * [10, 1, 2, 4][j]).toFixed(1),
        soil_moisture: j === 2 ? +(48 + Math.sin(i / 8) * 6).toFixed(1) : null,
      });
    });
    energy.push({
      id: `demo-e-${i}`,
      school_id: SCHOOL_ID,
      device_id: deviceId(8),
      recorded_at: date.toISOString(),
      voltage: 220.2,
      current: +(0.12 + heat * 0.5).toFixed(2),
      power_w: +(26 + heat * 110).toFixed(1),
      energy_kwh: +(123 + (720 - i) * 0.075).toFixed(3),
    });
    water.push({
      id: `demo-w-${i}`,
      school_id: SCHOOL_ID,
      device_id: deviceId(9),
      recorded_at: date.toISOString(),
      tank_level: +(72 + Math.sin(i / 12) * 10).toFixed(1),
      stored_liters: Math.round(720 + Math.sin(i / 12) * 100),
      used_liters: 4200 + (720 - i) * 3,
      harvested_liters: 5600 + (720 - i) * 4,
    });
  }
  // The latest sample forms the presentation scenario, independent of local clock time.
  const current = [
    [34.8, 62, 30.9, 44.2],
    [29.2, 68, 26.1, 30.5],
    [30.4, 71, 27.2, 32.1],
    [32.1, 65, 28.8, 35.4],
  ];
  sensors.slice(-4).forEach((r, i) => {
    [r.temperature, r.humidity, r.wbgt, r.surface_temperature] = current[i];
  });
  return {
    school: {
      id: SCHOOL_ID,
      slug: "school01",
      name: "SD Negeri Candigaron 01",
      location: "Desa Candigaron, Kecamatan Sumowono, Kabupaten Semarang",
      timezone: "Asia/Jakarta",
      is_public: true,
    },
    zones,
    devices,
    sensors,
    energy,
    water,
    role: "admin",
    schools: [
      {
        id: SCHOOL_ID,
        slug: "school01",
        name: "SD Negeri Candigaron 01",
        location: "Desa Candigaron, Kecamatan Sumowono, Kabupaten Semarang",
        timezone: "Asia/Jakarta",
        is_public: true,
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        slug: "school02",
        name: "SD Negeri Candigaron 02",
        location: "Desa Candigaron, Kecamatan Sumowono, Kabupaten Semarang",
        timezone: "Asia/Jakarta",
        is_public: false,
      },
    ],
    controls: devices
      .filter((d) =>
        ["fan", "shade", "irrigation", "hvac", "pump", "ventilation"].includes(
          d.kind,
        ),
      )
      .map((d) => ({
        device_id: d.id,
        school_id: SCHOOL_ID,
        temperature_setpoint: 28,
        humidity_setpoint: 65,
        updated_by: null,
        updated_at: at,
      })),
    activity: [],
    members: [],
    thresholds: {
      school_id: SCHOOL_ID,
      temperature_warning: 32,
      co2_warning: 1000,
      co2_critical: 1500,
      pm25_warning: 35,
      pm25_critical: 75,
      pcm_melt_start: 26,
      pcm_melt_end: 28,
      allow_operator_setpoints: true,
    },
    user: {
      id: "60000000-0000-4000-8000-000000000001",
      name: "Admin Demo",
      email: "demo@climate.local",
    },
    source: "demo",
    fetchedAt: at,
    commands: [],
    logs: [],
    alerts: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        school_id: SCHOOL_ID,
        zone_id: zoneId(1),
        severity: "warning",
        title: "Paparan panas di lapangan",
        sensor_type: "wbgt",
        message:
          "WBGT 30,9°C pada skenario demo. Tinjau kegiatan luar ruang dan arahkan waktu istirahat ke shelter sesuai SOP sekolah.",
        created_at: at,
        acknowledged_at: null,
      },
      {
        id: "50000000-0000-4000-8000-000000000002",
        school_id: SCHOOL_ID,
        zone_id: zoneId(4),
        severity: "info",
        title: "Sensor cadangan tidak terhubung",
        message:
          "Tidak ada heartbeat selama lebih dari 2 menit. Sensor utama kelas masih tersedia.",
        created_at: new Date(+now - 3600000).toISOString(),
        acknowledged_at: null,
      },
    ],
  };
}
