"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudRain,
  Droplets,
  Fan,
  Leaf,
  MapPin,
  Radio,
  ShieldAlert,
  SlidersHorizontal,
  Sprout,
  Sun,
  Thermometer,
  Waves,
  Wind,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Device, View } from "@/lib/types";
import { counterDelta, csvCell, fmt, latestSensors, time } from "@/lib/metrics";
import {
  commandSchema,
  isFresh,
  riskLevel,
  type Mode,
} from "../../shared/contracts";
import { ClimateChart, ResourceChart, type SensorMetric } from "./charts";
import { useDashboard } from "./dashboard-provider";
import { SchoolMap } from "./school-map";

import { AirMetrics, PcmPanel, RoomStatusBanner } from "./monitor-widgets";
import { canOperate, canAdmin } from "../../shared/platform";
const headings: Record<View, [string, string]> = {
  overview: [
    "Overview",
    "Satu pandangan untuk lingkungan sekolah yang lebih nyaman.",
  ],
  "heat-map": [
    "School Heat Map",
    "Kenali zona panas dan temukan ruang yang lebih sejuk.",
  ],
  analytics: [
    "Climate Analytics",
    "Bandingkan mikroklimat dan ukur dampak ruang teduh.",
  ],
  energy: [
    "Energy Monitoring",
    "Pantau daya dan konsumsi energi sistem pendinginan.",
  ],
  water: ["Water Management", "Dari air hujan, kembali merawat ruang hijau."],
  devices: [
    "Device Control",
    "Kelola perangkat dan tinjau konfirmasi setiap perintah.",
  ],
  history: ["Sensor History", "Telusuri pengukuran setiap zona sekolah."],
  alerts: [
    "Alerts & Activity",
    "Tinjau peringatan lingkungan dan aktivitas perangkat.",
  ],
};
function Metric({
  icon: Icon,
  label,
  value,
  unit,
  note,
  tone = "purple",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  note: string;
  tone?: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>
          <Icon size={19} />
        </span>
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="metric-note">{note}</div>
    </article>
  );
}
function Panel({
  title,
  sub,
  action,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function ViewLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      className="text-link"
      href={`/dashboard/${to === "devices" ? "control" : to}`}
    >
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export function DashboardView({ view }: { view: View }) {
  const { data, now } = useDashboard();
  const locationName = data.wokwi?.location.name ?? data.zones.find(z => z.id === data.selectedZoneId)?.name ?? "Lokasi";
  const [hours, setHours] = useState(24);
  const [metric, setMetric] = useState<SensorMetric>("temperature");
  const [zone, setZone] = useState("all");
  const latest = latestSensors(data);
  const outside = latest.get(
    data.zones.find((z) => z.kind === "outside")?.id ?? "",
  );
  const shelter = latest.get(
    data.selectedZoneId ?? "",
  );
  const garden = latest.get(
    data.zones.find((z) => z.kind === "garden")?.id ?? "",
  );
  const cooling =
    !data.wokwi && data.zones.find(z => z.id === data.selectedZoneId)?.kind === "shelter" && outside && shelter ? outside.temperature - shelter.temperature : null;
  const tank = data.water.at(-1);
  const energy = data.energy.at(-1);
  const active = data.devices.filter(
    (d) => d.last_seen && isFresh(d.last_seen, now),
  ).length;
  const anyStale = data.wokwi
    ? !data.wokwi.latest || now - Date.parse(data.wokwi.latest.received_at) >= 20000
    : [outside, shelter].some((r) => !r || !isFresh(r.recorded_at, now));
  const risk = riskLevel(outside?.wbgt);
  const energyRows = data.energy.filter(
    (r) => Date.parse(r.recorded_at) >= now - hours * 3600000,
  );
  const waterRows = data.water.filter(
    (r) => Date.parse(r.recorded_at) >= now - hours * 3600000,
  );
  const energyUsed =
    energyRows.length > 1 ? counterDelta(energyRows, "energy_kwh") : null;
  return (
    <div className="page-content" suppressHydrationWarning>
      <div className="page-heading">
        <div>
          <div className="page-kicker">
            <span className="kicker-line" /> SCHOOL MICROCLIMATE
          </div>
          <h1>{headings[view][0]}</h1>
          <p>{headings[view][1]}</p>
        </div>
        <div className="page-tools">
          {["overview", "analytics", "energy", "water"].includes(view) && (
            <label className="period-select">
              <Clock3 size={16} />
              <select
                aria-label="Periode grafik"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              >
                <option value={0.25}>Live · 15 menit</option>
                <option value={1}>1 jam terakhir</option>
                <option value={6}>6 jam terakhir</option>
                <option value={24}>24 jam terakhir</option>
                <option value={168}>7 hari terakhir</option>
                <option value={720}>30 hari terakhir</option>
              </select>
            </label>
          )}
          <span className="date-label">
            {new Intl.DateTimeFormat("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "Asia/Jakarta",
            }).format(new Date(now))}
          </span>
        </div>
      </div>
      {data.source === "demo" && !data.wokwi && (
        <div className="demo-strip">
          <span className="badge purple">DEMO</span>
          <span>
            Data contoh diperbarui setiap 6 detik. Kontrol perangkat adalah
            simulasi.
          </span>
          <span className="demo-time">
            Pembaruan {time(data.fetchedAt)} WIB
          </span>
        </div>
      )}
      {anyStale && (
        <div className="notice">
          <Clock3 size={17} /> {data.wokwi ? `Data ${locationName} belum tersedia atau belum diperbarui lebih dari 20 detik.` : "Data zona utama belum tersedia atau lebih dari 2 menit."} Nilai terakhir tidak mewakili kondisi saat ini.
        </div>
      )}
      {view === "overview" && <AirMetrics />}
      {view === "overview" && (
        <RoomStatusBanner
          shelter={shelter}
          row={latest.get(
            data.selectedZoneId ?? "",
          )}
          now={now}
        />
      )}
      {view === "overview" && (
        <>
          {!data.wokwi && <div className="metrics-grid">
            <Metric
              icon={Sun}
              label="Suhu luar ruangan"
              value={fmt(outside?.temperature)}
              unit="°C"
              note="Lapangan terbuka"
              tone="orange"
            />
            <Metric
              icon={Leaf}
              label={`Suhu ${locationName}`}
              value={fmt(shelter?.temperature)}
              unit="°C"
              note="Lokasi yang dipilih"
              tone="green"
            />
            <Metric
              icon={Droplets}
              label={`Kelembapan ${locationName}`}
              value={fmt(shelter?.humidity, 0)}
              unit="%"
              note="Kelembapan relatif udara"
              tone="blue"
            />
            <Metric
              icon={Radio}
              label="Perangkat terhubung"
              value={String(active).padStart(2, "0")}
              unit={`/ ${data.devices.length}`}
              note={`${data.devices.length - active} perangkat offline`}
            />
          </div>}
          <div className="overview-primary" style={data.wokwi ? {gridTemplateColumns:"1fr"} : undefined}>
            <Panel
              title="Tren suhu lingkungan"
              sub={`Pembacaan lingkungan · ${locationName}`}
              action={<ViewLink to="analytics">Detail</ViewLink>}
            >
              <ClimateChart hours={hours} compact zone={data.selectedZoneId ?? "all"} />
            </Panel>
            {!data.wokwi && data.zones.find(z => z.id === data.selectedZoneId)?.kind === "shelter" && <section className="cooling-card">
              <div className="cooling-top">
                <span>
                  <Leaf size={18} /> SHELTER PERFORMANCE
                </span>
                <span className="cooling-icon">
                  <ArrowDown size={21} />
                </span>
              </div>
              <h2>
                Lebih teduh.
                <br />
                Terukur lebih sejuk.
              </h2>
              <div className="cooling-value">
                {fmt(cooling)}
                <span>°C</span>
              </div>
              <p>
                Selisih suhu luar dan shelter{anyStale ? " · data lama" : ""}
              </p>
              <div className="cooling-comparison">
                <div>
                  <span>Di luar</span>
                  <strong>{fmt(outside?.temperature)}°</strong>
                </div>
                <div>
                  <span>Di shelter</span>
                  <strong>{fmt(shelter?.temperature)}°</strong>
                </div>
              </div>
              <small>
                <Activity size={13} /> ΔT sesaat · bukan baseline
                sebelum/sesudah
              </small>
            </section>}
          </div>
          <div className="overview-secondary">
            <Panel
              title="School Heat Map"
              sub="Kondisi mikroklimat per zona"
              action={<ViewLink to="heat-map">Jelajahi peta</ViewLink>}
            >
              <SchoolMap compact />
            </Panel>
            <div className="overview-side">
              <Panel
                title="Heat status"
                action={
                  <span className={`badge ${anyStale ? "neutral" : risk.tone}`}>
                    {anyStale ? "Data lama" : risk.label}
                  </span>
                }
              >
                <div className="heat-reading">
                  <span className="heat-icon">
                    <Thermometer size={28} />
                  </span>
                  <div>
                    <strong>
                      {fmt(outside?.wbgt)}
                      <small>°C</small>
                    </strong>
                    <span>WBGT · Lapangan terbuka</span>
                  </div>
                </div>
                <div className="risk-scale">
                  <i className="good" />
                  <i className="amber" />
                  <i className="warning" />
                  <i className="danger" />
                </div>
                <p className="small muted">
                  Ambang awal untuk demonstrasi. Tinjau kegiatan luar ruang
                  mengikuti SOP sekolah.
                </p>
              </Panel>
              <div className="resource-mini-grid">
                <Link className="resource-mini" href="/dashboard/water">
                  <span>
                    <Droplets size={17} /> Tandon air
                  </span>
                  <strong>
                    {fmt(tank?.tank_level, 0)}
                    <small>%</small>
                  </strong>
                  <div className="progress">
                    <i style={{ width: `${tank?.tank_level ?? 0}%` }} />
                  </div>
                  <small>{fmt(tank?.stored_liters, 0)} liter tersimpan</small>
                </Link>
                <Link className="resource-mini" href="/dashboard/energy">
                  <span>
                    <Zap size={17} /> Energi
                  </span>
                  <strong>
                    {fmt(energyUsed, 2)}
                    <small>kWh</small>
                  </strong>
                  <span className="energy-mini-line">
                    <Activity size={30} />
                  </span>
                  <small>{hours} jam terakhir</small>
                </Link>
              </div>
              <div className="overview-alert">
                <span className="alert-icon">
                  <Bell size={17} />
                </span>
                <div>
                  <strong>
                    {data.alerts.filter((a) => !a.acknowledged_at).length}{" "}
                    peringatan perlu ditinjau
                  </strong>
                  <Link href="/dashboard/alerts">
                    Lihat peringatan <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <Panel
            title="Perangkat aktif"
            sub="Status output terakhir yang dikonfirmasi"
            action={<ViewLink to="devices">Kelola perangkat</ViewLink>}
          >
            <div className="actuator-summary">
              {data.devices
                .filter(
                  (d) =>
                    [
                      "fan",
                      "shade",
                      "irrigation",
                      "hvac",
                      "pump",
                      "ventilation",
                    ].includes(d.kind) && d.active !== false && (!data.selectedZoneId || d.zone_id === data.selectedZoneId),
                )
                .map((d) => (
                  <DeviceSummary key={d.id} device={d} />
                ))}
            </div>
          </Panel>
        </>
      )}
      {view === "heat-map" && (
        <>
          <Panel
            title="Peta zona sekolah"
            sub="Pilih area di peta untuk melihat pengukuran dan kondisi terakhir"
            action={
              <span className="badge neutral">
                <MapPin size={13} /> Denah konseptual
              </span>
            }
          >
            <SchoolMap />
          </Panel>
          <div className="info-panel">
            <CircleHelp size={20} />
            <div>
              <strong>
                Warna menunjukkan kategori WBGT, angka menunjukkan suhu udara.
              </strong>
              <p>
                Rendah &lt;25°C · Waspada 25–&lt;28°C · Tinggi 28–&lt;31°C ·
                Sangat tinggi ≥31°C. Data lebih dari 2 menit ditandai abu-abu.
                Ambang demo ini perlu disesuaikan dengan SOP setempat.
              </p>
            </div>
          </div>
        </>
      )}
      {view === "analytics" && (
        <>
          <div className="metrics-grid">
            <Metric
              icon={ArrowDown}
              label="Selisih suhu saat ini"
              value={fmt(cooling)}
              unit="°C"
              note={data.wokwi ? "Memerlukan sensor luar yang terhubung" : "Luar dikurangi shelter"}
              tone="green"
            />
            <Metric
              icon={Thermometer}
              label="Permukaan lapangan"
              value={fmt(outside?.surface_temperature)}
              unit="°C"
              note="Pembacaan sensor permukaan"
              tone="orange"
            />
            <Metric
              icon={Wind}
              label={`WBGT ${locationName}`}
              value={fmt(shelter?.wbgt)}
              unit="°C"
              note={riskLevel(shelter?.wbgt).label}
            />
            <Metric
              icon={Droplets}
              label={`Kelembapan ${locationName}`}
              value={fmt(shelter?.humidity, 0)}
              unit="%"
              note="Kelembapan relatif"
              tone="blue"
            />
          </div>
          <Panel
            title="Perbandingan mikroklimat"
            sub="Sampel per menit untuk periode singkat; per jam untuk riwayat panjang"
            action={<ZoneSelect value={zone} onChange={setZone} />}
          >
            <div className="tabs" role="group" aria-label="Parameter grafik">
              {(
                [
                  ["temperature", "Suhu udara"],
                  ["humidity", "Kelembapan"],
                  ["wbgt", "WBGT"],
                  ["surface_temperature", "Suhu permukaan"],
                  ["co2", "CO₂"],
                  ["pm25", "PM2.5"],
                  ["thermal_comfort_index", "Kenyamanan"],
                  ["energy_consumption", "Energi"],
                  ["pcm_temperature", "PCM"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={metric === key}
                  className={metric === key ? "active" : ""}
                  onClick={() => setMetric(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <ClimateChart metric={metric} hours={hours} zone={zone} />
          </Panel>
          <div className="info-panel">
            <Leaf size={20} />
            <div>
              <strong>
                Ukur manfaat intervensi dengan kondisi yang sebanding.
              </strong>
              <p>
                ΔT di dashboard membandingkan dua zona pada saat yang sama.
                Evaluasi sebelum/sesudah membutuhkan baseline dengan waktu,
                cuaca, lokasi sensor, dan kalibrasi yang konsisten. WBGT berasal
                dari sensor, bukan diturunkan dari suhu udara saja.
              </p>
            </div>
          </div>
        </>
      )}
      {view === "energy" && (
        <>
          <div className="metrics-grid">
            <Metric
              icon={Zap}
              label={`Konsumsi ${hours} jam`}
              value={fmt(energyUsed, 2)}
              unit="kWh"
              note="Selisih meter kumulatif"
            />
            <Metric
              icon={Activity}
              label="Daya saat ini"
              value={fmt(energy?.power_w, 1)}
              unit="W"
              note={
                energy
                  ? `Terakhir ${time(energy.recorded_at)} WIB`
                  : "Menunggu data"
              }
              tone="orange"
            />
            <Metric
              icon={Zap}
              label="Tegangan"
              value={fmt(energy?.voltage, 1)}
              unit="V"
              note="Pembacaan energy meter"
              tone="blue"
            />
            <Metric
              icon={Activity}
              label="Arus"
              value={fmt(energy?.current, 2)}
              unit="A"
              note="Pembacaan energy meter"
              tone="green"
            />
          </div>
          <Panel
            title="Profil penggunaan daya"
            sub="Daya terukur pada meter utama sistem"
          >
            <ResourceChart kind="energy" hours={hours} />
          </Panel>
          <div className="two-column">
            <Panel
              title="Perangkat pendinginan"
              sub="Status output, bukan rincian daya per perangkat"
            >
              <div className="stacked-devices">
                {data.devices
                  .filter(
                    (d) =>
                      [
                        "fan",
                        "shade",
                        "irrigation",
                        "hvac",
                        "pump",
                        "ventilation",
                      ].includes(d.kind) && d.active !== false,
                  )
                  .map((d) => (
                    <DeviceSummary key={d.id} device={d} />
                  ))}
              </div>
            </Panel>
            <Panel
              title="Evaluasi efisiensi"
              sub="Mulai dari data yang dapat diverifikasi"
            >
              <div className="explanation">
                <Leaf size={30} />
                <h3>Hemat energi, dengan bukti.</h3>
                <p>
                  Konsumsi dihitung dari kenaikan meter kWh pada periode
                  terpilih. Reset meter yang menurunkan angka diabaikan.
                </p>
                <p>
                  Persentase penghematan dan pengurangan CO₂ belum ditampilkan
                  karena memerlukan baseline serta faktor emisi yang sesuai.
                </p>
              </div>
            </Panel>
          </div>
        </>
      )}
      {view === "water" && (
        <>
          <div className="metrics-grid">
            <Metric
              icon={Waves}
              label="Level tandon"
              value={fmt(tank?.tank_level, 0)}
              unit="%"
              note={
                tank && isFresh(tank.recorded_at, now)
                  ? "Pembacaan terbaru"
                  : "Data tandon kedaluwarsa"
              }
              tone="blue"
            />
            <Metric
              icon={Droplets}
              label="Air tersimpan"
              value={fmt(tank?.stored_liters, 0)}
              unit="L"
              note="Air hujan · nonkonsumsi"
              tone="blue"
            />
            <Metric
              icon={Sprout}
              label="Kelembapan tanah"
              value={fmt(garden?.soil_moisture, 0)}
              unit="%"
              note="Taman resapan"
              tone="green"
            />
            <Metric
              icon={CloudRain}
              label={`Air dipanen · ${hours} jam`}
              value={
                waterRows.length > 1
                  ? fmt(counterDelta(waterRows, "harvested_liters"), 0)
                  : "—"
              }
              unit="L"
              note="Selisih meter pemanenan"
            />
          </div>
          <div className="water-layout">
            <Panel
              title="Rainwater harvesting"
              sub="Air hujan untuk merawat vegetasi"
            >
              <div className="water-storage">
                <div
                  className="tank-graphic"
                  role="img"
                  aria-label={`Tandon ${fmt(tank?.tank_level, 0)} persen`}
                >
                  <div
                    className="tank-fill"
                    style={{ height: `${tank?.tank_level ?? 0}%` }}
                  />
                  <strong>
                    {fmt(tank?.tank_level, 0)}
                    <small>%</small>
                  </strong>
                  <span>TERISI</span>
                  <div className="tank-markings" />
                </div>
                <div>
                  <span className="eyebrow">TANDON SEKOLAH</span>
                  <h3>
                    {fmt(tank?.stored_liters, 0)} <small>liter</small>
                  </h3>
                  <p>Atap → talang → filter → tandon → irigasi</p>
                  <span className="badge blue">
                    Untuk penyiraman, bukan air minum
                  </span>
                </div>
              </div>
              <div className="detail-row">
                <span>Air digunakan · {hours} jam</span>
                <strong>
                  {waterRows.length > 1
                    ? fmt(counterDelta(waterRows, "used_liters"), 0)
                    : "—"}{" "}
                  L
                </strong>
              </div>
              <div className="detail-row">
                <span>Batas minimum irigasi</span>
                <strong>15%</strong>
              </div>
            </Panel>
            <Panel
              title="Kondisi taman"
              sub="Kelembapan tanah dan kontrol penyiraman"
            >
              <div className="garden-condition">
                <span className="garden-icon">
                  <Sprout size={32} />
                </span>
                <h3>Taman resapan</h3>
                <strong>
                  {fmt(garden?.soil_moisture, 0)}
                  <small>%</small>
                </strong>
                <p>Kelembapan tanah saat pembacaan terakhir</p>
                <div className="progress green">
                  <i style={{ width: `${garden?.soil_moisture ?? 0}%` }} />
                </div>
                <ViewLink to="devices">Kelola irigasi</ViewLink>
              </div>
            </Panel>
          </div>
          <Panel
            title="Riwayat level air"
            sub="Persentase isi tandon pada periode terpilih"
          >
            <ResourceChart kind="water" hours={hours} />
          </Panel>
        </>
      )}
      {view === "overview" && <PcmPanel />}
      {view === "devices" && <DeviceControl />}
      {view === "history" && <SensorHistory />}
      {view === "alerts" && <AlertsActivity />}
    </div>
  );
}
function ZoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data } = useDashboard();
  return (
    <select
      className="select"
      aria-label="Filter zona"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">Semua zona</option>
      {data.zones.map((z) => (
        <option key={z.id} value={z.id}>
          {z.name}
        </option>
      ))}
    </select>
  );
}
const deviceIcons: Record<string, LucideIcon> = {
  fan: Fan,
  shade: Sun,
  irrigation: Sprout,
};
function DeviceSummary({ device }: { device: Device }) {
  const { now } = useDashboard();
  const Icon = deviceIcons[device.kind] ?? Radio;
  const online = device.last_seen && isFresh(device.last_seen, now);
  return (
    <div className="device-summary">
      <span className={`device-icon ${device.kind}`}>
        <Icon size={22} />
      </span>
      <div>
        <strong>{device.name}</strong>
        <small>
          {online
            ? `${device.mode} · ${device.value}% output`
            : "Offline · status terakhir"}
        </small>
      </div>
      <span className={`badge ${online ? "good" : "neutral"}`}>
        {online ? "Online" : "Offline"}
      </span>
    </div>
  );
}
export function DeviceControl() {
  const { data, now } = useDashboard();
  const devices = data.selectedZoneId ? data.devices.filter(d => d.zone_id === data.selectedZoneId) : data.devices;
  const [editing, setEditing] = useState<{
    device: Device;
    emergency: boolean;
  } | null>(null);
  const [message, setMessage] = useState("");
  const actuators = devices.filter(
    (d) =>
      ["fan", "shade", "irrigation", "hvac", "pump", "ventilation"].includes(
        d.kind,
      ) && d.active !== false && !(data.wokwi && d.firmware_version?.startsWith("climate-wokwi-")),
  );
  return (
    <>
      {message && (
        <div role="status" className="notice success">
          <Check size={18} />
          {message}
          <button
            className="icon-button"
            aria-label="Tutup pesan"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {actuators.length > 0 && <div className="mode-guide">
        <span>
          <i className="mode-dot auto" />
          <strong>AUTO</strong> Aturan lokal perangkat
        </span>
        <span>
          <i className="mode-dot manual" />
          <strong>MANUAL</strong> Override berdurasi
        </span>
        <span>
          <i className="mode-dot emergency" />
          <strong>EMERGENCY</strong> Output berhenti & terkunci
        </span>
      </div>}
      <div className="device-grid">
        {actuators.map((d) => {
          const Icon = deviceIcons[d.kind] ?? Radio;
          const online = !!d.last_seen && isFresh(d.last_seen, now);
          const pending = data.commands.find(
            (c) =>
              c.device_id === d.id &&
              ["pending", "published"].includes(c.status) &&
              Date.parse(c.expires_at) > now,
          );
          return (
            <section className="panel device-card" key={d.id}>
              <div className="device-card-top">
                <span className={`device-icon ${d.kind}`}>
                  <Icon size={26} />
                </span>
                <span className={`badge ${online ? "good" : "neutral"}`}>
                  {online ? "Online" : "Offline"}
                </span>
              </div>
              <h2>{d.name}</h2>
              <p>{data.zones.find((z) => z.id === d.zone_id)?.name}</p>
              <div className="device-output">
                <strong>
                  {d.value}
                  <small>%</small>
                </strong>
                <span>
                  {d.kind === "shade"
                    ? d.mode === "EMERGENCY"
                      ? "Motor berhenti"
                      : "Target terbentang"
                    : d.kind === "irrigation"
                      ? "Status katup"
                      : "Kecepatan kipas"}
                </span>
              </div>
              <div className="progress">
                <i style={{ width: `${d.value}%` }} />
              </div>
              <div className="detail-row">
                <span>Mode terkonfirmasi</span>
                <span
                  className={`badge ${d.mode === "EMERGENCY" ? "danger" : "purple"}`}
                >
                  {d.mode}
                </span>
              </div>
              <div className="device-pending">
                {pending
                  ? `Menunggu perangkat · ${pending.status}`
                  : d.last_seen
                    ? `Heartbeat ${time(d.last_seen)} WIB`
                    : "Belum menerima heartbeat"}
              </div>
              <button
                className="button primary full"
                disabled={!online || !!pending || !canOperate(data.role)}
                onClick={() => setEditing({ device: d, emergency: false })}
              >
                <SlidersHorizontal size={16} />
                Atur perangkat
              </button>
              <button
                className="button danger-ghost full"
                disabled={!online || !canOperate(data.role)}
                onClick={() => setEditing({ device: d, emergency: true })}
              >
                <ShieldAlert size={16} />
                Emergency stop
              </button>
            </section>
          );
        })}
      </div>
      {actuators.length > 0 && <div className="info-panel warning">
        <ShieldAlert size={21} />
        <div>
          <strong>Kontrol fisik tetap menjadi pengaman utama.</strong>
          <p>
            Perintah web kedaluwarsa dalam 30 detik tanpa konfirmasi. Emergency
            menghentikan kipas, menutup katup, dan menghentikan gerak motor
            shading; hanya admin dapat melepasnya. Override manual maksimal 5
            menit. Perangkat harus menerapkan pengaman ini secara lokal.
          </p>
        </div>
      </div>}
      <Panel
        title="Inventaris perangkat"
        sub="Online jika heartbeat diterima dalam 2 menit"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Perangkat</th>
                <th>Zona</th>
                <th>Jenis</th>
                <th>Heartbeat terakhir</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.name}</strong>
                    <small>{d.slug}</small>
                  </td>
                  <td>{data.zones.find((z) => z.id === d.zone_id)?.name}</td>
                  <td>{d.kind}</td>
                  <td>
                    {d.last_seen
                      ? `${time(d.last_seen, true)} WIB`
                      : "Belum terhubung"}
                  </td>
                  <td>
                    <span
                      className={`badge ${d.last_seen && isFresh(d.last_seen, now) ? "good" : "neutral"}`}
                    >
                      {d.last_seen && isFresh(d.last_seen, now)
                        ? "Online"
                        : "Offline"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {editing && (
        <CommandDialog
          device={editing.device}
          emergency={editing.emergency}
          close={() => setEditing(null)}
          done={() => {
            setEditing(null);
            setMessage(
              data.source === "demo"
                ? "Simulasi berhasil. Output dan log telah diperbarui."
                : "Perintah masuk antrean. Tunggu konfirmasi dari perangkat.",
            );
          }}
        />
      )}
    </>
  );
}
function CommandDialog({
  device,
  emergency,
  close,
  done,
}: {
  device: Device;
  emergency: boolean;
  close: () => void;
  done: () => void;
}) {
  const { data, command } = useDashboard();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>(emergency ? "EMERGENCY" : device.mode);
  const [value, setValue] = useState(device.value);
  const [duration, setDuration] = useState(60);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="command-dialog"
      aria-labelledby="command-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const parsed = commandSchema.safeParse({
            deviceId: device.id,
            mode,
            value: mode === "MANUAL" ? value : 0,
            durationSeconds: duration,
            reason,
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          setBusy(true);
          try {
            await command(parsed.data);
            done();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Perintah gagal.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">
              {data.source === "demo"
                ? "KONTROL SIMULASI"
                : "PERINTAH PERANGKAT"}
            </span>
            <h2 id="command-title">{device.name}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Tutup dialog"
            onClick={close}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </div>
        <label>
          Mode perangkat
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            disabled={
              emergency ||
              ((device.mode === "EMERGENCY" || device.emergency_latched) &&
                !canAdmin(data.role))
            }
          >
            <option value="AUTO">AUTO · aturan lokal</option>
            <option value="MANUAL">MANUAL · override sementara</option>
            <option value="EMERGENCY">EMERGENCY · hentikan output</option>
          </select>
        </label>
        {mode === "MANUAL" && (
          <>
            {["irrigation", "pump", "hvac", "ventilation"].includes(
              device.kind,
            ) ? (
              <label>
                Status katup
                <select
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                >
                  <option value={0}>OFF (0%)</option>
                  <option value={100}>ON (100%)</option>
                </select>
              </label>
            ) : (
              <label>
                {device.kind === "shade"
                  ? "Peneduh terbentang"
                  : "Kecepatan kipas"}{" "}
                <strong>{value}%</strong>
                <input
                  aria-label="Nilai output"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                />
              </label>
            )}
            <label>
              Durasi manual
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                <option value={30}>30 detik</option>
                <option value={60}>1 menit</option>
                <option value={120}>2 menit</option>
                <option value={300}>5 menit</option>
              </select>
            </label>
          </>
        )}
        {mode === "EMERGENCY" && (
          <div className="notice warning">
            Output dihentikan dan mode dikunci. Untuk motor shading, gerakan
            berhenti di posisinya. Pelepasan emergency memerlukan admin dan
            pemeriksaan fisik.
          </div>
        )}
        {mode === "AUTO" && (
          <p className="small muted">
            Kembalikan keputusan output ke aturan lokal ESP32. Kebutuhan
            firmware dan ambangnya dijelaskan dalam panduan integrasi.
          </p>
        )}
        <label>
          Alasan tindakan
          <textarea
            required
            minLength={5}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: pengujian kipas setelah inspeksi"
            rows={3}
          />
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            onClick={close}
            disabled={busy}
          >
            Batal
          </button>
          <button
            className={`button ${mode === "EMERGENCY" ? "danger-solid" : "primary"}`}
            disabled={busy}
          >
            {busy
              ? "Mengirim…"
              : data.source === "demo"
                ? "Jalankan simulasi"
                : "Kirim perintah"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function SensorHistory() {
  const { data } = useDashboard();
  const [zone, setZone] = useState("all");
  const [page, setPage] = useState(0);
  const rows = [...data.sensors]
    .filter((r) => zone === "all" || r.zone_id === zone)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const size = 12;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  function download() {
    const headers = [
      "Waktu UTC",
      "Zona",
      "Suhu (C)",
      "Kelembapan (%)",
      "WBGT (C)",
      "Permukaan (C)",
      "Tanah (%)",
      "Sumber",
    ];
    const body = rows.map((r) => [
      r.recorded_at,
      data.zones.find((z) => z.id === r.zone_id)?.name,
      r.temperature,
      r.humidity,
      r.wbgt,
      r.surface_temperature,
      r.soil_moisture,
      data.source,
    ]);
    const csv =
      "\uFEFF" +
      [headers, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `climate-shelter-${data.source}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Panel
      title="Riwayat pengukuran"
      sub="Maksimal 7 hari · sampel terakhir tiap jam · waktu tabel dalam WIB"
      action={
        <div className="inline-actions">
          <ZoneSelect
            value={zone}
            onChange={(v) => {
              setZone(v);
              setPage(0);
            }}
          />
          <button className="button" onClick={download} disabled={!rows.length}>
            <ArrowDownToLine size={16} />
            Export CSV
          </button>
        </div>
      }
    >
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Waktu (WIB)</th>
              <th>Zona</th>
              <th>Suhu</th>
              <th>Kelembapan</th>
              <th>WBGT</th>
              <th>Permukaan</th>
              <th>Tanah</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * size, (page + 1) * size).map((r) => (
              <tr key={r.id}>
                <td>{time(r.recorded_at, true)}</td>
                <td>
                  <strong>
                    {data.zones.find((z) => z.id === r.zone_id)?.name}
                  </strong>
                </td>
                <td>{fmt(r.temperature)}°C</td>
                <td>{fmt(r.humidity, 0)}%</td>
                <td>
                  <span className={`badge ${riskLevel(r.wbgt).tone}`}>
                    {fmt(r.wbgt)}°C
                  </span>
                </td>
                <td>{fmt(r.surface_temperature)}°C</td>
                <td>
                  {r.soil_moisture === null
                    ? "—"
                    : `${fmt(r.soil_moisture, 0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-state">Belum ada pembacaan pada zona ini.</div>
        )}
      </div>
      <div className="pagination">
        <span>
          {rows.length} pembacaan ·{" "}
          {data.source === "demo" ? "data simulasi" : "sampel per jam"}
        </span>
        <div>
          <button
            className="icon-button"
            disabled={page === 0}
            aria-label="Halaman sebelumnya"
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            {page + 1} / {pages}
          </span>
          <button
            className="icon-button"
            disabled={page + 1 >= pages}
            aria-label="Halaman berikutnya"
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </Panel>
  );
}
function AlertsActivity() {
  const { data, acknowledge, now } = useDashboard();
  const [filter, setFilter] = useState("active");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const alerts = data.alerts.filter(
    (a) => filter === "all" || !a.acknowledged_at,
  );
  return (
    <>
      <Panel
        title="Peringatan lingkungan"
        sub="Menandai ditinjau tidak mengubah kondisi sensor"
        action={
          <div className="tabs small-tabs">
            <button
              className={filter === "active" ? "active" : ""}
              onClick={() => setFilter("active")}
            >
              Belum ditinjau
            </button>
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              Semua
            </button>
          </div>
        }
      >
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="alert-list">
          {alerts.map((a) => (
            <article className="alert-item" key={a.id}>
              <span className={`alert-item-icon ${a.severity}`}>
                <Bell size={19} />
              </span>
              <div>
                <h3>{a.title}</h3>
                <p>{a.message}</p>
                <small>
                  {time(a.created_at, true)} WIB ·{" "}
                  {data.zones.find((z) => z.id === a.zone_id)?.name ??
                    "Sistem sekolah"}
                </small>
              </div>
              {a.acknowledged_at ? (
                <span className="badge good">
                  <Check size={13} />
                  Ditinjau
                </span>
              ) : (
                <button
                  className="button"
                  disabled={!!busy || !canOperate(data.role)}
                  onClick={async () => {
                    setBusy(a.id);
                    setError("");
                    try {
                      await acknowledge(a.id);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Tindakan gagal.",
                      );
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === a.id ? "Menyimpan…" : "Tandai ditinjau"}
                </button>
              )}
            </article>
          ))}
        </div>
        {!alerts.length && (
          <div className="empty-state">
            <Check size={28} />
            <h3>
              Tidak ada peringatan{" "}
              {filter === "active" ? "yang belum ditinjau" : ""}
            </h3>
            <p>Peringatan baru akan muncul ketika diterima dari sistem.</p>
          </div>
        )}
      </Panel>
      <Panel
        title="Riwayat perintah"
        sub="Status antrean hingga konfirmasi perangkat"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Perangkat</th>
                <th>Mode / nilai</th>
                <th>Status</th>
                <th>Alasan</th>
              </tr>
            </thead>
            <tbody>
              {data.commands.map((c) => (
                <tr key={c.id}>
                  <td>{time(c.created_at, true)}</td>
                  <td>
                    {data.devices.find((d) => d.id === c.device_id)?.name}
                  </td>
                  <td>
                    {c.mode} / {c.value}%
                  </td>
                  <td>
                    <span
                      className={`badge ${c.status === "acknowledged" ? "good" : c.status === "failed" || c.status === "expired" ? "danger" : "amber"}`}
                    >
                      {["pending", "published"].includes(c.status) &&
                      Date.parse(c.expires_at) < now
                        ? "Menunggu status kedaluwarsa"
                        : c.status}
                    </span>
                  </td>
                  <td>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.commands.length && (
            <div className="empty-state">
              Belum ada perintah. Aktivitas dari Device Control akan tercatat di
              sini.
            </div>
          )}
        </div>
      </Panel>
      <Panel
        title="Actuator logs"
        sub="Jejak kejadian dari antrean dan perangkat"
      >
        <div className="activity-list">
          {data.logs.map((l) => (
            <div className="activity-item" key={l.id}>
              <span className="activity-marker" />
              <div>
                <strong>
                  {data.devices.find((d) => d.id === l.device_id)?.name} ·{" "}
                  {l.event}
                </strong>
                <p>{l.detail}</p>
              </div>
              <time>{time(l.created_at, true)}</time>
            </div>
          ))}
          {!data.logs.length && (
            <div className="empty-state">Belum ada log aktuator.</div>
          )}
        </div>
      </Panel>
    </>
  );
}
