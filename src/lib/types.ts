import type { Mode } from "../../shared/contracts";
export type Role = "public" | "operator" | "admin" | "super_admin" | "viewer";
export type School = {
  id: string;
  slug: string;
  name: string;
  location: string;
  timezone: string;
  latitude?: number | null;
  longitude?: number | null;
  is_public?: boolean;
};
export type Zone = {
  id: string;
  school_id: string;
  slug: string;
  name: string;
  kind: "outside" | "shelter" | "garden" | "classroom";
  description: string;
};
export type Device = {
  id: string;
  school_id: string;
  zone_id: string;
  slug: string;
  name: string;
  kind:
    | "sensor"
    | "fan"
    | "shade"
    | "irrigation"
    | "energy"
    | "water"
    | "hvac"
    | "pump"
    | "ventilation";
  mode: Mode;
  value: number;
  last_seen: string | null;
  emergency_latched: boolean;
  active?: boolean;
  location?: string;
  firmware_version?: string;
};
export type SensorReading = {
  id: string;
  device_id: string;
  school_id: string;
  zone_id: string;
  recorded_at: string;
  temperature: number;
  humidity: number;
  wbgt: number | null;
  surface_temperature: number | null;
  soil_moisture: number | null;
  co2?: number | null;
  pm25?: number | null;
  thermal_comfort_index?: number | null;
  energy_consumption?: number | null;
  pcm_temperature?: number | null;
};
export type EnergyReading = {
  id: string;
  school_id: string;
  device_id: string;
  recorded_at: string;
  voltage: number;
  current: number;
  power_w: number;
  energy_kwh: number;
};
export type WaterReading = {
  id: string;
  school_id: string;
  device_id: string;
  recorded_at: string;
  tank_level: number;
  stored_liters: number;
  used_liters: number;
  harvested_liters: number;
};
export type ActuatorCommand = {
  id: string;
  school_id: string;
  device_id: string;
  mode: Mode;
  value: number;
  duration_seconds: number;
  reason: string;
  status: "pending" | "published" | "acknowledged" | "failed" | "expired";
  created_at: string;
  expires_at: string;
  temperature_setpoint?: number | null;
  humidity_setpoint?: number | null;
  command_type?: "actuator" | "setpoint";
};
export type ActuatorLog = {
  id: string;
  school_id: string;
  device_id: string;
  command_id: string;
  event: string;
  detail: string;
  created_at: string;
};
export type Alert = {
  id: string;
  school_id: string;
  zone_id: string | null;
  severity: "warning" | "danger" | "info" | "critical";
  title: string;
  message: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at?: string | null;
  device_id?: string | null;
  sensor_type?: string;
  value?: number;
  threshold?: number;
};
export type ActivityLog = {
  id: string;
  school_id: string;
  user_id: string | null;
  action: string;
  device_id: string | null;
  description: string;
  created_at: string;
};
export type DeviceControl = {
  device_id: string;
  school_id: string;
  temperature_setpoint: number;
  humidity_setpoint: number;
  updated_at: string;
  updated_by: string | null;
  fan_status?: boolean;
  hvac_status?: boolean;
  pump_status?: boolean;
  ventilation_status?: boolean;
};
export type Thresholds = {
  school_id: string;
  temperature_warning: number;
  co2_warning: number;
  co2_critical: number;
  pm25_warning: number;
  pm25_critical: number;
  pcm_melt_start: number;
  pcm_melt_end: number;
  allow_operator_setpoints: boolean;
};
export type Member = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  school_id: string;
  created_at: string;
};
export type DashboardData = {
  selectedZoneId?: string;
  wokwi?: import("../../shared/wokwi").WokwiState;
  wokwiLocations?: import("../../shared/wokwi").WokwiState[];
  statistics?: {
    school_id: string;
    devices: number;
    online: number;
    alerts: number;
    members: number;
  }[];
  school: School;
  zones: Zone[];
  devices: Device[];
  sensors: SensorReading[];
  energy: EnergyReading[];
  water: WaterReading[];
  commands: ActuatorCommand[];
  logs: ActuatorLog[];
  alerts: Alert[];
  role: Role;
  source: "demo" | "supabase";
  fetchedAt: string;
  schools: School[];
  controls: DeviceControl[];
  activity: ActivityLog[];
  members: Member[];
  thresholds: Thresholds;
  user: { id: string; name: string; email: string };
};
export const views = [
  "overview",
  "heat-map",
  "analytics",
  "energy",
  "water",
  "devices",
  "history",
  "alerts",
] as const;
export type View = (typeof views)[number];

export const platformViews = [
  "overview",
  "live",
  "analytics",
  "heat-map",
  "energy",
  "water",
  "devices",
  "control",
  "alerts",
  "history",
  "reports",
  "activity",
  "settings",
  "users",
  "schools",
];
