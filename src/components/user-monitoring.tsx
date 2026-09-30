"use client";
import { useState } from "react";
import {
  Activity,
  Droplets,
  Layers,
  Leaf,
  Thermometer,
  Wind,
  Zap,
  Sun,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PublicSample, WokwiSnapshot } from "@/lib/public-types";
import { WokwiActuators } from "./wokwi-panel";
import { fmt, latestSensors, relativeUpdate, time } from "@/lib/metrics";
import {
  temperatureStatus,
  humidityStatus,
  co2Status,
  pm25Status,
  thermalScoreStatus,
  getAirQualityStatus,
  getOverallRoomStatus,
  pcmPhaseStatus,
  telemetryState,
} from "../../shared/status-config";
import { useDashboard } from "./dashboard-provider";

type Sample = Partial<PublicSample>;
type Props = {
  row?: Sample | null;
  now: number;
  demo: boolean;
  pcmRange?: { start: number; end: number };
  school: string;
  wokwi?: WokwiSnapshot;
  cardsOnly?: boolean;
  locationName?: string;
};
export function UserMonitoringSummary({
  row,
  now,
  demo,
  pcmRange,
  school,
  wokwi,
  cardsOnly = false,
  locationName,
}: Props) {
  const sample = wokwi?.latest;
  const state = wokwi ? !sample ? "empty" : now - Date.parse(sample.received_at) < 20000 ? "fresh" : "offline" : telemetryState(row?.recorded_at, now);
  // Never present old measurements as current comfortable conditions.
  const r = state === "fresh" ? wokwi ? {
    ...row, temperature: sample?.temperature, humidity: sample?.humidity,
    co2: sample?.co2, pm25: sample?.pm25, pcm_temperature: sample?.pcm_temperature,
  } : row : null;
  const room = getOverallRoomStatus(
    r?.temperature,
    r?.humidity,
    r?.co2,
    r?.pm25,
    r?.thermal_comfort_index,
  );
  const air = getAirQualityStatus(r?.co2, r?.pm25);
  const pcm = pcmPhaseStatus(
    r?.pcm_temperature,
    pcmRange?.start ?? NaN,
    pcmRange?.end ?? NaN,
  );
  const cards = [
    {
      title: "Suhu",
      value: fmt(r?.temperature),
      unit: "°C",
      status: temperatureStatus(r?.temperature),
      icon: Thermometer,
    },
    {
      title: "Kelembapan",
      value: fmt(r?.humidity, 0),
      unit: "%",
      status: humidityStatus(r?.humidity),
      icon: Droplets,
    },
    {
      title: "CO₂",
      value: fmt(r?.co2, 0),
      unit: "ppm",
      status: co2Status(r?.co2),
      icon: Wind,
    },
    {
      title: "PM2.5",
      value: fmt(r?.pm25),
      unit: "µg/m³",
      status: pm25Status(r?.pm25),
      icon: Activity,
    },
    {
      title: "Kenyamanan Termal",
      value: fmt(r?.thermal_comfort_index, 0),
      unit: "/ 100",
      status: thermalScoreStatus(r?.thermal_comfort_index),
      icon: Leaf,
    },
    {
      title: "Kualitas Udara",
      value: air.label,
      status: air,
      icon: Wind,
      text: true,
    },
    {
      title: "Energi Kumulatif",
      value: fmt(r?.energy_consumption),
      unit: "kWh",
      status: {
        label:
          r?.energy_consumption == null
            ? "Belum tersedia"
            : "Sejak pencatatan dimulai",
        description: "Tanggal awal pencatatan belum tersedia.",
        tone: "neutral",
      },
      icon: Zap,
    },
    {
      title: "Status PCM",
      value: pcm.label,
      secondary:
        r?.pcm_temperature == null
          ? undefined
          : `${fmt(r.pcm_temperature)} °C · estimasi fase dari suhu`,
      status: {
        label: pcm.label,
        description: pcm.explanation,
        tone: pcm.tone,
      },
      icon: Layers,
      text: true,
    },
  ];
  if (wokwi) {
    cards[4] = { title: "Cahaya", value: state === "fresh" ? fmt(sample?.light_lux, 0) : "—", unit: "lux", status: { label: "LDR", description: "Intensitas cahaya dari sensor Wokwi.", tone: "neutral" }, icon: Sun };
    cards[6] = { title: "Kehadiran", value: state !== "fresh" ? "—" : sample?.occupancy ? "Terdeteksi" : "Tidak terdeteksi", status: { label: "PIR", description: `Gerakan di ${wokwi.location.name}.`, tone: "neutral" }, icon: Activity, text: true };
  }
  return (
    <>
      {!cardsOnly && <><div className="page-heading user-heading">
        <div>
          <span className="page-kicker">{school}</span>
          <h1>{locationName ?? wokwi?.location.name ?? "Climate Shelter"}</h1>
          <p>Monitoring Kondisi Lingkungan</p>
        </div>
        <div className="user-update">
          <span
            className={`badge ${demo ? "purple" : state === "fresh" ? "good" : "neutral"}`}
          >
            {wokwi ? state === "fresh" ? "● Wokwi terhubung" : state === "empty" ? "Menunggu ESP32" : "Wokwi terputus" : demo
              ? "● Mode Simulasi"
              : state === "fresh"
                ? "● Live"
                : "Menunggu data"}
          </span>
          {demo && <small>Data contoh dari simulator aplikasi</small>}
          {wokwi && <small>Sensor ESP32 Wokwi · {wokwi.location.name}</small>}
          <small>
            Terakhir diperbarui: {relativeUpdate(sample?.received_at ?? row?.recorded_at, now)}
          </small>
        </div>
      </div>
      <section
        className={`panel room-summary ${state === "fresh" ? room.tone : "neutral"}`}
        aria-labelledby="room-status-heading"
      >
        <span className="eyebrow" id="room-status-heading">
          STATUS RUANGAN
        </span>
        <h2>
          {state === "empty"
            ? "Belum ada data sensor"
            : state === "offline"
              ? "Data sementara tidak tersedia"
              : room.label}
        </h2>
        <p>
          {state === "empty"
            ? "Menunggu data dari perangkat…"
            : state === "offline"
              ? "Perangkat monitoring sedang offline."
              : room.description}
        </p>
      </section></>}
      <div className="metrics-grid user-metrics">
        {cards.map(
          ({ title, value, unit, status, icon: Icon, text, secondary }) => (
            <article className="metric-card" key={title}>
              <div className="metric-top">
                <span>{title}</span>
                <span className="metric-icon purple">
                  <Icon size={18} aria-hidden="true" />
                </span>
              </div>
              <div className={`metric-value ${text ? "user-text-value" : ""}`}>
                {value}
                {unit && <small>{unit}</small>}
              </div>
              {secondary && <small className="muted">{secondary}</small>}
              <div className="metric-note user-metric-note">
                {!text && (
                  <span className={`badge ${status.tone}`}>{status.label}</span>
                )}
                <span>{status.description}</span>
              </div>
            </article>
          ),
        )}
      </div>
      {wokwi && <WokwiActuators key={wokwi.location.id} state={wokwi} now={now} />}
    </>
  );
}

