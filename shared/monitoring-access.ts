import type { DashboardData } from "../src/lib/types";
import { canAdmin, canOperate } from "./platform";
export const userViews = [
  "overview",
  "live",
  "analytics",
  "history",
  "reports",
  "alerts",
];
export function isUserRole(role: string) {
  return role === "public" || role === "viewer";
}
export function canAccessDashboardView(role: string, view: string) {
  if (isUserRole(role)) return userViews.includes(view);
  if (!canOperate(role)) return false;
  if (view === "schools") return role === "super_admin";
  if (view === "users") return canAdmin(role);
  return true;
}
export const environmentLabels: Record<string, string> = {
  temperature: "Suhu ruangan",
  humidity: "Kelembapan",
  co2: "Kadar CO₂",
  pm25: "Partikel halus",
  wbgt: "Paparan panas",
  thermal_comfort_index: "Kenyamanan termal",
  pcm_temperature: "Suhu PCM",
};
// Shared server-side projection: the browser never receives operational data for User.
export function forDashboardRole(data: DashboardData): DashboardData {
  if (!isUserRole(data.role)) return data;
  return {
    ...data,
    devices: [],
    commands: [],
    logs: [],
    controls: [],
    activity: [],
    members: [],
    statistics: [],
    energy: [],
    water: [],
    wokwi: undefined,
    wokwiLocations: undefined,
    alerts: data.alerts
      .filter(
        (a) =>
          !!a.sensor_type &&
          Object.hasOwn(environmentLabels, a.sensor_type) &&
          !a.resolved_at,
      )
      .map((a) => ({
        id: a.id,
        school_id: a.school_id,
        zone_id: a.zone_id,
        severity: a.severity,
        created_at: a.created_at,
        acknowledged_at: null,
        title: `${environmentLabels[a.sensor_type!]} perlu perhatian`,
        message: "Pengelola sekolah sedang memantau kondisi lingkungan ini.",
      })),
  };
}
