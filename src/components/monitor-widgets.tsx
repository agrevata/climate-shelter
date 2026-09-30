"use client";
import { useState } from "react";
import {
  Activity,
  Wind,
  Droplets,
  Leaf,
  Layers,
  Thermometer,
  Zap,
  Sun,
  CloudSun,
  Sparkles,
} from "lucide-react";
import { useDashboard } from "./dashboard-provider";
import type { SensorReading } from "@/lib/types";
import { UserMonitoringSummary } from "./user-monitoring";
import { fmt, latestSensors, relativeUpdate } from "@/lib/metrics";
import { isFresh } from "../../shared/contracts";
import { ClimateChart, type SensorMetric } from "./charts";
import {
  temperatureStatus,
  humidityStatus,
  co2Status,
  pm25Status,
  thermalScoreStatus,
  airQualityStatus,
  pcmPhaseStatus,
  getOverallRoomStatus,
  telemetryState,
} from "../../shared/status-config";

export function AirMetrics() {
  const { data, now } = useDashboard();
  const id = data.selectedZoneId;
  const row = latestSensors(data).get(id ?? "");
  if (data.wokwi) return <UserMonitoringSummary row={row} now={now} demo={false} school={data.school.name} wokwi={data.wokwi} cardsOnly pcmRange={{start:data.thresholds.pcm_melt_start,end:data.thresholds.pcm_melt_end}} />;

  const tStat = temperatureStatus(row?.temperature);
  const hStat = humidityStatus(row?.humidity);
  const cStat = co2Status(row?.co2);
  const pStat = pm25Status(row?.pm25);
  const tcStat = thermalScoreStatus(row?.thermal_comfort_index);
  const aqStat = airQualityStatus(row?.co2, row?.pm25);
  const pcmStat = pcmPhaseStatus(
    row?.pcm_temperature,
    data.thresholds.pcm_melt_start,
    data.thresholds.pcm_melt_end,
  );

  return (
    <div className="metrics-grid air-metrics">
      {/* 1. Suhu */}
      <article className="metric-card">
        <div className="metric-top">
          <span>Suhu</span>
          <span className="metric-icon purple">
            <Thermometer size={18} />
          </span>
        </div>
        <div className="metric-value">
          {fmt(row?.temperature)}
          <small>°C</small>
        </div>
        <div className="metric-note">
          <span className={`badge ${tStat.tone}`}>{tStat.label}</span>
          <span>{tStat.description}</span>
        </div>
      </article>

      {/* 2. Kelembapan */}
      <article className="metric-card">
        <div className="metric-top">
          <span>Kelembapan</span>
          <span className="metric-icon purple">
            <Droplets size={18} />
          </span>
        </div>
        <div className="metric-value">
          {fmt(row?.humidity)}
          <small>%</small>
        </div>
        <div className="metric-note">
          <span className={`badge ${hStat.tone}`}>{hStat.label}</span>
          <span>{hStat.description}</span>
        </div>
      </article>

      {/* 3. CO2 */}
      <article className="metric-card">
        <div className="metric-top">
          <span>CO₂</span>
          <span className="metric-icon purple">
            <Wind size={18} />
          </span>
        </div>
        <div className="metric-value">
          {row?.co2 != null ? Math.round(row.co2) : "—"}
          <small>ppm</small>
        </div>
        <div className="metric-note">
          <span className={`badge ${cStat.tone}`}>{cStat.label}</span>
          <span>{cStat.description}</span>
        </div>
      </article>

      {/* 4. PM2.5 */}
      <article className="metric-card">
        <div className="metric-top">
          <span>PM2.5</span>
          <span className="metric-icon purple">
            <Activity size={18} />
          </span>
        </div>
        <div className="metric-value">
          {fmt(row?.pm25)}
          <small>µg/m³</small>
        </div>
        <div className="metric-note">
          <span className={`badge ${pStat.tone}`}>{pStat.label}</span>
          <span>{pStat.description}</span>
        </div>
      </article>

      {/* 5. Kenyamanan Termal */}
      <article className="metric-card">
        <div className="metric-top">
          <span>Kenyamanan Termal</span>
          <span className="metric-icon purple">
            <Leaf size={18} />
          </span>
        </div>
        <div className="metric-value">
          {fmt(row?.thermal_comfort_index)}
          <small>/ 100</small>
        </div>
        <div className="metric-note">
          <span className={`badge ${tcStat.tone}`}>{tcStat.label}</span>
          <span>{tcStat.description}</span>
        </div>
      </article>

      {/* 6. Kualitas Udara */}
      <article className="metric-card">
        <div className="metric-top">
          <span>Kualitas Udara</span>
          <span className="metric-icon purple">
            <Wind size={18} />
          </span>
        </div>
        <div className="metric-value">
          <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            {aqStat.label}
          </span>
        </div>
        <div className="metric-note">
          <span className={`badge ${aqStat.tone}`}>{aqStat.label}</span>
          <span>{aqStat.description}</span>
        </div>
      </article>

      {/* 7. Energi Kumulatif */}
      <article className="metric-card">
        <div className="metric-top">
          <span>Energi Kumulatif</span>
          <span className="metric-icon purple">
            <Zap size={18} />
          </span>
        </div>
        <div className="metric-value">
          {fmt(row?.energy_consumption)}
          <small>kWh</small>
        </div>
        <div className="metric-note">
          <span className="badge neutral">Sejak pencatatan dimulai</span>
          <span>Tanggal awal pencatatan belum tersedia</span>
        </div>
      </article>

      {/* 8. Status PCM */}
      <article className="metric-card">
        <div className="metric-top">
          <span>Status PCM</span>
          <span className="metric-icon purple">
            <Layers size={18} />
          </span>
        </div>
        <div className="metric-value">
          <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            {pcmStat.label}
          </span>
          <small style={{ marginLeft: "0.5rem" }}>
            {fmt(row?.pcm_temperature)} °C
          </small>
        </div>
        <div className="metric-note">
          <span className={`badge ${pcmStat.tone}`}>{pcmStat.label}</span>
          <span>{pcmStat.explanation}</span>
        </div>
      </article>
    </div>
  );
}
export function PcmPanel() {
  const { data, now } = useDashboard();
  const zone = data.zones.find((z) => z.id === data.selectedZoneId);
  const rows = data.sensors.filter(
    (r) => r.zone_id === zone?.id && r.pcm_temperature != null,
  );
  const last = rows.at(-1),
    prev = rows.at(-2);
  const t = last?.pcm_temperature;
  const start = data.thresholds.pcm_melt_start,
    end = data.thresholds.pcm_melt_end;
  const fresh = !!last && isFresh(last.recorded_at, now);
  const phase =
    t == null
      ? "Belum tersedia"
      : t < start
        ? "Solid"
        : t > end
          ? "Liquid"
          : "Transition";
  const delta =
    t != null && prev?.pcm_temperature != null ? t - prev.pcm_temperature : 0;
  return (
    <section className="panel pcm-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">THERMAL STORAGE</span>
          <h2>PCM Monitoring</h2>
        </div>
        <Layers size={24} />
      </div>
      <div className="pcm-body">
        <div className="pcm-gauge">
          <span>
            {fmt(t)}
            <small>°C</small>
          </span>
          <strong>{phase}</strong>
        </div>
        <div>
          <span className={"badge " + (fresh ? "purple" : "neutral")}>
            {!fresh
              ? "Data belum tersedia / lama"
              : delta > 0.05
                ? "Estimasi charging"
                : delta < -0.05
                  ? "Estimasi discharging"
                  : "Suhu stabil"}
          </span>
          <h3>
            {phase === "Transition"
              ? "Berada di rentang transisi fasa"
              : "Penyimpanan panas termal"}
          </h3>
          <p>
            Rentang leleh konfigurasi: {start}–{end} °C. Fase diperkirakan dari
            suhu; belum mengukur kapasitas panas laten, fraksi cair, atau
            histeresis material.
          </p>
        </div>
      </div>
      <div className="pcm-phases">
        {["Solid", "Transition", "Liquid"].map((p) => (
          <span key={p} className={p === phase ? "selected" : ""}>
            {p}
          </span>
        ))}
      </div>
    </section>
  );
}
export function LiveCharts() {
  const { data } = useDashboard();
  const [hours, setHours] = useState(1),
    [metric, setMetric] = useState<SensorMetric>("temperature");
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Tren lingkungan</h2>
          <p>Data diperbarui otomatis; waktu dalam WIB.</p>
        </div>
        <div className="inline-fields">
          <select
            aria-label="Metrik live"
            value={metric}
            onChange={(e) => setMetric(e.target.value as SensorMetric)}
          >
            {[
              ["temperature", "Suhu"],
              ["humidity", "Kelembapan"],
              ["co2", "CO₂"],
              ["pm25", "PM2.5"],
              ["thermal_comfort_index", "Kenyamanan"],
              ["energy_consumption", "Energi kumulatif"],
              ["pcm_temperature", "Suhu PCM"],
              ["wbgt", "WBGT"],
              ["surface_temperature", "Suhu permukaan"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Periode live"
            value={hours}
            onChange={(e) => setHours(+e.target.value)}
          >
            {[
              [0.25, "Live · 15 menit"],
              [1, "1 jam"],
              [6, "6 jam"],
              [24, "24 jam"],
              [168, "7 hari"],
              [720, "30 hari"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ClimateChart metric={metric} hours={hours} zone={data.selectedZoneId ?? "all"} />
    </section>
  );
}

export function RoomStatusBanner({
  row,
  now,
}: {
  shelter?: SensorReading;
  row?: SensorReading;
  now: number;
}) {
  const { data } = useDashboard();
  const sample = data.wokwi?.latest;
  const state = data.wokwi ? !sample ? "empty" : sample.sensor_ok && now - Date.parse(sample.received_at) < 20000 ? "fresh" : "offline" : telemetryState(row?.recorded_at, now);
  const r = state === "fresh" ? row : null;
  const room = getOverallRoomStatus(
    r?.temperature,
    r?.humidity,
    r?.co2,
    r?.pm25,
    r?.thermal_comfort_index,
  );
  const tone =
    state === "empty"
      ? "neutral"
      : state === "offline"
        ? "warning"
        : room.tone;
  const isDemo = data.source === "demo" && !data.wokwi;

  const headline =
    state === "empty"
      ? "Belum ada data sensor"
      : state === "offline"
        ? "Data sementara tidak tersedia"
        : room.label;
  const subline =
    state === "empty"
      ? "Menunggu data pertama dari perangkat."
      : state === "offline"
        ? "Perangkat monitoring sedang offline."
        : room.description;

  return (
    <div className="room-status-layout">
      <section
        className={`panel room-banner tone-${tone}`}
        aria-labelledby="room-banner-heading"
      >
        <div className="room-banner-ring" aria-hidden="true" />
        <div className="room-banner-icon">
          {state === "fresh" ? (
            <Sparkles size={20} aria-hidden="true" />
          ) : (
            <CloudSun size={20} aria-hidden="true" />
          )}
        </div>
        <div className="room-banner-body">
          <span className="eyebrow">STATUS RUANGAN · {data.wokwi?.location.name ?? data.zones.find(z => z.id === data.selectedZoneId)?.name ?? "Lokasi"}</span>
          <h2 id="room-banner-heading">{headline}</h2>
          <p>{subline}</p>
        </div>
        <div className="room-banner-meta">
          <span
            className={`badge ${isDemo ? "purple" : state === "fresh" ? "good" : "neutral"}`}
          >
            {data.wokwi ? "● ESP32 Wokwi" : isDemo
              ? "● Mode Simulasi"
              : state === "fresh"
                ? "● Live"
                : "● Menunggu data"}
          </span>
          <small><Sun size={13} aria-hidden="true" /> Diperbarui {relativeUpdate(row?.recorded_at, now)}</small>
        </div>
      </section>
      {state === "fresh" && (
        <div className="room-banner-bars">
          {[
            { label: "Suhu", value: `${fmt(r?.temperature)}°C`, stat: temperatureStatus(r?.temperature) },
            { label: "Kelembapan", value: `${fmt(r?.humidity)}%`, stat: humidityStatus(r?.humidity) },
            { label: "Kualitas Udara", value: `CO₂ ${fmt(r?.co2)} ppm`, stat: airQualityStatus(r?.co2, r?.pm25) },
            { label: "Kenyamanan", value: `Skor ${fmt(r?.thermal_comfort_index)}`, stat: thermalScoreStatus(r?.thermal_comfort_index) },
          ].map(({ label, value, stat }) => (
            <div className={`bar-cell tone-${stat.tone}`} key={label}>
              <div className="bar-label">{label}</div>
              <div className="bar-value">{value}</div>
              <div className="bar-status">{stat.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