const metrics = {
  temperature: { label: "Suhu", unit: "°C", digits: 1 },
  humidity: { label: "Kelembapan", unit: "%", digits: 0 },
  co2: { label: "CO₂", unit: "ppm", digits: 0 },
  pm25: { label: "PM2.5", unit: "µg/m³", digits: 1 },
  thermal_comfort_index: {
    label: "Kenyamanan Termal",
    unit: "/ 100",
    digits: 0,
  },
  energy_consumption: { label: "Energi Kumulatif", unit: "kWh", digits: 1 },
};
export function UserMonitoringChart({
  rows,
  now,
}: {
  rows: Sample[];
  now: number;
}) {
  const [metric, setMetric] = useState<keyof typeof metrics>("temperature");
  const [hours, setHours] = useState(24);
  const selected = metrics[metric];
  const history = rows.filter(
    (r) =>
      r.recorded_at &&
      Date.parse(r.recorded_at) >= now - hours * 3600000 &&
      Date.parse(r.recorded_at) <= now,
  );
  const hasValues = history.some(
    (r) => r[metric] != null && Number.isFinite(r[metric]),
  );
  return (
    <section
      className="panel user-chart"
      aria-label="Grafik riwayat lingkungan"
    >
      <div className="panel-heading">
        <div>
          <h2>Riwayat lingkungan</h2>
          <p>Pantau perubahan kondisi dari waktu ke waktu.</p>
        </div>
        <div className="inline-fields">
          <label>
            Parameter
            <select
              value={metric}
              onChange={(e) =>
                setMetric(e.target.value as keyof typeof metrics)
              }
            >
              {Object.entries(metrics).map(([key, v]) => (
                <option key={key} value={key}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Periode
            <select value={hours} onChange={(e) => setHours(+e.target.value)}>
              {[
                [1, "1 Jam"],
                [6, "6 Jam"],
                [24, "24 Jam"],
                [168, "7 Hari"],
                [720, "30 Hari"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {metric === "energy_consumption" && (
        <p className="muted">
          Total sejak pencatatan dimulai; grafik ini bukan konsumsi per bulan.
        </p>
      )}
      <div className="chart">
        {hasValues ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={history}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border)"
              />
              <XAxis
                dataKey="recorded_at"
                tickFormatter={(v) => time(String(v), hours > 24)}
                minTickGap={60}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) => fmt(Number(v), selected.digits)}
                width={64}
              />
              <Tooltip
                labelFormatter={(v) => time(String(v), true) + " WIB"}
                formatter={(v) => [
                  fmt(Number(v), selected.digits) + " " + selected.unit,
                  selected.label,
                ]}
              />
              <Area
                type="monotone"
                dataKey={metric}
                name={selected.label}
                stroke="#8060d3"
                fill="#8060d322"
                isAnimationActive={false}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">
            Belum ada data sensor pada periode ini.
          </div>
        )}
      </div>
    </section>
  );
}

export function UserDashboard({ view }: { view: string }) {
  const { data, now } = useDashboard();
  const zone = data.zones.find((z) => z.id === data.selectedZoneId);
  const row = latestSensors(data).get(zone?.id ?? "");
  return (
    <div className="page-content user-dashboard">
      <UserMonitoringSummary
        row={row}
        now={now}
        demo={data.source === "demo" && !data.wokwi}
        wokwi={data.wokwi}
        school={data.school.name}
        locationName={data.wokwi?.location.name ?? zone?.name}
        pcmRange={{
          start: data.thresholds.pcm_melt_start,
          end: data.thresholds.pcm_melt_end,
        }}
      />
      {view === "alerts" ? (
        <section className="panel">
          <h2>Peringatan lingkungan</h2>
          {data.alerts.length ? (
            data.alerts.map((a) => (
              <article className="user-alert" key={a.id}>
                <h3>{a.title}</h3>
                <p>{a.message}</p>
                <small>{time(a.created_at, true)} WIB</small>
              </article>
            ))
          ) : (
            <p>Belum ada peringatan lingkungan yang dibagikan.</p>
          )}
        </section>
      ) : (
        <UserMonitoringChart
          rows={data.sensors.filter((r) => r.zone_id === zone?.id)}
          now={now}
        />
      )}
    </div>
  );
}
