import type { DashboardData, SensorReading } from "./types";
export function relativeUpdate(recordedAt: string | undefined, now: number) {
  const timestamp = recordedAt ? Date.parse(recordedAt) : NaN;
  if (!Number.isFinite(timestamp)) return "Belum ada pembaruan";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "Baru saja";
  if (seconds < 60) return `${seconds} detik lalu`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
  return `${Math.floor(seconds / 86400)} hari lalu`;
}
export const fmt = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("id-ID", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
export const time = (date: string, full = false) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    ...(full ? ({ day: "2-digit", month: "short" } as const) : {}),
  }).format(new Date(date));
export function latestSensors(data: DashboardData) {
  const map = new Map<string, SensorReading>();
  for (const r of data.sensors)
    if (!map.has(r.zone_id) || r.recorded_at > map.get(r.zone_id)!.recorded_at)
      map.set(r.zone_id, r);
  return map;
}
export function counterDelta(
  rows: { recorded_at: string; device_id: string; [key: string]: unknown }[],
  key: string,
) {
  const last = new Map<string, number>();
  let sum = 0;
  for (const r of [...rows].sort((a, b) =>
    a.recorded_at.localeCompare(b.recorded_at),
  )) {
    const value = Number(r[key]);
    const previous = last.get(r.device_id);
    if (previous !== undefined && value >= previous) sum += value - previous;
    last.set(r.device_id, value);
  }
  return sum;
}
export function csvCell(value: unknown) {
  let cell = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}
