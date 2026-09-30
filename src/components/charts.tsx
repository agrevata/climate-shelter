"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { time } from "@/lib/metrics";
import { useDashboard } from "./dashboard-provider";
export type SensorMetric =
  | "temperature"
  | "humidity"
  | "wbgt"
  | "surface_temperature"
  | "co2"
  | "pm25"
  | "thermal_comfort_index"
  | "energy_consumption"
  | "pcm_temperature";
const colors = ["#ed9668", "#7857e5", "#35ab94", "#67a2e0"];
export function ClimateChart({
  hours = 24,
  metric = "temperature",
  compact = false,
  zone = "all",
}: {
  hours?: number;
  metric?: SensorMetric;
  compact?: boolean;
  zone?: string;
}) {
  const { data, now } = useDashboard();
  const selected = data.zones.filter((z) =>
    zone === "all"
      ? !compact || z.kind === "outside" || z.kind === "shelter"
      : z.id === zone,
  );
  const grouped = new Map<number, Record<string, number | string | null>>();
  for (const row of data.sensors.filter(
    (r) => selected.some((z) => z.id === r.zone_id) && Date.parse(r.recorded_at) >= now - hours * 3600000,
  )) {
    const bucketMs = hours <= 6 ? 60000 : 3600000;
    const key = Math.floor(Date.parse(row.recorded_at) / bucketMs) * bucketMs;
    const bucket = grouped.get(key) ?? { timestamp: key };
    bucket[row.zone_id] = row[metric] ?? null;
    grouped.set(key, bucket);
  }
  const points = [...grouped.values()].sort(
    (a, b) => Number(a.timestamp) - Number(b.timestamp),
  );
  const unit =
    (
      {
        humidity: "%",
        co2: " ppm",
        pm25: " µg/m³",
        thermal_comfort_index: "",
        energy_consumption: " kWh",
      } as Record<string, string>
    )[metric] ?? "°C";
  if (!points.length)
    return (
      <div className="empty-state">Belum ada data sensor pada periode ini.</div>
    );
  return (
    <>
      <div
        className="chart"
        role="img"
        aria-label={`Grafik ${metric}, ${hours} jam terakhir. Nilai terperinci tersedia di Sensor History.`}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={points}
            margin={{ top: 14, right: 12, bottom: 4, left: -22 }}
          >
            <CartesianGrid
              strokeDasharray="4 5"
              vertical={false}
              stroke="var(--border)"
            />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) =>
                time(new Date(Number(v)).toISOString(), hours > 24)
              }
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={45}
            />
            <YAxis
              unit={unit}
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              domain={metric === "humidity" ? [0, 100] : ["auto", "auto"]}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--text)",
                fontSize: 13,
              }}
              labelFormatter={(v) =>
                time(new Date(Number(v)).toISOString(), true)
              }
              formatter={(v) => `${Number(v).toFixed(1)} ${unit}`}
            />
            {selected.map((z) => (
              <Line
                key={z.id}
                name={z.name}
                dataKey={z.id}
                type="monotone"
                stroke={
                  colors[
                    ["outside", "shelter", "garden", "classroom"].indexOf(
                      z.kind,
                    )
                  ]
                }
                strokeWidth={2.6}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend">
        {selected.map((z) => (
          <span key={z.id}>
            <i
              style={{
                background:
                  colors[
                    ["outside", "shelter", "garden", "classroom"].indexOf(
                      z.kind,
                    )
                  ],
              }}
            />
            {z.name}
          </span>
        ))}
      </div>
    </>
  );
}
export function ResourceChart({
  kind,
  hours = 24,
}: {
  kind: "energy" | "water";
  hours?: number;
}) {
  const { data, now } = useDashboard();
  const rows = (kind === "energy" ? data.energy : data.water).filter(
    (r) => Date.parse(r.recorded_at) > now - hours * 3600000,
  );
  if (!rows.length)
    return <div className="empty-state">Belum ada data pada periode ini.</div>;
  return (
    <div
      className="chart resource-chart"
      role="img"
      aria-label={
        kind === "energy"
          ? "Riwayat daya dalam watt"
          : "Riwayat level tandon dalam persen"
      }
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={rows}
          margin={{ top: 20, right: 10, left: -10, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`fill-${kind}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={kind === "energy" ? "#8a65e9" : "#319bcc"}
                stopOpacity={0.23}
              />
              <stop
                offset="100%"
                stopColor={kind === "energy" ? "#8a65e9" : "#319bcc"}
                stopOpacity={0.01}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="4 5"
          />
          <XAxis
            dataKey="recorded_at"
            tickFormatter={(v) => time(v, hours > 24)}
            axisLine={false}
            tickLine={false}
            minTickGap={55}
            tick={{ fontSize: 12, fill: "var(--muted)" }}
          />
          <YAxis
            domain={kind === "water" ? [0, 100] : ["auto", "auto"]}
            tick={{ fontSize: 12, fill: "var(--muted)" }}
            axisLine={false}
            tickLine={false}
            unit={kind === "water" ? "%" : " W"}
          />
          <Tooltip
            labelFormatter={(v) => time(String(v), true)}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          />
          <Area
            dataKey={kind === "water" ? "tank_level" : "power_w"}
            name={kind === "water" ? "Level tandon (%)" : "Daya (W)"}
            type="monotone"
            stroke={kind === "energy" ? "#8a65e9" : "#319bcc"}
            fill={`url(#fill-${kind})`}
            strokeWidth={2.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
